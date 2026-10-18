# Architecture

## Application boundaries

- `frontend/public/` contains public HTML pages and browser assets.
- `backend/server.js` is the Node.js process entry point.
- `backend/src/app.js` configures Express, the health endpoint, static files, and the API boundary.
- `backend/src/` contains Firebase Admin initialization and the API routes.
- Cloud Firestore is the active database. `firestore.indexes.json` is the deployed query-index source; `database/migrations/` contains historical MySQL schema only.
- `storage/` contains runtime-only logs and uploads and is never publicly served.
- `legacy/php-api/` is retained for migration reference and must not receive new features.

## Production boundary

The browser is an untrusted client. It may display state and submit requests, but it must not decide identity, roles, ownership, prices, or payment status. The Node API and Firestore are authoritative for those decisions.

## API and authentication

- The browser and API share the Node server origin; browser API requests use `/api` and an HttpOnly, SameSite=Strict JWT cookie.
- Register with `POST /api/auth/register`, sign in with `POST /api/auth/login`, inspect the current account with `GET /api/auth/me`, and end its session with `POST /api/auth/logout`.
- Client-specific data is scoped to the authenticated account under `/api/client`. Administrator endpoints are under `/api/admin` and check the account role in Firestore on every request.
- The admin dashboard reads clients, bookings, messages, verified shop orders and sales from `/api/admin`; program records and business settings are persisted in Firestore. Payment state is changed only after Flutterwave verification.
- Admins and coaches share role-protected site-content CRUD at `/api/admin/content` and image uploads at `/api/admin/uploads`. Public pages request published content at `/api/content/:page`; uploaded images are served from private runtime storage through `/api/media/:filename`.
- Site content uses typed records rather than executable HTML: staff can update existing page headings, paragraphs, and image elements, add/remove content blocks, and manage the shop and meal-plan catalogs. Layout and navigation remain code-owned.
- The first content-editor visit initializes Firestore catalogs from the current frontend shop and meal-plan defaults. Image uploads accept JPEG, PNG, WebP, or GIF up to 5 MB; configure persistent private storage/backups for production.
- Collections include `users`, `client_profiles`, `progress_entries`, `meal_logs`, `workout_logs`, `bookings`, `messages`, `site_content`, `shop_orders`, `coaching_programs`, and `business_settings`. Shop sales include only orders verified with Flutterwave; coaching subscriptions and booking revenue are not implemented.
- Configure `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT_PATH` in the private `.env`, deploy indexes from `firestore.indexes.json`, and verify with `npm --prefix backend run check:db`. Set a unique random `JWT_SECRET` of at least 32 characters for production and serve the app over HTTPS.
