/**
 * Session Manager Service
 * Sessions persist until the user explicitly logs out — no inactivity timeout,
 * no automatic expiry. Only explicit logout blacklists the token server-side.
 */

import { clearToken, getToken } from '@/lib/api';
import { clearSettings } from './settings';

export interface SessionInfo {
  userId: number;
  email: string;
  loginTime: number;
  lastActivity: number;
  tokenExpiry: number;
  sessionId: string;
}

const SESSION_STORAGE_KEY = 'mawby_session_info';

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Initialize a new session
 */
export function initializeSession(
  userId: number,
  email: string,
  tokenExpiry: number
): SessionInfo {
  const sessionInfo: SessionInfo = {
    userId,
    email,
    loginTime: Date.now(),
    lastActivity: Date.now(),
    tokenExpiry,
    sessionId: generateSessionId(),
  };

  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionInfo));
  } catch (error) {
    console.error('Error saving session info:', error);
  }

  return sessionInfo;
}

/**
 * Get current session info
 */
export function getSessionInfo(): SessionInfo | null {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error getting session info:', error);
  }
  return null;
}

/**
 * Update last activity timestamp
 */
export function updateActivity(): void {
  const session = getSessionInfo();
  if (session) {
    session.lastActivity = Date.now();
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
      console.error('Error updating activity:', error);
    }
  }
}

/**
 * Get session duration in minutes
 */
export function getSessionDurationMinutes(): number {
  const session = getSessionInfo();
  if (!session) return 0;

  const durationMs = Date.now() - session.loginTime;
  return Math.floor(durationMs / 60000);
}

/**
 * Destroy session (called on explicit logout)
 */
export function destroySession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    clearToken();
    clearSettings();
    window.dispatchEvent(new CustomEvent('sessionDestroyed'));
  } catch (error) {
    console.error('Error destroying session:', error);
  }
}

/**
 * Clear all sessions across tabs (for logout)
 */
export function clearAllSessions(): void {
  destroySession();

  // Notify other tabs via storage event
  const storageEvent = new StorageEvent('storage', {
    key: SESSION_STORAGE_KEY,
    newValue: null,
    oldValue: null,
    storageArea: localStorage,
    url: window.location.href,
  });
  window.dispatchEvent(storageEvent);
}

/**
 * Sync logout across tabs — when one tab logs out, all tabs follow
 */
export function setupCrossTabSync(): void {
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_STORAGE_KEY && event.newValue === null) {
      destroySession();
    }
  });
}

/**
 * Get session summary for debugging
 */
export function getSessionSummary(): Record<string, any> {
  const session = getSessionInfo();
  const token = getToken();

  return {
    isActive: !!token && !!session,
    hasToken: !!token,
    sessionInfo: session
      ? {
          userId: session.userId,
          email: session.email,
          durationMinutes: getSessionDurationMinutes(),
          lastActivity: new Date(session.lastActivity).toISOString(),
        }
      : null,
  };
}
