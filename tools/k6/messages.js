import http from 'k6/http';
import { check, sleep } from 'k6';

// Usage:
// API_URL=http://localhost:3001 k6 run tools/k6/messages.js

const API_URL = __ENV.API_URL || 'http://localhost:3001';
const EMAIL = __ENV.TEST_EMAIL || 'admin@mawbytec.com';
const PASSWORD = __ENV.TEST_PASSWORD || 'admin123';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  // Login (obtain token) — adapt to your /auth/login shape if different
  const loginRes = http.post(`${API_URL}/api/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(loginRes, { 'login OK': (r) => r.status === 200 });
  const token = loginRes.json('token');
  if (!token) return;

  // Fetch shared files (example read endpoint)
  const filesRes = http.get(`${API_URL}/api/files/shared`, { headers: { Authorization: `Bearer ${token}` } });
  check(filesRes, { 'files fetched': (r) => r.status === 200 });

  // Optionally hit presign for a sample key (replace with a real key from your setup)
  // const presignRes = http.get(`${API_URL}/api/files/url?key=chats/dm_1_2/sample.jpg`, { headers: { Authorization: `Bearer ${token}` } });

  sleep(1);
}
