const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function setSession(response, user) {
  const token = jwt.sign(
    { sub: String(user.id), role: user.role },
    config.jwtSecret,
    { expiresIn: config.sessionLifetime }
  );
  response.cookie(config.sessionName, token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: config.sessionLifetime * 1000,
    path: '/'
  });
}

router.post('/register', async (request, response) => {
  if (!config.sessionConfigured) {
    return response.status(503).json({ error: 'Authentication is not configured' });
  }
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
  const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const password = typeof request.body.password === 'string' ? request.body.password : '';

  if (name.length < 2 || name.length > 100 || !emailPattern.test(email) || email.length > 254 ||
      password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return response.status(400).json({
      error: 'Enter a valid name and email address, and a password between 8 and 72 UTF-8 bytes'
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, 'client']
    );
    const user = { id: result.insertId, name, email, role: 'client' };
    setSession(response, user);
    return response.status(201).json({ user, message: 'Account created successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'An account with that email already exists' });
    }
    throw error;
  }
});

router.post('/login', async (request, response) => {
  if (!config.sessionConfigured) {
    return response.status(503).json({ error: 'Authentication is not configured' });
  }
  const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const password = typeof request.body.password === 'string' ? request.body.password : '';
  if (!emailPattern.test(email) || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return response.status(400).json({ error: 'Enter a valid email address and password' });
  }

  const [users] = await pool.execute(
    'SELECT id, name, email, password, role FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  if (!users.length || !users[0].password || !(await bcrypt.compare(password, users[0].password))) {
    return response.status(401).json({ error: 'Invalid email or password' });
  }

  const user = publicUser(users[0]);
  setSession(response, user);
  return response.json({ user, message: 'Login successful' });
});

router.get('/me', requireAuth, async (request, response) => {
  const [users] = await pool.execute(
    'SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1',
    [request.auth.sub]
  );
  if (!users.length) {
    response.clearCookie(config.sessionName, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      path: '/'
    });
    return response.status(401).json({ error: 'Account no longer exists' });
  }
  return response.json({ user: publicUser(users[0]) });
});

router.post('/logout', (_request, response) => {
  response.clearCookie(config.sessionName, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/'
  });
  response.status(204).end();
});

module.exports = router;
