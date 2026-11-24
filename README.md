# ComboMaster Fitness

ComboMaster Fitness is a Node.js-backed fitness platform with a static frontend,
versioned database migrations, and private runtime storage.

## Repository structure

```text
.
├── backend/              # Node.js application and API
│   ├── src/               # App, config, routes, controllers, and models
│   └── tests/             # Backend tests
├── frontend/public/      # Browser pages and public assets
├── database/migrations/  # Versioned SQL schema changes
├── docs/                 # Architecture and release guidance
├── legacy/php-api/       # Retained PHP code for migration reference only
├── storage/              # Runtime logs/uploads, never public
├── tests/                # Automated tests and fixtures
└── package.json          # Workspace commands
```

The Node server serves `frontend/public` and owns the `/api` boundary. The PHP
implementation is not part of the active runtime.

## Local configuration

Create a Firebase project and a Cloud Firestore database in Native mode. In
Google Cloud IAM, give a dedicated service account the `Cloud Datastore User`
role and create a JSON key. Keep that key outside the repository; never paste it
into chat or commit it. Copy `.env.example` to `.env`, set the project ID and
the absolute path to that service-account JSON, and create a private session
secret locally:

```bash
openssl rand -base64 48
```

Put that command's output directly into `JWT_SECRET` in `.env`. Do not share it.
Then deploy the Firestore indexes and verify the service-account connection:

```bash
npm install --prefix backend
firebase deploy --only firestore:indexes
npm --prefix backend run check:db
npm start
```

The Firebase CLI must be installed and authenticated to the same project for
index deployment. Firestore collections are created as the API first writes
records; no SQL migrations are used by the active backend.

Every public registration receives the `client` role. To bootstrap an
administrator, register that account through the signup page, then promote the
registered email using the server-side command:

```bash
npm --prefix backend run admin:promote -- admin@example.com
```

Admins and coaches can use
the **Edit this page** button on the home, about, services, membership, meal
plans, shop, transformations, and contact pages to edit existing headings,
paragraphs, and images, add/remove content blocks, and manage the meal-plan and
shop catalogs. Product and meal-plan records are initialized from the current
site catalog the first time staff opens the corresponding page editor.

Never expose an endpoint that lets a browser assign itself the `admin` role.
The browser and API are served from the same origin at `http://localhost:3000`.
The shop cart is stored in the visitor's browser. Checkout uses Flutterwave
Standard in ZMW for card or Zambian mobile money. Before enabling checkout,
set `PUBLIC_APP_URL` to the public HTTPS origin, configure
`FLUTTERWAVE_SECRET_KEY` and `FLUTTERWAVE_WEBHOOK_SECRET_HASH` in the private
server `.env`, and verify Firestore connectivity. In the Flutterwave dashboard,
enable card and Zambia mobile money, turn off dashboard payment options if
using per-checkout payment choices, and set the webhook URL to
`https://your-domain.example/api/payments/webhook` with the same secret hash.
Zambian mobile money requires a Zambian merchant account or Flutterwave approval.
Open the shop content manager once to initialize its published product catalog
before accepting orders; checkout prices are always read from that server-side
catalog, never from browser-submitted prices.
Use Flutterwave test credentials and test the full callback/webhook flow before
switching to live credentials. Paid orders are recorded only after the server
verifies their transaction, amount, currency, and reference with Flutterwave.

Uploaded images are stored under `storage/uploads` and served through the
validated `/api/media/` endpoint. Keep that directory private from direct static
serving and include it in your protected production backup/persistent storage
configuration.

## Commands

```bash
npm install --prefix backend
npm test
npm start
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) before adding
production features.


🟢 Quick wins — high impact, low effort
1. Coach side of messages (most requested by users)
Right now messages only go client → coach. There's no way for the coach to reply, so the chat feels dead.

Backend (backend/src/routes/admin.js):

js
// POST /api/admin/messages/:userId  { body }
router.post('/messages/:userId', requireRole('admin'), async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body || body.length > 4000) return res.status(400).json({ error: 'Invalid message' });
  const msg = {
    id: await allocateId('messages'),
    user_id: Number(req.params.userId),           // ← client receiving
    sender_id: Number(req.auth.sub),              // ← coach sending
    body,
    created_at: new Date()
  };
  await getCollection('messages').doc(String(msg.id)).create(msg);
  res.status(201).json({ message: msg });
});
Frontend already handles this correctly — renderMessages compares sender_id to the current user, so coach messages automatically render as left bubbles. Zero frontend changes needed.

2. Meal / workout editing (same pattern as bookings)
You already did this for bookings. Apply the same PATCH pattern to meals and workouts. Users will want to fix typos ("Chickn Bowl" → "Chicken Bowl") without deleting and re-logging.

Backend: add router.patch('/meals/:id') and router.patch('/workouts/:id') mirroring the bookings PATCH you just wrote.
Frontend: reuse openEditBookingModal — copy → openEditMealModal / openEditWorkoutModal, change the field names.

~30 minutes if you copy the pattern.

3. Search & filter on lists
Once a client has 20+ meals, the meal list is a wall of text. Add a search box + date filter at the top of each list.

html
<input id="mealSearch" placeholder="Search meals…" class="form-input" oninput="renderMeals()">
<select id="mealRange" onchange="renderMeals()">
  <option value="all">All time</option>
  <option value="7">Last 7 days</option>
  <option value="30">Last 30 days</option>
</select>
In renderMeals:

js
const query = ($('mealSearch')?.value || '').toLowerCase().trim();
const days = Number($('mealRange')?.value) || 0;
const cutoff = days ? Date.now() - days * 86400000 : 0;

const filtered = state.meals.filter(m => {
  if (query && !m.meal_name.toLowerCase().includes(query)) return false;
  if (cutoff && new Date(m.logged_at).getTime() < cutoff) return false;
  return true;
});
Same for workouts, progress, bookings.

4. Profile photo upload
The header avatar is just an initial letter. Adding a real photo makes the app feel personal.

Needs:

multer on the backend (you already require it in app.js)

POST /api/client/avatar accepting a 5MB max image

Upload to your existing storage/uploads directory (you already configured config.uploadDirectory)

Save avatar_url on the client profile

Frontend: file input in settings + display in the header avatar

~1 hour.

5. Password change in settings
Users expect this. Add a section to settings:

html
<div class="glass-card p-6">
  <h3 class="font-semibold mb-3">Change password</h3>
  <input id="currentPassword" type="password" class="form-input mb-2" placeholder="Current password">
  <input id="newPassword" type="password" class="form-input mb-2" placeholder="New password (8+ chars)">
  <input id="confirmNewPassword" type="password" class="form-input mb-2" placeholder="Confirm new password">
  <button onclick="changePassword()" class="btn-gold w-full py-2 rounded-xl">Update password</button>
</div>
Backend: POST /api/auth/change-password — verifies current, hashes new, invalidates sessions if you want to force re-login.

6. Export data (CSV)
One button → downloads all meals/workouts/progress as CSV. Users love owning their data.

js
window.exportMeals = function () {
  const rows = [['date', 'meal', 'calories']];
  state.meals.forEach(m => rows.push([
    new Date(m.logged_at).toISOString().slice(0, 10),
    m.meal_name,
    m.calories || 0
  ]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meals-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export downloaded', 'success');
};
Zero backend. ~15 min for all three (meals, workouts, progress).

🟡 Medium — noticeable improvements
7. Email notifications
When a coach approves a booking or replies to a message, send an email. You already have config.frontendUrl and a "TODO: send email" comment in forgot-password.

Options:

Resend (easiest, free 100/day) — npm install resend

Nodemailer with Gmail SMTP (free, needs 2FA app password)

SendGrid (free 100/day, more setup)

Recommended events:

Account created → welcome email

Password reset → reset link (you already generate it, just stop logging and send it)

Booking approved/declined → "Your coach confirmed Friday 3 PM"

Coach replies to message → "You have a new message"

~2–3 hours for full coverage.

8. Booking calendar view
Your bookings tab is a list. A month calendar showing upcoming sessions is much nicer.

Library: FullCalendar (free, feature-rich) or tui.calendar.

Or hand-roll a simple month grid:

html
<div id="bookingCalendar" class="grid grid-cols-7 gap-1"></div>
Each cell = day, bookings shown as colored pills. Click a pill → opens the edit modal you already built.

~2 hours. Very high visual impact.

9. Progress photo timeline
Weigh-ins are one thing; progress photos tell the real story.

Settings → add "Upload progress photo"

Store in Firestore with { user_id, photo_url, taken_at, weight_kg, note }

Progress tab → new card showing thumbnails in a timeline

Click → full-size modal with date + weight

Needs the same multer upload as the avatar. ~2 hours.

10. Coach-assigned check-in responses
Right now POST /client/checkins writes to Firestore but nobody reads it. Give the coach a UI to:

See the client's last 7 check-ins

Reply with feedback

Set a "streak" marker (they responded 3 days in a row → green checkmark)

Backend: GET /api/admin/checkins/:userId and POST /api/admin/checkins/:id/reply.

Frontend: new card in Profile Overview showing "Last check-in: Tired — coach replied: 'Rest day today, come back stronger'".

~2 hours if you build a minimal coach side.

11. Nutrition macro tracking
You already accept protein_g in POST /meals. Extend to:

Add carbs_g and fat_g fields to the modal

Show a macro donut chart next to the calorie total

Daily target: { calories: 2200, protein_g: 150, ... } stored on client_profiles

Progress bar per macro

Backend: extend the meal validator to accept carbs_g and fat_g. One-line change per field.

Frontend: add inputs + a Chart.js donut. ~1.5 hours.

12. Payment integration (Stripe or Flutterwave)
You have a "Choose a plan" modal that just shows a toast. Time to make it real.

Since your config.js already has flutterwaveSecretKey and flutterwaveWebhookSecretHash, use Flutterwave:

js
// backend/src/routes/payments.js
router.post('/subscribe', requireAuth, async (req, res) => {
  const { plan_id } = req.body;
  const plan = PLANS[plan_id];
  if (!plan) return res.status(400).json({ error: 'Unknown plan' });
  const txRef = `sub_${req.auth.sub}_${Date.now()}`;
  const response = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.flutterwaveSecretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tx_ref: txRef,
      amount: plan.price,
      currency: 'USD',
      redirect_url: `${config.publicAppUrl}/payments.html`,
      customer: { email: user.email, name: user.name },
      customizations: { title: `ComboMaster ${plan.name}` }
    })
  });
  const { data } = await response.json();
  res.json({ checkout_url: data.link });
});
Frontend: window.open(data.checkout_url). Webhook verifies and updates client_profiles.subscription_status.

~4–6 hours including webhook, testing, and reconciliation.

🔴 Bigger features — plan a proper sprint
13. Coach dashboard (admin-dashboard.html)
Half your data has no UI on the coach side. This is the highest-leverage build:

Client list with status (active / at-risk / inactive)

Click a client → see their meals, workouts, progress, messages

Approve/decline bookings (your backend already supports PATCH /api/admin/bookings/:id from the earlier patch)

Assign meal/workout plans (PATCH /api/admin/users/:id/plans)

Reply to messages and checkins

See aggregate stats ("this week: 23 sessions, 4 pending bookings")

~2–3 days for a solid v1.

14. Notifications center (in-app bell)
Not a toast — a persistent bell icon in the header that shows:

Unread coach messages

Booking status changes

New achievements unlocked

Coach check-in replies

Backend: new collection notifications with { user_id, type, message, read, created_at }. Every action that matters inserts one.

Frontend: bell icon in header → dropdown panel + toast when new one arrives (via the 30s poll you already have).

~1 day.

15. Session reminders + scheduled jobs
Cron every hour:

Booking in next 24h → email + in-app notification

No workout in 3 days → "We miss you" email

Check-in missed 2 days in a row → gentle nudge

Needs node-cron on the backend and a small scheduler module. ~4 hours to set up, but you need email first.

16. Streaks + gamification
You have streak for workouts. Extend:

Daily check-in streak

Meal log streak

Weekly goal completion (5 workouts/week)

Leaderboard (opt-in) across clients

Unlockable badges with real animations when earned

Backend: add streak columns to the dashboard response. Frontend: unlock animation when a streak increments.

~1 day.

## My recommendation — build in this order
Week 1:

Coach-side messages (30 min — unblocks the dead chat)

Meal/workout edit (30 min — completes CRUD everywhere)

Search + filter on lists (1 hour — immediately useful)

Export CSV (15 min — one-liner)

Week 2:

Password change (1 hour)

Avatar upload (1 hour)

Progress photos (2 hours)

Booking calendar view (2 hours)

Week 3:

Email notifications via Resend (3 hours — highest perceived value)

In-app notifications bell (1 day)

Week 4+:

Coach dashboard (2–3 days)

Stripe/Flutterwave payment integration (1 week, mostly testing)

