const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Resend } = require('resend');
const { sendOtpEmail } = require('./otp-email');

const emailsPrototype = Object.getPrototypeOf(new Resend('re_test').emails);

function withEnv(t, values) {
  const original = {};
  for (const [key, value] of Object.entries(values)) {
    original[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('verification email requires a Resend API key', async (t) => {
  withEnv(t, { RESEND_API_KEY: undefined, CONTACT_FROM_EMAIL: undefined, OTP_FROM_EMAIL: undefined });
  await assert.rejects(sendOtpEmail({ email: 'aditi@example.in', name: 'Aditi', code: '123456' }), { code: 'OTP_EMAIL_NOT_CONFIGURED' });
});

test('verification email sends the code through Resend with the configured sender', async (t) => {
  withEnv(t, {
    RESEND_API_KEY: 're_test_key',
    CONTACT_FROM_EMAIL: 'perfectlens. India <contact@perfectlens.in>',
    OTP_FROM_EMAIL: 'perfectlens. India accounts <accounts@perfectlens.in>',
  });
  const calls = [];
  mock.method(emailsPrototype, 'send', async (payload) => {
    calls.push(payload);
    return { data: { id: 'email-123' }, error: null };
  });
  t.after(() => mock.restoreAll());

  const result = await sendOtpEmail({ email: 'aditi@example.in', name: 'Aditi', code: '123456' });

  assert.deepEqual(result, { id: 'email-123' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].from, 'perfectlens. India accounts <accounts@perfectlens.in>');
  assert.equal(calls[0].to, 'aditi@example.in');
  assert.equal(calls[0].subject, 'Your perfectlens. verification code');
  assert.match(calls[0].text, /123456/);
  assert.match(calls[0].text, /expires in 10 minutes/i);
  assert.match(calls[0].html, /123456/);
});

test('verification email surfaces Resend delivery failures', async (t) => {
  withEnv(t, { RESEND_API_KEY: 're_test_key', CONTACT_FROM_EMAIL: undefined, OTP_FROM_EMAIL: undefined });
  mock.method(emailsPrototype, 'send', async () => ({ data: null, error: { message: 'The domain is not verified.' } }));
  t.after(() => mock.restoreAll());

  await assert.rejects(sendOtpEmail({ email: 'aditi@example.in', name: 'Aditi', code: '123456' }), { code: 'OTP_EMAIL_FAILED' });
});
