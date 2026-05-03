/**
 * Public SPA origin for share links (protocol + host + port), not the REST API host.
 * Set VITE_APP_ORIGIN in .env (e.g. http://localhost:3000); falls back to window.location.origin.
 */

/** Trims trailing slashes from an origin string */
function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

/**
 * Returns the base URL where users open the web app — used to build /teacher/classroom/… and /student/classroom/… links.
 */
export function getAppOrigin(): string {
  const fromEnv = import.meta.env.VITE_APP_ORIGIN as string | undefined;
  const trimmed = fromEnv?.trim();
  if (trimmed) return normalizeOrigin(trimmed);
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
