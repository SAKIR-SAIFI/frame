const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createMongoStore } = require('./mongo-store');
const { createMarketplaceServer } = require('./index');
const { dateKey, parseDate } = require('../src/utils/scheduling');

const mongoUri = process.env.MONGODB_TEST_URI;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

function close(server) {
  return new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(resolve);
    server.closeAllConnections();
  });
}

test('MongoDB indexes, GridFS assets, and sessions are shared across app instances', { skip: !mongoUri }, async (t) => {
  const dbName = `perfectlens_ci_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const firstStore = await createMongoStore({ uri: mongoUri, dbName });
  const stores = [firstStore];
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map(close));
    await firstStore.db.dropDatabase();
    await Promise.all(stores.map((store) => store.close()));
  });
  const secondStore = await createMongoStore({ uri: mongoUri, dbName });
  stores.push(secondStore);

  assert.equal(await firstStore.db.collection('users').countDocuments(), 0);
  assert.equal(await firstStore.db.collection('gigs').countDocuments(), 0);
  const userIndexes = await firstStore.db.collection('users').listIndexes().toArray();
  assert.ok(userIndexes.some((index) => index.name === 'user-email-role-unique' && index.unique));

  const user = {
    id: 'integration-client', name: 'Integration Client', email: 'mongo-test@example.in', role: 'client',
    passwordHash: 'test-only', location: 'Mumbai, Maharashtra', phone: '9876543210', company: '', availability: [],
  };
  await firstStore.db.collection('users').insertOne(user);
  await assert.rejects(
    firstStore.db.collection('users').insertOne({ ...user, id: 'another-client' }),
    (error) => error.code === 11000,
  );

  const token = crypto.randomBytes(32).toString('hex');
  await firstStore.sessions.create(token, user.id, Date.now() + 60_000);
  const firstServer = createMarketplaceServer({ store: firstStore, buildDirectory: path.resolve(__dirname, '../public') });
  const secondServer = createMarketplaceServer({ store: secondStore, buildDirectory: path.resolve(__dirname, '../public') });
  servers.push(firstServer, secondServer);
  const firstUrl = await listen(firstServer);
  const secondUrl = await listen(secondServer);

  const shared = await fetch(`${secondUrl}/api/workspace`, { headers: { Cookie: `perfectlens_session=${token}` } });
  assert.equal(shared.status, 200);
  const workspace = await shared.json();
  assert.equal(workspace.user.id, user.id);
  assert.equal(workspace.gigs.length, 0);

  const freelancer = {
    id: 'integration-freelancer', name: 'Integration Freelancer', email: 'mongo-freelancer@example.in', role: 'freelancer',
    passwordHash: 'test-only', location: 'Mumbai, Maharashtra', phone: '9876543211', specialty: 'camera', company: '',
    availability: [],
  };
  const date = parseDate(dateKey());
  date.setUTCDate(date.getUTCDate() + 7);
  const bookingDate = dateKey(date);
  freelancer.availability = [{ id: 'weekly-hours', weekday: parseDate(bookingDate).getUTCDay(), start: '09:00', end: '17:00' }];
  await firstStore.db.collection('users').insertOne(freelancer);
  await firstStore.db.collection('gigs').insertOne({
    id: 'integration-gig', ownerId: freelancer.id, name: freelancer.name, category: 'camera', location: freelancer.location,
    rate: 10000, title: 'Camera operation for your next brand film', bio: 'Experienced camera specialist for brand films and wedding productions.',
    equipment: ['Sony FX3'], skills: ['Hindi'], cover: '', avatar: '', color: '#e3eacb', rating: 0, reviews: 0,
    verified: false, remote: false, status: 'published', createdAt: Date.now(),
  });
  const simultaneousBookings = await Promise.all([firstUrl, secondUrl].map((url) => fetch(`${url}/api/bookings`, {
    method: 'POST',
    headers: { Cookie: `perfectlens_session=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ creatorId: 'integration-gig', date: bookingDate, start: '10:00', end: '12:00' }),
  })));
  assert.deepEqual(simultaneousBookings.map((response) => response.status).sort(), [201, 409]);

  const health = await fetch(`${firstUrl}/api/health`);
  assert.equal(health.status, 200);

  const bytes = Buffer.from('persistent GridFS asset');
  const saved = await firstStore.assets.save('mongo-asset-test', Readable.from([bytes]), { name: 'sample.pdf', type: 'application/pdf' }, 1024);
  assert.equal(saved.size, bytes.length);
  assert.equal(await secondStore.assets.has('mongo-asset-test'), true);
  await secondStore.assets.remove('mongo-asset-test');
  assert.equal(await firstStore.assets.has('mongo-asset-test'), false);

  const logout = await fetch(`${secondUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: `perfectlens_session=${token}` } });
  assert.equal(logout.status, 200);
  const invalidated = await fetch(`${firstUrl}/api/workspace`, { headers: { Cookie: `perfectlens_session=${token}` } });
  assert.equal(invalidated.status, 401);
});
