const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('client'));

router.get('/dashboard', async (request, response) => {
  const userId = request.auth.sub;
  const [[profileRows], [progress], [meals], [workouts], [bookings], [messages]] = await Promise.all([
    pool.execute(
      'SELECT phone, goal, height_cm FROM client_profiles WHERE user_id = ? LIMIT 1',
      [userId]
    ),
    pool.execute(
      'SELECT id, weight_kg, body_fat_percent, note, recorded_at FROM progress_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 30',
      [userId]
    ),
    pool.execute(
      'SELECT id, meal_name, calories, protein_g, logged_at FROM meal_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT 20',
      [userId]
    ),
    pool.execute(
      'SELECT id, workout_name, duration_minutes, completed_at FROM workout_logs WHERE user_id = ? ORDER BY completed_at DESC LIMIT 20',
      [userId]
    ),
    pool.execute(
      'SELECT id, service, requested_at, status FROM bookings WHERE user_id = ? ORDER BY requested_at DESC LIMIT 20',
      [userId]
    ),
    pool.execute(
      'SELECT id, sender_id, body, created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId]
    )
  ]);

  response.json({
    profile: profileRows[0] || { phone: null, goal: null, height_cm: null },
    progress,
    meals,
    workouts,
    bookings,
    messages,
    stats: {
      latestWeightKg: progress[0]?.weight_kg ?? null,
      latestBodyFatPercent: progress[0]?.body_fat_percent ?? null,
      workoutCount: workouts.length,
      mealCount: meals.length
    }
  });
});

router.patch('/profile', async (request, response) => {
  const [profiles] = await pool.execute(
    'SELECT phone, goal, height_cm FROM client_profiles WHERE user_id = ? LIMIT 1',
    [request.auth.sub]
  );
  const current = profiles[0] || { phone: null, goal: null, height_cm: null };
  if ((Object.hasOwn(request.body, 'name') && typeof request.body.name !== 'string') ||
      (Object.hasOwn(request.body, 'phone') && request.body.phone !== null && typeof request.body.phone !== 'string') ||
      (Object.hasOwn(request.body, 'goal') && request.body.goal !== null && typeof request.body.goal !== 'string') ||
      (Object.hasOwn(request.body, 'height_cm') && request.body.height_cm !== null &&
        typeof request.body.height_cm !== 'string' && typeof request.body.height_cm !== 'number')) {
    return response.status(400).json({ error: 'Profile values are invalid' });
  }
  const name = Object.hasOwn(request.body, 'name') ? request.body.name.trim() : undefined;
  const phone = Object.hasOwn(request.body, 'phone')
    ? (request.body.phone === null ? null : String(request.body.phone).trim())
    : current.phone;
  const goal = Object.hasOwn(request.body, 'goal')
    ? (request.body.goal === null ? null : String(request.body.goal).trim())
    : current.goal;
  const heightInput = request.body.height_cm;
  const height = Object.hasOwn(request.body, 'height_cm')
    ? (heightInput === null || heightInput === '' ? null : Number(heightInput))
    : current.height_cm;
  if ((name !== undefined && (name.length < 2 || name.length > 100)) ||
      (phone && phone.length > 32) || (goal && goal.length > 500) ||
      (height !== null && (!Number.isFinite(height) || height < 50 || height > 300))) {
    return response.status(400).json({ error: 'Profile values are invalid' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO client_profiles (user_id, phone, goal, height_cm)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE phone = VALUES(phone), goal = VALUES(goal), height_cm = VALUES(height_cm)`,
      [request.auth.sub, phone || null, goal || null, height]
    );
    if (name !== undefined) {
      await connection.execute('UPDATE users SET name = ? WHERE id = ?', [name, request.auth.sub]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return response.json({ profile: { name, phone: phone || null, goal: goal || null, height_cm: height } });
});

router.post('/meals', async (request, response) => {
  const mealName = typeof request.body.meal_name === 'string' ? request.body.meal_name.trim() : '';
  const validNumberInput = (value) => typeof value === 'number' || typeof value === 'string';
  if ((request.body.calories !== undefined && request.body.calories !== null && request.body.calories !== '' && !validNumberInput(request.body.calories)) ||
      (request.body.protein_g !== undefined && request.body.protein_g !== null && request.body.protein_g !== '' && !validNumberInput(request.body.protein_g))) {
    return response.status(400).json({ error: 'Meal name and nutrition values are invalid' });
  }
  const calories = request.body.calories === undefined || request.body.calories === null || request.body.calories === '' ? null : Number(request.body.calories);
  const protein = request.body.protein_g === undefined || request.body.protein_g === null || request.body.protein_g === '' ? null : Number(request.body.protein_g);
  if (!mealName || mealName.length > 120 ||
      (calories !== null && (!Number.isInteger(calories) || calories < 0 || calories > 10000)) ||
      (protein !== null && (!Number.isFinite(protein) || protein < 0 || protein > 1000))) {
    return response.status(400).json({ error: 'Meal name and nutrition values are invalid' });
  }
  const [result] = await pool.execute(
    'INSERT INTO meal_logs (user_id, meal_name, calories, protein_g) VALUES (?, ?, ?, ?)',
    [request.auth.sub, mealName, calories, protein]
  );
  return response.status(201).json({ id: result.insertId, meal_name: mealName, calories, protein_g: protein });
});

router.post('/workouts', async (request, response) => {
  const name = typeof request.body.workout_name === 'string' ? request.body.workout_name.trim() : '';
  if (typeof request.body.duration_minutes !== 'number' && typeof request.body.duration_minutes !== 'string') {
    return response.status(400).json({ error: 'Workout name and duration are invalid' });
  }
  const duration = Number(request.body.duration_minutes);
  if (!name || name.length > 120 || !Number.isInteger(duration) || duration < 1 || duration > 1440) {
    return response.status(400).json({ error: 'Workout name and duration are invalid' });
  }
  const [result] = await pool.execute(
    'INSERT INTO workout_logs (user_id, workout_name, duration_minutes) VALUES (?, ?, ?)',
    [request.auth.sub, name, duration]
  );
  return response.status(201).json({ id: result.insertId, workout_name: name, duration_minutes: duration });
});

router.post('/progress', async (request, response) => {
  if ((typeof request.body.weight_kg !== 'number' && typeof request.body.weight_kg !== 'string') ||
      (request.body.body_fat_percent !== undefined && request.body.body_fat_percent !== null && request.body.body_fat_percent !== '' &&
        typeof request.body.body_fat_percent !== 'number' && typeof request.body.body_fat_percent !== 'string')) {
    return response.status(400).json({ error: 'Progress values are invalid' });
  }
  const weight = Number(request.body.weight_kg);
  const bodyFat = request.body.body_fat_percent === undefined || request.body.body_fat_percent === null || request.body.body_fat_percent === ''
    ? null : Number(request.body.body_fat_percent);
  const note = typeof request.body.note === 'string' ? request.body.note.trim() : null;
  if (!Number.isFinite(weight) || weight < 20 || weight > 500 ||
      (bodyFat !== null && (!Number.isFinite(bodyFat) || bodyFat < 1 || bodyFat > 80)) ||
      (note && note.length > 500)) {
    return response.status(400).json({ error: 'Progress values are invalid' });
  }
  const [result] = await pool.execute(
    'INSERT INTO progress_entries (user_id, weight_kg, body_fat_percent, note) VALUES (?, ?, ?, ?)',
    [request.auth.sub, weight, bodyFat, note || null]
  );
  return response.status(201).json({ id: result.insertId, weight_kg: weight, body_fat_percent: bodyFat, note });
});

router.post('/bookings', async (request, response) => {
  const service = typeof request.body.service === 'string' ? request.body.service.trim() : '';
  const requestedAtInput = request.body.requested_at;
  const requestedAt = typeof requestedAtInput === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(requestedAtInput)
    ? new Date(requestedAtInput) : null;
  if (!service || service.length > 120 || !requestedAt || Number.isNaN(requestedAt.getTime()) ||
      requestedAt.getTime() < Date.now() - 60_000) {
    return response.status(400).json({ error: 'Choose a valid service and a future booking time' });
  }
  const [result] = await pool.execute(
    'INSERT INTO bookings (user_id, service, requested_at) VALUES (?, ?, ?)',
    [request.auth.sub, service, requestedAt]
  );
  return response.status(201).json({ id: result.insertId, service, requested_at: requestedAt, status: 'pending' });
});

router.post('/messages', async (request, response) => {
  const body = typeof request.body.body === 'string' ? request.body.body.trim() : '';
  if (!body || body.length > 4000) {
    return response.status(400).json({ error: 'Message must be between 1 and 4000 characters' });
  }
  const [result] = await pool.execute(
    'INSERT INTO messages (user_id, sender_id, body) VALUES (?, ?, ?)',
    [request.auth.sub, request.auth.sub, body]
  );
  return response.status(201).json({ id: result.insertId, sender_id: request.auth.sub, body });
});

module.exports = router;
