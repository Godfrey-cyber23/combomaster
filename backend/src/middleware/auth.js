const jwt = require('jsonwebtoken');
const config = require('../config');
const pool = require('../db');

async function requireAuth(request, response, next) {
  if (!config.sessionConfigured) {
    return response.status(503).json({ error: 'Authentication is not configured' });
  }

  const token = request.cookies?.[config.sessionName];
  if (!token) {
    return response.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const [users] = await pool.execute('SELECT id, role FROM users WHERE id = ? LIMIT 1', [decoded.sub]);
    if (!users.length) {
      response.clearCookie(config.sessionName, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'strict',
        path: '/'
      });
      return response.status(401).json({ error: 'Account no longer exists' });
    }
    request.auth = { sub: String(users[0].id), role: users[0].role };
    return next();
  } catch (_error) {
    if (_error.name !== 'JsonWebTokenError' && _error.name !== 'TokenExpiredError' &&
        _error.name !== 'NotBeforeError') {
      return next(_error);
    }
    return response.status(401).json({ error: 'Session expired or invalid' });
  }
}

function requireRole(role) {
  return (request, response, next) => {
    if (request.auth?.role !== role) {
      return response.status(403).json({ error: 'You do not have permission to access this resource' });
    }
    return next();
  };
}

function requireStaff(request, response, next) {
  if (!['admin', 'coach'].includes(request.auth?.role)) {
    return response.status(403).json({ error: 'Administrator or coach access is required' });
  }
  return next();
}

module.exports = { requireAuth, requireRole, requireStaff };
