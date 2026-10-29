# Reference v2.0 — implementation traceability

Status is deliberately conservative: a screen or function is not complete until the backend behavior and acceptance tests are verified.

| Reference requirement | Current clean-build status | Next required work |
|---|---|---|
| New implementation independent from old runtime | Implemented on branch rebuild/atsh-ai-clean-v2 | Keep main and production workflow untouched until release gate |
| Arabic-first public website, RTL and responsive layout | Initial static foundation | Complete page inventory, bilingual parity, browser/keyboard/mobile review |
| Service catalog and guided configurator | Not implemented; placeholder service cards only | Inspect live schema, approve catalog fields, build schema-driven steps and conditional logic |
| Server-calculated pricing and billing periods | Pure calculation helper and unit tests only | Connect only to verified catalog API; add discounts/tax/version snapshots and integration tests |
| Transactional request intake and tracking reference | Explicitly disabled | Map actual database schema; implement validation, anti-spam, transaction, idempotency and audit |
| Admin authentication and role-based permissions | Not implemented; /admin is an explanatory placeholder | Implement secure sessions, password recovery, MFA for privileged roles, server-side permission checks |
| CMS, theme, media, preview/publish/rollback | Not implemented | Implement versioned content and design tokens with publish authorization |
| Customers, projects, tasks, quotes, approvals | Not implemented | Implement state machine, immutable quote versions, explicit customer approval events and tests |
| Customer portal and support | Not implemented | Tenant isolation, scoped sessions, ticket lifecycle and visibility controls |
| Approved-knowledge AI assistant and customer agents | Not implemented | Knowledge lifecycle, source-grounded responses, escalation, quotas, secret isolation and evaluation |
| Hosting/domain/backups/monitoring | Not implemented | Provider adapters; prove backup and restore before reporting success |
| API, security and privacy | Initial security headers and public rate limit | Threat model, CSRF/session controls, validation, audit coverage, data retention, dependency/security scans |
| Existing database preservation | No schema writes or migrations in this branch | Run read-only schema inspection, map compatibility, test additive migrations against a disposable copy |
| CI and staging | CI workflow committed; staging workflow guarded to -staging | Confirm CI success; configure staging-only secrets/app; browser acceptance and rollback |
| Production release | Blocked | All release gates, verified backup/restore, real integration checks, explicit release approval |

## Release blockers
- The current live PostgreSQL schema has not been inspected by this branch.
- No write API or form reports success before persistent storage is implemented.
- The admin page intentionally does not accept credentials.
- No staging deployment has been verified.
- No pricing, tax, legal copy, payment, AI, email, hosting, or backup integration is declared production-ready.
