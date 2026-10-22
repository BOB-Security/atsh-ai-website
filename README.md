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

## Admin portal and CMS

The admin portal is at `/admin`; the separate staff entry is `/staff/login`. The backend provides owner bootstrap by one-time email code, password login with scrypt password hashes, secure HttpOnly session cookies and CSRF validation, role-checked APIs, staff invitations, account suspension/deletion, task assignment/status, audit events, image uploads, and a CMS store for pages, blocks, images and theme colors. The CMS renders saved blocks on public pages and can serve newly created CMS pages.

The initial owner account is **not pre-created**. Before first activation, configure the following GitHub Actions repository secrets, then allow the Azure deployment workflow to apply them as App Service settings:
- `ADMIN_EMAIL`: the owner's personal email address.
- `RESEND_API_KEY`: Resend API key.
- `EMAIL_FROM`: a sender address verified with the email provider.

Without these secrets, owner activation and team invitations stay disabled and show a configuration error. Never place secrets or passwords in Git, source files, or chat messages.

The admin store and uploaded images are placed in `DATA_DIR=/home/data` on App Service so app redeployments do not replace them. This JSON-file store is a **single-instance MVP**, not a highly available database. Do not scale out or use it for sensitive customer records until the data is migrated to a managed database with backups, restore testing, and a reviewed retention policy. Successful build/deployment does not by itself verify email delivery or production authentication; test those separately.

## Inquiry form

The form is not a durable CRM or database. To enable real inquiries, set `INQUIRY_WEBHOOK_URL` to a trusted HTTPS endpoint, test the receiving service, and define retention/deletion and access policies. Until configured, the website clearly reports that online submission is not active.

## Security boundaries

Do not commit secrets, access tokens, customer data, or private keys. A successful build is not proof that the production deployment, inquiry receiver, or custom domain is operational. Those states must be checked independently.
