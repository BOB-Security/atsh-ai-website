# atsh-ai website

Arabic-first, responsive multi-page company website and initial inquiry API.

## Public pages

- `index.html` — homepage and company introduction.
- `services.html` — service areas and scope caveat.
- `products.html` — product status; no unverified products are presented as available.
- `work.html` — documented work and in-progress internal project.
- `about.html` — company approach and principles.
- `contact.html` — contact form connected to the inquiry API.
- `privacy.html` and `terms.html` — initial drafts requiring review before production launch.

Shared styles are in `styles.css` and `pages.css`; shared navigation behavior is in `site.js`.

## Current backend

- Contact form posts to `POST /api/contact`.
- Referral form on the homepage posts to `POST /api/referrals`.
- Submissions are validated server-side and persisted in SQLite.
- `GET /api/health` provides a basic health response.
- Referral receipt is not an approval, assignment, or commission agreement.
- Internal source, test, documentation, and data paths are blocked from static serving.

## Local development

Requires Node.js 22+ and a writable local directory.

1. Run `npm install`.
2. Optionally copy `.env.example` to `.env` and configure the database path.
3. Run `npm run check`.
4. Run `npm test`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

## Not yet production-ready

No authenticated admin inbox, human support agent, real AI provider integration, secure attachment upload, employee portal, email notifications, or deployment configuration is implemented. The in-memory rate limiter is a basic safeguard, not production-grade abuse protection. Configure persistent storage, backups, privacy/retention policies, monitoring, and security review before collecting real customer data.

The privacy and terms pages are initial drafts, not approved legal documents. Do not commit secrets or real customer data. Do not deploy or collect production submissions until the remaining safeguards are in place.
