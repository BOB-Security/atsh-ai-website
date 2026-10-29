# ATSH AI Greenfield — Operations

## Safety boundary
This is a fresh application tree. No application code, database migration, seed record, or customer data was copied from the legacy/demo implementation. Existing database and hosting resources are external infrastructure only.

## Runtime settings
- `DATABASE_URL`: connection string supplied by the existing deployment secret store; never commit or print it.
- `PGSSL=require`: require TLS for hosted PostgreSQL. Disable TLS only for isolated local test containers.
- `PUBLIC_BASE_URL`: canonical HTTPS URL for this deployment.
- `DB_DIAGNOSTICS_TOKEN`: optional high-entropy bearer token for read-only schema inventory.
- `PORT`: defaults to 8080.
- `TRUST_PROXY=true`: only behind a known trusted proxy.

## Read-only database verification
`GET /ready` runs only `SELECT 1`. `GET /api/diagnostics/database-schema` requires the diagnostics bearer token and reads `information_schema.columns` inside a read-only transaction. It returns table/column metadata only; it does not read customer rows or change schema/data.

No migrations, bootstrap, table creation, seed data, or write query are part of this foundation. Do not enable intake, prices, customer portals, or admin operations until the existing schema is inventoried and a compatibility adapter is reviewed and tested.

## Staging deployment
The staging workflow deploys only to an already-existing Azure App Service whose name ends in `-staging`. It never creates or replaces a cloud resource and never runs database migrations. It checks `/health` and `/ready` after deployment. Production is not a target.

Required GitHub Actions secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. `DATABASE_URL` must already be configured as an App Service secret setting. Never paste secret values into chat or commit them.
