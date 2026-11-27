const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const multer = require('multer');
const { allocateId, getCollection, getDocument, listDocuments } = require('../firestore');
const { requireAuth, requireRole } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();
router.use(requireAuth, requireRole('client'));

/* ═══════════════════════════════════════════════════════
   FILE UPLOADS (attachments)
   ═══════════════════════════════════════════════════════ */
const uploadsDir = path.resolve(
  config.uploadDirectory || path.join(__dirname, '../../../storage/uploads'),
  'messages'
);
fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'application/zip',
  'audio/mpeg', 'audio/webm', 'audio/ogg',
  'video/mp4', 'video/webm'
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('Unsupported file type'));
    cb(null, true);
  }
});

/* ═══════════════════════════════════════════════════════
   TYPING STATE — in-memory, per-process
   Coach polls GET /api/admin/messages/:userId/typing
   ═══════════════════════════════════════════════════════ */
const typingState = new Map();
const TYPING_TTL_MS = 5000;

function markTyping(userId, whoId) {
  typingState.set(Number(userId), { whoId, until: Date.now() + TYPING_TTL_MS });
}
function isTyping(userId) {
  const entry = typingState.get(Number(userId));
  if (!entry) return false;
  if (entry.until < Date.now()) { typingState.delete(Number(userId)); return false; }
  return true;
}

/* ═══════════════════════════════════════════════════════
   TIMESTAMP NORMALIZATION
   ═══════════════════════════════════════════════════════ */
const TIMESTAMP_FIELDS = [
  'recorded_at', 'logged_at', 'completed_at',
  'requested_at', 'created_at', 'updated_at',
  'cancelled_at', 'approved_at', 'declined_at'
];

function normalizeTimestamps(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of TIMESTAMP_FIELDS) {
    const value = out[key];
    if (!value) continue;
    if (typeof value === 'string') continue;
    if (value instanceof Date) { out[key] = value.toISOString(); continue; }
    if (typeof value.toDate === 'function') out[key] = value.toDate().toISOString();
    else if (typeof value._seconds === 'number') out[key] = new Date(value._seconds * 1000).toISOString();
    else if (typeof value.seconds === 'number') out[key] = new Date(value.seconds * 1000).toISOString();
  }
  return out;
}

const normalizeArray = (rows) => Array.isArray(rows) ? rows.map(normalizeTimestamps) : [];

const parseTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/* ============================================================
   DASHBOARD
   ============================================================ */
router.get('/dashboard', async (request, response) => {
  const userId = Number(request.auth.sub);
  const [
  userSnapshot,
  profileSnapshot,
  progress,
  meals,
  workouts,
  bookings,
  messages
] = await Promise.all([
  getDocument('users', userId).get(),
  getDocument('client_profiles', userId).get(),
  listDocuments('progress_entries', {
    filters: [['user_id', '==', userId]],
    orderBy: [['recorded_at', 'desc']],
    limit: 30
  }),
  listDocuments('meal_logs', {
    filters: [['user_id', '==', userId]],
    orderBy: [['logged_at', 'desc']],
    limit: 20
  }),
  listDocuments('workout_logs', {
    filters: [['user_id', '==', userId]],
    orderBy: [['completed_at', 'desc']],
    limit: 20
  }),
  listDocuments('bookings', {
    filters: [['user_id', '==', userId]],
    orderBy: [['requested_at', 'desc']],
    limit: 20
  }),
  listDocuments('messages', {
    filters: [['user_id', '==', userId]],
    orderBy: [['created_at', 'desc']],
    limit: 50
  })
]);

const user = userSnapshot.exists ? userSnapshot.data() : {};
const profile = profileSnapshot.exists ? profileSnapshot.data() : {};
  // streak calculation — fixed to use parseTimestamp
  const workoutDays = new Set(
    workouts
      .map(w => parseTimestamp(w.completed_at))
      .filter(d => d && !Number.isNaN(d.getTime()))
      .map(d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)
  );
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
    if (workoutDays.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  const achievements = [
    { icon: 'flame',  name: '7-Day Streak',       desc: 'Train 7 days in a row', progress: Math.min(streak, 7), target: 7 },
    { icon: 'trophy', name: 'Iron Warrior',       desc: '50 workouts completed', progress: workouts.length,       target: 50 },
    { icon: 'apple',  name: 'Nutrition Master',   desc: 'Log 30 meals',          progress: meals.length,          target: 30 },
    { icon: 'scale',  name: 'Consistent Tracker', desc: 'Log 10 weigh-ins',      progress: progress.length,       target: 10 }
  ];
  const badges = achievements.filter(a => a.progress >= a.target).length;

  response.json({
    profile: {
  name: profile.name || user.name || null,
  phone: profile.phone || null,
  goal: profile.goal || null,
  height_cm: profile.height_cm ?? null
},
    progress: normalizeArray(progress),
    meals:    normalizeArray(meals),
    workouts: normalizeArray(workouts),
    bookings: normalizeArray(bookings),
    messages: normalizeArray(messages),
    stats: {
      latestWeightKg: progress[0]?.weight_kg ?? null,
      latestBodyFatPercent: progress[0]?.body_fat_percent ?? null,
      workoutCount: workouts.length,
      mealCount: meals.length,
      streak,
      badges
    },
    achievements: { items: achievements }
  });
});

/* ============================================================
   PROFILE
   ============================================================ */
router.patch('/profile', async (request, response) => {
  const userId = Number(request.auth.sub);
  const profileRef = getDocument('client_profiles', userId);
  const currentSnapshot = await profileRef.get();
  const current = currentSnapshot.exists ? currentSnapshot.data() : { phone: null, goal: null, height_cm: null };

  const body = request.body || {};
  if ((Object.hasOwn(body, 'name') && typeof body.name !== 'string') ||
      (Object.hasOwn(body, 'phone') && body.phone !== null && typeof body.phone !== 'string') ||
      (Object.hasOwn(body, 'goal') && body.goal !== null && typeof body.goal !== 'string') ||
      (Object.hasOwn(body, 'height_cm') && body.height_cm !== null &&
        typeof body.height_cm !== 'string' && typeof body.height_cm !== 'number')) {
    return response.status(400).json({ error: 'Profile values are invalid' });
  }

  const name = Object.hasOwn(body, 'name') ? body.name.trim() : undefined;
  const phone = Object.hasOwn(body, 'phone')
    ? (body.phone === null ? null : String(body.phone).trim())
    : current.phone;
  const goal = Object.hasOwn(body, 'goal')
    ? (body.goal === null ? null : String(body.goal).trim())
    : current.goal;
  const heightInput = body.height_cm;
  const height = Object.hasOwn(body, 'height_cm')
    ? (heightInput === null || heightInput === '' ? null : Number(heightInput))
    : current.height_cm;

  if ((name !== undefined && (name.length < 2 || name.length > 100)) ||
      (phone && phone.length > 32) || (goal && goal.length > 500) ||
      (height !== null && (!Number.isFinite(height) || height < 50 || height > 300))) {
    return response.status(400).json({ error: 'Profile values are invalid' });
  }

  const db = profileRef.firestore;

const updatedName = name !== undefined
  ? name.replace(/\s+/g, ' ')
  : current.name || null;

await db.runTransaction(async (transaction) => {
  const profileUpdates = {
    user_id: userId,
    phone: phone || null,
    goal: goal || null,
    height_cm: height,
    updated_at: new Date()
  };

  if (name !== undefined) {
    profileUpdates.name = updatedName;

    transaction.set(
      getDocument('users', userId),
      {
        name: updatedName,
        updated_at: new Date()
      },
      { merge: true }
    );
  }

  transaction.set(profileRef, profileUpdates, { merge: true });
});

return response.json({
  profile: {
    name: updatedName,
    phone: phone || null,
    goal: goal || null,
    height_cm: height
  }
});

/* ============================================================
   MEALS
   ============================================================ */
router.get('/meals', async (request, response) => {
  const meals = await listDocuments('meal_logs', {
    filters: [['user_id', '==', Number(request.auth.sub)]],
    orderBy: [['logged_at', 'desc']],
    limit: 50
  });
  response.json({ meals: normalizeArray(meals) });
});

router.post('/meals', async (request, response) => {
  const body = request.body || {};
  const mealName = typeof body.meal_name === 'string' ? body.meal_name.trim() : '';
  const validNumberInput = (v) => typeof v === 'number' || typeof v === 'string';
  if ((body.calories !== undefined && body.calories !== null && body.calories !== '' && !validNumberInput(body.calories)) ||
      (body.protein_g !== undefined && body.protein_g !== null && body.protein_g !== '' && !validNumberInput(body.protein_g))) {
    return response.status(400).json({ error: 'Meal name and nutrition values are invalid' });
  }
  const calories = body.calories === undefined || body.calories === null || body.calories === '' ? null : Number(body.calories);
  const protein  = body.protein_g === undefined || body.protein_g === null || body.protein_g === '' ? null : Number(body.protein_g);
  if (!mealName || mealName.length > 120 ||
      (calories !== null && (!Number.isInteger(calories) || calories < 0 || calories > 10000)) ||
      (protein !== null && (!Number.isFinite(protein) || protein < 0 || protein > 1000))) {
    return response.status(400).json({ error: 'Meal name and nutrition values are invalid' });
  }
  const meal = {
    id: await allocateId('meal_logs'),
    user_id: Number(request.auth.sub),
    meal_name: mealName, calories, protein_g: protein,
    logged_at: new Date()
  };
  await getCollection('meal_logs').doc(String(meal.id)).create(meal);
  return response.status(201).json(normalizeTimestamps(meal));
});

router.patch('/meals/:id', async (request, response) => {
  const ref = getDocument('meal_logs', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Meal not found' });
  if (Number(snap.get('user_id')) !== Number(request.auth.sub)) {
    return response.status(403).json({ error: 'Not your meal' });
  }
  const body = request.body || {};
  const updates = {};
  if (Object.hasOwn(body, 'meal_name')) {
    const name = String(body.meal_name || '').trim();
    if (!name || name.length > 120) return response.status(400).json({ error: 'Invalid meal name' });
    updates.meal_name = name;
  }
  if (Object.hasOwn(body, 'calories')) {
    const c = Number(body.calories);
    if (!Number.isInteger(c) || c < 0 || c > 10000) return response.status(400).json({ error: 'Invalid calories' });
    updates.calories = c;
  }
  if (Object.hasOwn(body, 'protein_g')) {
    const p = Number(body.protein_g);
    if (!Number.isFinite(p) || p < 0 || p > 1000) return response.status(400).json({ error: 'Invalid protein' });
    updates.protein_g = p;
  }
  if (!Object.keys(updates).length) return response.status(400).json({ error: 'No fields to update' });
  updates.updated_at = new Date();
  await ref.set(updates, { merge: true });
  const fresh = await ref.get();
  return response.json({ meal: normalizeTimestamps({ id: ref.id, ...fresh.data() }) });
});

router.delete('/meals/:id', async (request, response) => {
  const ref = getDocument('meal_logs', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Meal not found' });
  if (Number(snap.get('user_id')) !== Number(request.auth.sub)) {
    return response.status(403).json({ error: 'Not your meal' });
  }
  await ref.delete();
  return response.status(204).end();
});

/* ============================================================
   WORKOUTS
   ============================================================ */
router.get('/workouts', async (request, response) => {
  const workouts = await listDocuments('workout_logs', {
    filters: [['user_id', '==', Number(request.auth.sub)]],
    orderBy: [['completed_at', 'desc']],
    limit: 50
  });
  response.json({ workouts: normalizeArray(workouts) });
});

router.post('/workouts', async (request, response) => {
  const body = request.body || {};
  const name = typeof body.workout_name === 'string' ? body.workout_name.trim() : '';
  if (typeof body.duration_minutes !== 'number' && typeof body.duration_minutes !== 'string') {
    return response.status(400).json({ error: 'Workout name and duration are invalid' });
  }
  const duration = Number(body.duration_minutes);
  if (!name || name.length > 120 || !Number.isInteger(duration) || duration < 1 || duration > 1440) {
    return response.status(400).json({ error: 'Workout name and duration are invalid' });
  }
  const workout = {
    id: await allocateId('workout_logs'),
    user_id: Number(request.auth.sub),
    workout_name: name, duration_minutes: duration,
    completed_at: new Date()
  };
  await getCollection('workout_logs').doc(String(workout.id)).create(workout);
  return response.status(201).json(normalizeTimestamps(workout));
});

router.patch('/workouts/:id', async (request, response) => {
  const ref = getDocument('workout_logs', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Workout not found' });
  if (Number(snap.get('user_id')) !== Number(request.auth.sub)) {
    return response.status(403).json({ error: 'Not your workout' });
  }
  const body = request.body || {};
  const updates = {};
  if (Object.hasOwn(body, 'workout_name')) {
    const name = String(body.workout_name || '').trim();
    if (!name || name.length > 120) return response.status(400).json({ error: 'Invalid workout name' });
    updates.workout_name = name;
  }
  if (Object.hasOwn(body, 'duration_minutes')) {
    const d = Number(body.duration_minutes);
    if (!Number.isInteger(d) || d < 1 || d > 1440) return response.status(400).json({ error: 'Invalid duration' });
    updates.duration_minutes = d;
  }
  if (!Object.keys(updates).length) return response.status(400).json({ error: 'No fields to update' });
  updates.updated_at = new Date();
  await ref.set(updates, { merge: true });
  const fresh = await ref.get();
  return response.json({ workout: normalizeTimestamps({ id: ref.id, ...fresh.data() }) });
});

router.delete('/workouts/:id', async (request, response) => {
  const ref = getDocument('workout_logs', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Workout not found' });
  if (Number(snap.get('user_id')) !== Number(request.auth.sub)) {
    return response.status(403).json({ error: 'Not your workout' });
  }
  await ref.delete();
  return response.status(204).end();
});

/* ============================================================
   PROGRESS
   ============================================================ */
router.get('/progress', async (request, response) => {
  const progress = await listDocuments('progress_entries', {
    filters: [['user_id', '==', Number(request.auth.sub)]],
    orderBy: [['recorded_at', 'desc']],
    limit: 60
  });
  response.json({ progress: normalizeArray(progress) });
});

router.post('/progress', async (request, response) => {
  const body = request.body || {};
  if ((typeof body.weight_kg !== 'number' && typeof body.weight_kg !== 'string') ||
      (body.body_fat_percent !== undefined && body.body_fat_percent !== null && body.body_fat_percent !== '' &&
        typeof body.body_fat_percent !== 'number' && typeof body.body_fat_percent !== 'string')) {
    return response.status(400).json({ error: 'Progress values are invalid' });
  }
  const weight = Number(body.weight_kg);
  const bodyFat = body.body_fat_percent === undefined || body.body_fat_percent === null || body.body_fat_percent === ''
    ? null : Number(body.body_fat_percent);
  const note = typeof body.note === 'string' ? body.note.trim() : null;
  if (!Number.isFinite(weight) || weight < 20 || weight > 500 ||
      (bodyFat !== null && (!Number.isFinite(bodyFat) || bodyFat < 1 || bodyFat > 80)) ||
      (note && note.length > 500)) {
    return response.status(400).json({ error: 'Progress values are invalid' });
  }
  const progress = {
    id: await allocateId('progress_entries'),
    user_id: Number(request.auth.sub),
    weight_kg: weight, body_fat_percent: bodyFat, note: note || null,
    recorded_at: new Date()
  };
  await getCollection('progress_entries').doc(String(progress.id)).create(progress);
  return response.status(201).json(normalizeTimestamps(progress));
});

/* ============================================================
   BOOKINGS
   ============================================================ */
router.get('/bookings', async (request, response) => {
  const bookings = await listDocuments('bookings', {
    filters: [['user_id', '==', Number(request.auth.sub)]],
    orderBy: [['requested_at', 'desc']],
    limit: 50
  });
  response.json({ bookings: normalizeArray(bookings) });
});

router.get('/bookings/:id', async (request, response) => {
  const ref = getDocument('bookings', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Booking not found' });
  if (Number(snap.get('user_id')) !== Number(request.auth.sub)) {
    return response.status(403).json({ error: 'Not your booking' });
  }
  response.json({ booking: normalizeTimestamps({ id: snap.id, ...snap.data() }) });
});

router.post('/bookings', async (request, response) => {
  const body = request.body || {};
  const service = typeof body.service === 'string' ? body.service.trim() : '';
  const requestedAtInput = body.requested_at;
  const requestedAt = typeof requestedAtInput === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(requestedAtInput)
    ? new Date(requestedAtInput) : null;
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : null;
  if (!service || service.length > 120 || !requestedAt || Number.isNaN(requestedAt.getTime()) ||
      requestedAt.getTime() < Date.now() - 60_000) {
    return response.status(400).json({ error: 'Choose a valid service and a future booking time' });
  }
  const booking = {
    id: await allocateId('bookings'),
    user_id: Number(request.auth.sub),
    service, requested_at: requestedAt, status: 'pending',
    notes: notes || null, created_at: new Date()
  };
  await getCollection('bookings').doc(String(booking.id)).create(booking);
  return response.status(201).json(normalizeTimestamps(booking));
});

router.patch('/bookings/:id', async (request, response) => {
  const ref = getDocument('bookings', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Booking not found' });
  if (Number(snap.get('user_id')) !== Number(request.auth.sub)) {
    return response.status(403).json({ error: 'Not your booking' });
  }

  const current = snap.data();
  if (current.status !== 'pending') {
    return response.status(409).json({
      error: `This booking is ${current.status} and can no longer be edited.`
    });
  }

  const body = request.body || {};
  const updates = {};

  if (Object.hasOwn(body, 'service')) {
    const service = typeof body.service === 'string' ? body.service.trim() : '';
    if (!service || service.length > 120) return response.status(400).json({ error: 'Enter a valid service name' });
    updates.service = service;
  }
  if (Object.hasOwn(body, 'requested_at')) {
    const input = body.requested_at;
    const when = typeof input === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(input)
      ? new Date(input) : null;
    if (!when || Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
      return response.status(400).json({ error: 'Choose a valid future booking time' });
    }
    updates.requested_at = when;
  }
  if (Object.hasOwn(body, 'notes')) {
    updates.notes = body.notes === null ? null : String(body.notes).trim().slice(0, 500) || null;
  }
  if (!Object.keys(updates).length) return response.status(400).json({ error: 'No editable fields provided' });

  updates.updated_at = new Date();
  await ref.set(updates, { merge: true });
  const fresh = await ref.get();
  return response.json({ booking: normalizeTimestamps({ id: ref.id, ...fresh.data() }) });
});

router.delete('/bookings/:id', async (request, response) => {
  const ref = getDocument('bookings', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Booking not found' });
  if (Number(snap.get('user_id')) !== Number(request.auth.sub)) {
    return response.status(403).json({ error: 'Not your booking' });
  }
  const status = snap.get('status');
  if (status === 'pending') {
    await ref.delete();
    return response.status(204).end();
  }
  if (status === 'approved') {
    await ref.set({ status: 'cancelled', cancelled_at: new Date(), updated_at: new Date() }, { merge: true });
    return response.status(204).end();
  }
  await ref.delete();
  return response.status(204).end();
});

/* ============================================================
   MESSAGES — list
   ═══════════════════════════════════════════════════════
   Order matters: the literal routes (/attachments, /typing)
   must come BEFORE the parameterized ones (:messageId/reactions).
   Express matches in definition order.
   ============================================================ */
router.get('/messages', async (request, response) => {
  const userId = Number(request.auth.sub);
  const messages = await listDocuments('messages', {
    filters: [['user_id', '==', userId]],
    orderBy: [['created_at', 'asc']],
    limit: 200
  });
  const messageIds = messages.map(m => Number(m.id));

  const [attachments, reactions] = await Promise.all([
    listDocuments('message_attachments', { limit: 5000 }),
    listDocuments('message_reactions', { limit: 5000 })
  ]);

  const attachmentsByMsg = {};
  attachments.forEach(a => {
    if (!messageIds.includes(Number(a.message_id))) return;
    (attachmentsByMsg[a.message_id] ||= []).push(normalizeTimestamps(a));
  });
  const reactionsByMsg = {};
  reactions.forEach(r => {
    if (!messageIds.includes(Number(r.message_id))) return;
    (reactionsByMsg[r.message_id] ||= []).push(r);
  });

  response.json({
    messages: normalizeArray(messages).map(m => ({
      ...m,
      attachments: attachmentsByMsg[m.id] || [],
      reactions: reactionsByMsg[m.id] || []
    }))
  });
});

/* Client polls coach typing — MUST be before :messageId routes */
router.get('/messages/typing', async (request, response) => {
  const userId = Number(request.auth.sub);
  response.json({ typing: isTyping(userId) });
});

/* Client signals typing */
router.post('/messages/typing', async (request, response) => {
  const userId = Number(request.auth.sub);
  markTyping(userId, userId);
  response.json({ ok: true });
});

/* Upload attachment — MUST be before :messageId routes */
router.post('/messages/attachments', upload.single('file'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'No file uploaded' });
  const userId = Number(request.auth.sub);
  const attachmentId = await allocateId('message_attachments');
  const ext = path.extname(request.file.originalname || '').toLowerCase().slice(0, 10) || '';
  const storedName = `${attachmentId}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const filePath = path.join(uploadsDir, storedName);
  await fs.writeFile(filePath, request.file.buffer);

  const attachment = {
    id: attachmentId, message_id: null, user_id: userId, sender_id: userId,
    original_name: request.file.originalname, stored_name: storedName,
    mime_type: request.file.mimetype, size_bytes: request.file.size,
    url: `/api/client/messages/attachments/${storedName}`,
    created_at: new Date()
  };
  await getCollection('message_attachments').doc(String(attachmentId)).create(attachment);
  response.status(201).json({ attachment: normalizeTimestamps(attachment) });
});

/* Serve attachment */
router.get('/messages/attachments/:storedName', async (request, response) => {
  const storedName = path.basename(request.params.storedName);
  const filePath = path.join(uploadsDir, storedName);
  try {
    await fs.access(filePath);
    response.sendFile(filePath);
  } catch {
    response.status(404).json({ error: 'Attachment not found' });
  }
});

/* Toggle reaction on a message — verify ownership */
router.post('/messages/:messageId/reactions', async (request, response) => {
  const messageId = Number(request.params.messageId);
  const emoji = String(request.body?.emoji || '').trim();
  if (!messageId || !emoji || emoji.length > 8) {
    return response.status(400).json({ error: 'Invalid message or emoji' });
  }
  const userId = Number(request.auth.sub);

  // Verify the message belongs to this client's thread
  const msgSnap = await getDocument('messages', messageId).get();
  if (!msgSnap.exists || Number(msgSnap.get('user_id')) !== userId) {
    return response.status(403).json({ error: 'Not your message thread' });
  }

  const existing = await listDocuments('message_reactions', {
    filters: [['message_id', '==', messageId], ['user_id', '==', userId], ['emoji', '==', emoji]],
    limit: 1
  });
  if (existing.length) {
    await getDocument('message_reactions', existing[0].id).delete();
    return response.json({ removed: true });
  }
  const id = await allocateId('message_reactions');
  await getCollection('message_reactions').doc(String(id)).create({
    id, message_id: messageId, user_id: userId, emoji, created_at: new Date()
  });
  response.json({ added: true, reaction: { id, message_id: messageId, user_id: userId, emoji } });
});

/* Send message — must come LAST among /messages routes */
router.post('/messages', async (request, response) => {
  const body = request.body || {};
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const replyTo = body.reply_to != null ? Number(body.reply_to) : null;
  const attachmentId = body.attachment_id != null ? Number(body.attachment_id) : null;
  if ((!text || text.length > 4000) && !attachmentId) {
    return response.status(400).json({ error: 'Message must be 1–4000 chars, or include an attachment' });
  }
  const userId = Number(request.auth.sub);
  const messageId = await allocateId('messages');
  const message = {
    id: messageId, user_id: userId, sender_id: userId,
    body: text || '', reply_to: replyTo || null, created_at: new Date()
  };
  await getCollection('messages').doc(String(messageId)).create(message);
  if (attachmentId) {
    const attRef = getDocument('message_attachments', attachmentId);
    const attSnap = await attRef.get();
    if (attSnap.exists && Number(attSnap.get('user_id')) === userId) {
      await attRef.set({ message_id: messageId, updated_at: new Date() }, { merge: true });
    }
  }
  response.status(201).json({ message: normalizeTimestamps(message) });
});

/* ============================================================
   ASSIGNED PLANS
   ============================================================ */
router.get('/plans', async (request, response) => {
  const userId = Number(request.auth.sub);
  const userSnap = await getDocument('users', userId).get();
  if (!userSnap.exists) return response.status(401).json({ error: 'Account not found' });
  const mealPlanId = userSnap.get('meal_plan_id') || null;
  const workoutPlanId = userSnap.get('workout_plan_id') || null;
  const [mealPlanSnap, workoutPlanSnap] = await Promise.all([
    mealPlanId ? getDocument('meal_plans', mealPlanId).get() : null,
    workoutPlanId ? getDocument('workout_plans', workoutPlanId).get() : null
  ]);
  response.json({
    mealPlan: mealPlanSnap && mealPlanSnap.exists ? normalizeTimestamps({ id: mealPlanSnap.id, ...mealPlanSnap.data() }) : null,
    workoutPlan: workoutPlanSnap && workoutPlanSnap.exists ? normalizeTimestamps({ id: workoutPlanSnap.id, ...workoutPlanSnap.data() }) : null
  });
});

/* ============================================================
   DAILY CHECK-IN
   ============================================================ */
router.post('/checkins', async (request, response) => {
  const { mood, notes } = request.body || {};
  const entry = {
    id: await allocateId('checkins'),
    user_id: Number(request.auth.sub),
    mood: typeof mood === 'string' ? mood.slice(0, 40) : null,
    notes: typeof notes === 'string' ? notes.slice(0, 1000) : null,
    created_at: new Date()
  };
  await getCollection('checkins').doc(String(entry.id)).create(entry);
  response.status(201).json({ checkin: normalizeTimestamps(entry) });
});

module.exports = router;
