import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';

// Socket E2E scaffold — requires two test users available. Provide credentials via env:
// TEST_USER1_EMAIL, TEST_USER1_PASSWORD, TEST_USER2_EMAIL, TEST_USER2_PASSWORD

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Login failed: ' + res.status);
  return res.json();
}

function getDmId(a: number | string, b: number | string) {
  const ai = Number(a);
  const bi = Number(b);
  return `dm_${Math.min(ai, bi)}_${Math.max(ai, bi)}`;
}

// Timeout increased for network operations
test.setTimeout(60_000);

test('socket-level messaging between two test users', async () => {
  const u1Email = process.env.TEST_USER1_EMAIL;
  const u1Pass = process.env.TEST_USER1_PASSWORD;
  const u2Email = process.env.TEST_USER2_EMAIL;
  const u2Pass = process.env.TEST_USER2_PASSWORD;

  test.skip(!u1Email || !u1Pass || !u2Email || !u2Pass, 'Required TEST_USER*_EMAIL and PASSWORD env vars not set');

  const a = await login(u1Email!, u1Pass!);
  const b = await login(u2Email!, u2Pass!);

  const tokenA = a.token;
  const tokenB = b.token;
  const idA = String(a.user.id);
  const idB = String(b.user.id);

  const dmId = getDmId(idA, idB);

  const socketA = io(API_BASE, { auth: { token: tokenA }, transports: ['websocket'], reconnection: true });
  const socketB = io(API_BASE, { auth: { token: tokenB }, transports: ['websocket'], reconnection: true });

  await new Promise((resolve, reject) => {
    let connected = 0;
    socketA.on('connect', () => { connected++; if (connected === 2) resolve(null); });
    socketB.on('connect', () => { connected++; if (connected === 2) resolve(null); });
    setTimeout(() => reject(new Error('Socket connect timeout')), 10000);
  });

  // Join DM rooms
  socketA.emit('join_dm', { otherUserId: idB });
  socketB.emit('join_dm', { otherUserId: idA });

  const uniqueMsg = `e2e-msg-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Did not receive message in time')), 10000);
    socketB.on('new_message', ({ conversationId, message }: any) => {
      if (conversationId === dmId && message.content.includes('e2e-msg-')) {
        clearTimeout(timeout);
        resolve(message);
      }
    });
  });

  socketA.emit('send_message', { conversationId: dmId, content: uniqueMsg, type: 'text' }, (ack: any) => {
    // ack received by A
  });

  const msg = await received;
  expect((msg as any).content).toContain('e2e-msg-');

  // Reconnect test: disconnect B and reconnect, then A sends another message which B should receive after rejoin
  await new Promise((r) => socketB.disconnect(), 50);

  // Wait a moment and reconnect
  await new Promise((res) => setTimeout(res, 500));
  const socketB2 = io(API_BASE, { auth: { token: tokenB }, transports: ['websocket'], reconnection: true });
  await new Promise((resolve, reject) => {
    socketB2.on('connect', () => resolve(null));
    setTimeout(() => reject(new Error('Reconnect timeout')), 10000);
  });
  socketB2.emit('join_dm', { otherUserId: idA });

  const uniqueMsg2 = `e2e-msg2-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const received2 = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Did not receive message after reconnect')), 10000);
    socketB2.on('new_message', ({ conversationId, message }: any) => {
      if (conversationId === dmId && message.content.includes('e2e-msg2-')) {
        clearTimeout(timeout);
        resolve(message);
      }
    });
  });

  socketA.emit('send_message', { conversationId: dmId, content: uniqueMsg2, type: 'text' }, () => {});

  const msg2 = await received2;
  expect((msg2 as any).content).toContain('e2e-msg2-');

  // Cleanup
  socketA.disconnect();
  socketB2.disconnect();
});
