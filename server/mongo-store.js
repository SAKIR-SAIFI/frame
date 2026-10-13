const dns = require('node:dns');
const { MongoClient } = require('mongodb');
const { createMongoAssetStore } = require('./mongo-assets');
const { createSessionStore } = require('./session-store');

const indexes = {
  users: [
    { key: { id: 1 }, unique: true, name: 'user-id-unique' },
    { key: { email: 1, role: 1 }, unique: true, name: 'user-email-role-unique' },
  ],
  gigs: [
    { key: { id: 1 }, unique: true, name: 'gig-id-unique' },
    { key: { status: 1, category: 1 }, name: 'gig-discovery' },
    { key: { ownerId: 1, status: 1 }, name: 'gig-owner-status' },
  ],
  bookings: [
    { key: { id: 1 }, unique: true, name: 'booking-id-unique' },
    { key: { clientId: 1, status: 1 }, name: 'booking-client-status' },
    { key: { freelancerId: 1, date: 1, status: 1 }, name: 'booking-freelancer-date-status' },
    { key: { creatorId: 1, clientId: 1, status: 1 }, name: 'booking-thread' },
  ],
  projects: [
    { key: { id: 1 }, unique: true, name: 'project-id-unique' },
    { key: { clientId: 1, status: 1 }, name: 'project-client-status' },
  ],
  portfolioProjects: [
    { key: { id: 1 }, unique: true, name: 'portfolio-project-id-unique' },
    { key: { ownerId: 1, showOnProfile: 1 }, name: 'portfolio-owner-visibility' },
    { key: { 'assets.id': 1 }, name: 'portfolio-asset-id' },
  ],
  messages: [
    { key: { id: 1 }, unique: true, name: 'message-id-unique' },
    { key: { creatorId: 1, clientId: 1, timestamp: 1 }, name: 'message-thread-time' },
  ],
  agreedRates: [
    { key: { clientId: 1, creatorId: 1 }, unique: true, name: 'agreed-rate-thread-unique' },
  ],
  shortlists: [
    { key: { userId: 1 }, unique: true, name: 'shortlist-user-unique' },
  ],
  sessions: [
    { key: { tokenHash: 1 }, unique: true, name: 'session-token-hash-unique' },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'session-expiry-ttl' },
  ],
};

async function createMongoStore({
  uri = process.env.MONGODB_URI,
  dbName = process.env.MONGODB_DB_NAME || 'frame',
} = {}) {
  if (!uri) throw new Error('MONGODB_URI is required to start the marketplace API.');
  if (!dbName) throw new Error('MONGODB_DB_NAME must not be empty.');

  const dnsServers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map((server) => server.trim()).filter(Boolean);
  if (dnsServers.length) dns.setServers(dnsServers);

  const client = new MongoClient(uri, {
    appName: 'frame-marketplace',
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 5),
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 15_000,
  });

  try {
    await client.connect();
    const db = client.db(dbName);
    await Promise.all(Object.entries(indexes).map(([collection, definitions]) => db.collection(collection).createIndexes(definitions)));
    await db.collection('portfolioAssets.files').createIndex({ 'metadata.assetId': 1 }, { unique: true, name: 'portfolio-asset-id-unique' });

    return {
      db,
      client,
      sessions: createSessionStore(db.collection('sessions')),
      assets: createMongoAssetStore(db),
      ping: () => db.command({ ping: 1 }),
      close: () => client.close(),
    };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

module.exports = { createMongoStore };
