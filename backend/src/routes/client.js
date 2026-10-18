const express = require('express');
const { allocateId, getCollection, getDocument, listDocuments } = require('../firestore');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('client'));

router.get('/dashboard', async (request, response) => {
  const userId = Number(request.auth.sub);
  const [profileSnapshot, progress, meals, workouts, bookings, messages] = await Promise.all([
    getDocument('client_profiles', userId).get(),
    listDocuments('progress_entries', { filters: [['user_id', '==', userId]], orderBy: [['recorded_at', 'desc']], limit: 30 }),
    listDocuments('meal_logs', { filters: [['user_id', '==', userId]], orderBy: [['logged_at', 'desc']], limit: 20 }),
    listDocuments('workout_logs', { filters: [['user_id', '==', userId]], orderBy: [['completed_at', 'desc']], limit: 20 }),
    listDocuments('bookings', { filters: [['user_id', '==', userId]], orderBy: [['requested_at', 'desc']], limit: 20 }),
    listDocuments('messages', { filters: [['user_id', '==', userId]], orderBy: [['created_at', 'desc']], limit: 50 })
  ]);
  const profile = profileSnapshot.exists ? profileSnapshot.data() : {};

  response.json({
    profile: { phone: profile.phone || null, goal: profile.goal || null, height_cm: profile.height_cm ?? null },
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
  const userId = Number(request.auth.sub);
  const profileRef = getDocument('client_profiles', userId);
  const currentSnapshot = await profileRef.get();
  const current = currentSnapshot.exists ? currentSnapshot.data() : { phone: null, goal: null, height_cm: null };
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

  const db = profileRef.firestore;
  await db.runTransaction(async (transaction) => {
    transaction.set(profileRef, {
      user_id: userId, phone: phone || null, goal: goal || null, height_cm: height,
      updated_at: new Date()
    }, { merge: true });
    if (name !== undefined) {
      transaction.set(getDocument('users', userId), { name, updated_at: new Date() }, { merge: true });
    }
  });
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
  const meal = { id: await allocateId('meal_logs'), user_id: Number(request.auth.sub), meal_name: mealName, calories, protein_g: protein, logged_at: new Date() };
  await getCollection('meal_logs').doc(String(meal.id)).create(meal);
  return response.status(201).json(meal);
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
  const workout = { id: await allocateId('workout_logs'), user_id: Number(request.auth.sub), workout_name: name, duration_minutes: duration, completed_at: new Date() };
  await getCollection('workout_logs').doc(String(workout.id)).create(workout);
  return response.status(201).json(workout);
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
  const progress = { id: await allocateId('progress_entries'), user_id: Number(request.auth.sub), weight_kg: weight, body_fat_percent: bodyFat, note: note || null, recorded_at: new Date() };
  await getCollection('progress_entries').doc(String(progress.id)).create(progress);
  return response.status(201).json(progress);
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
  const booking = { id: await allocateId('bookings'), user_id: Number(request.auth.sub), service, requested_at: requestedAt, status: 'pending', created_at: new Date() };
  await getCollection('bookings').doc(String(booking.id)).create(booking);
  return response.status(201).json(booking);
});

router.post('/messages', async (request, response) => {
  const body = typeof request.body.body === 'string' ? request.body.body.trim() : '';
  if (!body || body.length > 4000) {
    return response.status(400).json({ error: 'Message must be between 1 and 4000 characters' });
  }
  const message = { id: await allocateId('messages'), user_id: Number(request.auth.sub), sender_id: Number(request.auth.sub), body, created_at: new Date() };
  await getCollection('messages').doc(String(message.id)).create(message);
  return response.status(201).json(message);
});

module.exports = router;
