const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Resend } = require('resend');
const { CONTACT_EMAIL, sendContactEmail } = require('./contact-email');

const message = {
  name: 'Aditi Verma',
  email: 'aditi@example.in',
  type: 'Suggestion',
  subject: 'Show prices in the discovery list',
  message: 'It would help to see day rates on gig cards.',
};

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

test('contact email requires a Resend API key', async (t) => {
  withEnv(t, { RESEND_API_KEY: undefined, CONTACT_FROM_EMAIL: undefined });
  await assert.rejects(sendContactEmail(message), { code: 'CONTACT_EMAIL_NOT_CONFIGURED' });
});

test('contact email forwards submissions through Resend with the visitor reply-to', async (t) => {
  withEnv(t, { RESEND_API_KEY: 're_test_key', CONTACT_FROM_EMAIL: 'perfectlens. India <contact@perfectlens.in>' });
  const calls = [];
  mock.method(emailsPrototype, 'send', async (payload) => {
    calls.push(payload);
    return { data: { id: 'email-123' }, error: null };
  });
  t.after(() => mock.restoreAll());

  const result = await sendContactEmail(message);

  assert.deepEqual(result, { id: 'email-123' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].from, 'perfectlens. India <contact@perfectlens.in>');
  assert.equal(calls[0].to, CONTACT_EMAIL);
  assert.equal(calls[0].replyTo, 'aditi@example.in');
  assert.equal(calls[0].subject, '[perfectlens. Suggestion] Show prices in the discovery list');
  assert.match(calls[0].text, /Name: Aditi Verma/);
  assert.match(calls[0].text, /It would help to see day rates on gig cards\./);
});

test('contact email surfaces Resend delivery failures', async (t) => {
  withEnv(t, { RESEND_API_KEY: 're_test_key', CONTACT_FROM_EMAIL: undefined });
  mock.method(emailsPrototype, 'send', async () => ({ data: null, error: { message: 'The domain is not verified.', name: 'validation_error' } }));
  t.after(() => mock.restoreAll());

  await assert.rejects(sendContactEmail(message), { code: 'CONTACT_EMAIL_FAILED' });
});
