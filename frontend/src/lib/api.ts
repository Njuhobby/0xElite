// Authenticated fetch wrapper. Reads JWT from localStorage, attaches
// Authorization header, rotates on X-New-Token (sliding window), and
// dispatches `auth:expired` on 401 so AuthProvider can drop the token.
//
// Use this for any backend mutation. GET endpoints that don't require auth
// can use plain fetch.

export const TOKEN_KEY = 'auth_token';
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new CustomEvent('auth:rotated', { detail: { token } }));
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });

  const newToken = res.headers.get('X-New-Token');
  if (newToken) setToken(newToken);

  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  return res;
}
