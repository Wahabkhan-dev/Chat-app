import { getSocket } from './socket';

export type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline';

export interface OnlineUser {
  id: string;
  name: string;
  avatar: string;
  status: PresenceStatus;
}

// Auto-mark as away after 5 minutes of inactivity
const AWAY_TIMEOUT = 5 * 60 * 1000;

let inactivityTimer: NodeJS.Timeout | null = null;
let lastActivityTime = Date.now();

export function updatePresence(status: PresenceStatus): void {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('update_presence', { status }, (response: any) => {
    if (!response?.success) {
      console.error('[Presence] Update failed:', response?.error);
    }
  });
}

export function getOnlineUsers(callback: (users: OnlineUser[]) => void): void {
  const socket = getSocket();
  if (!socket) {
    callback([]);
    return;
  }

  socket.emit('get_online_users', (response: any) => {
    if (response?.success) {
      callback(response.users || []);
    } else {
      console.error('[Presence] Get online users failed:', response?.error);
      callback([]);
    }
  });
}

export function reportActivity(): void {
  lastActivityTime = Date.now();

  // Reset inactivity timer
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }

  const socket = getSocket();
  if (!socket) return;

  // Report to server
  socket.emit('user_activity', (response: any) => {
    if (!response?.success) {
      console.error('[Presence] Activity report failed:', response?.error);
    }
  });

  // Set timer for auto-away
  inactivityTimer = setTimeout(() => {
    updatePresence('away');
  }, AWAY_TIMEOUT);
}

export function setAutoAwayTimer(): void {
  // Listen for user activity
  document.addEventListener('mousemove', reportActivity);
  document.addEventListener('keydown', reportActivity);
  document.addEventListener('click', reportActivity);
  document.addEventListener('scroll', reportActivity);

  // Report initial activity
  reportActivity();
}

export function clearAutoAwayTimer(): void {
  document.removeEventListener('mousemove', reportActivity);
  document.removeEventListener('keydown', reportActivity);
  document.removeEventListener('click', reportActivity);
  document.removeEventListener('scroll', reportActivity);

  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}

export function isUserOnline(user: OnlineUser): boolean {
  return user.status === 'online' || user.status === 'away' || user.status === 'dnd';
}

export function getPresenceLabel(status: PresenceStatus): string {
  const labels: Record<PresenceStatus, string> = {
    online: 'Online',
    away: 'Away',
    dnd: 'Do Not Disturb',
    offline: 'Offline',
  };
  return labels[status] || status;
}

export function getPresenceColor(status: PresenceStatus): string {
  const colors: Record<PresenceStatus, string> = {
    online: '#10b981',    // Green
    away: '#f59e0b',      // Amber
    dnd: '#ef4444',       // Red
    offline: '#6b7280',   // Gray
  };
  return colors[status] || '#6b7280';
}
