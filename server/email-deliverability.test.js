const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEmailDeliverabilityService, createDohResolvers } = require('./email-deliverability');

function dnsError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function noAddress() {
  return Promise.reject(dnsError('ENODATA'));
}

test('accepts domains with MX records and caches the lookup', async () => {
  let calls = 0;
  const service = createEmailDeliverabilityService({
    resolveMx: async () => {
      calls += 1;
      return [{ exchange: 'mail.example.in', priority: 10 }];
    },
  });
  assert.deepEqual(await service.check('aditi@example.in'), { deliverable: true, checked: true, reason: null });
  assert.deepEqual(await service.check('another@example.in'), { deliverable: true, checked: true, reason: null });
  assert.equal(calls, 1);
});

test('rejects null MX domains even when the domain has an address record', async () => {
  let addressCalls = 0;
  const service = createEmailDeliverabilityService({
    resolveMx: async () => [{ exchange: '.', priority: 0 }],
    resolve4: async () => { addressCalls += 1; return ['192.0.2.10']; },
  });
  assert.deepEqual(await service.check('aditi@example.in'), { deliverable: false, checked: true, reason: 'no-mail-server' });
  assert.equal(addressCalls, 0);
});

test('accepts domains without MX records when an address record exists', async () => {
  const service = createEmailDeliverabilityService({
    resolveMx: async () => { throw dnsError('ENODATA'); },
    resolve4: async () => ['192.0.2.10'],
    resolve6: noAddress,
  });
  assert.deepEqual(await service.check('aditi@example.in'), { deliverable: true, checked: true, reason: null });
});

test('rejects nonexistent domains and domains without a mail route', async () => {
  const nonexistent = createEmailDeliverabilityService({
    resolveMx: async () => { throw dnsError('ENOTFOUND'); },
  });
  assert.deepEqual(await nonexistent.check('aditi@missing.in'), { deliverable: false, checked: true, reason: 'invalid-domain' });

  const noMail = createEmailDeliverabilityService({
    resolveMx: async () => { throw dnsError('ENODATA'); },
    resolve4: noAddress,
    resolve6: noAddress,
  });
  assert.deepEqual(await noMail.check('aditi@example.in'), { deliverable: false, checked: true, reason: 'no-mail-server' });
});

test('reports transient DNS failures as unchecked instead of invalid', async () => {
  const service = createEmailDeliverabilityService({
    resolveMx: async () => { throw dnsError('ESERVFAIL'); },
  });
  assert.deepEqual(await service.check('aditi@example.in'), { deliverable: null, checked: false, reason: 'lookup-unavailable' });
});

test('falls back to DNS-over-HTTPS when the system resolver is unavailable', async () => {
  const unroutable = async () => { throw dnsError('ECONNREFUSED'); };
  const service = createEmailDeliverabilityService({
    resolveMx: unroutable,
    resolve4: unroutable,
    resolve6: unroutable,
    doh: {
      mx: async () => [{ exchange: 'mail.example.in', priority: 10 }],
      a: noAddress,
      aaaa: noAddress,
    },
  });
  assert.deepEqual(await service.check('aditi@example.in'), { deliverable: true, checked: true, reason: null });
});

test('DNS-over-HTTPS resolves MX records and maps DNS failures', async () => {
  const requests = [];
  const resolvers = createDohResolvers({
    fetchImpl: async (url) => {
      requests.push(new URL(url));
      return { ok: true, json: async () => ({ Status: 0, Answer: [{ type: 15, data: '5 mail.example.in.' }] }) };
    },
  });
  assert.deepEqual(await resolvers.mx('example.in'), [{ priority: 5, exchange: 'mail.example.in' }]);
  assert.equal(requests[0].searchParams.get('type'), 'MX');

  const nullMx = createDohResolvers({
    fetchImpl: async () => ({ ok: true, json: async () => ({ Status: 0, Answer: [{ type: 15, data: '0 .' }] }) }),
  });
  assert.deepEqual(await nullMx.mx('example.in'), [{ priority: 0, exchange: '' }]);

  const missing = createDohResolvers({
    fetchImpl: async () => ({ ok: true, json: async () => ({ Status: 3 }) }),
  });
  await assert.rejects(() => missing.a('missing.in'), (error) => error.code === 'ENOTFOUND');

  const empty = createDohResolvers({
    fetchImpl: async () => ({ ok: true, json: async () => ({ Status: 0 }) }),
  });
  await assert.rejects(() => empty.aaaa('example.in'), (error) => error.code === 'ENODATA');
});

test('times out slow DNS lookups without claiming the address is invalid', async () => {
  const service = createEmailDeliverabilityService({
    resolveMx: () => new Promise(() => {}),
    timeoutMs: 10,
  });
  assert.deepEqual(await service.check('aditi@example.in'), { deliverable: null, checked: false, reason: 'lookup-unavailable' });
});

test('rejects malformed email domains without a DNS lookup', async () => {
  let calls = 0;
  const service = createEmailDeliverabilityService({
    resolveMx: async () => { calls += 1; return []; },
  });
  for (const email of ['aditi@localhost', 'aditi@[127.0.0.1]', 'aditi@-example.in', 'aditi@example..in']) {
    assert.deepEqual(await service.check(email), { deliverable: false, checked: true, reason: 'invalid-domain' });
  }
  assert.equal(calls, 0);
});
