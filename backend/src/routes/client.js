const express = require('express');
const { allocateId, getCollection, getDocument, listDocuments, getFirestore } = require('../firestore');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Every route in this file requires a logged-in client.
router.use(requireAuth, requireRole('client'));

/* ============================================================
   DASHBOARD
   ============================================================ */
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

  // Compute streak server-side: consecutive days with at least one workout.
  const workoutDays = new Set(
    workouts
      .map(w => new Date(w.completed_at))
      .filter(d => !Number.isNaN(d.getTime()))
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

  // Derive achievements progress from real data.
  const achievements = [
    { icon: 'flame',  name: '7-Day Streak',      desc: 'Train 7 days in a row', progress: Math.min(streak, 7),       target: 7 },
    { icon: 'trophy', name: 'Iron Warrior',      desc: '50 workouts completed', progress: workouts.length,              target: 50 },
    { icon: 'apple',  name: 'Nutrition Master',  desc: 'Log 30 meals',          progress: meals.length,                 target: 30 },
    { icon: 'scale',  name: 'Consistent Tracker',desc: 'Log 10 weigh-ins',      progress: progress.length,              target: 10 }
  ];
  const badges = achievements.filter(a => a.progress >= a.target).length;

  response.json({
    profile: {
      name: profile.name || null,
      phone: profile.phone || null,
      goal: profile.goal || null,
      height_cm: profile.height_cm ?? null
    },
    progress,
    meals,
    workouts,
    bookings,
    messages,
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

/* ============================================================
   MEALS  (list + create + delete)
   ============================================================ */
router.get('/meals', async (request, response) => {
  const meals = await listDocuments('meal_logs', {
    filters: [['user_id', '==', Number(request.auth.sub)]],
    orderBy: [['logged_at', 'desc']],
    limit: 50
  });
  response.json({ meals });
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
   WORKOUTS  (list + create + delete)
   ============================================================ */
router.get('/workouts', async (request, response) => {
  const workouts = await listDocuments('workout_logs', {
    filters: [['user_id', '==', Number(request.auth.sub)]],
    orderBy: [['completed_at', 'desc']],
    limit: 50
  });
  response.json({ workouts });
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
   PROGRESS  (list + create)
   ============================================================ */
router.get('/progress', async (request, response) => {
  const progress = await listDocuments('progress_entries', {
    filters: [['user_id', '==', Number(request.auth.sub)]],
    orderBy: [['recorded_at', 'desc']],
    limit: 60
  });
  response.json({ progress });
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

/* ============================================================
   BOOKINGS  (list + create)
   ============================================================ */
router.get('/bookings', async (request, response) => {
  const bookings = await listDocuments('bookings', {
    filters: [['user_id', '==', Number(request.auth.sub)]],
    orderBy: [['requested_at', 'desc']],
    limit: 50
  });
  response.json({ bookings });
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

/* ============================================================
   MESSAGES  (list + create)
   ============================================================ */
router.get('/messages', async (request, response) => {
  const messages = await listDocuments('messages', {
    filters: [['user_id', '==', Number(request.auth.sub)]],
    orderBy: [['created_at', 'asc']],
    limit: 200
  });
  response.json({ messages });
});

router.post('/messages', async (request, response) => {
  const body = typeof request.body.body === 'string' ? request.body.body.trim() : '';
  if (!body || body.length > 4000) {
    return response.status(400).json({ error: 'Message must be between 1 and 4000 characters' });
  }
  const message = {
    id: await allocateId('messages'),
    user_id: Number(request.auth.sub),
    sender_id: Number(request.auth.sub),
    body,
    created_at: new Date()
  };
  await getCollection('messages').doc(String(message.id)).create(message);
  return response.status(201).json(message);
});

/* ============================================================
   ASSIGNED PLANS (meal + workout)
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
    mealPlan: mealPlanSnap && mealPlanSnap.exists ? { id: mealPlanSnap.id, ...mealPlanSnap.data() } : null,
    workoutPlan: workoutPlanSnap && workoutPlanSnap.exists ? { id: workoutPlanSnap.id, ...workoutPlanSnap.data() } : null
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
  response.status(201).json({ checkin: entry });
});

module.exports = router;