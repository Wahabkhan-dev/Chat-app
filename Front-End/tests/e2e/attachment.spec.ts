import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

test('upload attachment and verify preview/download persistence', async () => {
  const email = process.env.TEST_USER1_EMAIL;
  const password = process.env.TEST_USER1_PASSWORD;
  test.skip(!email || !password, 'Required TEST_USER1_EMAIL and TEST_USER1_PASSWORD env vars not set');

  const auth = await login(email!, password!);
  const token = auth.token;
  const conversationId = 'general';

  const fileContent = 'E2E attachment persistence test';
  const formData = new FormData();
  formData.append('conversationId', conversationId);
  formData.append('files', new Blob([fileContent], { type: 'text/plain' }), 'e2e-attachment.txt');

  const uploadRes = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  expect(uploadRes.ok).toBeTruthy();
  const uploadBody = await uploadRes.json();
  expect(Array.isArray(uploadBody.files)).toBeTruthy();
  expect(uploadBody.files.length).toBeGreaterThan(0);

  const fileKey = uploadBody.files[0]?.key;
  expect(typeof fileKey).toBe('string');
  expect(fileKey).toContain('chats/');

  const urlRes = await fetch(`${API_BASE}/api/files/url?key=${encodeURIComponent(fileKey)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(urlRes.ok).toBeTruthy();
  const urlBody = await urlRes.json();
  expect(typeof urlBody.url).toBe('string');

  const previewRes = await fetch(urlBody.url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(previewRes.ok).toBeTruthy();
  expect(previewRes.headers.get('content-type')).toContain('text/plain');

  const downloadRes = await fetch(`${API_BASE}/api/files/download?key=${encodeURIComponent(fileKey)}&filename=e2e-attachment.txt`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(downloadRes.ok).toBeTruthy();
  expect(downloadRes.headers.get('content-disposition')).toContain('e2e-attachment.txt');

  const bodyText = await downloadRes.text();
  expect(bodyText).toContain('E2E attachment persistence test');
});
