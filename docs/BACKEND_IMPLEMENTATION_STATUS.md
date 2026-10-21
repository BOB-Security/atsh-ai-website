# Backend implementation status

## Implemented in this branch

- Node.js + Express API scaffold.
- SQLite persistence for contact and referral submissions.
- Server-side input validation, JSON body limit, Helmet security headers, and a basic per-IP rate limit.
- Honeypot field support (website) for bot submissions.
- Health endpoint: GET /api/health.
- Submission endpoints: POST /api/contact and POST /api/referrals.
- Referral submissions are requests for administrative review, not approval, assignment, or a commission agreement.

## Important limitations

This is an initial development scaffold, not production-ready deployment. The current rate limiter is in-memory and is not suitable for multi-instance production. There is no authenticated admin inbox yet, no email notification, no human support integration, no AI provider integration, no file upload/storage, and no employee portal. SQLite requires a persistent writable volume on the hosting platform. Backups, retention/deletion policy, privacy notice, TLS/hosting configuration, and security review must be completed before collecting real customer data.

## Local development

1. Install Node.js 22 or newer.
2. Run npm install.
3. Copy .env.example to .env if you need custom settings.
4. Run npm run check, then npm start.
5. Open http://localhost:3000/api/health.

Do not add secrets or real customer data to the repository. Do not deploy until persistent storage and operational privacy/security controls are configured.
