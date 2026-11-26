
const config = require('../config');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function sendPasswordResetEmail(email, resetUrl) {
  if (!config.brevoApiKey) {
    throw new Error('Brevo API key is not configured');
  }

  if (!config.brevoSenderEmail) {
    throw new Error('Brevo sender email is not configured');
  }

  const safeResetUrl = escapeHtml(resetUrl);

  const payload = {
    sender: {
      name: config.brevoSenderName,
      email: config.brevoSenderEmail
    },
    to: [{ email }],
    subject: 'Reset your ComboMaster password',
    textContent: `You requested a password reset for your ComboMaster account.

Open this link to reset your password:

${resetUrl}

This link expires in one hour and can only be used once. If you did not request this reset, ignore this email.`,
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <body style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:25px;color:#222">
          <h2 style="color:#2563eb">ComboMaster</h2>
          <h3>Password Reset Request</h3>
          <p>We received a request to reset your ComboMaster account password.</p>
          <p>Click below to choose a new password.</p>
          <p style="margin:30px 0">
            <a href="${safeResetUrl}"
               style="background:#2563eb;color:#fff;padding:13px 24px;text-decoration:none;border-radius:6px;display:inline-block">
              Reset My Password
            </a>
          </p>
          <p>This link expires in one hour and can only be used once.</p>
          <p>If you did not request this reset, you can safely ignore this email.</p>
          <hr>
          <small>ComboMaster Fitness</small>
        </body>
      </html>
    `
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': config.brevoApiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();

  let result = {};

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = { message: responseText };
  }

  if (!response.ok) {
    throw new Error(
      `Brevo API error (${response.status}): ${
        result.message || result.code || 'Email sending failed'
      }`
    );
  }

  return result;
}

module.exports = { sendPasswordResetEmail };
