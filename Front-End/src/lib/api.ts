const _rawApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const BASE_URL = _rawApiUrl.startsWith('http')
  ? _rawApiUrl
  : 'https://chat-app-wv5a.onrender.com/api';

/** Returns the resolved API base URL. Use this instead of reading NEXT_PUBLIC_API_URL directly. */
export function getApiBaseUrl(): string {
  return BASE_URL;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('teams_token');
}

export function saveToken(token: string) {
  localStorage.setItem('teams_token', token);
}

export function clearToken() {
  localStorage.removeItem('teams_token');
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  // 401 / 403 both mean the session is no longer valid — clear the token so
  // the auth layer can redirect to login cleanly instead of looping on errors.
  if (res.status === 401 || res.status === 403) {
    clearToken();
    throw new Error(data.message || 'Session expired. Please login again.');
  }

  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong.');
  }

  return data;
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
};
