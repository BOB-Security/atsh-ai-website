# atsh-ai website

Arabic-first responsive website prototype and an initial backend API for project/contact and referral submissions.

## Current implementation

- Responsive RTL landing page for atsh-ai.
- Contact form posts to POST /api/contact.
- Referral form posts to POST /api/referrals.
- Submissions are validated server-side and persisted in SQLite.
- GET /api/health provides a basic health response.
- Referral receipt is not an approval, assignment, or commission agreement.

## Local development

Requires Node.js 22+ and a writable local directory.

1. Run npm install.
2. Optionally copy .env.example to .env and configure the database path.
3. Run npm run check.
4. Run npm start.
5. Open http://localhost:3000.

## Not yet production-ready

No authenticated admin inbox, human support agent, AI provider integration, secure attachment upload, employee portal, email notification, or deployment configuration is implemented. The current in-memory rate limiter is a basic development safeguard, not production-grade abuse protection. Configure persistent storage, backups, privacy/retention policies, monitoring, and security review before collecting real customer data.

Do not commit secrets or real customer data. Do not deploy or collect production submissions until the remaining safeguards are in place.
