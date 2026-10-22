# atsh-ai Repository Ownership and Client Isolation Policy

Status: approved working policy; implementation is staged, not yet migrated to a GitHub Organization.

## Ownership model

- The personal GitHub account is an identity used by the founder to sign in; it should not remain the sole long-term container for company-owned code.
- Target organization: `atsh-ai` (availability and creation must be confirmed in GitHub by an organization owner).
- Company-owned repositories should live under the organization after transfer checks are complete.
- Do not transfer repositories until Actions secrets, deployment credentials, environments, branch protections, Pages/custom-domain configuration, webhooks, and any external integrations have been inventoried and validated.
- Keep repositories private by default unless there is a deliberate, documented reason to publish one.

## Initial repository

Current repository: `atshpana/atsh-ai-website` (private).

Planned destination: `atsh-ai/atsh-ai-website`, subject to organization creation and destination availability.

Transfer gate:
1. Create the organization and confirm the founder has Owner access and recovery options.
2. Add a second trusted owner only when there is a real trusted person and a secure account; do not invent or share credentials.
3. Inventory repository secrets, variables, Actions workflows, environments, deploy keys, webhooks, branch rules, and the open pull request.
4. Confirm the organization has the required plan/features and billing setup before transfer.
5. Transfer the repository using GitHub's supported transfer flow; preserve history and verify redirects, clone URL, CI, PR, and integrations.
6. Keep the original repository and branch history recoverable until all checks pass. Do not delete the original manually as a shortcut.

## Client work

- Company platform code and client deliverables must be clearly distinguished in contracts and repositories.
- For each client, decide ownership, access, confidentiality, retention, handover, and post-contract access in writing.
- Prefer a client-owned repository or client-owned organization when the client is to own the deliverable. Grant the atsh-ai team least-privilege access.
- If atsh-ai retains ownership under contract, keep that client's code in a separate private repository with least-privilege access.
- Never mix credentials, production data, customer exports, or secrets between clients or with BOB Security.
- Use separate deployment environments, secrets, and data stores per client when risk, contract, or architecture requires it.

## CI and deployment policy

- Keep the existing working branch and pull request until the organization migration is verified.
- Do not merge the draft PR or deploy to production as part of a repository ownership change.
- The current app includes a Node.js API and SQLite persistence; it must not be deployed as a static-only site. Durable storage, backup/restore, secrets, monitoring, and smoke tests are deployment gates.
- atsh-ai resources remain independent from BOB Security resources even when temporarily using the same domain at different times.

## Current state

- Organization membership query returned no organizations for the connected GitHub identity.
- The repository is currently private under the personal account.
- Latest CMS draft/revision API commit `a85c542ffae0848c9dc51e1a33637c846ba650c4` passed the repository's existing CI workflow.
- That CI result is not evidence that a GitHub Organization exists or that the app has been deployed.
