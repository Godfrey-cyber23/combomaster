const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');
const multer = require('multer');
const {
  allocateId,
  getCollection,
  getDocument,
  getFirestore,
  listDocuments
} = require('../firestore');
const { requireAuth, requireRole } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

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
    const v = out[key];
    if (!v) continue;
    if (typeof v === 'string') continue;
    if (v instanceof Date) { out[key] = v.toISOString(); continue; }
    if (typeof v.toDate === 'function') out[key] = v.toDate().toISOString();
    else if (typeof v._seconds === 'number') out[key] = new Date(v._seconds * 1000).toISOString();
    else if (typeof v.seconds === 'number') out[key] = new Date(v.seconds * 1000).toISOString();
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

/* ═══════════════════════════════════════════════════════
   FILE UPLOADS (attachments)
   ═══════════════════════════════════════════════════════ */
const uploadsDir = path.resolve(config.uploadDirectory || path.join(__dirname, '../../../storage/uploads'), 'messages');
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
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }
    cb(null, true);
  }
});

/* ═══════════════════════════════════════════════════════
   IN-MEMORY TYPING STATE
   Key: `${userId}` → { coachTypingAt: number, coachId: number }
   Scoped per-process; not persisted. That's fine — if the
   server restarts, the indicator just clears.
   ═══════════════════════════════════════════════════════ */
const typingState = new Map();
const TYPING_TTL_MS = 5000;

function markTyping(userId, coachId) {
  typingState.set(Number(userId), {
    coachId,
    until: Date.now() + TYPING_TTL_MS
  });
}

function isTyping(userId) {
  const entry = typingState.get(Number(userId));
  if (!entry) return false;
  if (entry.until < Date.now()) {
    typingState.delete(Number(userId));
    return false;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════
   PROGRAM SEED (unchanged from your version)
   ═══════════════════════════════════════════════════════ */
const defaultPrograms = [
  { name: 'Fat Loss Blueprint', description: 'Nutrition and training for sustainable fat loss.', duration_weeks: 12 },
  { name: 'Muscle Gain System', description: 'A progressive hypertrophy-focused training program.', duration_weeks: 16 },
  { name: 'Competition Prep', description: 'Structured preparation for physique competition.', duration_weeks: 12 }
];

async function seedPrograms() {
  const db = getFirestore();
  const markerRef = getDocument('_system', 'default_programs_seeded');
  await db.runTransaction(async (transaction) => {
    const marker = await transaction.get(markerRef);
    if (marker.exists) return;
    const counterRef = getDocument('_counters', 'coaching_programs');
    const counter = await transaction.get(counterRef);
    let id = counter.exists ? Number(counter.get('value')) : 0;
    defaultPrograms.forEach((program) => {
      id += 1;
      transaction.create(getDocument('coaching_programs', id), {
        id, ...program, is_active: true, created_at: new Date(), updated_at: new Date()
      });
    });
    transaction.set(counterRef, { value: id });
    transaction.create(markerRef, { initialized_at: new Date() });
  });
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════ */
router.get('/dashboard', async (_request, response) => {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const monthAgo = now - 30 * 86400000;

  const [users, bookings, orders, messages] = await Promise.all([
    listDocuments('users', { filters: [['role', '==', 'client']], limit: 2000 }),
    listDocuments('bookings', { orderBy: [['requested_at', 'desc']], limit: 500 }),
    listDocuments('shop_orders', { orderBy: [['created_at', 'desc']], limit: 2000 }),
    listDocuments('messages', { orderBy: [['created_at', 'desc']], limit: 500 })
  ]);

  const completedOrders = orders.filter((o) => String(o.status).toLowerCase() === 'successful');
  const revenue30d = completedOrders
    .filter((o) => {
      const t = parseTimestamp(o.created_at);
      return t && t.getTime() >= monthAgo;
    })
    .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  const upcomingBookings = bookings.filter((b) => {
    const t = parseTimestamp(b.requested_at);
    return b.status === 'approved' && t && t.getTime() > now;
  });

  const revenueSeries = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now - (i + 1) * 7 * 86400000);
    const end = new Date(now - i * 7 * 86400000);
    const total = completedOrders
      .filter((o) => {
        const t = parseTimestamp(o.created_at);
        return t && t.getTime() >= start && t.getTime() < end;
      })
      .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    revenueSeries.push(total);
  }

  const userMap = Object.fromEntries(users.map((u) => [Number(u.id), u]));

  const recentBookings = bookings.slice(0, 5).map((b) => ({
    ...normalizeTimestamps(b),
    clientName: userMap[Number(b.user_id)]?.name || 'Unknown client'
  }));

  response.json({
    stats: {
      clients: users.length,
      joinedToday: users.filter((u) => {
        const t = parseTimestamp(u.created_at);
        return t && t.getTime() >= startOfDay.getTime();
      }).length,
      bookings: bookings.length,
      pendingBookings: bookings.filter((b) => b.status === 'pending').length,
      upcomingBookings: upcomingBookings.length,
      completedOrders: completedOrders.length,
      messagesToday: messages.filter((m) => {
        const t = parseTimestamp(m.created_at);
        return t && t.getTime() >= startOfDay.getTime();
      }).length,
      totalRevenue: revenue30d,
      activeClients: users.length
    },
    revenueSeries,
    recentBookings
  });
});

/* ═══════════════════════════════════════════════════════
   CLIENTS — with ?q= search
   ═══════════════════════════════════════════════════════ */
router.get('/clients', async (request, response) => {
  const users = await listDocuments('users', {
    filters: [['role', '==', 'client']],
    orderBy: [['created_at', 'desc']],
    limit: 500
  });

  let clients = await Promise.all(users.map(async (user) => {
    const [profileSnap, latestProgress, latestWorkout, latestMeal, pendingCount] = await Promise.all([
      getDocument('client_profiles', user.id).get(),
      getCollection('progress_entries').where('user_id', '==', user.id).orderBy('recorded_at', 'desc').limit(1).get(),
      getCollection('workout_logs').where('user_id', '==', user.id).orderBy('completed_at', 'desc').limit(1).get(),
      getCollection('meal_logs').where('user_id', '==', user.id).orderBy('logged_at', 'desc').limit(1).get(),
      getCollection('bookings').where('user_id', '==', user.id).where('status', '==', 'pending').count().get()
    ]);

    const candidates = [
      !latestProgress.empty ? latestProgress.docs[0].get('recorded_at') : null,
      !latestWorkout.empty ? latestWorkout.docs[0].get('completed_at') : null,
      !latestMeal.empty ? latestMeal.docs[0].get('logged_at') : null
    ].map(parseTimestamp).filter(Boolean);

    const lastActivity = candidates.length
      ? candidates.sort((a, b) => b.getTime() - a.getTime())[0]
      : null;

    return {
      id: user.id,
      name: user.name || 'Unknown',
      email: user.email || '',
      created_at: normalizeTimestamps({ created_at: user.created_at }).created_at,
      goal: profileSnap.exists ? profileSnap.get('goal') || null : null,
      height_cm: profileSnap.exists ? profileSnap.get('height_cm') ?? null : null,
      latestWeightKg: !latestProgress.empty ? latestProgress.docs[0].get('weight_kg') : null,
      lastActivity: lastActivity ? lastActivity.toISOString() : null,
      pending_bookings: pendingCount.data().count
    };
  }));

  // substring search in JS
  const q = String(request.query.q || '').trim().toLowerCase();
  if (q) {
    clients = clients.filter(c =>
      c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }

  response.json({ clients, total: clients.length });
});

router.get('/clients/:id', async (request, response) => {
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).json({ error: 'Client id is invalid' });
  }
  const userId = Number(request.params.id);
  const userSnap = await getDocument('users', userId).get();
  if (!userSnap.exists || userSnap.get('role') !== 'client') {
    return response.status(404).json({ error: 'Client not found' });
  }
  const user = userSnap.data();
  const profileSnap = await getDocument('client_profiles', userId).get();

  const [meals, workouts, progress, bookings, messages] = await Promise.all([
    listDocuments('meal_logs',        { filters: [['user_id', '==', userId]], orderBy: [['logged_at', 'desc']],    limit: 20 }),
    listDocuments('workout_logs',     { filters: [['user_id', '==', userId]], orderBy: [['completed_at', 'desc']], limit: 20 }),
    listDocuments('progress_entries', { filters: [['user_id', '==', userId]], orderBy: [['recorded_at', 'desc']],  limit: 20 }),
    listDocuments('bookings',         { filters: [['user_id', '==', userId]], orderBy: [['requested_at', 'desc']], limit: 20 }),
    listDocuments('messages',         { filters: [['user_id', '==', userId]], orderBy: [['created_at', 'asc']],    limit: 200 })
  ]);

  // fetch attachments + reactions for these messages
  const messageIds = messages.map(m => Number(m.id));
  const [allAttachments, allReactions] = await Promise.all([
    listDocuments('message_attachments', { limit: 5000 }),
    listDocuments('message_reactions', { limit: 5000 })
  ]);
  const attachmentsByMessage = {};
  allAttachments.forEach(a => {
    if (!messageIds.includes(Number(a.message_id))) return;
    (attachmentsByMessage[a.message_id] ||= []).push(a);
  });
  const reactionsByMessage = {};
  allReactions.forEach(r => {
    if (!messageIds.includes(Number(r.message_id))) return;
    (reactionsByMessage[r.message_id] ||= []).push(r);
  });

  const enrichedMessages = normalizeArray(messages).map(m => ({
    ...m,
    attachments: attachmentsByMessage[m.id] || [],
    reactions: reactionsByMessage[m.id] || []
  }));

  response.json({
    client: {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: normalizeTimestamps({ created_at: user.created_at }).created_at,
      ...(profileSnap.exists ? profileSnap.data() : {})
    },
    meals:    normalizeArray(meals),
    workouts: normalizeArray(workouts),
    progress: normalizeArray(progress),
    bookings: normalizeArray(bookings),
    messages: enrichedMessages
  });
});

/* ═══════════════════════════════════════════════════════
   BOOKINGS — with ?status= and ?q= and ?from= and ?to=
   ═══════════════════════════════════════════════════════ */
router.get('/bookings', async (request, response) => {
  const records = await listDocuments('bookings', {
    orderBy: [['requested_at', 'desc']],
    limit: 500
  });
  const userIds = [...new Set(records.map((b) => Number(b.user_id)))];
  const users = await Promise.all(userIds.map((id) => getDocument('users', id).get()));
  const userMap = Object.fromEntries(
    users
      .filter((u) => u.exists)
      .map((u) => [Number(u.id), { name: u.get('name'), email: u.get('email') }])
  );

  let bookings = normalizeArray(records).map((b) => ({
    ...b,
    clientName: userMap[Number(b.user_id)]?.name || 'Unknown client',
    clientEmail: userMap[Number(b.user_id)]?.email || ''
  }));

  const status = String(request.query.status || '').trim();
  if (status && status !== 'all') {
    bookings = bookings.filter(b => b.status === status);
  }

  const q = String(request.query.q || '').trim().toLowerCase();
  if (q) {
    bookings = bookings.filter(b =>
      (b.clientName || '').toLowerCase().includes(q) ||
      (b.service || '').toLowerCase().includes(q)
    );
  }

  const from = request.query.from ? new Date(request.query.from) : null;
  const to   = request.query.to   ? new Date(request.query.to)   : null;
  if (from && !Number.isNaN(from.getTime())) {
    bookings = bookings.filter(b => new Date(b.requested_at) >= from);
  }
  if (to && !Number.isNaN(to.getTime())) {
    bookings = bookings.filter(b => new Date(b.requested_at) <= to);
  }

  response.json({ bookings, total: bookings.length });
});

router.get('/bookings/:id', async (request, response) => {
  const ref = getDocument('bookings', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Booking not found' });
  response.json({ booking: normalizeTimestamps({ id: ref.id, ...snap.data() }) });
});

router.patch('/bookings/:id', async (request, response) => {
  const status = request.body?.status;
  if (!['approved', 'declined', 'cancelled'].includes(status)) {
    return response.status(400).json({ error: 'Status must be approved, declined, or cancelled' });
  }
  const ref = getDocument('bookings', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Booking not found' });

  await ref.set({
    status,
    [`${status}_at`]: new Date(),
    updated_at: new Date()
  }, { merge: true });

  const fresh = await ref.get();
  return response.json({ booking: normalizeTimestamps({ id: ref.id, ...fresh.data() }) });
});

/* ═══════════════════════════════════════════════════════
   MEALS — edit existing entry
   ═══════════════════════════════════════════════════════ */
router.patch('/meals/:id', async (request, response) => {
  const ref = getDocument('meal_logs', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Meal not found' });

  const updates = {};
  if (Object.hasOwn(request.body, 'meal_name')) {
    const name = String(request.body.meal_name || '').trim();
    if (!name || name.length > 120) return response.status(400).json({ error: 'Invalid meal name' });
    updates.meal_name = name;
  }
  if (Object.hasOwn(request.body, 'calories')) {
    const c = Number(request.body.calories);
    if (!Number.isInteger(c) || c < 0 || c > 10000) return response.status(400).json({ error: 'Invalid calories' });
    updates.calories = c;
  }
  if (Object.hasOwn(request.body, 'protein_g')) {
    const p = Number(request.body.protein_g);
    if (!Number.isFinite(p) || p < 0 || p > 1000) return response.status(400).json({ error: 'Invalid protein' });
    updates.protein_g = p;
  }
  if (!Object.keys(updates).length) return response.status(400).json({ error: 'No fields to update' });
  updates.updated_at = new Date();
  await ref.set(updates, { merge: true });
  const fresh = await ref.get();
  response.json({ meal: normalizeTimestamps({ id: ref.id, ...fresh.data() }) });
});

/* ═══════════════════════════════════════════════════════
   WORKOUTS — edit existing entry
   ═══════════════════════════════════════════════════════ */
router.patch('/workouts/:id', async (request, response) => {
  const ref = getDocument('workout_logs', request.params.id);
  const snap = await ref.get();
  if (!snap.exists) return response.status(404).json({ error: 'Workout not found' });

  const updates = {};
  if (Object.hasOwn(request.body, 'workout_name')) {
    const name = String(request.body.workout_name || '').trim();
    if (!name || name.length > 120) return response.status(400).json({ error: 'Invalid workout name' });
    updates.workout_name = name;
  }
  if (Object.hasOwn(request.body, 'duration_minutes')) {
    const d = Number(request.body.duration_minutes);
    if (!Number.isInteger(d) || d < 1 || d > 1440) return response.status(400).json({ error: 'Invalid duration' });
    updates.duration_minutes = d;
  }
  if (!Object.keys(updates).length) return response.status(400).json({ error: 'No fields to update' });
  updates.updated_at = new Date();
  await ref.set(updates, { merge: true });
  const fresh = await ref.get();
  response.json({ workout: normalizeTimestamps({ id: ref.id, ...fresh.data() }) });
});

/* ═══════════════════════════════════════════════════════
   ORDERS — with ?status= and ?q=
   ═══════════════════════════════════════════════════════ */
router.get('/orders', async (request, response) => {
  let orders = await listDocuments('shop_orders', { orderBy: [['created_at', 'desc']], limit: 500 });
  orders = normalizeArray(orders);

  const status = String(request.query.status || '').trim();
  if (status && status !== 'all') {
    orders = orders.filter(o => o.status === status);
  }
  const q = String(request.query.q || '').trim().toLowerCase();
  if (q) {
    orders = orders.filter(o =>
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.customer_email || '').toLowerCase().includes(q) ||
      (o.tx_ref || '').toLowerCase().includes(q)
    );
  }
  response.json({ orders, total: orders.length });
});

/* ═══════════════════════════════════════════════════════
   SALES
   ═══════════════════════════════════════════════════════ */
router.get('/sales', async (_request, response) => {
  const orders = await listDocuments('shop_orders', {
    filters: [['status', '==', 'successful']],
    orderBy: [['created_at', 'desc']],
    limit: 5000
  });
  const byMonth = new Map();
  orders.forEach((order) => {
    const t = parseTimestamp(order.created_at);
    if (!t) return;
    const month = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    const row = byMonth.get(month) || { month, orders: 0, revenue: 0 };
    row.orders += 1;
    row.revenue += Number(order.amount) || 0;
    byMonth.set(month, row);
  });
  const monthly = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  response.json({
    currency: 'ZMW',
    completedOrders: orders.length,
    revenue: orders.reduce((total, order) => total + (Number(order.amount) || 0), 0),
    monthly
  });
});

/* ═══════════════════════════════════════════════════════
   COACHING PROGRAMS
   ═══════════════════════════════════════════════════════ */
router.get('/programs', async (_request, response) => {
  await seedPrograms();
  const programs = await listDocuments('coaching_programs', { orderBy: [['name', 'asc']], limit: 200 });
  programs.sort((a, b) => Number(b.is_active) - Number(a.is_active));
  response.json({ programs: normalizeArray(programs) });
});

router.post('/programs', async (request, response) => {
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
  const description = typeof request.body.description === 'string' ? request.body.description.trim() : '';
  const duration = Number(request.body.duration_weeks);
  if (!name || name.length > 160 || description.length > 5000 ||
      !Number.isInteger(duration) || duration < 1 || duration > 104) {
    return response.status(400).json({ error: 'Program details are invalid' });
  }
  const id = await allocateId('coaching_programs');
  const program = {
    id, name, description, duration_weeks: duration,
    is_active: true, created_at: new Date(), updated_at: new Date()
  };
  await getDocument('coaching_programs', id).create(program);
  response.status(201).json({ program: normalizeTimestamps(program) });
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
  const programRef = getDocument('coaching_programs', request.params.id);
  const existing = await programRef.get();
  if (!existing.exists) return response.status(404).json({ error: 'Program not found' });
  const program = {
    ...existing.data(), name, description, duration_weeks: duration,
    is_active: isActive, updated_at: new Date()
  };
  await programRef.set(program);
  response.json({ program: normalizeTimestamps(program) });
});

/* ═══════════════════════════════════════════════════════
   SETTINGS — now with toggle flags
   ═══════════════════════════════════════════════════════ */
const defaultSettings = {
  business_name: 'ComboMaster Fitness',
  contact_email: 'admin@combomaster.com',
  sound_enabled: true,
  typing_indicator_enabled: true,
  reactions_enabled: true,
  attachments_enabled: true,
  read_receipts_enabled: true
};

router.get('/settings', async (_request, response) => {
  const keys = Object.keys(defaultSettings);
  const rows = await Promise.all(keys.map((key) => getDocument('business_settings', key).get()));
  const settings = { ...defaultSettings };
  rows.forEach((snapshot) => {
    if (snapshot.exists) settings[snapshot.id] = snapshot.get('setting_value');
  });
  response.json({ settings });
});

router.put('/settings', async (request, response) => {
  const next = { ...defaultSettings };
  if (typeof request.body.business_name === 'string') next.business_name = request.body.business_name.trim();
  if (typeof request.body.contact_email === 'string') next.contact_email = request.body.contact_email.trim();
  for (const key of ['sound_enabled', 'typing_indicator_enabled', 'reactions_enabled', 'attachments_enabled', 'read_receipts_enabled']) {
    if (typeof request.body[key] === 'boolean') next[key] = request.body[key];
  }

  if (!next.business_name || next.business_name.length > 160 ||
      next.contact_email.length > 254 ||
      (next.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.contact_email))) {
    return response.status(400).json({ error: 'Business settings are invalid' });
  }

  const batch = getCollection('business_settings').firestore.batch();
  Object.entries(next).forEach(([key, value]) => {
    batch.set(getDocument('business_settings', key), {
      setting_value: value,
      updated_by: Number(request.auth.sub),
      updated_at: new Date()
    });
  });
  await batch.commit();
  response.json({ settings: next });
});

/* ═══════════════════════════════════════════════════════
   MESSAGES — threads list, enriched
   GET /admin/messages  →  all messages grouped by client
   ═══════════════════════════════════════════════════════ */
router.get('/messages', async (_request, response) => {
  const [records, clients] = await Promise.all([
    listDocuments('messages', { orderBy: [['created_at', 'asc']], limit: 2000 }),
    listDocuments('users', { filters: [['role', '==', 'client']], limit: 2000 })
  ]);

  const clientMap = Object.fromEntries(clients.map(u => [Number(u.id), { name: u.name, email: u.email }]));

  // enrich with attachments + reactions in bulk
  const [allAttachments, allReactions] = await Promise.all([
    listDocuments('message_attachments', { limit: 5000 }),
    listDocuments('message_reactions', { limit: 5000 })
  ]);

  const attachmentsByMessage = {};
  allAttachments.forEach(a => {
    (attachmentsByMessage[a.message_id] ||= []).push(normalizeTimestamps(a));
  });
  const reactionsByMessage = {};
  allReactions.forEach(r => {
    (reactionsByMessage[r.message_id] ||= []).push(r);
  });

  const messages = normalizeArray(records).map(m => ({
    ...m,
    client_name: clientMap[Number(m.user_id)]?.name || 'Unknown client',
    client_email: clientMap[Number(m.user_id)]?.email || '',
    attachments: attachmentsByMessage[m.id] || [],
    reactions: reactionsByMessage[m.id] || []
  }));

  // group into threads
  const threads = {};
  messages.forEach(m => {
    const key = String(m.user_id);
    (threads[key] ||= []).push(m);
  });

  response.json({ messages, threads });
});

/* ═══════════════════════════════════════════════════════
   MESSAGES — send (with optional reply + attachment)
   POST /admin/messages/:userId
   Body: { body, reply_to?, attachment_id? }
   ═══════════════════════════════════════════════════════ */
router.post('/messages/:userId', async (request, response) => {
  if (!/^\d+$/.test(request.params.userId)) {
    return response.status(400).json({ error: 'Client id is invalid' });
  }
  const userId = Number(request.params.userId);
  const body = typeof request.body.body === 'string' ? request.body.body.trim() : '';
  const replyTo = request.body.reply_to != null ? Number(request.body.reply_to) : null;
  const attachmentId = request.body.attachment_id != null ? Number(request.body.attachment_id) : null;

  if ((!body || body.length > 4000) && !attachmentId) {
    return response.status(400).json({ error: 'Message must be 1–4000 chars, or include an attachment' });
  }

  const clientSnap = await getDocument('users', userId).get();
  if (!clientSnap.exists || clientSnap.get('role') !== 'client') {
    return response.status(404).json({ error: 'Client not found' });
  }

  const messageId = await allocateId('messages');
  const message = {
    id: messageId,
    user_id: userId,
    sender_id: Number(request.auth.sub),
    body: body || '',
    reply_to: replyTo || null,
    created_at: new Date()
  };
  await getCollection('messages').doc(String(messageId)).create(message);

  // attach existing attachment record to the message
  if (attachmentId) {
    const attRef = getDocument('message_attachments', attachmentId);
    const attSnap = await attRef.get();
    if (attSnap.exists && Number(attSnap.get('user_id')) === userId) {
      await attRef.set({ message_id: messageId, updated_at: new Date() }, { merge: true });
    }
  }

  response.status(201).json({ message: normalizeTimestamps(message) });
});

/* ═══════════════════════════════════════════════════════
   MESSAGES — upload attachment
   POST /admin/messages/:userId/attachments  (multipart)
   Field: file
   ═══════════════════════════════════════════════════════ */
router.post('/messages/:userId/attachments', upload.single('file'), async (request, response) => {
  if (!/^\d+$/.test(request.params.userId)) {
    return response.status(400).json({ error: 'Client id is invalid' });
  }
  if (!request.file) {
    return response.status(400).json({ error: 'No file uploaded' });
  }
  const userId = Number(request.params.userId);
  const clientSnap = await getDocument('users', userId).get();
  if (!clientSnap.exists || clientSnap.get('role') !== 'client') {
    return response.status(404).json({ error: 'Client not found' });
  }

  const attachmentId = await allocateId('message_attachments');
  const ext = path.extname(request.file.originalname || '').toLowerCase().slice(0, 10) || '';
  const storedName = `${attachmentId}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const filePath = path.join(uploadsDir, storedName);
  await fs.writeFile(filePath, request.file.buffer);

  const attachment = {
    id: attachmentId,
    message_id: null,          // set when the message is actually sent
    user_id: userId,
    sender_id: Number(request.auth.sub),
    original_name: request.file.originalname,
    stored_name: storedName,
    mime_type: request.file.mimetype,
    size_bytes: request.file.size,
    url: `/api/admin/messages/attachments/${storedName}`,
    created_at: new Date()
  };
  await getCollection('message_attachments').doc(String(attachmentId)).create(attachment);

  response.status(201).json({ attachment: normalizeTimestamps(attachment) });
});

/* ═══════════════════════════════════════════════════════
   MESSAGES — serve attachment file
   GET /admin/messages/attachments/:storedName
   ═══════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════
   MESSAGES — toggle emoji reaction
   POST /admin/messages/:messageId/reactions
   Body: { emoji }
   ═══════════════════════════════════════════════════════ */
router.post('/messages/:messageId/reactions', async (request, response) => {
  const messageId = Number(request.params.messageId);
  const emoji = String(request.body.emoji || '').trim();
  if (!messageId || !emoji || emoji.length > 8) {
    return response.status(400).json({ error: 'Invalid message or emoji' });
  }
  const userId = Number(request.auth.sub);

  // one reaction per (message, user, emoji)
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
  return response.json({ added: true, reaction: { id, message_id: messageId, user_id: userId, emoji } });
});

/* ═══════════════════════════════════════════════════════
   MESSAGES — typing indicator
   POST /admin/messages/:userId/typing  (coach signals "typing")
   GET  /admin/messages/:userId/typing  (client polls "is coach typing?")
   The GET is also exposed on /api/client/messages/:id/typing by the
   client router; keep it here for coach-side parity.
   ═══════════════════════════════════════════════════════ */
router.post('/messages/:userId/typing', async (request, response) => {
  const userId = Number(request.params.userId);
  if (!userId) return response.status(400).json({ error: 'Invalid user' });
  markTyping(userId, Number(request.auth.sub));
  response.json({ ok: true });
});

router.get('/messages/:userId/typing', async (request, response) => {
  const userId = Number(request.params.userId);
  response.json({ typing: isTyping(userId) });
});

/* ═══════════════════════════════════════════════════════
   EXPORT — /admin/export/:type?format=csv|json
   Types: clients | bookings | meals | workouts | progress | messages
   ═══════════════════════════════════════════════════════ */
router.get('/export/:type', async (request, response) => {
  const type = String(request.params.type).toLowerCase();
  const format = String(request.query.format || 'csv').toLowerCase();

  const exportable = {
    clients:  { coll: 'users',             filter: [['role', '==', 'client']] },
    bookings: { coll: 'bookings' },
    meals:    { coll: 'meal_logs' },
    workouts: { coll: 'workout_logs' },
    progress: { coll: 'progress_entries' },
    messages: { coll: 'messages' }
  };
  const cfg = exportable[type];
  if (!cfg) return response.status(400).json({ error: 'Unknown export type' });

  let rows = await listDocuments(cfg.coll, {
    ...(cfg.filter ? { filters: cfg.filter } : {}),
    limit: 10000
  });
  rows = normalizeArray(rows);

  if (format === 'json') {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Content-Disposition', `attachment; filename="${type}-${Date.now()}.json"`);
    return response.send(JSON.stringify(rows, null, 2));
  }

  // CSV — collect union of keys, but prioritize common fields
  const preferred = ['id','name','email','role','user_id','clientName','service','status','requested_at','meal_name','calories','protein_g','logged_at','workout_name','duration_minutes','completed_at','weight_kg','body_fat_percent','recorded_at','sender_id','body','created_at'];
  const keySet = new Set(preferred);
  rows.forEach(r => Object.keys(r).forEach(k => keySet.add(k)));
  const cols = [...keySet].filter(k => rows.some(r => r[k] !== undefined));

  const escape = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  rows.forEach(r => lines.push(cols.map(c => escape(r[c])).join(',')));
  const csv = lines.join('\r\n');

  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${type}-${Date.now()}.csv"`);
  response.send('\uFEFF' + csv); // BOM so Excel opens UTF-8 correctly
});

module.exports = router;