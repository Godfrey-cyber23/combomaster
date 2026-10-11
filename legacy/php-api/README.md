# PHP API

The PHP API is the current server boundary for authentication and application data.

## Local setup

1. Copy the repository `.env.example` to `.env`.
2. Create the MySQL database using the migrations in `database/migrations/`.
3. Install PHP dependencies with Composer when the Firebase integration is enabled.
4. Serve the repository through PHP/Apache so the `api/` paths are available.

## Rules

- API responses are JSON and must use meaningful HTTP status codes.
- Secrets and database credentials come from environment variables.
- Authentication and authorization are enforced on the server, never by local storage.
- Production errors must be logged privately and must not expose SQL or stack traces.
