# ATSH AI Platform v2 — operator runbook

## Safety boundary
This rebuild is isolated on `rebuild/atsh-ai-from-scratch`. The existing `main` branch and its Azure deployment workflow have not been replaced. The v2 app lives under `platform/` until acceptance is complete. Do not point production traffic at it yet.

## Required services
1. PostgreSQL 15 or newer, with TLS for hosted environments.
2. Node.js 22 or newer.
3. A verified outbound email sender and Resend API key for invitations, quote delivery and approval requests.
4. An OpenAI-compatible model endpoint and API key to activate the public assistant. Without these, the assistant deliberately returns an unconfigured response.
5. A hosting secret store and Azure deployment identity for staging. Do not place secrets in repository files or client JavaScript.

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
- Hosting inventory and backup-run APIs track records; provider-specific backup execution and restore automation are not yet implemented.
- Customer AI agent records and knowledge-source metadata exist; independent tenant key management, usage billing and all third-party channels require provider adapters and acceptance tests.
- Payment collection and a full customer portal are intentionally not enabled.
- English coverage exists on the main landing page; all standalone content and admin workflows still require bilingual review.
