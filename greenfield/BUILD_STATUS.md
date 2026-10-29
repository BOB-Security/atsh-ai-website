# Greenfield build status

## Implemented in this branch
- Independent Express application under `greenfield/`; it does not import the legacy app.
- Arabic-first responsive landing page and service overview.
- Interactive eight-step project configurator with validation, progress, back navigation, and review.
- Privacy consent requirement and a public inquiry submission UI that displays a reference only after a successful server response.
- Guarded inquiry persistence: server-side validation, organization-scoped customer/lead writes in one transaction, consent timestamp, schema-column gate, and no false success on database failure.
- Health and readiness endpoints; protected, read-only PostgreSQL schema diagnostics.
- Automated smoke tests for health, database failure, schema access control, intake guard, consent validation, successful persistence response, and failure behavior.
- Manual staging deployment workflow packages only `greenfield/`, requires a staging database secret, and runs no migrations or bootstrap steps.
- Database compatibility and release gates documented in [DATABASE_COMPATIBILITY_AND_RELEASE_PLAN.md](docs/DATABASE_COMPATIBILITY_AND_RELEASE_PLAN.md).

## Explicitly not complete
- Inquiry intake remains disabled by default. It must not be enabled until the live staging schema, organization UUID, privacy notice, and end-to-end transaction behavior are verified.
- No completed authenticated admin dashboard, catalog/pricing management, quote/order lifecycle, project operations, or customer portal in this baseline.
- Privacy and terms pages are drafts and require business/legal review.
- Staging deployment has not been executed; the staging App Service, resource group, and required GitHub secrets must exist first.
- Production `main` and the existing production App Service have not been replaced or deployed.

## Safety boundary
No database migration, seed data, or production deployment is part of this branch's current behavior. Do not merge to production until the acceptance checklist and rollback plan are satisfied.
