# ATSH AI — Rebuild Acceptance Contract

This branch is the clean implementation track for the unified ATSH AI reference specification. The existing `main` branch and its production history are intentionally untouched. Do not merge or deploy this branch until the acceptance gates below pass.

## Product contract
- Bilingual public site (Arabic RTL / English LTR), responsive and accessible.
- Service catalog is the single source of truth for services, options, pricing, recurring charges, exclusions and quote snapshots.
- Guided, reversible multi-step project configurator that describes outcomes in business language, then produces a reviewable project brief and reference number.
- Central operations console for leads, customers, projects, stages/tasks, quotes, service catalog, subscriptions, domains/hosting assets, backups, AI agents/knowledge sources/conversations, support tickets, team/roles, audit trail and settings.
- AI assistant grounded only in approved knowledge and service data; no invented prices or commitments; safe escalation to a human.
- Separate customer AI integrations must be tenant-scoped, usage-limited, auditable and secret-safe.
- Operational lifecycle: intake → qualification → scope → quote → explicit approval/payment record → project delivery → preview/staging → revision cycles → explicit client approval → deploy/release → handover → recurring service operations.
- No production deployment or irreversible action may be triggered by an AI agent without an explicit authorized human approval.
- PostgreSQL is the system of record. JSON files are not an acceptable production database.

## Architecture guardrails
- Keep the legacy app and main branch recoverable; build on `rebuild/atsh-ai-from-scratch`.
- PostgreSQL schema uses UUID keys, foreign keys, timestamps, status constraints, indexes and tenant ownership where applicable.
- Secrets are stored only as secret references/environment variables; never return secret values to browsers or logs.
- Validate input at the server boundary, enforce authorization on every protected action, rate-limit authentication/public submission, and audit privileged mutations.
- Store a quote snapshot at issue time so later catalog changes do not alter an existing quote.
- Every backup feature must record outcome and retention; claim restore capability only after a documented restore test.
- External services (email, AI, hosting, DNS, payments) must show a clear configured/unconfigured state; never simulate success.
- Prices and commercial policies are unapproved until the owner explicitly approves them.

## Definition of done
1. Requirements traceability matrix maps each reference requirement to files, API, UI and tests.
2. Database migrations apply cleanly to an empty PostgreSQL database and can be tested in CI.
3. Automated tests cover permissions, tenant isolation, quote math/snapshots, project workflow approvals, input validation and health checks.
4. `npm run build`, `npm test`, migration validation and end-to-end smoke tests pass.
5. A staging deployment is verified against the commit SHA; core flows are tested in a real browser.
6. No claim of production readiness until required environment settings and external integrations are verified.
7. Production release remains blocked until owner approval and rollback plan are documented.

## Phased delivery
A. Repository baseline, traceability, schema and CI.
B. Public pages, service catalog and project configurator.
C. Auth, roles, central console, leads/customers/projects/tasks/quotes.
D. Integrations, AI assistant, customer AI agents and support.
E. Hosting/domain/backups/monitoring and release automation.
F. Security, accessibility, migration, staging acceptance and production release.
