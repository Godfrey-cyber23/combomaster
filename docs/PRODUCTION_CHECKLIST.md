# Production checklist

- [ ] Keep the Node API as the single active backend; retire the legacy PHP implementation.
- [ ] Load all secrets from environment variables.
- [ ] Add secure session cookies, session rotation, logout, CSRF protection, and rate limiting.
- [ ] Add server-side authentication and role/ownership authorization.
- [ ] Replace dashboard mock data and browser-only storage with API-backed records.
- [ ] Add password reset email delivery and email verification.
- [ ] Add payment provider integration and verified webhooks.
- [ ] Deploy Firestore indexes; configure least-privilege service-account access, backups, and restore tests.
- [ ] Add automated tests and CI checks.
- [ ] Deploy behind HTTPS with security headers and private runtime storage.
- [ ] Add structured logs, health checks, error monitoring, and alerting.
- [ ] Publish privacy, terms, retention, and account deletion procedures.
