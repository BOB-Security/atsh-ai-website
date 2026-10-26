# Requirements traceability — first rebuild pass

This matrix maps the reference specification to the isolated implementation track. "Partial" means a first implementation exists but has not passed staging acceptance. No row is production-complete merely because code exists.

| Reference area | Implementation | Current status | Acceptance still required |
|---|---|---|---|
| Bilingual public website | `platform/public/index.html`, `app.js`, `styles.css` | Partial | Full page inventory, translations, mobile/browser testing, content approval |
| Service catalog source of truth | `service_categories`, `service_plans`, `service_addons`; public/admin routes | Partial | UI edit/deactivate flows, audited commercial approval, owner-approved catalog |
| Multi-step project configurator | `project-builder.html`, `builder.js`, `POST /api/public/project-inquiries` | Implemented baseline | Accessibility, field coverage, real browser E2E, spam tests, email/notification workflow |
| Reference number and stored request | `leads`, `customers`, transactional intake | Partial | Customer duplicate policy, notification delivery, admin E2E |
| Central database | `db/001..005_*.sql`, `platform/src/db.js` | Schema and runner implemented | Apply to real PostgreSQL, migration test, backup/restore test, connection policy |
| Admin authentication | `platform/src/auth.js`, `team_invitations` | Partial | Rate-limit tests, session revocation/expiry tests, secure deployment settings |
| Team roles/invitations | `platform/src/routes/team.js`, bootstrap role seeds | Partial | Invite email integration test, role matrix test, UI actions for all cases |
| Leads/customers/projects/tasks | `platform/src/routes/admin.js` | Partial | CRUD completion, filtering/pagination, field-level validation, workflow tests |
| Quotes and immutable snapshot | `quotes`, `quote_items`, public estimate page, email issue and one-time response token | Partial | Quote rendering/PDF, payment workflow, expiry and rounding/currency review |
| Explicit client release approval | `project_approvals`, one-time emailed token, `project-approval.html` | Implemented baseline | End-to-end email test, token replay/expiry tests, authorization review |
| AI assistant grounded in approved knowledge | `knowledge_articles`, `platform/src/routes/assistant.js` | Partial | Provider configuration, prompt-injection tests, citations, retention policy, human handoff workflow |
| Customer AI agents | `ai_agents`, approved agent knowledge, token metering, origin allowlist, `agent-widget.js` | Partial runtime | Independent per-customer secret management, cost-based billing, non-OpenAI providers and channel adapters |
| Hosting/domain inventory | `hosting_assets`, ops APIs | Inventory only | Provider adapters and real provider health/expiry checks |
| Backup history | `backup_runs`, ops APIs | Tracking only | Actual backup jobs, independent artifact storage, alerts and verified restore drills |
| Support tickets | `support_tickets`, public intake, ops APIs, notification fan-out | Partial | Assignment UI, threaded messages, SLA timers and outbound notifications |
| CMS/theme management | `site_pages`, `site_settings`, ops APIs, escaped structured-block renderer | Partial | Full block editor, preview/publish workflow and all-page theme application |
| Security and audit | Helmet, rate limits, parameterized SQL, audit logs in some mutations | Partial | CSRF/origin checks, complete audit coverage, dependency scanning, penetration review |
| Azure deployment | isolated CI workflow only | Not deployed | Green CI, environment/secret setup, staging deployment, browser smoke test, rollback plan |

## Hard release gates
- Do not modify `main` or the existing Azure deployment workflow as part of this rebuild pass.
- Do not deploy this branch to production while authentication, database migrations, integrations and browser tests remain unverified.
- Do not publish example prices or placeholder legal copy as approved commercial policy.
- Do not claim backup success unless an actual provider operation succeeded; do not claim recoverability until a restore test is recorded.
- Do not deploy a client project until a valid final-release approval token has been consumed and the approval record is present.
