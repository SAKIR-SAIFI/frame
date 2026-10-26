const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateOtp, hashOtp, verifyOtp, OTP_PATTERN } = require('./registration-otp');

test('verification codes are six digits', () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateOtp(), OTP_PATTERN);
  }
});

test('verification codes are hashed and compared timing-safely', async () => {
  const hash = await hashOtp('123456');
  assert.notEqual(hash, '123456');
  assert.equal(await verifyOtp('123456', hash), true);
  assert.equal(await verifyOtp('654321', hash), false);
  assert.equal(await verifyOtp('123456', 'invalid'), false);
});
