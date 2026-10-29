# Database compatibility and release plan

## Objective

Connect the independent `greenfield/` application to the existing ATSH AI PostgreSQL database only after a read-only schema inspection and a staging acceptance pass. Preserve existing customer, project, quote, user, and audit records.

## Confirmed from the current platform code

The existing `main` branch's public and portal routes reference these domain tables and fields. This is code evidence, not a claim that every deployment has the same applied schema:

- `service_categories` and `service_plans`: active service catalog, Arabic/English names and descriptions, sort order, features, currency, and setup/monthly/annual amounts stored in minor currency units.
- `site_settings` and `site_pages`: organization-scoped editable website settings and visible pages.
- `leads`, `customers`, `projects`, `quotes`, `support_tickets`, `tasks`, `notifications`, and `audit_logs`: operational entities already referenced by the current platform.
- `customer_portal_accounts` and `customer_portal_sessions`: customer portal authentication data.

These references must be checked against the target database's live schema. This document does not authorize new writes or migrations.

## Required read-only discovery

1. Deploy only to a confirmed staging App Service and use a sanitized staging database copy.
2. Configure `DATABASE_URL` to the staging database, never production, and set a strong `DB_DIAGNOSTICS_TOKEN` in protected environment secrets.
3. Call `GET /api/diagnostics/database-schema` with the bearer token over HTTPS. Save the schema output as a release artifact with secrets and personal data excluded. The endpoint should expose column metadata only, not table rows.
4. Compare actual schemas against the current platform's migration files and the intended feature mapping. Record missing tables/columns, types, nullability, constraints, and organization-scoping rules.
5. Do not infer that a table is safe to write simply because it exists. Review constraints, indexes, foreign keys, triggers, RLS/policies if present, and current application semantics.

## Mapping gate before enabling inquiry intake

- Confirm the target entity and required fields for a new project inquiry (likely a lead or a dedicated inquiry entity; this remains undecided until the schema and lifecycle are reviewed).
- Confirm server-side validation, organization assignment, generated identifiers/references, status values, audit logging, spam controls, retention policy, and notification behavior.
- Use parameterized SQL and a single transaction for related writes.
- Never accept organization IDs, prices, role assignments, or privileged status from the public client.
- Return a success response only after the transaction commits. On failure, return a safe error and do not claim the inquiry was saved.
- Add tests for validation failures, duplicate submissions, transaction rollback, cross-organization isolation, rate limiting, and database unavailability.
- Keep intake disabled until the mapping is reviewed and tests pass.

## Admin and customer portal gates

- Implement server-side authentication and role/permission checks before exposing admin APIs.
- Scope every tenant-owned query by the authenticated organization ID.
- Keep role and permission assignment server-controlled; never trust client-provided role names.
- Admin CRUD must validate allowed fields and audit material changes.
- Customer portal responses must be scoped to the authenticated customer account and must not disclose other customers' records.
- Do not create demo customers or seed production-like customer records.

## Prohibited until explicit release approval

- No `DROP`, `TRUNCATE`, destructive reset, automatic bootstrap, or unreviewed schema migration.
- No writes against production during schema discovery or development.
- No replacement of `main`, production deployment, DNS cutover, or removal of the previous deployable version before staging acceptance and a tested rollback plan.
- Do not put database URLs, tokens, personal information, or schema diagnostic credentials in source control, logs, or public artifacts.

## Release checklist

- [ ] Staging App Service and resource group confirmed by the operator.
- [ ] Sanitized staging database restored and connection verified.
- [ ] Live schema inventory captured and reviewed.
- [ ] Service catalog mapping validated against real columns and currency representation.
- [ ] Inquiry lifecycle and persistence mapping approved.
- [ ] Admin permissions and tenant isolation tested.
- [ ] Customer portal authorization and cross-customer isolation tested.
- [ ] Browser/mobile-width acceptance and accessibility review completed.
- [ ] Backup and restore rehearsal completed.
- [ ] Rollback procedure documented and rehearsed.
- [ ] Explicit owner approval recorded before production change.
