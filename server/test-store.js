const crypto = require('node:crypto');
const { createSeed } = require('./test-fixtures');
const { createSessionStore } = require('./session-store');

const clone = (value) => structuredClone(value);

function duplicateKeyError() {
  const error = new Error('Duplicate key');
  error.code = 11000;
  return error;
}

function valuesAt(document, path) {
  const parts = path.split('.');
  function visit(value, index) {
    if (index === parts.length) return [value];
    if (Array.isArray(value)) return value.flatMap((item) => visit(item, index));
    if (value === null || value === undefined) return [undefined];
    return visit(value[parts[index]], index + 1);
  }
  return visit(document, 0);
}

function equal(actual, expected) {
  if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime();
  if (Array.isArray(actual) && !Array.isArray(expected)) return actual.some((value) => equal(value, expected));
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    return Object.keys(actual).length === Object.keys(expected).length
      && Object.entries(expected).every(([key, value]) => equal(actual[key], value));
  }
  return actual === expected;
}

function valueMatches(actual, condition) {
  if (!condition || typeof condition !== 'object' || condition instanceof Date || Array.isArray(condition)) return equal(actual, condition);
  const operators = Object.keys(condition).filter((key) => key.startsWith('$'));
  if (!operators.length) return equal(actual, condition);
  return operators.every((operator) => {
    const expected = condition[operator];
    if (operator === '$eq') return equal(actual, expected);
    if (operator === '$ne') return actual === undefined || !equal(actual, expected);
    if (operator === '$in') return expected.some((item) => equal(actual, item));
    if (operator === '$nin') return !expected.some((item) => equal(actual, item));
    if (operator === '$exists') return expected ? actual !== undefined : actual === undefined;
    if (operator === '$gt') return actual > expected;
    if (operator === '$gte') return actual >= expected;
    if (operator === '$lt') return actual < expected;
    if (operator === '$lte') return actual <= expected;
    if (operator === '$size') return Array.isArray(actual) && actual.length === expected;
    if (operator === '$elemMatch') return Array.isArray(actual) && actual.some((item) => matches(item, expected));
    if (operator === '$not') return !valueMatches(actual, expected);
    return false;
  });
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return condition.some((item) => matches(document, item));
    if (key === '$and') return condition.every((item) => matches(document, item));
    if (key === '$nor') return !condition.some((item) => matches(document, item));
    const values = valuesAt(document, key);
    if (condition && typeof condition === 'object' && '$not' in condition) return !values.some((value) => valueMatches(value, condition.$not));
    return values.some((value) => valueMatches(value, condition));
  });
}

function setPath(document, path, value) {
  const parts = path.split('.');
  let current = document;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = clone(value);
}

function applyUpdate(document, update, inserting = false) {
  for (const [operator, fields] of Object.entries(update)) {
    if (operator === '$set' || (operator === '$setOnInsert' && inserting)) {
      for (const [path, value] of Object.entries(fields)) setPath(document, path, value);
    } else if (operator === '$inc') {
      for (const [path, value] of Object.entries(fields)) {
        const current = valuesAt(document, path)[0] || 0;
        setPath(document, path, current + value);
      }
    } else if (operator === '$push' || operator === '$addToSet') {
      for (const [path, value] of Object.entries(fields)) {
        const array = valuesAt(document, path)[0] || [];
        const items = value && typeof value === 'object' && '$each' in value ? value.$each : [value];
        for (const item of items) if (operator === '$push' || !array.some((existing) => equal(existing, item))) array.push(clone(item));
        setPath(document, path, array);
      }
    } else if (operator === '$pull') {
      for (const [path, condition] of Object.entries(fields)) {
        const array = valuesAt(document, path)[0] || [];
        const next = array.filter((item) => !(condition && typeof condition === 'object'
          ? (Object.keys(condition).some((key) => key.startsWith('$')) ? valueMatches(item, condition) : matches(item, condition))
          : equal(item, condition)));
        setPath(document, path, next);
      }
    } else if (operator === '$unset') {
      for (const path of Object.keys(fields)) {
        const parts = path.split('.');
        let current = document;
        for (const part of parts.slice(0, -1)) current = current?.[part];
        if (current) delete current[parts[parts.length - 1]];
      }
    }
  }
}

function insertBase(filter) {
  const document = {};
  for (const [key, value] of Object.entries(filter)) {
    if (!key.startsWith('$') && (!value || typeof value !== 'object' || value instanceof Date || Array.isArray(value))) setPath(document, key, value);
  }
  return document;
}

function createMemoryDatabase(data) {
  const collections = new Map();
  return {
    collection(name) {
      if (collections.has(name)) return collections.get(name);
      if (!Array.isArray(data[name])) data[name] = [];
      const documents = data[name];
      const collection = {
        async createIndex() { return 'memory-index'; },
        async findOne(filter = {}) {
          const document = documents.find((item) => matches(item, filter));
          return document ? clone(document) : null;
        },
        find(filter = {}) {
          const selected = documents.filter((item) => matches(item, filter));
          return { toArray: async () => clone(selected) };
        },
        async insertOne(document) {
          if (document.id && documents.some((item) => item.id === document.id)) throw duplicateKeyError();
          if (name === 'users' && documents.some((item) => item.email === document.email && item.role === document.role)) throw duplicateKeyError();
          if (document.tokenHash && documents.some((item) => item.tokenHash === document.tokenHash)) throw duplicateKeyError();
          const inserted = clone(document);
          if (inserted._id === undefined) inserted._id = inserted.id || `${name}-${crypto.randomUUID()}`;
          documents.push(inserted);
          return { acknowledged: true, insertedId: inserted._id };
        },
        async updateOne(filter, update, options = {}) {
          let document = documents.find((item) => matches(item, filter));
          if (!document && options.upsert) {
            document = insertBase(filter);
            if (document._id !== undefined && documents.some((item) => equal(item._id, document._id))) throw duplicateKeyError();
            applyUpdate(document, update, true);
            if (document._id === undefined) document._id = `${name}-${crypto.randomUUID()}`;
            documents.push(document);
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: document._id };
          }
          if (!document) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
          const before = JSON.stringify(document);
          applyUpdate(document, update);
          return { acknowledged: true, matchedCount: 1, modifiedCount: before === JSON.stringify(document) ? 0 : 1, upsertedCount: 0 };
        },
        async deleteOne(filter = {}) {
          const index = documents.findIndex((item) => matches(item, filter));
          if (index === -1) return { acknowledged: true, deletedCount: 0 };
          documents.splice(index, 1);
          return { acknowledged: true, deletedCount: 1 };
        },
        async deleteMany(filter = {}) {
          const before = documents.length;
          const remaining = documents.filter((item) => !matches(item, filter));
          documents.splice(0, documents.length, ...remaining);
          return { acknowledged: true, deletedCount: before - documents.length };
        },
        async countDocuments(filter = {}) {
          return documents.filter((item) => matches(item, filter)).length;
        },
      };
      collections.set(name, collection);
      return collection;
    },
    async command() { return { ok: 1 }; },
  };
}

function createMemoryAssetStore() {
  const assets = new Map();
  return {
    async save(id, source, metadata, maxBytes) {
      const chunks = [];
      let size = 0;
      for await (const chunk of source) {
        size += chunk.length;
        if (size > maxBytes) {
          source.resume?.();
          const error = new Error('Each project file must be 50 MB or smaller. Use a Google Drive link for larger files.');
          error.status = 413;
          throw error;
        }
        chunks.push(chunk);
      }
      if (!size) {
        const error = new Error('Choose a non-empty project file.');
        error.status = 400;
        throw error;
      }
      assets.set(id, { bytes: Buffer.concat(chunks), metadata });
      return { size };
    },
    async remove(id) { assets.delete(id); },
    async has(id) { return assets.has(id); },
    async send(request, response, asset) {
      const stored = assets.get(asset.id);
      if (!stored) {
        const error = new Error('Project file not found.');
        error.status = 404;
        throw error;
      }
      const size = stored.bytes.length;
      const headers = {
        'Content-Type': asset.type,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(asset.name).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        'Accept-Ranges': 'bytes',
      };
      let start = 0;
      let end = size - 1;
      let status = 200;
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!range || (!range[1] && !range[2])) {
          response.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); response.end(); return;
        }
        if (range[1]) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1; }
        else start = Math.max(0, size - Number(range[2]));
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
          response.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); response.end(); return;
        }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      }
      response.writeHead(status, { ...headers, 'Content-Length': end - start + 1 });
      if (request.method === 'HEAD') response.end();
      else response.end(stored.bytes.subarray(start, end + 1));
    },
  };
}

function createTestStore(initialData = createSeed()) {
  const source = clone(initialData);
  const data = {
    users: source.users || [],
    gigs: source.gigs || [],
    bookings: source.bookings || [],
    portfolioProjects: source.portfolioProjects || [],
    projects: source.projects || [],
    messages: source.messages || [],
    agreedRates: Object.entries(source.agreedRates || {}).map(([id, rate]) => ({ id, ...rate })),
    shortlists: Object.entries(source.shortlists || {}).map(([userId, gigIds]) => ({ id: userId, userId, gigIds })),
    sessions: [],
    bookingSlots: [],
  };
  const db = createMemoryDatabase(data);
  return {
    db,
    data,
    sessions: createSessionStore(db.collection('sessions')),
    assets: createMemoryAssetStore(),
    ping: async () => ({ ok: 1 }),
    close: async () => {},
  };
}

module.exports = { createTestStore, createMemoryDatabase };
