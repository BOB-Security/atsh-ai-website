# Customer portal implementation: discovery and release gates

## Operator-selected scope

- Existing PostgreSQL database; preserve its current records.
- Email/password sign-in for invited customer accounts.
- Customer project dashboard and stage timeline.
- Customer-visible comments and revision requests.
- Explicit project/deliverable approvals.
- Customer file uploads and secure file retrieval.
- In-portal notifications.
- Billing and payment processing deferred.

## What this first implementation slice adds

- A protected, read-only endpoint at `GET /api/diagnostics/customer-portal-readiness`.
- It uses the existing schema-inspection method and never reads table rows or writes application data.
- It compares the public schema against the portal tables/columns described by the repository's existing database migrations.
- It reports missing required columns and separately reports optional file/comment table compatibility.
- The endpoint returns 404 unless the existing `DB_DIAGNOSTICS_TOKEN` bearer token is configured and supplied.
- Automated tests cover compatibility checks, non-public schema filtering, endpoint authorization, and missing schema reporting.

This is a discovery gate, not a claim that the customer portal is complete. Customer login and mutation APIs remain disabled until the target schema has been inspected and the implementation can be tested against staging.

## Schema compatibility baseline

The prior repository migration history describes these existing tables as the expected baseline:

- `customer_portal_accounts` and `customer_portal_sessions` for customer identity and sessions.
- `customers`, `projects`, and `project_stages` for account ownership and project progress.
- `customer_project_updates` for customer-visible project updates.
- `project_approvals` for explicit approvals.
- `notifications` for in-app notices.
- Upload storage metadata is not yet verified. File bytes must not be stored on ephemeral App Service local disk; choose a durable private object-storage target after the Azure environment is confirmed.
- Comments may map to existing support-ticket threads or a dedicated project-comment table. Do not create a new table until the live schema and current admin workflow are reviewed.

The migration files describe intended schemas only. They do not prove those migrations have run against the configured database.

## Required verification before customer authentication is enabled

1. Confirm a staging Azure App Service and use a sanitized staging database copy, never production for discovery.
2. Configure the existing GitHub Actions staging deployment secrets only after confirming the target app and resource group. Do not place credentials in source control.
3. In the staging App Service settings, configure `DATABASE_URL` to the staging-only database and `DB_DIAGNOSTICS_TOKEN` to a strong random token.
4. Call `GET /api/diagnostics/customer-portal-readiness` over HTTPS with `Authorization: Bearer <token>`. Keep the response private; it exposes schema metadata.
5. Resolve the compatibility report against the actual schema, constraints, foreign keys, row-level security policies, and existing admin code. No schema changes are authorized by this step.
6. Implement and test login, logout, customer-scoped dashboard reads, comments, approvals, notifications, and durable private uploads against staging.
7. Add transactional admin-side operations to invite a customer, assign the customer to the correct organization, and associate projects. Customer self-signup is intentionally not assumed.
8. Complete cross-customer and cross-organization isolation tests, CSRF tests, rate-limit tests, and upload content/size/access tests before release.

## Secrets and settings: add only when the corresponding integration is selected

Already used by the current application/workflow:
- `DATABASE_URL`: existing application database URL. For staging work, it must be the sanitized staging database URL, not production.
- `DB_DIAGNOSTICS_TOKEN`: strong random bearer token used only for protected schema diagnostics.
- Azure OIDC deployment secrets: existing `AZUREAPPSERVICE_CLIENTID_...`, `AZUREAPPSERVICE_TENANTID_...`, and `AZUREAPPSERVICE_SUBSCRIPTIONID_...` names in the current workflow. Reuse only if they are authorized for the confirmed staging App Service; otherwise configure staging-specific identities/secrets.

Likely needed for the complete feature, but **not yet required for this read-only discovery slice**:
- Email delivery: provider API key and verified sender address, stored as GitHub/Azure secrets/settings. Exact names will be chosen after selecting the provider. Needed for invitations and password-reset links; never log raw tokens.
- Private durable file storage: Azure Blob Storage identity/connection configuration with least-privilege write/read permissions. Prefer managed identity where supported; no storage secret should be added until the target account/container and deployment identity are confirmed.
- Optional public base URL for absolute links in invitation/reset emails; this can be a non-secret App Setting.

Do not add payment secrets: billing/payment processing is explicitly deferred. Do not enable public inquiry intake as part of portal setup. Do not run migrations, seed data, or production writes.

## Current status

- [x] Add read-only portal schema compatibility validator.
- [x] Add protected diagnostics endpoint.
- [x] Add tests for validator and endpoint protection.
- [ ] Run GitHub Actions verification on this branch and review results.
- [ ] Inspect actual staging schema.
- [ ] Implement authenticated customer APIs and portal UI.
- [ ] Integrate customer/project administration with the existing admin workspace.
- [ ] Implement private durable file uploads, comments, approval workflow, and notification read state.
- [ ] Complete staging acceptance and obtain explicit production release approval.
