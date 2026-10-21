# atsh-ai — Website MVP (initial frontend)

This branch introduces the first responsive Arabic-first landing-page frontend.

## Included
- Responsive landing page with AI/service positioning and process explanation.
- Contact/project inquiry form UI.
- Referral intake form UI following the documented management-approval workflow.
- Customer-support chat widget prototype with canned responses, attachment selection UI, and ticket handoff shortcut.
- Accessibility basics: semantic sections, labels, focus styles, skip link, reduced-motion handling.

## Important implementation status
This is a **frontend prototype only**. Forms do not submit to a server, tickets are not persisted, attachments are not uploaded, and the chat is not connected to an AI service or live support. The UI explicitly discloses this to avoid misleading visitors.

## Next required engineering work
1. Select and configure the app framework, server/API, database, and authentication.
2. Implement validated server endpoints and persistent ticket/conversation records.
3. Add private object storage, file validation/scanning, access control, and retention policy.
4. Build the authenticated admin inbox and role-based access checks.
5. Integrate a chosen AI provider only after reviewing cost, privacy, and data handling.
6. Configure deployment/domain after the correct domain name is confirmed.
7. Run automated checks, security tests, and production smoke tests.

Do not publish this prototype as a fully operational customer-support service until the backend and security work above is complete.
