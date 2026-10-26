# ATSH AI Platform v2 — Clean Rebuild

This application is intentionally isolated under `platform/` while it is being built on `rebuild/atsh-ai-from-scratch`. The legacy application and `main` remain untouched until the new system passes acceptance.

## Runtime
- Node.js 22+
- PostgreSQL 15+
- Copy environment values from your deployment secret store; do not commit credentials.

Required before readiness: `DATABASE_URL`, `DEFAULT_ORGANIZATION_ID`. The owner bootstrap, authenticated operations console, catalog management, project workflow, AI, email and deployment integrations are not declared complete until their respective modules and tests are implemented.

## Local development
```sh
cd platform
npm install
npm run build
npm test
npm start
```

The root `db/schema.sql` is the canonical PostgreSQL schema. The first versioned migration lives in `db/001_initial_schema.sql`; migration runner applies numbered SQL files in order.

## Security principles
- Public intake is rate limited and validated.
- Database operations use parameterized SQL and transactions.
- No credentials are shipped to the browser.
- Health and readiness are distinct: `/health` reports process health; `/ready` verifies required configuration and database connectivity.
- This scaffold is not production-ready until auth/RBAC, organization isolation, catalog seeding, migrations, tests, backups, observability and staging deployment have been completed and verified.
