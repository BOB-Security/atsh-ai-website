# atsh-ai Deployment Architecture Decision

Status: proposed target architecture; not deployed.

## Product and company boundary

- atsh-ai is the company-level website and platform.
- BOB Security is one product owned by atsh-ai.
- BOB Security keeps its existing repository, Azure resources, deployment pipeline, domain bindings, secrets, and data stores.
- atsh-ai must use its own application identity, configuration, secrets, data store, and deployment pipeline. Do not repoint or repurpose a BOB Security resource.

## Current evidence

The Azure screenshots supplied by the owner show three Azure Static Web App resources in the subscription. One resource named `bob` in resource group `bobsecurity-site` reports Standard plan, Ready status, and GitHub `main` as its deployment source. This confirms the type and reported state of that resource only; it does not establish that it is the only live BOB Security resource.

The atsh-ai repository currently contains a Node.js 22 + Express server, API endpoints, and SQLite persistence using `better-sqlite3`. Its CI workflow runs syntax checks and tests, but there is no deployment workflow or Azure deployment configuration in the repository.

## Deployment constraints

1. Do not deploy the current repository as a static-only site and expect its API or SQLite persistence to work.
2. Do not connect the atsh-ai deployment pipeline to a BOB Security Static Web App.
3. Keep the atsh-ai website and API isolated from BOB Security, even if they share the same Azure subscription.
4. Do not publish production contact/referral forms until persistent storage, backup/restore, secrets, access controls, retention/deletion policy, monitoring, and security review are configured.
5. Do not commit tokens, connection strings, or other secrets to GitHub.

## Recommended rollout

1. Inspect and cost-check Azure options within the existing subscription without modifying BOB resources.
2. Create a separate atsh-ai deployment target with its own name and resource identity.
3. Choose a supported hosting shape for the Node.js API and a durable database. SQLite requires a genuinely persistent writable volume and is not suitable for an ephemeral filesystem or casually scaled multi-instance deployment.
4. Keep frontend and API configuration explicit; use environment settings for API origin and secret values.
5. Validate health checks, form submission, database persistence after restart, backups, and admin authentication in a non-production test.
6. Attach the atsh-ai domain only after verification. Do not alter BOB DNS or custom-domain bindings.
7. Promote the release only after CI and deployment smoke tests pass.

## Current decision

Independent atsh-ai application and data boundary: **required**.
Reuse of BOB Security's existing Static Web App resource: **not approved**.
Production deployment: **not yet approved** pending durable storage and security configuration.
