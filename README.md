# ATSH AI — Platform Rebuild (v2)

This branch contains an isolated rebuild of the ATSH AI system based on the unified reference specification. The v2 application is in `platform/`; database migrations are in `db/`; operational requirements and requirement traceability are in `docs/`.

## Safety boundary
- Branch: `rebuild/atsh-ai-from-scratch`
- Production `main` remains unchanged.
- The legacy root-level application files are retained only as historical reference during the rebuild and are not the v2 runtime.
- This branch is not production-deployed. Do not point the production domain at it until the acceptance gates in `docs/TRACEABILITY.md` are met.

## Platform commands
Run from `platform/` with Node.js 22+:

```sh
npm install
npm run db:migrate
npm run db:bootstrap
npm run build
npm test
npm start
```

Set the required environment variables from `docs/OPERATIONS.md`. The app exposes:
- `/health` — process liveness.
- `/ready` — database and organization readiness.
- `/admin` — protected operations console.
- `/project-builder.html` and `/project-builder-en.html` — Arabic/English project intake.
- `/pricing.html` and `/pricing-en.html` — server-calculated estimates from the active catalog.
- `/support.html` and `/support-en.html` — support intake.
- `/services.html`, `/hosting.html`, `/ai-solutions.html`, `/process.html`, `/faq.html`, and English equivalents.

## Important limits
- Commercial pricing must be approved by the owner before publication.
- Formal quotes are issued by email and require an explicit customer response.
- Final project release requires a one-time, expiring client approval.
- Customer AI agents require an approved knowledge base, an active agent, and configured origin allowlisting.
- The platform database backup workflow is disabled until the required repository secrets are configured.
- Hosting inventory records do not provision customer hosting. Customer-site backup automation, independent per-customer secret management, payment processing and a full customer portal remain gated items.

See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) and [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) before operating this branch.
