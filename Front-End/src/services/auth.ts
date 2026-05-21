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

interface MeResponse {
  user: AuthUser;
}

interface RefreshResponse {
  message: string;
  token: string;
  user: AuthUser;
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const data = await api.post<LoginResponse>('/auth/login', { email, password });
  saveToken(data.token);

  // Decode token to get expiry time
  try {
    const decoded: any = jwtDecode(data.token);
    const tokenExpiry = (decoded.exp || 0) * 1000; // Convert to milliseconds

    // Initialize session with token expiry
    initializeSession(data.user.id, data.user.email, tokenExpiry);
  } catch (error) {
    console.error('Error decoding token:', error);
  }

  return data.user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const data = await api.get<MeResponse>('/auth/me');
    return data.user;
  } catch {
    clearToken();
    return null;
  }
}

export async function refreshToken(): Promise<{ token: string; user: AuthUser } | null> {
  try {
    if (!getToken()) return null;
    const data = await api.post<RefreshResponse>('/auth/refresh', {});
    saveToken(data.token);

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
    clearAllSessions();
    return null;
  }
}

/**
 * Force logout without server call (for when session expires)
 */
export async function forceLogout(): Promise<void> {
  clearAllSessions();
  clearSignedUrlCache();
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
  }
}
