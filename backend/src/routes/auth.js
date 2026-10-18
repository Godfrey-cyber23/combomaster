const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { getDocument, getFirestore } = require('../firestore');
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
  const db = getFirestore();
  const emailRef = db.collection('_user_emails').doc(crypto.createHash('sha256').update(email).digest('hex'));
  const user = await db.runTransaction(async (transaction) => {
    const emailSnapshot = await transaction.get(emailRef);
    if (emailSnapshot.exists) return null;
    const counterRef = db.collection('_counters').doc('users');
    const counter = await transaction.get(counterRef);
    const id = (counter.exists ? Number(counter.get('value')) : 0) + 1;
    const userRef = db.collection('users').doc(String(id));
    const createdUser = { id, name, email, password_hash: passwordHash, role: 'client', created_at: new Date(), updated_at: new Date() };
    transaction.set(counterRef, { value: id });
    transaction.create(userRef, createdUser);
    transaction.create(emailRef, { user_id: id });
    return publicUser(createdUser);
  });
  if (!user) return response.status(409).json({ error: 'An account with that email already exists' });
  setSession(response, user);
  return response.status(201).json({ user, message: 'Account created successfully' });
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

  const emailHash = crypto.createHash('sha256').update(email).digest('hex');
  const emailSnapshot = await getDocument('_user_emails', emailHash).get();
  const userSnapshot = emailSnapshot.exists
    ? await getDocument('users', emailSnapshot.get('user_id')).get()
    : null;
  const userRecord = userSnapshot?.exists ? userSnapshot.data() : null;
  if (!userRecord?.password_hash || !(await bcrypt.compare(password, userRecord.password_hash))) {
    return response.status(401).json({ error: 'Invalid email or password' });
  }

  const user = publicUser(userRecord);
  setSession(response, user);
  return response.json({ user, message: 'Login successful' });
});

router.get('/me', requireAuth, async (request, response) => {
  const userSnapshot = await getDocument('users', request.auth.sub).get();
  if (!userSnapshot.exists) {
    response.clearCookie(config.sessionName, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      path: '/'
    });
    return response.status(401).json({ error: 'Account no longer exists' });
  }
  return response.json({ user: publicUser(userSnapshot.data()) });
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
