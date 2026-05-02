/**
 * apiClient.ts
 *
 * Drop-in authenticated fetch wrapper with automatic JWT token refresh.
 *
 * Problem solved:
 *   Raw fetch() calls across the app read `token` from localStorage and send it
 *   in the Authorization header. When the access token expires the server returns
 *   401 and the request fails — the user has to manually refresh the page.
 *
 * How it works:
 *   1. Sends the request with the current access token.
 *   2. If the response is 401, calls POST /auth/refresh with the stored refresh_token.
 *   3. Saves the new access token to localStorage.
 *   4. Re-sends the original request with the new token.
 *   5. If multiple requests fire simultaneously and all receive 401, only ONE refresh
 *      call is made — the rest are queued and replayed once the token is ready.
 *   6. If the refresh itself fails (refresh token expired / missing), clears all
 *      stored tokens and dispatches the "auth:logout" window event so AuthProvider
 *      can reset state and redirect to /login.
 *
 * Usage (replaces raw fetch):
 *   import { fetchWithAuth } from '../services/apiClient';
 *
 *   // Before
 *   const token = localStorage.getItem('token') ?? '';
 *   const res = await fetch(url, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
 *     body: JSON.stringify(body),
 *   });
 *
 *   // After — no need to read or pass the token manually
 *   const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify(body) });
 */

import { API_BASE_URL } from './api';

// Same origin as axios `api` client so refresh matches VITE_API_BASE_URL (not relative /api/v1 on :3000).
const API_BASE = API_BASE_URL;

// ── Internal refresh-queue state ──────────────────────────────────────────────

/** True while a refresh call is already in flight. */
let isRefreshing = false;

/**
 * Requests queued while a refresh is in progress.
 * Each entry holds resolve/reject for a promise that will settle once the
 * new token is available (resolve) or the refresh fails (reject).
 */
let pendingQueue: Array<{
  resolve: (newToken: string) => void;
  reject:  (err: unknown)    => void;
}> = [];

/** Settle all queued promises with a new token or an error. */
function flushQueue(newToken: string | null, err: unknown = null): void {
  pendingQueue.forEach(({ resolve, reject }) =>
    newToken ? resolve(newToken) : reject(err)
  );
  pendingQueue = [];
}

// ── Token refresh ─────────────────────────────────────────────────────────────

/**
 * Calls POST /auth/refresh, persists the new access token, and returns it.
 * Throws if the refresh token is missing or the server rejects it.
 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    throw new Error('No refresh token available — cannot refresh session.');
  }

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed with status ${res.status}`);
  }

  const data = await res.json();
  const newAccessToken: string = data.access_token;
  localStorage.setItem('token', newAccessToken);
  return newAccessToken;
}

/** Clears stored tokens and notifies the app that the session has ended. */
function forceLogout(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  window.dispatchEvent(new Event('auth:logout'));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Authenticated fetch wrapper.
 *
 * Automatically injects the Authorization header, and silently refreshes
 * the access token on 401 before retrying the original request once.
 *
 * @param input  - URL string or Request object (same as fetch's first arg).
 * @param init   - RequestInit options. Do NOT include Authorization — it is
 *                 injected automatically. Content-Type defaults to application/json.
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init:  RequestInit = {},
): Promise<Response> {
  const currentToken = localStorage.getItem('token') ?? '';

  /** Build a fetch call with the given token injected into headers. */
  const makeRequest = (token: string): Promise<Response> =>
    fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        // Allow callers to override Content-Type (e.g. multipart/form-data).
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });

  // ── First attempt ─────────────────────────────────────────────────────────
  const response = await makeRequest(currentToken);

  // Not a 401 — return directly (covers 2xx, 4xx errors, 5xx, etc.).
  if (response.status !== 401) return response;

  // ── 401 received — decide whether to refresh or queue ────────────────────

  if (isRefreshing) {
    /**
     * Another request is already refreshing the token.
     * Queue this one so it replays as soon as the new token is ready,
     * without making a second redundant refresh call.
     */
    return new Promise<Response>((resolve, reject) => {
      pendingQueue.push({
        resolve: (newToken) => resolve(makeRequest(newToken)),
        reject,
      });
    });
  }

  // ── This request triggers the one refresh call ────────────────────────────
  isRefreshing = true;

  try {
    const newToken = await refreshAccessToken();
    flushQueue(newToken);          // replay all queued requests
    return makeRequest(newToken);  // replay this request
  } catch (err) {
    flushQueue(null, err);  // reject all queued requests
    forceLogout();          // clear tokens + notify AuthProvider
    throw err;
  } finally {
    isRefreshing = false;
  }
}