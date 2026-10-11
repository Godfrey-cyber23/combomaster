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
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_DATABASE || 'combomaster_fitness',
    user: process.env.DB_USERNAME || 'combomaster_app',
    password: process.env.DB_PASSWORD || ''
  },
  publicAppUrl: process.env.PUBLIC_APP_URL || '',
  flutterwaveSecretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
  flutterwaveWebhookSecretHash: process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH || '',
  uploadDirectory: path.resolve(__dirname, '../../../storage/uploads'),
  migrationDatabase: {
    user: process.env.DB_MIGRATION_USERNAME || process.env.DB_USERNAME || 'combomaster_migrator',
    password: process.env.DB_MIGRATION_PASSWORD || process.env.DB_PASSWORD || ''
  }
};