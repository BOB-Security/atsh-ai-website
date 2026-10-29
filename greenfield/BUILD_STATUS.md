# Greenfield build status

## Implemented in this branch
- Independent Express application under `greenfield/`; it does not import the legacy app.
- Arabic-first responsive landing page and service overview.
- Interactive eight-step project configurator with validation, progress, back navigation, and review.
- Privacy consent requirement and a public inquiry submission UI that displays a reference only after a successful server response.
- Guarded inquiry persistence: server-side validation, organization-scoped customer/lead writes in one transaction, consent timestamp, schema-column gate, and no false success on database failure.
- Health and readiness endpoints; protected, read-only PostgreSQL schema diagnostics.
- Organization-scoped read-only public catalog API for active service categories and active plans, with schema compatibility checks and database-sourced prices only.
- Public services and pricing pages now render active database-backed catalog entries when available; until the organization catalog is configured or has entries, they show an explicitly provisional EGP starter catalog for websites, software, AI/automation, integrations, and separately priced hosting. Database catalog values override defaults. Prices are editable defaults, not approved final offers.
- Automated tests for health, database failure, schema access control, inquiry consent/persistence failure behavior, catalog tenant/schema gates, admin login/session/CSRF boundaries, and the internal admin workspace shell.
- Manual staging deployment workflow packages only `greenfield/`, requires a staging database secret, and runs no migrations or bootstrap steps.
- Database compatibility and release gates documented in [DATABASE_COMPATIBILITY_AND_RELEASE_PLAN.md](docs/DATABASE_COMPATIBILITY_AND_RELEASE_PLAN.md).

## Explicitly not complete
- Inquiry intake remains disabled by default. It must not be enabled until the live staging schema, organization UUID, privacy notice, and end-to-end transaction behavior are verified.
- Admin foundation now includes a login screen, rate-limited server-side credential verification, hashed database sessions, session inspection/logout with CSRF protection, and permission-gated, organization-scoped read-only overview/catalog/latest-leads views. Pricing/catalog CRUD remains incomplete, so the provisional defaults are not yet editable from the admin UI. Successful admin login and logout are recorded in `audit_logs` within the same database transaction as session creation/deletion; only a SHA-256 hash of the request IP is recorded. Admin authentication now fails closed if required audit-log columns are missing. This remains unverified against the live database and stored password-hash format; catalog/pricing CRUD, audit-backed business mutations, role management, quote/order lifecycle, project operations, and customer portal remain incomplete.
- Privacy and terms pages are drafts and require business/legal review.
- Staging deployment has not been executed; the staging App Service, resource group, and required GitHub secrets must exist first.
- Production `main` and the existing production App Service have not been replaced or deployed.

## Safety boundary
No database migration, seed data, or production deployment is part of this branch's current behavior. Do not merge to production until the acceptance checklist and rollback plan are satisfied.
