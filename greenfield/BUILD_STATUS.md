# Greenfield build status

## Implemented in this branch
- Independent Express application under `greenfield/`; it does not import the legacy app.
- Arabic-first responsive landing page and service overview.
- Interactive eight-step project configurator: solution type, scope/languages, brand/content readiness, feature choices, hosting needs, contact details, goals/constraints, and review.
- Client-side validation, progress state, back navigation, and edit links from the review screen.
- No fabricated prices, testimonials, customer records, or success state for unsaved submissions.
- Health and readiness endpoints; protected, read-only PostgreSQL schema diagnostics.
- Automated smoke tests for health, database failure, schema access control, intake guard, and configurator presence.
- Manual staging deployment workflow packages only `greenfield/`, requires a staging database secret, and runs no migrations or bootstrap steps.

## Explicitly not complete
- The configurator does not submit or persist inquiries yet. It must remain disabled until the actual database schema and a safe staging copy are verified.
- No completed customer portal, authenticated admin dashboard, catalog/pricing management, quote/order lifecycle, project operations, or audit trail in this baseline.
- Privacy and terms pages are drafts and require business/legal review.
- Staging deployment has not been executed; the staging App Service, resource group, and required GitHub secrets must exist first.
- Production `main` and the existing production App Service have not been replaced or deployed.

## Safety boundary
No database migration, seed data, customer-data write, or production deployment is part of this branch's current behavior. Do not merge to production until the acceptance checklist and rollback plan are satisfied.
