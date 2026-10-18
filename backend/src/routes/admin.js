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

router.get('/orders', async (_request, response) => {
  const [orders] = await pool.execute(
    `SELECT id, tx_ref, customer_name, customer_email, customer_phone, payment_method,
       currency, amount, items, status, created_at, updated_at
     FROM shop_orders ORDER BY created_at DESC LIMIT 200`
  );
  response.json({ orders });
});

router.get('/sales', async (_request, response) => {
  const [[summary], [monthly]] = await Promise.all([
    pool.execute(
      `SELECT COUNT(*) AS completed_orders, COALESCE(SUM(amount), 0) AS revenue
       FROM shop_orders WHERE status = 'successful'`
    ),
    pool.execute(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS orders,
         COALESCE(SUM(amount), 0) AS revenue
       FROM shop_orders
       WHERE status = 'successful' AND created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 11 MONTH)
       GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY month`
    )
  ]);
  response.json({
    currency: 'ZMW',
    completedOrders: Number(summary[0].completed_orders),
    revenue: Number(summary[0].revenue),
    monthly: monthly.map((row) => ({
      month: row.month,
      orders: Number(row.orders),
      revenue: Number(row.revenue)
    }))
  });
});

router.get('/programs', async (_request, response) => {
  const [programs] = await pool.execute(
    `SELECT id, name, description, duration_weeks, is_active, created_at, updated_at
     FROM coaching_programs ORDER BY is_active DESC, name`
  );
  response.json({ programs });
});

router.post('/programs', async (request, response) => {
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
  const description = typeof request.body.description === 'string' ? request.body.description.trim() : '';
  const duration = Number(request.body.duration_weeks);
  if (!name || name.length > 160 || description.length > 5000 ||
      !Number.isInteger(duration) || duration < 1 || duration > 104) {
    return response.status(400).json({ error: 'Program details are invalid' });
  }
  const [result] = await pool.execute(
    'INSERT INTO coaching_programs (name, description, duration_weeks) VALUES (?, ?, ?)',
    [name, description, duration]
  );
  response.status(201).json({
    program: { id: result.insertId, name, description, duration_weeks: duration, is_active: 1 }
  });
});

router.put('/programs/:id', async (request, response) => {
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).json({ error: 'Program id is invalid' });
  }
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
  const description = typeof request.body.description === 'string' ? request.body.description.trim() : '';
  const duration = Number(request.body.duration_weeks);
  const isActive = request.body.is_active;
  if (!name || name.length > 160 || description.length > 5000 ||
      !Number.isInteger(duration) || duration < 1 || duration > 104 ||
      typeof isActive !== 'boolean') {
    return response.status(400).json({ error: 'Program details are invalid' });
  }
  const [result] = await pool.execute(
    `UPDATE coaching_programs SET name = ?, description = ?, duration_weeks = ?, is_active = ?
     WHERE id = ?`,
    [name, description, duration, isActive, request.params.id]
  );
  if (!result.affectedRows) return response.status(404).json({ error: 'Program not found' });
  response.json({
    program: { id: Number(request.params.id), name, description, duration_weeks: duration, is_active: isActive }
  });
});

const defaultSettings = {
  business_name: 'ComboMaster Fitness',
  contact_email: 'admin@combomaster.com'
};

router.get('/settings', async (_request, response) => {
  const [rows] = await pool.execute(
    'SELECT setting_key, setting_value FROM business_settings WHERE setting_key IN (?, ?)',
    Object.keys(defaultSettings)
  );
  const settings = { ...defaultSettings };
  rows.forEach(({ setting_key, setting_value }) => { settings[setting_key] = setting_value; });
  response.json({ settings });
});

router.put('/settings', async (request, response) => {
  const settings = {
    business_name: typeof request.body.business_name === 'string' ? request.body.business_name.trim() : '',
    contact_email: typeof request.body.contact_email === 'string' ? request.body.contact_email.trim() : ''
  };
  if (!settings.business_name || settings.business_name.length > 160 ||
      settings.contact_email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email)) {
    return response.status(400).json({ error: 'Business settings are invalid' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const [key, value] of Object.entries(settings)) {
      await connection.execute(
        `INSERT INTO business_settings (setting_key, setting_value, updated_by)
         VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [key, value, request.auth.sub]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  response.json({ settings });
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
