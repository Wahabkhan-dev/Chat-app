const fetch = global.fetch;

(async () => {
  try {
    const baseUrl = 'http://127.0.0.1:3001/api';
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@mawbytec.com', password: 'admin123' }),
    });
    const loginData = await loginRes.json();
    console.log('login status', loginRes.status, loginData);
    if (!loginRes.ok) return;

    const token = loginData.token;
    const msgRes = await fetch(`${baseUrl}/messages/dm_1_2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const msgData = await msgRes.text();
    console.log('messages status', msgRes.status);
    console.log(msgData);
  } catch (err) {
    console.error('API test error', err);
  }
})();
