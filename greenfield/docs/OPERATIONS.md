# ATSH AI Greenfield — Operations

## Safety boundary
This is a fresh application tree and does not import the legacy application. Do not deploy it to production until staging acceptance, database compatibility review, and rollback preparation are complete.

## Runtime settings
- `DATABASE_URL`: connection string supplied by the deployment secret store; never commit or print it.
- `PGSSL=require`: require TLS for hosted PostgreSQL. Disable TLS only for isolated local test containers.
- `PUBLIC_BASE_URL`: canonical HTTPS URL for this deployment.
- `DB_DIAGNOSTICS_TOKEN`: high-entropy bearer token for read-only schema inventory.
- `PUBLIC_ORGANIZATION_ID`: UUID for the approved ATSH AI organization in the staging database. Leave blank until verified.
- `INQUIRY_INTAKE_ENABLED=false`: keep false until schema mapping, staging persistence, and privacy review have passed. The server additionally requires a valid `PUBLIC_ORGANIZATION_ID`.
- `PORT`: defaults to 8080.
- `TRUST_PROXY=true`: only behind a known trusted proxy.

## Read-only database verification
`GET /ready` runs only `SELECT 1`. `GET /api/diagnostics/database-schema` requires the diagnostics bearer token and reads `information_schema.columns` inside a read-only transaction. It returns table/column metadata only; it does not read customer rows or change schema/data.

## Inquiry persistence
The public inquiry endpoint is implemented but deliberately gated. Unless `INQUIRY_INTAKE_ENABLED=true` and `PUBLIC_ORGANIZATION_ID` is a valid UUID, it returns HTTP 503 and does not write anything. When enabled, it verifies required `customers` and `leads` columns against `information_schema`, then inserts/locates the contact and creates a lead in one transaction. It records the customer's consent timestamp, validates the request server-side, scopes writes to the configured organization, and returns a reference only after commit. If the schema check fails or the transaction fails, it does not claim the request was saved.

This runtime check is a guard, not a substitute for reviewing constraints, foreign keys, indexes, triggers, existing data, and the staging migration history. Enable intake only after a sanitized staging database has been reviewed and end-to-end tests pass.

No migrations, bootstrap, table creation, seed data, or destructive query are part of this application. Do not enable pricing, customer portals, or admin operations until each feature has its own reviewed adapter and authorization tests.

## Staging deployment
The staging workflow deploys only to an already-existing Azure App Service whose name ends in `-staging`. It never creates or replaces a cloud resource and never runs database migrations. It checks `/health` and `/ready` after deployment. Production is not a target.

Required GitHub Actions secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `STAGING_DATABASE_URL`, and `DB_DIAGNOSTICS_TOKEN`. Never paste secret values into chat or commit them. Configure `PUBLIC_ORGANIZATION_ID` and enable intake only after the approved staging review.
