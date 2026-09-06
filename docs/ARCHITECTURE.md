# Architecture

## Application boundaries

- `frontend/public/` contains public HTML pages and browser assets.
- `backend/server.js` is the Node.js process entry point.
- `backend/src/app.js` configures Express, the health endpoint, static files, and the API boundary.
- `backend/src/` is divided into configuration, routes, controllers, and models as those features are implemented.
- `database/migrations/` is the versioned database schema source.
- `storage/` contains runtime-only logs and uploads and is never publicly served.
- `legacy/php-api/` is retained for migration reference and must not receive new features.

## Production boundary

The browser is an untrusted client. It may display state and submit requests, but it must not decide identity, roles, ownership, prices, or payment status. The Node API and database are authoritative for those decisions.
