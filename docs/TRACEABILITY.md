# Requirements traceability — first rebuild pass

This matrix maps the reference specification to the isolated implementation track. "Partial" means a first implementation exists but has not passed staging acceptance. No row is production-complete merely because code exists.

| Reference area | Implementation | Current status | Acceptance still required |
|---|---|---|---|
| Bilingual public website | `platform/public/index.html`, `app.js`, `styles.css` | Partial | Full page inventory, translations, mobile/browser testing, content approval |
| Service catalog source of truth | `service_categories`, `service_plans`, `service_addons`; public/admin routes | Partial — management UI implemented | Verify all create/edit/activate/deactivate flows in browser; audited commercial approval and owner-approved catalog remain required |
| Multi-step project configurator | `project-builder.html`, `builder.js`, `POST /api/public/project-inquiries` | Implemented baseline | Accessibility, field coverage, real browser E2E, spam tests, email/notification workflow |
| Reference number and stored request | `leads`, `customers`, transactional intake | Partial | Customer duplicate policy, notification delivery, admin E2E |
| Central database | `db/001..005_*.sql`, `platform/src/db.js` | Schema and runner implemented | Apply to real PostgreSQL, migration test, backup/restore test, connection policy |
| Admin authentication | `platform/src/auth.js`, opaque DB sessions, rate-limited login, TOTP MFA, encrypted MFA secrets, single-use recovery codes, and restricted enrollment-only sessions for privileged accounts | Partial — release blocker | Configure `MFA_ENCRYPTION_KEY` in deployment; apply migrations 018–020; run privileged-policy and enrollment E2E; complete MFA recovery/rotation lifecycle, concurrent challenge tests, migration/upgrade tests and backup/restore acceptance |
| Team roles/invitations | `platform/src/routes/team.js`, bootstrap role seeds | Partial | Invite email integration test, role matrix test, UI actions for all cases |
| Leads/customers/projects/tasks | `platform/src/routes/admin.js` | Partial | CRUD completion, filtering/pagination, field-level validation, workflow tests |
| Quotes and immutable snapshot | `quotes`, `quote_items`, public estimate page, email issue and one-time response token | Partial — admin status/expiry display and currency-aware minor-unit formatting implemented | Browser acceptance, customer-facing quote rendering/PDF, payment workflow, currency/rounding integration tests and email-provider E2E remain required |
| Explicit client release approval | `project_approvals`, one-time emailed token, `project-approval.html` | Implemented baseline | End-to-end email test, token replay/expiry tests, authorization review |\n| Scope changes | `project_change_requests`, customer portal submissions and explicit quote decision, operations estimate/review UI | Partial | E-mail provider tests, approved change implementation and price/schedule impact policy, browser acceptance |
| AI assistant grounded in approved knowledge | `knowledge_articles`, `platform/src/routes/assistant.js`, 30-case bilingual evaluation dataset | Partial | Run and score the cases against a configured provider, citations, retention policy, human handoff and owner sign-off |
| Customer AI agents | `ai_agents`, approved agent knowledge, token metering, origin allowlist, `agent-widget.js` | Partial runtime | Independent per-customer secret management, cost-based billing, non-OpenAI providers and channel adapters |
| Hosting/domain inventory | `hosting_assets`, ops APIs | Inventory only | Provider adapters and real provider health/expiry checks |
| Backup history | `backup_runs`, encrypted PostgreSQL backup to Azure Blob, manual isolated restore-test workflow | Partial | Enable secrets, configure blob lifecycle, add customer-hosting provider adapters and alerting |
| Support tickets | `support_tickets`, public and portal intake, assignment UI, threaded messages, customer/internal visibility, SLA trigger and ops APIs | Partial | End-to-end customer reply/email tests, SLA policy approval, alerting and browser acceptance |
| CMS/theme management | `site_pages`, `site_settings`, escaped structured-block renderer, scoped design drafts, preview, publish, version history and rollback APIs/UI | Partial | Full block editor, true page-level preview, visual contrast checks, broader theme token coverage and browser acceptance |
| Customer portal | `customer_portal_accounts`, isolated sessions, scoped requests/projects/quotes/tickets, customer-visible project updates, scope-change decisions, profile/password controls, invitations/revocation, Arabic/English UI | Baseline implemented | Email activation E2E, tenant-isolation attack tests, private file exchange, invoices/payments and full portal acceptance |\n| Security and audit | Helmet, same-origin write checks, rate limits, parameterized SQL, audit logs on critical mutations, tenant-scoped portal sessions | Partial — release blocker | MFA, private file scanning/storage, complete audit coverage, dependency scanning, penetration review and retention/deletion workflow |
| Azure deployment | isolated CI plus manual staging workflow guarded to `-staging` apps | Not deployed | Configure Azure OIDC/secrets and staging app, green CI, browser smoke test, rollback plan |

## Hard release gates
- Do not modify `main` or the existing Azure deployment workflow as part of this rebuild pass.
- Do not deploy this branch to production while authentication, database migrations, integrations and browser tests remain unverified.
- Do not publish example prices or placeholder legal copy as approved commercial policy.
- Do not claim backup success unless an actual provider operation succeeded; do not claim recoverability until a restore test is recorded.
- Do not deploy a client project until a valid final-release approval token has been consumed and the approval record is present.


## MFA implementation status
- TOTP enrollment and verification are implemented on the isolated MFA branch; secrets use AES-256-GCM with a dedicated 32-byte hexadecimal `MFA_ENCRYPTION_KEY` environment variable.
- Recovery codes are generated once and stored as hashes; successful TOTP steps are tracked to prevent replay.
- This implementation is not production-ready until CI, migration, staging secret configuration, browser tests and recovery-path acceptance pass.

- Privileged MFA enforcement hardening is in isolated branch `security/mfa-enforcement-hardening`: Owner and roles with defined sensitive permissions are directed to a 15-minute enrollment-only session; normal API access is blocked until successful MFA enrollment promotes that session.
- Static regression assertions were added for the policy and migration. They have not yet been executed in CI or against a live PostgreSQL/browser environment in this work session; do not treat them as acceptance evidence.
- Recovery/rotation lifecycle, race-condition verification, real PostgreSQL migration/upgrade tests, browser E2E, and backup/restore remain unresolved release gates.

## Current MFA hardening validation checkpoint
- PR #43 is a draft targeting `main` so the pull-request validation workflow can run against the combined diff. A passing run must be associated with the exact PR head commit; earlier green runs on PR #40 or `security/mfa-on-rebuild` are not substitutes.
- CI passed on exact PR head `fae8310d5fe3564e1daa94ed94468499adbefbec` in run `40745203293`: build, PostgreSQL migrations, bootstrap, and `npm test` all succeeded. This validates the CI workflow only; it does not replace browser E2E, race/concurrency tests, recovery acceptance, or staging/restore checks. No staging deployment, merge, or production release is authorized by this status note.


### MFA pending enrollment expiry hardening
- Added migration `020_mfa_pending_expiry.sql` for a nullable expiry timestamp on pending MFA enrollment records.
- MFA setup sets a 10-minute expiry; enabling requires an unexpired pending secret, and successful enable clears the expiry.
- Static regression coverage added. This does not replace database-backed concurrency or browser acceptance tests.
- Release gates remain open until the CI run for the exact PR head passes and recovery, rate-limit, replay/concurrency, browser E2E, staging migration and restore checks are evidenced.


- Follow-up after CI pass: regression migration inventory now includes `020_mfa_pending_expiry.sql`. CI must rerun on the resulting latest PR head; do not reuse the earlier green run as proof for this later commit.
