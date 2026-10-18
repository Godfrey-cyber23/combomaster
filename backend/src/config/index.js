const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  sessionConfigured: Boolean(
    process.env.JWT_SECRET &&
    process.env.JWT_SECRET.length >= 32 &&
    !/replace-with|change-me/i.test(process.env.JWT_SECRET)
  ),
  sessionLifetime: Number(process.env.SESSION_LIFETIME) || 3600,
  sessionName: process.env.SESSION_NAME || 'combomaster_session',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseDatabaseId: process.env.FIREBASE_DATABASE_ID || 'default',
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : '',
  publicAppUrl: process.env.PUBLIC_APP_URL || '',
  flutterwaveSecretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
  flutterwaveWebhookSecretHash: process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH || '',
  uploadDirectory: path.resolve(__dirname, '../../../storage/uploads')
};