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