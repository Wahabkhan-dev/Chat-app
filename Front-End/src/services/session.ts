/**
 * Session Manager Service
 * Handles session lifecycle, token expiration, and cleanup
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
const SESSION_ACTIVITY_INTERVAL = 60000; // 1 minute
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const TOKEN_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours (adjust based on JWT_EXPIRES_IN)

let sessionActivityInterval: NodeJS.Timeout | null = null;
let inactivityTimeout: NodeJS.Timeout | null = null;
let onSessionExpiredCallback: (() => void) | null = null;

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

  startActivityTracking();
  startInactivityMonitoring();

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
 * Start tracking user activity
 */
function startActivityTracking(): void {
  if (sessionActivityInterval) {
    clearInterval(sessionActivityInterval);
  }

  const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
  const onActivity = () => {
    updateActivity();
    resetInactivityTimeout();
  };

  events.forEach((event) => {
    document.addEventListener(event, onActivity, true);
  });

  // Cleanup function
  const cleanup = () => {
    events.forEach((event) => {
      document.removeEventListener(event, onActivity, true);
    });
  };

  // Store cleanup function for later
  (window as any).__sessionActivityCleanup = cleanup;
}

/**
 * Start monitoring for inactivity
 */
function startInactivityMonitoring(): void {
  resetInactivityTimeout();
}

/**
 * Reset inactivity timeout
 */
function resetInactivityTimeout(): void {
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }

  inactivityTimeout = setTimeout(() => {
    handleInactivityTimeout();
  }, INACTIVITY_TIMEOUT);
}

/**
 * Handle inactivity timeout
 */
function handleInactivityTimeout(): void {
  console.warn('Session expired due to inactivity');
  destroySession();

  if (onSessionExpiredCallback) {
    onSessionExpiredCallback();
  }
}

/**
 * Check if session is expired
 */
export function isSessionExpired(): boolean {
  const session = getSessionInfo();
  if (!session) return true;

  const now = Date.now();
  const inactiveTime = now - session.lastActivity;

  // Check inactivity (30 minutes)
  if (inactiveTime > INACTIVITY_TIMEOUT) {
    return true;
  }

  // Check token expiry
  if (now > session.tokenExpiry) {
    return true;
  }

  return false;
}

/**
 * Get remaining session time in milliseconds
 */
export function getRemainingSessionTime(): number {
  const session = getSessionInfo();
  if (!session) return 0;

  const now = Date.now();
  const inactiveTime = now - session.lastActivity;
  const remainingInactivity = INACTIVITY_TIMEOUT - inactiveTime;
  const remainingToken = session.tokenExpiry - now;

  return Math.min(remainingInactivity, remainingToken);
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
 * Warn user before session expires (5 minutes)
 */
export function onSessionAboutToExpire(
  callback: (remainingSeconds: number) => void
): () => void {
  const interval = setInterval(() => {
    const remaining = getRemainingSessionTime();

    // Warn when 5 minutes left
    if (remaining <= 5 * 60 * 1000 && remaining > 0) {
      callback(Math.floor(remaining / 1000));
    }

    // Clear interval if session expired
    if (remaining <= 0) {
      clearInterval(interval);
    }
  }, 10000); // Check every 10 seconds

  return () => clearInterval(interval);
}

/**
 * Register callback for session expiration
 */
export function onSessionExpired(callback: () => void): () => void {
  onSessionExpiredCallback = callback;
  return () => {
    onSessionExpiredCallback = null;
  };
}

/**
 * Destroy session (logout)
 */
export function destroySession(): void {
  try {
    // Clear session info
    localStorage.removeItem(SESSION_STORAGE_KEY);

    // Clear token
    clearToken();

    // Clear settings
    clearSettings();

    // Clear activity tracking
    if ((window as any).__sessionActivityCleanup) {
      (window as any).__sessionActivityCleanup();
    }

    // Clear timeouts
    if (sessionActivityInterval) {
      clearInterval(sessionActivityInterval);
      sessionActivityInterval = null;
    }

    if (inactivityTimeout) {
      clearTimeout(inactivityTimeout);
      inactivityTimeout = null;
    }

    // Dispatch custom event
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

  // Notify other tabs
  const storageEvent = new StorageEvent('storage', {
    key: SESSION_STORAGE_KEY,
    newValue: null,
    oldValue: getSessionInfo() ? JSON.stringify(getSessionInfo()) : null,
    storageArea: localStorage,
    url: window.location.href,
  });

  window.dispatchEvent(storageEvent);
}

/**
 * Sync session across tabs
 */
export function setupCrossTabSync(): void {
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_STORAGE_KEY) {
      if (event.newValue === null) {
        // Session destroyed in another tab
        destroySession();
      }
    }
  });

  // Listen for session destroyed event from same tab
  window.addEventListener('sessionDestroyed', () => {
    console.log('Session destroyed, redirecting to login...');
  });
}

/**
 * Get session summary for debugging
 */
export function getSessionSummary(): Record<string, any> {
  const session = getSessionInfo();
  const token = getToken();

  return {
    isActive: !isSessionExpired(),
    hasToken: !!token,
    sessionInfo: session
      ? {
          userId: session.userId,
          email: session.email,
          durationMinutes: getSessionDurationMinutes(),
          remainingTime: getRemainingSessionTime(),
          lastActivity: new Date(session.lastActivity).toISOString(),
        }
      : null,
  };
}
