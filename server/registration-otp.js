const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
const OTP_MAX_SENDS_PER_WINDOW = 5;
const OTP_PATTERN = /^\d{6}$/;

function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

async function hashOtp(code) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(code, salt, 64)).toString('hex')}`;
}

async function verifyOtp(code, hash) {
  const [salt, expected] = String(hash || '').split(':');
  if (!salt || !expected) return false;
  const actual = await scrypt(code, salt, 64);
  const stored = Buffer.from(expected, 'hex');
  return stored.length === actual.length && crypto.timingSafeEqual(stored, actual);
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_SEND_WINDOW_MS,
  OTP_MAX_SENDS_PER_WINDOW,
  OTP_PATTERN,
};
