# atsh-ai — Official Website

The public website is a bilingual Arabic/English Node.js application prepared for Azure App Service. The deployment baseline is intentionally small: the public website, static service pages, a health endpoint, and an inquiry form that never claims success unless a configured HTTPS receiver confirms it.

## Verify locally

Requires Node.js 24 or newer.

```sh
npm ci
npm run build
npm test
npm start
```

Open `http://localhost:3000`; `GET /health` should return `200`.

## Azure deployment

The canonical workflow is **Actions → Azure App Service — provision and deploy**. It can run manually or when the Azure infrastructure definition/workflow changes on `main`. It always runs the build and tests before changing Azure resources and uses the repository's existing Azure OIDC secrets. Website code changes alone do not trigger a production deployment.

- If `atsh-ai-website` already exists in the authenticated Azure subscription, the workflow discovers its resource group, region, and App Service plan and reuses them.
- If the app does not exist, supply an existing resource group and a globally unique app name.
- The default App Service plan is `B1`, which is paid. Check the actual regional price and available credits before running the workflow.
- The workflow tests the live `/health` endpoint. Do not bind the custom domain until the live test passes.

Infrastructure definition and detailed instructions: [infra/azure/README.md](infra/azure/README.md).

## Admin portal

The initial admin entry page is available at `/admin`. The requirements are documented in [docs/ADMIN-DASHBOARD-SPEC.md](docs/ADMIN-DASHBOARD-SPEC.md). The current page is intentionally a non-functional preview: password login, email activation, durable data storage, and admin APIs are **not enabled yet**. Do not treat it as an authenticated control panel or enter credentials there. Complete the identity/email provider and durable storage configuration before enabling authentication.

## Inquiry form

The form is not a durable CRM or database. To enable real inquiries, set `INQUIRY_WEBHOOK_URL` to a trusted HTTPS endpoint, test the receiving service, and define retention/deletion and access policies. Until configured, the website clearly reports that online submission is not active.

## Security boundaries

Do not commit secrets, access tokens, customer data, or private keys. A successful build is not proof that the production deployment, inquiry receiver, or custom domain is operational. Those states must be checked independently.
