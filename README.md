# atsh-ai website

The repository contains the public-facing bilingual company website and a small Node.js server suitable for Azure App Service.

## Run locally

Requires Node.js 24 or newer.

```sh
npm install
npm run build
npm test
npm start
``

Open `http://localhost:3000`.

## Project inquiry form

The website deliberately does not claim an inquiry has been submitted unless the configured receiving service confirms it. Set `INQUIRY_WEBHOOK_URL` in the hosting environment to an HTTPS endpoint that accepts the inquiry JSON payload and returns a 2xx response. Do not commit secrets or credentials to this repository. Without the integration, the form returns a clear message that online submission is not active.

The endpoint validates required fields, limits the request body, uses a honeypot field, and applies an eight-second upstream timeout. A production deployment should additionally configure durable storage or a trusted ticketing/CRM provider, rate limiting/WAF, monitoring, retention/deletion rules, and the applicable privacy notice before accepting real customer data.

## Health check

`GET /health` returns a small JSON health response.

## Deployment

GitHub Actions workflows deploy to Azure App Service. The site needs a valid `package.json` with a start script and a server that listens on `process.env.PORT`. Azure runtime settings, deployment secrets, domain configuration, and the inquiry integration must be checked in the Azure environment before production launch.

## Current scope

This commit provides the bilingual public website, navigation, service overview, process/about sections, and project inquiry form UI. A connected CRM/database, authenticated admin panel, client portal, staff roles, bots, and cloud-service control plane are not implemented by this static-site milestone and must be delivered in subsequent tested phases.
