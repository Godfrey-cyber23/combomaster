const express = require('express');
const { allocateId, getCollection, getDocument, getFirestore, listDocuments, normalizeValue } = require('../firestore');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));
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

router.get('/dashboard', async (_request, response) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const usersQuery = getCollection('users').where('role', '==', 'client');
  const bookingsQuery = getCollection('bookings');
  const messagesQuery = getCollection('messages').where('created_at', '>=', startOfDay);
  const [clients, joinedToday, bookings, pendingBookings, messagesToday] = await Promise.all([
    usersQuery.count().get(),
    usersQuery.where('created_at', '>=', startOfDay).count().get(),
    bookingsQuery.count().get(),
    bookingsQuery.where('status', '==', 'pending').count().get(),
    messagesQuery.count().get()
  ]);
  response.json({
    stats: {
      clients: clients.data().count,
      joinedToday: joinedToday.data().count,
      bookings: bookings.data().count,
      pendingBookings: pendingBookings.data().count,
      messagesToday: messagesToday.data().count
    }
  });
});

router.get('/clients', async (_request, response) => {
  const users = await listDocuments('users', {
    filters: [['role', '==', 'client']], orderBy: [['created_at', 'desc']], limit: 200
  });
  const clients = await Promise.all(users.map(async (user) => {
    const [profile, progress, pendingBookings] = await Promise.all([
      getDocument('client_profiles', user.id).get(),
      getCollection('progress_entries').where('user_id', '==', user.id).orderBy('recorded_at', 'desc').limit(1).get(),
      getCollection('bookings').where('user_id', '==', user.id).where('status', '==', 'pending').count().get()
    ]);
    return {
      id: user.id, name: user.name, email: user.email, created_at: user.created_at,
      goal: profile.exists ? profile.get('goal') : null,
      last_progress_at: progress.empty ? null : normalizeValue(progress.docs[0].get('recorded_at')),
      pending_bookings: pendingBookings.data().count
    };
  }));
  response.json({ clients });
});

router.get('/bookings', async (_request, response) => {
  const records = await listDocuments('bookings', { orderBy: [['requested_at', 'desc']], limit: 200 });
  const bookings = await Promise.all(records.map(async (booking) => {
    const user = await getDocument('users', booking.user_id).get();
    return {
      id: booking.id, service: booking.service, requested_at: booking.requested_at,
      status: booking.status, client_name: user.exists ? user.get('name') : 'Unknown client',
      client_email: user.exists ? user.get('email') : ''
    };
  }));
  response.json({ bookings });
});

router.get('/orders', async (_request, response) => {
  const orders = await listDocuments('shop_orders', { orderBy: [['created_at', 'desc']], limit: 200 });
  response.json({ orders });
});

router.get('/sales', async (_request, response) => {
  const orders = await listDocuments('shop_orders', {
    filters: [['status', '==', 'successful']], orderBy: [['created_at', 'desc']], limit: 5000
  });
  const byMonth = new Map();
  orders.forEach((order) => {
    const createdAt = order.created_at?.toDate ? order.created_at.toDate() : new Date(order.created_at);
    const month = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
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

router.get('/programs', async (_request, response) => {
  await seedPrograms();
  const programs = await listDocuments('coaching_programs', { orderBy: [['name', 'asc']], limit: 200 });
  programs.sort((a, b) => Number(b.is_active) - Number(a.is_active));
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
  const id = await allocateId('coaching_programs');
  const program = { id, name, description, duration_weeks: duration, is_active: true, created_at: new Date(), updated_at: new Date() };
  await getDocument('coaching_programs', id).create(program);
  response.status(201).json({
    program
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
  const programRef = getDocument('coaching_programs', request.params.id);
  const existing = await programRef.get();
  if (!existing.exists) return response.status(404).json({ error: 'Program not found' });
  const program = { ...existing.data(), name, description, duration_weeks: duration, is_active: isActive, updated_at: new Date() };
  await programRef.set(program);
  response.json({
    program
  });
});

const defaultSettings = {
  business_name: 'ComboMaster Fitness',
  contact_email: 'admin@combomaster.com'
};

router.get('/settings', async (_request, response) => {
  const rows = await Promise.all(Object.keys(defaultSettings).map((key) => getDocument('business_settings', key).get()));
  const settings = { ...defaultSettings };
  rows.forEach((snapshot) => {
    if (snapshot.exists) settings[snapshot.id] = snapshot.get('setting_value');
  });
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
  const batch = getCollection('business_settings').firestore.batch();
  Object.entries(settings).forEach(([key, value]) => {
    batch.set(getDocument('business_settings', key), {
      setting_value: value, updated_by: Number(request.auth.sub), updated_at: new Date()
    });
  });
  await batch.commit();
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
  const bookingRef = getDocument('bookings', request.params.id);
  const booking = await bookingRef.get();
  if (!booking.exists) return response.status(404).json({ error: 'Booking not found' });
  await bookingRef.update({ status, updated_at: new Date() });
  response.json({ id: Number(request.params.id), status });
});

router.get('/messages', async (_request, response) => {
  const records = await listDocuments('messages', { orderBy: [['created_at', 'asc']], limit: 500 });
  const messages = await Promise.all(records.map(async (message) => {
    const user = await getDocument('users', message.user_id).get();
    return { ...message, client_name: user.exists ? user.get('name') : 'Unknown client' };
  }));
  response.json({ messages });
});

router.post('/messages/:userId', async (request, response) => {
  const body = typeof request.body.body === 'string' ? request.body.body.trim() : '';
  if (!body || body.length > 4000) {
    return response.status(400).json({ error: 'Message must be between 1 and 4000 characters' });
  }
  if (!/^\d+$/.test(request.params.userId)) return response.status(404).json({ error: 'Client not found' });
  const client = await getDocument('users', request.params.userId).get();
  if (!client.exists || client.get('role') !== 'client') return response.status(404).json({ error: 'Client not found' });
  const message = {
    id: await allocateId('messages'), user_id: Number(request.params.userId),
    sender_id: Number(request.auth.sub), body, created_at: new Date()
  };
  await getCollection('messages').doc(String(message.id)).create(message);
  response.status(201).json(message);
});

module.exports = router;
