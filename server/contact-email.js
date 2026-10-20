const nodemailer = require("nodemailer");

const CONTACT_EMAIL = "saifi.sameer.0001@gmail.com";

async function sendContactEmail({ name, email, type, subject, message }) {
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!appPassword) {
    const error = new Error("GMAIL_APP_PASSWORD is not configured.");
    error.code = "CONTACT_EMAIL_NOT_CONFIGURED";
    throw error;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: CONTACT_EMAIL, pass: appPassword },
  });

  await transporter.sendMail({
    from: { name: "perfectlens. India contact form", address: CONTACT_EMAIL },
    to: CONTACT_EMAIL,
    replyTo: email,
    subject: `[perfectlens. ${type}] ${subject}`,
    text: [
      "A new message was sent through the perfectlens. India contact form.",
      "",
      `Type: ${type}`,
      `Name: ${name}`,
      `Email: ${email}`,
      `Subject: ${subject}`,
      "",
      message,
    ].join("\n"),
  });
}

module.exports = { CONTACT_EMAIL, sendContactEmail };
