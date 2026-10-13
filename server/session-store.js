const crypto = require('node:crypto');

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSessionStore(collection) {
  return {
    async create(token, userId, expiresAt) {
      await collection.insertOne({
        tokenHash: tokenHash(token),
        userId,
        expiresAt: new Date(expiresAt),
        createdAt: Date.now(),
      });
    },
    async get(token) {
      if (!token || !/^[a-f\d]{64}$/i.test(token)) return null;
      const session = await collection.findOne({
        tokenHash: tokenHash(token),
        expiresAt: { $gt: new Date() },
      });
      return session ? { userId: session.userId, expires: session.expiresAt.getTime() } : null;
    },
    async delete(token) {
      if (!token || !/^[a-f\d]{64}$/i.test(token)) return;
      await collection.deleteOne({ tokenHash: tokenHash(token) });
    },
  };
}

module.exports = { createSessionStore, tokenHash };
