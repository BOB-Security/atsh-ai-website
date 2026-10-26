# Requirements traceability — first rebuild pass

This matrix maps the reference specification to the isolated implementation track. "Partial" means a first implementation exists but has not passed staging acceptance. No row is production-complete merely because code exists.

| Reference area | Implementation | Current status | Acceptance still required |
|---|---|---|---|
| Bilingual public website | `platform/public/index.html`, `app.js`, `styles.css` | Partial | Full page inventory, translations, mobile/browser testing, content approval |
| Service catalog source of truth | `service_categories`, `service_plans`, `service_addons`; public/admin routes | Partial | UI edit/deactivate flows, audited commercial approval, owner-approved catalog |
| Multi-step project configurator | `project-builder.html`, `builder.js`, `POST /api/public/project-inquiries` | Implemented baseline | Accessibility, field coverage, real browser E2E, spam tests, email/notification workflow |
| Reference number and stored request | `leads`, `customers`, transactional intake | Partial | Customer duplicate policy, notification delivery, admin E2E |
| Central database | `db/001..005_*.sql`, `platform/src/db.js` | Schema and runner implemented | Apply to real PostgreSQL, migration test, backup/restore test, connection policy |
| Admin authentication | `platform/src/auth.js`, opaque DB sessions, rate-limited login, owner-controlled roles | Partial — release blocker | Implement MFA for privileged users, password recovery, session revocation UI, rate-limit tests and secure deployment settings |
| Team roles/invitations | `platform/src/routes/team.js`, bootstrap role seeds | Partial | Invite email integration test, role matrix test, UI actions for all cases |
| Leads/customers/projects/tasks | `platform/src/routes/admin.js` | Partial | CRUD completion, filtering/pagination, field-level validation, workflow tests |
| Quotes and immutable snapshot | `quotes`, `quote_items`, public estimate page, email issue and one-time response token | Partial | Quote rendering/PDF, payment workflow, expiry and rounding/currency review |
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
