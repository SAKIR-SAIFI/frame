const { Resend } = require('resend');

const DEFAULT_FROM = 'perfectlens. India <enquiry@perfectlens.in>';

function otpEmailError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

async function sendOtpEmail({ email, name, code, expiresInMinutes = 10 }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw otpEmailError('OTP_EMAIL_NOT_CONFIGURED', 'RESEND_API_KEY is not configured.');
  }

  const resend = new Resend(apiKey);
  const from = process.env.OTP_FROM_EMAIL?.trim()
    || process.env.CONTACT_FROM_EMAIL?.trim()
    || DEFAULT_FROM;
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const subject = 'Your perfectlens. verification code';

  let result;
  try {
    result = await resend.emails.send({
      from,
      to: email,
      subject,
      text: [
        greeting,
        '',
        `Your perfectlens. verification code is: ${code}`,
        '',
        `Enter this code to finish creating your account. It expires in ${expiresInMinutes} minutes.`,
        'If you did not request this code, you can ignore this email.',
      ].join('\n'),
      html: [
        `<p>${escapeHtml(greeting)}</p>`,
        '<p>Your perfectlens. verification code is:</p>',
        `<p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:24px 0;color:#203124;">${escapeHtml(code)}</p>`,
        `<p>Enter this code to finish creating your account. It expires in ${expiresInMinutes} minutes.</p>`,
        '<p>If you did not request this code, you can ignore this email.</p>',
      ].join(''),
    });
  } catch (cause) {
    throw otpEmailError('OTP_EMAIL_FAILED', 'The Resend request failed.', cause);
  }

  if (result.error) {
    throw otpEmailError('OTP_EMAIL_FAILED', result.error.message || 'Resend rejected the verification email.');
  }

  return result.data;
}

module.exports = { sendOtpEmail };
