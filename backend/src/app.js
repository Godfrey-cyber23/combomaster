const express = require('express');
const cors = require('cors');
const path = require('node:path');

const app = express();
const publicDirectory = path.resolve(__dirname, '../../frontend/public');

app.disable('x-powered-by');
app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.use(express.static(publicDirectory));

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found' });
});

app.get('{*splat}', (_request, response) => {
  response.sendFile(path.join(publicDirectory, 'index.html'));
});

module.exports = app;