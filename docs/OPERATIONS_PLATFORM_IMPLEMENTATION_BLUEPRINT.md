# atsh-ai Operations Platform — Implementation Blueprint

**Status:** Approved for staged engineering; not production-ready  
**Repository:** `atshpana/atsh-ai-website`  
**Working branch:** `feature/initial-website-mvp`  
**Boundary:** atsh-ai is the company platform. BOB Security remains a separately deployed product. Do not reuse BOB's Azure Static Web App, database, secrets, storage, or deployment pipeline.

## 1. Objective

Evolve the current company website and inquiry API into a real operations platform. A screen is not complete because it renders or a button responds: each shipped workflow must be backed by server-side authorization, durable persistence, validation, audit events, and automated tests.

## 2. Delivery sequence

### Phase 0 — Guardrails and architecture
- Keep changes on the feature branch; do not merge to `main` or deploy production without explicit review.
- Maintain a module-by-module implementation status and identify mock data clearly.
- Decide the production runtime, relational database, object storage, secret management, backups, monitoring, and restore procedure before deployment.
- Do not collect real customer data until the security and operational gates are passed.

### Phase 1 — Identity and authorization
- Individual administrator/staff accounts; no permanent shared bearer token as the final browser login model.
- Server-managed secure sessions, password hashing or a vetted identity provider, session expiry and revocation, CSRF protection for cookie-authenticated mutations, rate limits, and secure cookie settings.
- Roles and permissions enforced on the server for every route and object; hiding a button is not authorization.
- Initial roles: Owner, Administrator, Content Editor, Support Agent, Marketing Manager, Project Manager, Read-only Analyst.
- Audit successful and denied sensitive actions without recording passwords, tokens, or unnecessary message contents.

### Phase 2 — CMS vertical slice (first complete product workflow)
- Content model: Page, Section, Revision, MediaAsset, PublishEvent.
- Draft creation and edit, server-side validation, revision history, preview of a specific revision, authorized publish/unpublish, and rollback to a prior revision.
- Publishing is a distinct authorized action; editing a draft must never silently change the public site.
- Prevent stored XSS: sanitize permitted rich text, escape output by context, validate URLs, and avoid arbitrary HTML injection.
- Media uploads require type/size limits, generated storage names, authorization, safe serving headers, and a documented malware-scanning strategy. Store files outside the web root/object storage; do not trust client-provided MIME types.
- Tests cover draft persistence, revision isolation, unauthorized publish attempts, XSS payloads, and publish/rollback behavior.

### Phase 3 — Contact inbox and CRM
- Persisted contact/referral records, filtering, assignment, status transitions, internal notes, and authorized exports.
- Validate all inputs on the server; protect personal data with least privilege, retention/deletion rules, and audit trails.
- Referral receipt is not approval, assignment, or a commission agreement.

### Phase 4 — Team and work management
- Staff/helper invitations, role assignment, activation/deactivation, projects, tasks, owners, due dates, status history, and activity timeline.
- Deactivation revokes active sessions. Owners cannot accidentally remove the final active owner.
- Enforce tenant/company scope and object-level permissions server-side.

### Phase 5 — Marketing operations
- Campaign drafts, channel, audience, budget, schedule, approval state, and measured outcomes.
- No fabricated metrics or simulated third-party delivery. Integrations must be explicitly configured, credentialed, tested, and labelled by status.

### Phase 6 — Product portfolio and reporting
- Company-level product registry and operational links.
- BOB Security appears as an independently operated product; company-console permissions do not imply access to BOB internals.
- Reports derive from persisted records and state their date range and source.

## 3. Data model baseline

Use migrations and foreign keys. Minimum entities:
- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `sessions`
- `pages`, `page_sections`, `content_revisions`, `publish_events`
- `media_assets`
- `submissions`, `submission_assignments`, `submission_notes`
- `projects`, `tasks`, `task_events`
- `campaigns`, `campaign_events`
- `products`
- `audit_events`

Use UTC timestamps, stable IDs, created/updated metadata, explicit state transitions, indexes for common filters, and soft-delete only where a documented retention policy requires it. Never store secrets in application tables or source control.

## 4. Architecture and hosting gate

The current Express + SQLite scaffold is useful for development and tests, but SQLite on ephemeral/local host storage is not an acceptable production assumption. Before production:
1. Select a Node.js-compatible host for the Express server.
2. Select a managed relational database or prove a durable-volume, backup, and restore design.
3. Select private object storage for uploaded media.
4. Configure secrets through the host's secret manager.
5. Configure HTTPS, trusted-proxy settings, security headers, request limits, rate limiting, structured logs, monitoring, alerting, backup schedule, and restore testing.
6. Run security and deployment smoke tests against a staging environment.
7. Keep staging and production secrets/data separate.

Do not assume an Azure Static Web App serving the existing BOB site can host this application safely. No BOB resource should be modified as part of this work.

## 5. Definition of done

A module is **designed** when its flows, states, permissions, and data model are documented; **implemented** when UI, API, and persistence are connected; **tested** when automated tests cover success, validation, and authorization failures; and **production-ready** only after staging validation, security controls, backup/restore, monitoring, and deployment configuration are verified.

Each pull request must state:
- exact files and behaviors changed;
- commands/tests run and actual results;
- remaining limitations;
- whether any external service or production resource changed (default: no).

## 6. Immediate next task

Inspect the current Express routes, schema, and tests. Design and implement the smallest complete CMS draft vertical slice without weakening the existing contact/referral safeguards. Add migration-backed content/revision storage and tests before connecting a visual editor. Do not implement a fake login or claim production security based on a shared token. If identity is not ready, keep the CMS API inaccessible except in test/dev and document the blocker rather than shipping a bypass.

## 7. Current verified baseline

- CI workflow exists at `.github/workflows/ci.yml` and runs `npm run check` and `npm test`.
- Commit `a219e7b2f2735bbe611fcd31800f615f5e473836` passed GitHub Actions run [39697192774](https://github.com/atshpana/atsh-ai-website/actions/runs/39697192774).
- Pull request #1 remains open and unmerged.
- Production deployment is not confirmed and must not be represented as complete.
