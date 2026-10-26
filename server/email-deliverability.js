const dns = require('node:dns');
const { domainToASCII } = require('node:url');

const DOMAIN_CACHE_TTL = 10 * 60 * 1000;
const UNKNOWN_CACHE_TTL = 30 * 1000;
const MAX_CACHE_ENTRIES = 500;
const DNS_TIMEOUT_MS = 4000;
const DEFAULT_DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const DEFINITIVE_DNS_ERRORS = new Set(['ENOTFOUND', 'ENODATA', 'ENONAME']);
const DOH_TYPES = { MX: 15, A: 1, AAAA: 28 };

function invalidDomain() {
  return { deliverable: false, checked: true, reason: 'invalid-domain' };
}

function noMailServer() {
  return { deliverable: false, checked: true, reason: 'no-mail-server' };
}

function lookupUnavailable() {
  return { deliverable: null, checked: false, reason: 'lookup-unavailable' };
}

function dnsError(code, message = code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function emailDomain(email) {
  const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return null;
  const rawDomain = value.slice(at + 1);
  if (!rawDomain || rawDomain.startsWith('[')) return null;
  let domain;
  try { domain = domainToASCII(rawDomain); } catch { return null; }
  if (!domain || domain.length > 253) return null;
  const labels = domain.split('.');
  if (labels.length < 2) return null;
  const validLabel = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  if (labels.some((label) => !label || label.length > 63 || !validLabel.test(label))) return null;
  return domain;
}

function createDohResolvers({ endpoint = DEFAULT_DOH_ENDPOINT, fetchImpl = global.fetch, timeoutMs = DNS_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') return null;

  async function query(domain, type) {
    let response;
    try {
      response = await fetchImpl(`${endpoint}?name=${encodeURIComponent(domain)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw dnsError('ELOOKUP', 'DNS-over-HTTPS request failed.', cause);
    }
    if (!response.ok) throw dnsError('ELOOKUP', `DNS-over-HTTPS returned ${response.status}.`);
    let payload;
    try {
      payload = await response.json();
    } catch (cause) {
      throw dnsError('ELOOKUP', 'DNS-over-HTTPS returned invalid JSON.', cause);
    }
    if (Number(payload.Status) === 3) throw dnsError('ENOTFOUND');
    if (Number(payload.Status) !== 0) throw dnsError('ESERVFAIL');
    const records = (Array.isArray(payload.Answer) ? payload.Answer : [])
      .filter((answer) => answer?.type === undefined || Number(answer.type) === DOH_TYPES[type]);
    if (!records.length) throw dnsError('ENODATA');
    return records.map((answer) => String(answer.data || ''));
  }

  return {
    mx: async (domain) => (await query(domain, 'MX')).map((data) => {
      const [priority, exchange = ''] = data.trim().split(/\s+/);
      return { priority: Number(priority), exchange: exchange.replace(/\.$/, '') };
    }),
    a: (domain) => query(domain, 'A'),
    aaaa: (domain) => query(domain, 'AAAA'),
  };
}

function createEmailDeliverabilityService({
  resolveMx = (domain) => dns.promises.resolveMx(domain),
  resolve4 = (domain) => dns.promises.resolve4(domain),
  resolve6 = (domain) => dns.promises.resolve6(domain),
  doh = null,
  cacheTtl = DOMAIN_CACHE_TTL,
  unknownCacheTtl = UNKNOWN_CACHE_TTL,
  timeoutMs = DNS_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  const cache = new Map();
  const systemResolvers = { mx: resolveMx, a: resolve4, aaaa: resolve6 };

  function withTimeout(promise) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error('DNS lookup timed out.');
        error.code = 'ETIMEOUT';
        reject(error);
      }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function remember(domain, result) {
    const ttl = result.checked ? cacheTtl : unknownCacheTtl;
    cache.set(domain, { result, expiresAt: now() + ttl });
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    return result;
  }

  async function hasAddressRecord(domain, resolvers) {
    const attempts = await Promise.allSettled([
      withTimeout(resolvers.a(domain)),
      withTimeout(resolvers.aaaa(domain)),
    ]);
    const addresses = attempts.flatMap((attempt) => attempt.status === 'fulfilled' ? attempt.value : []);
    if (addresses.length) return { deliverable: true, checked: true, reason: null };
    const failures = attempts.filter((attempt) => attempt.status === 'rejected').map((attempt) => attempt.reason?.code);
    if (failures.length === attempts.length && failures.every((code) => DEFINITIVE_DNS_ERRORS.has(code))) {
      return noMailServer();
    }
    return lookupUnavailable();
  }

  async function lookup(domain, resolvers) {
    let records;
    try {
      records = await withTimeout(resolvers.mx(domain));
    } catch (error) {
      if (error?.code === 'ENOTFOUND' || error?.code === 'ENONAME') return invalidDomain();
      if (error?.code === 'ENODATA') return hasAddressRecord(domain, resolvers);
      return lookupUnavailable();
    }
    if (records.some((record) => !record.exchange || record.exchange === '.')) return noMailServer();
    if (records.length) return { deliverable: true, checked: true, reason: null };
    return hasAddressRecord(domain, resolvers);
  }

  async function check(email) {
    const domain = emailDomain(email);
    if (!domain) return invalidDomain();
    const cached = cache.get(domain);
    if (cached && cached.expiresAt > now()) return { ...cached.result };
    try {
      let result = await lookup(domain, systemResolvers);
      if (doh && !result.checked) {
        let fallback = null;
        try { fallback = await lookup(domain, doh); } catch { fallback = null; }
        if (fallback?.checked) result = fallback;
      }
      return remember(domain, result);
    } catch {
      return remember(domain, lookupUnavailable());
    }
  }

  return { check };
}

module.exports = {
  createEmailDeliverabilityService,
  createDohResolvers,
  emailDomain,
  DEFAULT_DOH_ENDPOINT,
  DOMAIN_CACHE_TTL,
  DNS_TIMEOUT_MS,
};
