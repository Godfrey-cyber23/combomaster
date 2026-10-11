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

Copy `.env.example` to `.env` and replace every placeholder. Never commit `.env`, database credentials, Firebase service-account files, or runtime uploads.

## Commands

```bash
npm install --prefix backend
npm test
npm start
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) before adding
production features.