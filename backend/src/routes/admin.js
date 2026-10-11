const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/dashboard', async (_request, response) => {
  const [[users], [bookings], [messages], [recentClients]] = await Promise.all([
    pool.execute("SELECT COUNT(*) AS total, SUM(created_at >= CURRENT_DATE) AS joined_today FROM users WHERE role = 'client'"),
    pool.execute("SELECT COUNT(*) AS total, SUM(status = 'pending') AS pending FROM bookings"),
    pool.execute('SELECT COUNT(*) AS total FROM messages WHERE created_at >= CURRENT_DATE'),
    pool.execute(
      "SELECT id, name, email, created_at FROM users WHERE role = 'client' ORDER BY created_at DESC LIMIT 10"
    )
  ]);
  response.json({
    stats: {
      clients: Number(users[0].total),
      joinedToday: Number(users[0].joined_today || 0),
      bookings: Number(bookings[0].total),
      pendingBookings: Number(bookings[0].pending || 0),
      messagesToday: Number(messages[0].total)
    },
    recentClients
  });
});

router.get('/clients', async (_request, response) => {
  const [clients] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.created_at, cp.goal,
       (SELECT MAX(pe.recorded_at) FROM progress_entries pe WHERE pe.user_id = u.id) AS last_progress_at,
       (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id AND b.status = 'pending') AS pending_bookings
     FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.role = 'client' ORDER BY u.created_at DESC LIMIT 200`
  );
  response.json({ clients });
});

router.get('/bookings', async (_request, response) => {
  const [bookings] = await pool.execute(
    `SELECT b.id, b.service, b.requested_at, b.status, u.name AS client_name, u.email AS client_email
     FROM bookings b JOIN users u ON u.id = b.user_id
     ORDER BY b.requested_at DESC LIMIT 200`
  );
  response.json({ bookings });
});

router.patch('/bookings/:id', async (request, response) => {
  const status = request.body.status;
  if (!['approved', 'declined', 'completed'].includes(status)) {
    return response.status(400).json({ error: 'Booking status is invalid' });
  }
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).json({ error: 'Booking id is invalid' });
  }
  const [result] = await pool.execute('UPDATE bookings SET status = ? WHERE id = ?', [status, request.params.id]);
  if (!result.affectedRows) {
    return response.status(404).json({ error: 'Booking not found' });
  }
  response.json({ id: Number(request.params.id), status });
});

router.get('/messages', async (_request, response) => {
  const [messages] = await pool.execute(
    `SELECT m.id, m.user_id, m.sender_id, m.body, m.created_at, u.name AS client_name
     FROM messages m JOIN users u ON u.id = m.user_id
     ORDER BY m.created_at ASC LIMIT 500`
  );
  response.json({ messages });
});

router.post('/messages/:userId', async (request, response) => {
  const body = typeof request.body.body === 'string' ? request.body.body.trim() : '';
  if (!body || body.length > 4000) {
    return response.status(400).json({ error: 'Message must be between 1 and 4000 characters' });
  }
  const [result] = await pool.execute(
    `INSERT INTO messages (user_id, sender_id, body)
     SELECT id, ?, ? FROM users WHERE id = ? AND role = 'client'`,
    [request.auth.sub, body, request.params.userId]
  );
  if (!result.affectedRows) {
    return response.status(404).json({ error: 'Client not found' });
  }
  response.status(201).json({ id: result.insertId, user_id: Number(request.params.userId), sender_id: request.auth.sub, body });
});

module.exports = router;
