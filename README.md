# ATSH AI Clean Rebuild v2.0

Fresh implementation branch governed by the pinned executive reference. Production main and its deployment workflow remain untouched. Preserve the existing production database. Never run destructive migrations. Inspect live schema read-only before connecting writes. No production release until authentication, authorization, data isolation, catalog approval, tests, staging verification, backup/restore and rollback are accepted.

CI workflow was re-triggered after staging workflow hardening.

The current clean-build branch includes a read-only live schema inventory and a database-backed inquiry adapter; production data is not modified by CI.


The clean rebuild now includes project lifecycle controls with an audited client-approval gate before deployment, plus lead/quote workflow APIs.
