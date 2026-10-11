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

Create the MySQL database and a least-privilege application account, then apply
the versioned schema before starting the server:

```bash
mysql -u root -p
```

```sql
CREATE DATABASE combomaster_fitness CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'combomaster_app'@'127.0.0.1' IDENTIFIED BY 'replace-with-an-app-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON combomaster_fitness.* TO 'combomaster_app'@'127.0.0.1';
CREATE USER 'combomaster_migrator'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-migration-password';
GRANT ALL PRIVILEGES ON combomaster_fitness.* TO 'combomaster_migrator'@'127.0.0.1';
```

Configure both sets of credentials in `.env`, then run:

```bash
npm install --prefix backend
npm --prefix backend run migrate
npm start
```

The initial schema grants every public registration the `client` role. To
bootstrap an administrator, register that account through the signup page and
promote it directly in MySQL using its exact email:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

Never expose an endpoint that lets a browser assign itself the `admin` role.
The browser and API are served from the same origin at `http://localhost:3000`.
The production dashboard currently uses no payment provider; revenue and order
processing must not be treated as live until a provider and verified webhook
are configured.

## Commands

```bash
npm install --prefix backend
npm test
npm start
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) before adding
production features.