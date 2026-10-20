const { Resend } = require('resend');

const CONTACT_EMAIL = 'enquiry@perfectlens.in';
const DEFAULT_FROM = 'perfectlens. India contact form <enquiry@perfectlens.in>';

function contactEmailError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

async function sendContactEmail({ name, email, type, subject, message }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw contactEmailError('CONTACT_EMAIL_NOT_CONFIGURED', 'RESEND_API_KEY is not configured.');
  }

  const resend = new Resend(apiKey);
  const from = process.env.CONTACT_FROM_EMAIL?.trim() || DEFAULT_FROM;

  let result;
  try {
    result = await resend.emails.send({
      from,
      to: CONTACT_EMAIL,
      replyTo: email,
      subject: `[perfectlens. ${type}] ${subject}`,
      text: [
        'A new message was sent through the perfectlens. India contact form.',
        '',
        `Type: ${type}`,
        `Name: ${name}`,
        `Email: ${email}`,
        `Subject: ${subject}`,
        '',
        message,
      ].join('\n'),
    });
  } catch (cause) {
    throw contactEmailError('CONTACT_EMAIL_FAILED', 'The Resend request failed.', cause);
  }

  if (result.error) {
    throw contactEmailError('CONTACT_EMAIL_FAILED', result.error.message || 'Resend rejected the message.');
  }

  return result.data;
}

module.exports = { CONTACT_EMAIL, sendContactEmail };
