# E2E Test Guidance (Playwright)

This folder contains guidance for adding Playwright tests for the Front-End app.

Quick setup (recommended):

1. Install Playwright in the `Front-End` folder:

```bash
cd Front-End
npm i -D @playwright/test
npx playwright install
```

2. Sample test location: `Front-End/tests/e2e/forwarding.spec.ts`

3. Run tests:

```bash
cd Front-End
npx playwright test
```

Implemented tests:
- `socket.spec.ts` — socket messaging, DM exchange, reconnect behavior
- `attachment.spec.ts` — upload attachment, preview URL, secure download persistence

Additional coverage to add:
- `forwarding.spec.ts` — send message with attachment, forward to another user, assert recipient receives file
- `login.spec.ts` — verify login and session persistence via UI
