# QA Stability & E2E Audit — Mawby Teams

This document lists step-by-step stability checks, manual test matrix, automated test suggestions, and stress-test skeletons to validate the application before production.

## Quick start (local)

1. Start backend:

```bash
cd Back-End
node server.js
```

2. Start frontend:

```bash
cd Front-End
npm run dev
```

3. Login: `admin@mawbytec.com / admin123`

---

## High-level audit areas

- Messaging (send/edit/delete/pin/forward)
- Group chats (membership, roles, rejoin)
- Notifications (persisted + realtime)
- Shared repository (files listing + previews)
- Uploads/Downloads (R2 + local fallback)
- Forwarding (re-fetch & re-upload paths)
- Attachments (images, video, audio, pdf, docs, zip)
- Reactions, Blocking, Socket sync, Reconnects

---

## Manual checklist (detailed)

- General
  - Run the app locally and in an incognito window.
  - Open the app on multiple tabs and different devices and sign in with different users.

- Messaging
  - Send text messages in DM and group.
  - Reply, edit, delete, and undelete messages. Verify all clients update.
  - Pin and unpin messages; verify sidebar/header shows pinned message.

- Attachments & Forwarding
  - Upload image, video, pdf, docx, zip, audio and verify preview in FilePreviewModal.
  - Download file using `Download` — ensure correct filename & content-type.
  - Forward a message that contains:
    - persisted file (has `key`) — should forward without re-upload
    - transient blob (no `key`) — should re-fetch from preview/blob and re-upload
  - Verify forwarded files persist after refresh and are visible in Shared files.
  - Attempt >10 files and >25MB per file to assert server rejection message.

- Notifications & Persistence
  - Verify `new_notification` appears in bell panel and persists after refresh.
  - Ensure offline unread counts are computed on reconnect.

- Blocking & Permissions
  - Block a user in DM — verify messages/typing/notifications from the blocked user are ignored.
  - Try group actions as non-member — ensure server rejects.

- Reconnect & Refresh
  - Simulate network loss; reconnect and verify the client rejoins rooms and receives missed messages via offline-unread flow.
  - Refresh while viewing conversation and ensure no loss of state and that media previews still load.

---

## Attachment-heavy tests (important)

- Test file types: image (jpg/png/webp), video (mp4/webm), audio (mp3), pdf, docx/xlsx/pptx, zip.
- Large files: test up to 24.5 MB (current limit). If you need bigger, increase `MAX_UPLOAD_MB` (server change).
- Multiple attachments: attach 3–10 files in one send; confirm server accepts up to 10.
- Forwarding edge-case: forward an attachment while R2 is intentionally unavailable (simulate by misconfiguring R2 env). Ensure local fallback and metadata behaviors are acceptable.

---

## Stress testing guidance

- Tools: `k6` (HTTP), `artillery` (WebSocket), or a distributed Artillery cluster for 1000+ connections.
- Run plan: smoke (10 users), medium (100 users), large (1000+ distributed).
- Monitor: backend CPU, memory, socket disconnect rates, DB slow queries, R2 error rates.

### k6 skeleton (see `tools/k6/messages.js`) — adapt to your auth & endpoints.

### Artillery (WebSocket)
 - Create an Artillery script that opens WebSocket connections and emits `join_group`/`send_message` events at a controlled rate.
 - Run distributed for 1000+ concurrent websockets.

---

## Automated tests (suggestions)

- Unit tests:
  - `Back-End`: `extractLinks`, `formatMessage`, upload route error handling (mocking R2).
  - `Front-End`: `getSignedUrl` cache, `useSignedUrl` refresh logic, forwarding `buildForwardFiles` behavior.

- E2E (Playwright/Cypress):
  - Login, upload file, send message, forward message to another DM, verify message and file visible in recipient tab.
  - Simulate offline/online transitions and verify pending sends.

---

## Quick fixes & recommendations

- Consider increasing `limits.fileSize` in `Back-End/routes/upload.js` if >25 MB files are required.
- Improve metadata save reliability (retry/backoff) to avoid files without metadata.
- Add server health endpoints and monitoring integration (Sentry, Prometheus, etc.).
- Add CI job running lint/typecheck and E2E tests on PRs.

---

## Static audit summary

- Ran repository-wide TODO/FIXME scan: no active code TODO markers found.
- Verified backend upload and file serving use safe path resolution and configurable upload root.
- Added a Playwright attachment persistence test covering upload, preview URL, and secure download.
- Verified reconnect coverage already exists in `Front-End/tests/e2e/socket.spec.ts`.

---

If you want, I can: scaffold Playwright E2E tests, add Artillery WebSocket scripts, or bump upload limits and add a corresponding UI warning. Which should I do next?
