const _rawApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const BASE_URL = _rawApiUrl.startsWith('http')
  ? _rawApiUrl
  : 'https://chat-app-dzn1.onrender.com/api';

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

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // Send HTTP-Only cookies with every request (mobile fix)
    });
  } catch (networkErr) {
    // fetch rejects on network failure / CORS / server unreachable — surface a clear,
    // non-crashing error instead of an opaque "Something went wrong" from a later parse.
    throw new Error('Network error — could not reach the server. Check your connection.');
  }

  // Parse the body defensively: a 5xx/gateway error or empty body may not be JSON,
  // and calling res.json() on it would throw a confusing SyntaxError that crashes the UI.
  const rawText = await res.text();
  let data: any = null;
  if (rawText) {
    try { data = JSON.parse(rawText); } catch { data = { message: rawText }; }
  }

  // Error messages may live at data.message OR data.error.message (the rate limiter
  // nests it under `error`). Check both so the real reason surfaces, not a generic one.
  const errMessage = data?.message || data?.error?.message;

  // 401 / 403 both mean the session is no longer valid — clear the token so
  // the auth layer can redirect to login cleanly instead of looping on errors.
  if (res.status === 401 || res.status === 403) {
    clearToken();
    throw new Error(errMessage || 'Session expired. Please login again.');
  }

  if (!res.ok) {
    throw new Error(errMessage || `Request failed (${res.status} ${res.statusText}).`);
  }

  return data as T;
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
