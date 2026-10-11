const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('node:path');
const pool = require('./db');
const config = require('./config');
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');
const contentRoutes = require('./routes/content');
const paymentRoutes = require('./routes/payments');

const app = express();
const publicDirectory = path.resolve(__dirname, '../../frontend/public');

app.disable('x-powered-by');
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use((request, response, next) => {
  if (request.body === undefined) {
    request.body = {};
  } else if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    return response.status(400).json({ error: 'Request body must be a JSON object' });
  }
  return next();
});

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    const status = config.sessionConfigured ? 'ok' : 'unavailable';
    const body = {
      status,
      database: 'connected',
      authentication: config.sessionConfigured ? 'configured' : 'unconfigured'
    };
    response.status(config.sessionConfigured ? 200 : 503).json(body);
  } catch (error) {
    console.error('[health] Database check failed:', error.code || error.message);
    response.status(503).json({
      status: 'unavailable',
      database: 'disconnected',
      authentication: config.sessionConfigured ? 'configured' : 'unconfigured'
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api', contentRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(publicDirectory));

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found' });
});

app.get('{*splat}', (_request, response) => {
  response.sendFile(path.join(publicDirectory, 'index.html'));
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return response.status(status).json({
      error: status === 413 ? 'Image must be 5 MB or smaller' : 'Image upload is invalid'
    });
  }
  console.error('[api] Request failed:', error.code || error.message);
  if (response.headersSent) return;
  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ error: 'Request body must contain valid JSON' });
  }
  return response.status(500).json({ error: 'An unexpected server error occurred' });
});

module.exports = app;