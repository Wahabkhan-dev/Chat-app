import { io, Socket } from 'socket.io-client';
import { getToken } from '@/lib/api';

const _rawSocketApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const _validApiUrl = _rawSocketApiUrl.startsWith('http')
  ? _rawSocketApiUrl
  : 'https://chat-app-wv5a.onrender.com/api';
const SOCKET_URL = _validApiUrl.replace(/\/api\/?$/, '');

let socket: Socket | null = null;

// ── Socket status ──────────────────────────────────────────────────────────
export type SocketStatus = 'connected' | 'reconnecting' | 'disconnected';
let _socketStatus: SocketStatus = 'disconnected';
const _statusListeners = new Set<(s: SocketStatus) => void>();

export function getSocketStatus(): SocketStatus {
  return _socketStatus;
}

export function onSocketStatusChange(cb: (s: SocketStatus) => void): () => void {
  _statusListeners.add(cb);
  return () => _statusListeners.delete(cb);
}

function _setSocketStatus(s: SocketStatus): void {
  if (_socketStatus === s) return;
  _socketStatus = s;
  _statusListeners.forEach((cb) => cb(s));
}

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  // If socket exists but is merely disconnected, kick it to reconnect rather than making a new one
  if (socket) {
    if (socket.connected) return socket;
    socket.connect();
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,  // never give up
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,     // cap backoff at 10 s
    withCredentials: true, // Send HTTP-Only cookies for mobile sessions
  });

  socket.on('connect', () => {
    _setSocketStatus('connected');
  });

  socket.on('disconnect', (reason) => {
    // 'io server disconnect' and 'io client disconnect' are intentional — don't show reconnecting
    const intentional = reason === 'io server disconnect' || reason === 'io client disconnect';
    _setSocketStatus(intentional ? 'disconnected' : 'reconnecting');
  });

  socket.on('reconnect_attempt', () => {
    _setSocketStatus('reconnecting');
  });

  socket.on('reconnect', () => {
    _setSocketStatus('connected');
  });

  socket.on('reconnect_failed', () => {
    _setSocketStatus('disconnected');
  });

  socket.on('connect_error', () => {
    _setSocketStatus('reconnecting');
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    _setSocketStatus('disconnected');
  }
}
