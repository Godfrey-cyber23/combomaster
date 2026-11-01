// seed.js
const fs = require('node:fs');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const config = require('./config');

async function main() {
  // --- Init Firebase Admin ---
  const serviceAccount = JSON.parse(fs.readFileSync(config.firebaseServiceAccountPath, 'utf8'));
  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: config.firebaseProjectId || serviceAccount.project_id
  });
  const db = getFirestore(app, config.firebaseDatabaseId);

  console.log('🌱 Seeding Firestore...');

  // --- Prepare timestamps ---
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  const hoursAgo = (n) => new Date(now.getTime() - n * 60 * 60 * 1000);
  const daysFromNow = (n, hour = 10) => {
    const d = new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  // --- Passwords (bcrypt cost 12, matches auth.js) ---
  const clientPassword = await bcrypt.hash('Password123!', 12);
  const adminPassword  = await bcrypt.hash('Admin123!',    12);
  console.log('  ✔ Generated bcrypt hashes');

  // --- Users ---
  const users = [
    { id: 1, name: 'James Mwansa', email: 'james@example.com', password_hash: clientPassword, role: 'client' },
    { id: 2, name: 'Sarah Banda',  email: 'sarah@example.com', password_hash: clientPassword, role: 'client' },
    { id: 3, name: 'Coach Alex',   email: 'admin@combomaster.com', password_hash: adminPassword, role: 'admin' }
  ];
  const batch = db.batch();
  for (const u of users) {
    batch.set(db.collection('users').doc(String(u.id)), {
      ...u, created_at: now, updated_at: now
    });
    const emailHash = crypto.createHash('sha256').update(u.email.toLowerCase()).digest('hex');
    batch.set(db.collection('_user_emails').doc(emailHash), { user_id: u.id });
  }
  batch.set(db.collection('_counters').doc('users'), { value: 3 });
  await batch.commit();
  console.log('  ✔ users, _user_emails, _counters');

  // --- Client profiles ---
  await Promise.all([
    db.collection('client_profiles').doc('1').set({
      user_id: 1, phone: '+260971234567', goal: 'Lose 5kg, build strength',
      height_cm: 178, updated_at: now
    }),
    db.collection('client_profiles').doc('2').set({
      user_id: 2, phone: '+260977654321', goal: 'Prep for half marathon',
      height_cm: 165, updated_at: now
    })
  ]);
  console.log('  ✔ client_profiles');

  // --- Progress entries ---
  const progress = [
    { id: 1, user_id: 1, weight_kg: 84.2, body_fat_percent: 18.1, note: null,               recorded_at: daysAgo(7) },
    { id: 2, user_id: 1, weight_kg: 83.8, body_fat_percent: 17.9, note: null,               recorded_at: daysAgo(6) },
    { id: 3, user_id: 1, weight_kg: 83.1, body_fat_percent: 17.5, note: null,               recorded_at: daysAgo(4) },
    { id: 4, user_id: 1, weight_kg: 82.7, body_fat_percent: 17.2, note: null,               recorded_at: daysAgo(2) },
    { id: 5, user_id: 1, weight_kg: 82.5, body_fat_percent: 16.9, note: 'Feeling good',     recorded_at: now },
    { id: 6, user_id: 2, weight_kg: 61.0, body_fat_percent: 22.0, note: null,               recorded_at: now }
  ];
  for (const p of progress) {
    await db.collection('progress_entries').doc(String(p.id)).set(p);
  }
  await db.collection('_counters').doc('progress_entries').set({ value: 6 });
  console.log('  ✔ progress_entries');

  // --- Meal logs ---
  const meals = [
    { id: 1, user_id: 1, meal_name: 'Protein Oats',    calories: 450, protein_g: 30, logged_at: hoursAgo(6) },
    { id: 2, user_id: 1, meal_name: 'Chicken Bowl',    calories: 580, protein_g: 48, logged_at: hoursAgo(2) },
    { id: 3, user_id: 1, meal_name: 'Salmon meal',     calories: 520, protein_g: 40, logged_at: daysAgo(1) },
    { id: 4, user_id: 1, meal_name: 'Protein Yogurt',  calories: 210, protein_g: 28, logged_at: hoursAgo(1) },
    { id: 5, user_id: 2, meal_name: 'Greek Salad',     calories: 320, protein_g: 18, logged_at: hoursAgo(3) }
  ];
  for (const m of meals) {
    await db.collection('meal_logs').doc(String(m.id)).set(m);
  }
  await db.collection('_counters').doc('meal_logs').set({ value: 5 });
  console.log('  ✔ meal_logs');

  // --- Workout logs ---
  const workouts = [
    { id: 1, user_id: 1, workout_name: 'Upper Body Push',     duration_minutes: 60, completed_at: now },
    { id: 2, user_id: 1, workout_name: 'Lower Body Strength', duration_minutes: 55, completed_at: daysAgo(1) },
    { id: 3, user_id: 1, workout_name: 'HIIT Cardio',         duration_minutes: 30, completed_at: daysAgo(3) },
    { id: 4, user_id: 1, workout_name: 'Upper Body Push',     duration_minutes: 62, completed_at: daysAgo(4) },
    { id: 5, user_id: 2, workout_name: 'Long Run',            duration_minutes: 75, completed_at: now }
  ];
  for (const w of workouts) {
    await db.collection('workout_logs').doc(String(w.id)).set(w);
  }
  await db.collection('_counters').doc('workout_logs').set({ value: 5 });
  console.log('  ✔ workout_logs');

  // --- Bookings ---
  const bookings = [
    { id: 1, user_id: 1, service: 'Nutrition Review', requested_at: daysFromNow(1, 10), status: 'pending',  created_at: now },
    { id: 2, user_id: 1, service: '1-on-1 Coaching',  requested_at: daysFromNow(3, 14), status: 'approved', created_at: daysAgo(2) },
    { id: 3, user_id: 2, service: 'Form Check',       requested_at: daysFromNow(2, 9),  status: 'pending',  created_at: daysAgo(1) }
  ];
  for (const b of bookings) {
    await db.collection('bookings').doc(String(b.id)).set(b);
  }
  await db.collection('_counters').doc('bookings').set({ value: 3 });
  console.log('  ✔ bookings');

  // --- Messages ---
  const messages = [
    { id: 1, user_id: 1, sender_id: 1, body: 'Hi coach! Should I add more cardio this week?', created_at: daysAgo(2) },
    { id: 2, user_id: 1, sender_id: 3, body: 'Not this week — keep the focus on strength. Cardio next week.', created_at: hoursAgo(47) },
    { id: 3, user_id: 1, sender_id: 1, body: 'Sounds good, thanks!', created_at: hoursAgo(46) },
    { id: 4, user_id: 2, sender_id: 2, body: 'My knee feels fine after the run.', created_at: now }
  ];
  for (const m of messages) {
    await db.collection('messages').doc(String(m.id)).set(m);
  }
  await db.collection('_counters').doc('messages').set({ value: 4 });
  console.log('  ✔ messages');

  // --- Meal + workout plans ---
  await db.collection('meal_plans').doc('plan1').set({
    name: 'Foundation Nutrition',
    days: [
      { name: 'Monday',  meals: [{ name: 'Oats + Berries', calories: 450 }, { name: 'Chicken Bowl', calories: 580 }, { name: 'Salmon + Veg', calories: 520 }] },
      { name: 'Tuesday', meals: [{ name: 'Eggs + Toast', calories: 420 }, { name: 'Beef Stir-fry', calories: 610 }, { name: 'Tuna Salad', calories: 380 }] }
    ]
  });
  await db.collection('workout_plans').doc('plan1').set({
    name: 'Strength Base',
    days: [
      { name: 'Push Day', exercises: [{ name: 'Bench Press', sets: 4, reps: '8-10' }, { name: 'Overhead Press', sets: 3, reps: '10' }, { name: 'Triceps Dips', sets: 3, reps: '15' }] },
      { name: 'Pull Day', exercises: [{ name: 'Pull Ups', sets: 4, reps: '6-8' }, { name: 'Barbell Row', sets: 3, reps: '10' }, { name: 'Face Pulls', sets: 3, reps: '15' }] }
    ]
  });
  await db.collection('users').doc('1').set({
    meal_plan_id: 'plan1', workout_plan_id: 'plan1'
  }, { merge: true });
  console.log('  ✔ meal_plans, workout_plans (assigned to user 1)');

  // --- Coaching programs ---
  const programs = [
    { id: 1, name: '12-Week Strength',  duration_weeks: 12, description: 'Progressive overload focused on compound lifts.', is_active: true },
    { id: 2, name: '8-Week Shred',       duration_weeks: 8,  description: 'Cut-focused plan with cardio and nutrition support.', is_active: true },
    { id: 3, name: 'Beginner Foundations', duration_weeks: 6, description: 'Movement quality and habit building.', is_active: true }
  ];
  for (const p of programs) {
    await db.collection('coaching_programs').doc(String(p.id)).set(p);
  }
  console.log('  ✔ coaching_programs');

  // --- Business settings ---
  await db.collection('settings').doc('business').set({
    business_name: 'ComboMaster Fitness',
    contact_email: 'hello@combomaster.com',
    updated_at: now
  });
  console.log('  ✔ settings');

  // --- Sample orders (shop) ---
  const orders = [
    {
      tx_ref: 'CM-TEST-0001',
      customer_name: 'James Mwansa', customer_email: 'james@example.com',
      items: [{ title: 'Whey Protein 2kg', quantity: 1, price: 650 }, { title: 'Shaker Bottle', quantity: 1, price: 80 }],
      amount: 730, currency: 'ZMW', status: 'paid', created_at: daysAgo(5)
    },
    {
      tx_ref: 'CM-TEST-0002',
      customer_name: 'Sarah Banda', customer_email: 'sarah@example.com',
      items: [{ title: 'Resistance Bands', quantity: 2, price: 120 }],
      amount: 240, currency: 'ZMW', status: 'paid', created_at: daysAgo(3)
    }
  ];
  for (const o of orders) {
    await db.collection('orders').add(o);
  }
  console.log('  ✔ orders');

  console.log('\n✅ Seed complete!\n');
  console.log('Login credentials:');
  console.log('  Client: james@example.com  / Password123!');
  console.log('  Client: sarah@example.com  / Password123!');
  console.log('  Admin:  admin@combomaster.com / Admin123!\n');
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});