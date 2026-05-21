const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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
  isRetry: boolean = false
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

  // If 403 Forbidden and not already retrying, try to refresh token
  if (res.status === 403 && !isRetry && endpoint !== '/auth/refresh') {
    try {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const refreshData = await refreshRes.json();

      if (refreshRes.ok && refreshData.token) {
        saveToken(refreshData.token);
        // Retry the original request with new token
        return request<T>(endpoint, options, true);
      } else {
        clearToken();
        throw new Error('Session expired. Please login again.');
      }
    } catch (err) {
      clearToken();
      throw err;
    }
  }
  // If 401 Unauthorized, clear token immediately
  if (res.status === 401) {
    clearToken();
    throw new Error('Unauthorized. Please login again.');
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
