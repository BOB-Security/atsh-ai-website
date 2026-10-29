# Release gates — ATSH AI v2.0

No deployment to the production app or production traffic switch is permitted until each gate is recorded with evidence.

1. **Schema safety:** actual database schema inventoried read-only; current backup and restore evidence verified; migrations are additive and tested against a disposable copy.
2. **Product completeness:** all public pages and core journeys in the reference are traceable to working APIs and tests.
3. **Identity and authorization:** MFA for privileged roles, secure session lifecycle, server-side permissions on every mutation, and cross-customer access tests pass.
4. **Financial integrity:** prices are owner-approved; server recomputes all totals; billing periods, currency precision, quote snapshots, discounts and tax treatment are tested.
5. **Workflow integrity:** state transitions reject invalid transitions; quotes, revisions, customer approval and release actions are auditable and token-replay safe.
6. **External services:** email, AI, hosting, DNS, payment and storage integrations show verified configuration; unconfigured integrations fail closed and do not simulate success.
7. **Quality:** build, unit, integration, migration, security, accessibility, RTL/LTR, mobile and real-browser end-to-end tests pass.
8. **Operations:** staging matches the tested commit; backup and isolated restore test pass; monitoring, incident response, rollback and ownership are documented.
9. **Commercial/legal approval:** owner approves catalog, policies, privacy/terms, retention and release content.
10. **Release authorization:** explicit approval is recorded before production deployment or any irreversible operation.

The present branch is a foundation, not a production release candidate. A green CI run alone does not satisfy these gates.
