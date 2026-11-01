const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { getAuth, getDocument, getFirestore } = require('../firestore');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt limit

function isValidPassword(password) {
  return typeof password === 'string'
    && password.length >= PASSWORD_MIN
    && Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES;
}

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

function clearSession(response) {
  response.clearCookie(config.sessionName, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/'
  });
}

// ============================================================
// FORGOT PASSWORD / RESET PASSWORD
// ============================================================

// POST /api/auth/forgot-password
// Body: { email }
// Always returns 200 so we don't leak whether an email is registered.
router.post('/forgot-password', async (request, response, next) => {
  try {
    const email = typeof request.body.email === 'string'
      ? request.body.email.trim().toLowerCase()
      : '';

    if (!emailPattern.test(email) || email.length > 254) {
      return response.status(400).json({ error: 'Enter a valid email address' });
    }

    // Look the user up via the same sha256(email) index used by /login.
    const emailHash = crypto.createHash('sha256').update(email).digest('hex');
    const emailSnapshot = await getDocument('_user_emails', emailHash).get();

    if (!emailSnapshot.exists) {
      // Don't reveal that the account doesn't exist.
      return response.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const userId = emailSnapshot.get('user_id');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    // Store the reset token in its own collection so /reset-password can
    // do a direct document lookup (no index, no collection-wide query).
    // Firestore TTL can be enabled on `_password_resets.expires_at` later.
    await getDocument('_password_resets', tokenHash).set({
      user_id: userId,
      expires_at: expiresAt,
      created_at: new Date()
    });

    // Only trust the configured frontend URL — never the Origin header,
    // which can be spoofed and would poison the reset link.
    const frontendBase = config.frontendUrl || 'http://localhost:3000';
    const resetUrl = `${frontendBase.replace(/\/+$/, '')}/resetpassword.html?token=${token}`;

    // TODO: send an actual email. For now, log so you can test locally.
    console.log(`[forgot-password] Reset link for ${email}: ${resetUrl}`);

    return response.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    return next(error);
  }
});

// POST /api/auth/reset-password
// Body: { token, password }
router.post('/reset-password', async (request, response, next) => {
  try {
    const token = typeof request.body.token === 'string' ? request.body.token : '';
    const password = typeof request.body.password === 'string' ? request.body.password : '';

    if (!token || !password) {
      return response.status(400).json({ error: 'Token and new password are required' });
    }
    if (!isValidPassword(password)) {
      return response.status(400).json({
        error: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX_BYTES} characters (UTF-8).`
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetRef = getDocument('_password_resets', tokenHash);
    const resetSnapshot = await resetRef.get();

    if (!resetSnapshot.exists) {
      return response.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    const resetData = resetSnapshot.data();
    if (!resetData.expires_at || Number(resetData.expires_at) < Date.now()) {
      // Clean up the stale entry.
      await resetRef.delete().catch(() => {});
      return response.status(400).json({ error: 'This reset link has expired. Request a new one.' });
    }

    const userId = resetData.user_id;
    const userRef = getDocument('users', userId);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) {
      await resetRef.delete().catch(() => {});
      return response.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    // IMPORTANT: same field name as /register and /login use — password_hash.
    const passwordHash = await bcrypt.hash(password, 12); // match register cost

    await userRef.set({
      password_hash: passwordHash,
      updated_at: new Date()
    }, { merge: true });

    // Consume the reset token so it can't be reused.
    await resetRef.delete().catch(() => {});

    // Invalidate any active session for this user.
    // (Full invalidation of already-issued JWTs would require a tokenVersion
    // check in requireAuth — out of scope here, but recommended.)
    clearSession(response);

    return response.json({ message: 'Password updated. You can now sign in.' });
  } catch (error) {
    return next(error);
  }
});

// ============================================================
// REGISTER / LOGIN / FIREBASE / ME / LOGOUT
// ============================================================

router.post('/register', async (request, response) => {
  if (!config.sessionConfigured) {
    return response.status(503).json({ error: 'Authentication is not configured' });
  }
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
  const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const password = typeof request.body.password === 'string' ? request.body.password : '';

  if (name.length < 2 || name.length > 100
      || !emailPattern.test(email) || email.length > 254
      || !isValidPassword(password)) {
    return response.status(400).json({
      error: `Enter a valid name and email address, and a password between ${PASSWORD_MIN} and ${PASSWORD_MAX_BYTES} UTF-8 bytes`
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
    const createdUser = {
      id, name, email, password_hash: passwordHash, role: 'client',
      created_at: new Date(), updated_at: new Date()
    };
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
  if (!emailPattern.test(email) || !password || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
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

router.post('/firebase-login', async (request, response) => {
  if (!config.sessionConfigured) return response.status(503).json({ error: 'Authentication is not configured' });
  if (!config.firebaseServiceAccountPath) return response.status(503).json({ error: 'Firebase is not configured' });

  const { token } = request.body || {};
  if (!token || typeof token !== 'string') return response.status(400).json({ error: 'Firebase token required' });

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch (error) {
    // Surface a 503 if Firebase itself isn't initialised; otherwise 401.
    if (error.status === 503) {
      return response.status(503).json({ error: error.message });
    }
    return response.status(401).json({ error: 'Invalid Firebase token' });
  }

  if (!decoded.email) return response.status(400).json({ error: 'Firebase token did not include an email' });

  const email = decoded.email.trim().toLowerCase();
  const emailHash = crypto.createHash('sha256').update(email).digest('hex');
  const db = getFirestore();

  const user = await db.runTransaction(async (transaction) => {
    const emailRef = db.collection('_user_emails').doc(emailHash);
    const emailSnapshot = await transaction.get(emailRef);

    if (emailSnapshot.exists) {
      const userRef = db.collection('users').doc(String(emailSnapshot.get('user_id')));
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) return null;
      const data = userSnapshot.data();
      if (!data.firebase_uid) transaction.update(userRef, { firebase_uid: decoded.uid, updated_at: new Date() });
      return publicUser(data);
    }

    const counterRef = db.collection('_counters').doc('users');
    const counter = await transaction.get(counterRef);
    const id = (counter.exists ? Number(counter.get('value')) : 0) + 1;
    const userRef = db.collection('users').doc(String(id));
    const createdUser = {
      id, name: decoded.name || email.split('@')[0].slice(0, 100),
      email, role: 'client', firebase_uid: decoded.uid,
      created_at: new Date(), updated_at: new Date()
    };
    transaction.set(counterRef, { value: id });
    transaction.create(userRef, createdUser);
    transaction.create(emailRef, { user_id: id });
    return publicUser(createdUser);
  });

  if (!user) return response.status(401).json({ error: 'Account not found' });
  setSession(response, user);
  return response.json({ user, message: 'Signed in successfully' });
});

router.get('/me', requireAuth, async (request, response) => {
  const userSnapshot = await getDocument('users', request.auth.sub).get();
  if (!userSnapshot.exists) {
    clearSession(response);
    return response.status(401).json({ error: 'Account no longer exists' });
  }
  return response.json({ user: publicUser(userSnapshot.data()) });
});

router.post('/logout', (_request, response) => {
  clearSession(response);
  response.status(204).end();
});

module.exports = router;