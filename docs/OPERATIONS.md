# ATSH AI Platform v2 — operator runbook

## Safety boundary
This rebuild is isolated on `rebuild/atsh-ai-from-scratch`. The existing `main` branch and its Azure deployment workflow have not been replaced. The v2 app lives under `platform/` until acceptance is complete. Database migrations currently extend through `015_design_versioning.sql`. Do not point production traffic at it yet.

## Required services
1. PostgreSQL 15 or newer, with TLS for hosted environments.
2. Node.js 22 or newer.
3. A verified outbound email sender and Resend API key for invitations, quote delivery and approval requests.
4. Azure Blob Storage for encrypted platform database backups, plus a separately stored 32-byte backup encryption key.
5. A dedicated, disposable, empty PostgreSQL database for manually confirmed restore tests.
6. An OpenAI-compatible model endpoint and API key to activate the public assistant. Without these, the assistant deliberately returns an unconfigured response.
7. A hosting secret store and Azure deployment identity for staging. Do not place secrets in repository files or client JavaScript.

## Environment contract
- `DATABASE_URL`: PostgreSQL connection string.
- `PGSSL=require`: require TLS for hosted PostgreSQL; use `disable` only for local test containers.
- `DEFAULT_ORGANIZATION_SLUG`: default `atsh-ai`.
- `DEFAULT_ORGANIZATION_ID`: optional UUID override; normally the server resolves the slug after migration/bootstrap.
- `SESSION_SECRET`: reserved for future signed state; session cookies currently use opaque random tokens hashed in PostgreSQL.
- `PUBLIC_BASE_URL`: canonical HTTPS site URL used in emailed approval and invitation links.
- `OWNER_EMAIL`, `OWNER_NAME`, `OWNER_PASSWORD`: only for one-time bootstrap. Password must be at least 14 characters. Provide via a secure environment/secret manager.
- `RESEND_API_KEY`, `EMAIL_FROM`: verified sender configuration.
- `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`: server-only AI provider settings. Never prefix these with a public/client variable name.
- `PORT`: defaults to 8080.
- `TRUST_PROXY=true`: enable only behind a known trusted reverse proxy.

## Initial database setup
Run from `platform/`:
```sh
npm install
npm run db:migrate
npm run db:bootstrap
npm run build
npm test
npm start
```
Bootstrap creates the organization, owner and initial least-privilege roles. Keep the bootstrap password out of logs and shell history. Once the owner can sign in, rotate or remove the one-time bootstrap environment variables.

## Customer portal
An authorized team member with `customers.manage` can send a customer portal invitation from the customer record. The customer activates the invitation at `/portal.html` or `/portal-en.html` with a password of at least 14 characters. Portal sessions use a separate opaque cookie and session table. The portal API scopes projects, quotes, updates and tickets to the authenticated customer record; internal support notes are filtered by message visibility. Revoking portal access disables the account and deletes its active sessions. Validate invitation delivery, expiry, revocation, and cross-customer access in staging before production use.

## Design-system publishing
Theme edits are saved as drafts with an explicit scope (`public`, `portal`, `admin`, or `all`). The admin console provides a preview and version history. Only the separate publish action changes the selected scope; rollback creates a new version and records its reason. Public pages and portal/admin interfaces load only published theme versions for their scope. Test contrast, responsive layout, RTL/LTR and keyboard navigation before publishing.

## Database backup and restore test
The daily encrypted PostgreSQL backup workflow remains disabled until these repository secrets are set: `BACKUP_ENABLED=true`, `PLATFORM_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY` (64 hex characters), and `AZURE_BACKUP_STORAGE_CONNECTION_STRING`. The workflow uploads an AES-256-GCM encrypted custom-format `pg_dump` to Azure Blob Storage and records the result in `backup_runs`. Configure an Azure Blob lifecycle rule for the backup container/prefix and the agreed age-based retention period; the `retentionuntil` tag is audit metadata, not an automatic deletion rule. The database retention date alone does not delete blobs.

A restore test is deliberately manual because it copies production database data into the target. Configure `RESTORE_TEST_DATABASE_URL` to a dedicated, disposable, isolated and empty database, then run the `ATSH AI isolated backup restore test` workflow and explicitly confirm the target. The script refuses a non-empty target and records `restore_tested` only after `pg_restore` and table-count checks succeed. Never point it at production.

## Staging deployment
The manual workflow `ATSH AI v2 staging deploy` only runs from `rebuild/atsh-ai-from-scratch` and refuses app names that do not end in `-staging`. It deploys only to an already-created staging App Service and requires GitHub secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `STAGING_DATABASE_URL`, `STAGING_OWNER_EMAIL`, `STAGING_OWNER_NAME`, and `STAGING_OWNER_PASSWORD`. The staging App Service must already contain the settings `DATABASE_URL`, `PUBLIC_BASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `AI_API_KEY`, and `AI_MODEL`. Configure and verify these values in GitHub/Azure secret settings; never paste secret values into chat or commit them to source. The workflow migrates and bootstraps the staging database, runs tests, deploys, and checks `/ready`. It does not switch production traffic.

## Health checks
- `GET /health`: process liveness only.
- `GET /ready`: checks organization configuration and PostgreSQL connectivity.
A healthy liveness response does not prove that email, AI, storage, DNS, backup or deployment integrations are working.

## Operational truth rules
- An inventory record is not proof that a provider resource exists.
- A backup log entry is not a backup operation. Only record success after the provider confirms the artifact; record `restore_tested` only after a real isolated restore test.
- A quote estimate is not a formal offer. The formal issue action emails a one-time response link.
- Client approval links are one-time and expire. Final-release state changes are blocked unless a final approval is recorded.
- Legal pages are placeholders until the owner approves the actual policies.
- Seed prices, if any, are examples until explicitly approved by the owner.
- Do not deploy to production until CI, migrations, browser tests, provider checks, restore tests and rollback procedures have been verified.

## Current limitations
- The platform database has an encrypted Azure Blob backup workflow and a manually confirmed restore test. Backups of customer websites, files, databases, domains and third-party hosting resources still require provider-specific adapters and secrets.
- Customer AI agents now have a tenant-scoped OpenAI-compatible runtime, approved per-agent knowledge documents, an embeddable widget with an origin allowlist, conversation isolation and token metering. Independent per-customer secret resolution, cost-based billing, and non-OpenAI-compatible providers still require provider adapters and acceptance tests.
- Payment collection and a full customer portal are intentionally not enabled.
- English coverage exists on the main landing page; all standalone content and admin workflows still require bilingual review.
