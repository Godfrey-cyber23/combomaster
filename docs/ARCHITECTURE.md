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

## API and authentication

- The browser and API share the Node server origin; browser API requests use `/api` and an HttpOnly, SameSite=Strict JWT cookie.
- Register with `POST /api/auth/register`, sign in with `POST /api/auth/login`, inspect the current account with `GET /api/auth/me`, and end its session with `POST /api/auth/logout`.
- Client-specific data is scoped to the authenticated account under `/api/client`. Administrator endpoints are under `/api/admin` and check the account role against MySQL on every request.
- Admins and coaches share role-protected site-content CRUD at `/api/admin/content` and image uploads at `/api/admin/uploads`. Public pages request published content at `/api/content/:page`; uploaded images are served from private runtime storage through `/api/media/:filename`.
- Site content uses typed records rather than executable HTML: staff can update existing page headings, paragraphs, and image elements, add/remove content blocks, and manage the shop and meal-plan catalogs. Layout and navigation remain code-owned.
- The first content-editor visit initializes the database catalogs from the current frontend shop and meal-plan defaults. Image uploads accept JPEG, PNG, WebP, or GIF up to 5 MB; configure persistent private storage/backups for production.
- Client profiles, meal/workout logs, progress, booking requests, and coach messages are stored in MySQL. Payment and order pages do not represent live financial processing; no payment provider is configured.
- Apply migrations with `npm --prefix backend run migrate`. Set a unique random `JWT_SECRET` of at least 32 characters for production and serve the app over HTTPS.
