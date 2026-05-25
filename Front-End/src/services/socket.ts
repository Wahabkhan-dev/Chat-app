import { io, Socket } from 'socket.io-client';
import { getToken, saveToken } from '@/lib/api';

const _rawSocketApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const _validApiUrl = _rawSocketApiUrl.startsWith('http')
  ? _rawSocketApiUrl
  : 'https://chat-app-wv5a.onrender.com/api';
const SOCKET_URL = _validApiUrl.replace(/\/api\/?$/, '');

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  // Handle token refresh on reconnection
  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message, err);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
