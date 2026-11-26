const nodemailer = require('nodemailer');
const config = require('../config');

const transporter = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpPort === 465,
  auth: {
    user: config.smtpUser,
    pass: config.smtpPass
  }
});

async function sendPasswordResetEmail(email, resetUrl) {
  if (!config.smtpUser || !config.smtpPass || !config.mailFrom) {
    throw new Error('SMTP credentials are not configured');
  }

  return transporter.sendMail({
    from: {
      name: 'ComboMaster',
      address: config.mailFrom
    },
    to: email,
    subject: 'Reset your ComboMaster password',
    text: `You requested a password reset for your ComboMaster account.

Open this link to reset your password:

${resetUrl}

This link expires in one hour and can only be used once. If you did not request this reset, ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:25px;color:#222">
        <h2 style="color:#2563eb">ComboMaster</h2>
        <h3>Password Reset Request</h3>
        <p>We received a request to reset your ComboMaster account password.</p>
        <p>Click below to choose a new password.</p>
        <p style="margin:30px 0">
          <a href="${resetUrl}"
             style="background:#2563eb;color:#fff;padding:13px 24px;text-decoration:none;border-radius:6px;display:inline-block">
            Reset My Password
          </a>
        </p>
        <p>This link expires in one hour and can only be used once.</p>
        <p>If you did not request this reset, you can safely ignore this email.</p>
        <hr>
        <small>ComboMaster Fitness</small>
      </div>
    `
  });
}

module.exports = { sendPasswordResetEmail };
