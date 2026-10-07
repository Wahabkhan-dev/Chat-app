import { api, saveToken, clearToken, getToken } from '@/lib/api';
import { initializeSession, destroySession, clearAllSessions } from './session';
import { loadSettings, clearSettings } from './settings';
import { jwtDecode } from 'jwt-decode';
import { disconnectSocket } from './socket';
import { clearSignedUrlCache } from './fileUrl';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  avatar: string;
  status: 'online' | 'away' | 'offline' | 'dnd';
  department: string;
  is_active: number;
  created_at: string;
}

interface LoginResponse {
  message: string;
  token: string;
  user: AuthUser;
}

export interface LoginInitiateResponse {
  success: true;
  requiresOTP: true;
  message: string;
  maskedEmail: string;
}

interface MeResponse {
  user: AuthUser;
}

interface RefreshResponse {
  message: string;
  token: string;
  user: AuthUser;
}

export async function initiateLogin(email: string, password: string): Promise<LoginInitiateResponse> {
  return api.post<LoginInitiateResponse>('/auth/login', { email, password });
}

export async function verifyOTP(email: string, otpCode: string): Promise<AuthUser> {
  const data = await api.post<LoginResponse>('/auth/verify-otp', { email, otp_code: otpCode });
  saveToken(data.token);
  cacheUser(data.user);

  try {
    const decoded: any = jwtDecode(data.token);
    const tokenExpiry = (decoded.exp || 0) * 1000;
    initializeSession(data.user.id, data.user.email, tokenExpiry);
  } catch (error) {
    console.error('Error decoding token after OTP:', error);
  }

  return data.user;
}

export async function resendOTP(email: string): Promise<{ success: boolean; message: string }> {
  return api.post('/auth/resend-otp', { email });
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const data = await api.post<LoginResponse>('/auth/login', { email, password });
  saveToken(data.token);
  cacheUser(data.user);

  try {
    const decoded: any = jwtDecode(data.token);
    const tokenExpiry = (decoded.exp || 0) * 1000;
    initializeSession(data.user.id, data.user.email, tokenExpiry);
  } catch (error) {
    console.error('Error decoding token:', error);
  }

  return data.user;
}

const CACHED_USER_KEY = 'teams_cached_user';

/** Last known profile, used so a refresh can show the app instantly instead of waiting on the network. */
export function getCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheUser(user: AuthUser): void {
  try { localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user)); } catch {}
}

function clearCachedUser(): void {
  try { localStorage.removeItem(CACHED_USER_KEY); } catch {}
}

/**
 * Thrown by getCurrentUser() when the server couldn't be reached at all (network error,
 * timeout, a 5xx while it's waking up, …) — distinct from a real 401/403 rejection, which
 * api.ts already turns into a cleared token. Callers must NOT log the user out for this: their
 * token is still here and still valid, the server just didn't answer in time.
 */
export class SessionCheckUnreachableError extends Error {}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const data = await api.get<MeResponse>('/auth/me');
    cacheUser(data.user);
    return data.user;
  } catch (err) {
    // api.ts clears the token itself, but only when the server actually responded 401/403
    // (session genuinely invalid/revoked). If the token is still here, this failure was the
    // request never completing — not the session being rejected — so it must not count as logout.
    if (!getToken()) return null;
    throw new SessionCheckUnreachableError((err as Error).message);
  }
}

export async function refreshToken(): Promise<{ token: string; user: AuthUser } | null> {
  try {
    if (!getToken()) return null;
    const data = await api.post<RefreshResponse>('/auth/refresh', {});
    saveToken(data.token);
    cacheUser(data.user);

    // Update session expiry with new token
    try {
      const decoded: any = jwtDecode(data.token);
      const tokenExpiry = (decoded.exp || 0) * 1000;
      initializeSession(data.user.id, data.user.email, tokenExpiry);
    } catch (error) {
      console.error('Error updating session after token refresh:', error);
    }

    return { token: data.token, user: data.user };
  } catch {
    // Same rule as getCurrentUser(): only a real 401/403 (api.ts already cleared the token)
    // means the session is actually gone. A network/timeout failure must not log anyone out.
    if (!getToken()) clearAllSessions();
    return null;
  }
}

/**
 * Force logout without server call (for when session expires)
 */
export async function forceLogout(): Promise<void> {
  clearAllSessions();
  clearSignedUrlCache();
  clearCachedUser();
}

export async function logoutUser(): Promise<void> {
  try {
    // Try to notify server of logout
    await api.post('/auth/logout', {});
  } catch (error) {
    console.error('Error notifying server of logout:', error);
    // Continue with local cleanup even if server call fails
  } finally {
    // Complete cleanup: disconnect realtime and clear everything
    try { disconnectSocket(); } catch (e) {}
    clearAllSessions();
    clearCachedUser();
  }
}
