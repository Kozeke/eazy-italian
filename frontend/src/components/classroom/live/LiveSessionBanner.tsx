/**
 * LiveSessionBanner.tsx
 *
 * Intentionally renders nothing.
 * The live sync is transparent (Google-Docs style) — no banners or indicators.
 * This file exists only to satisfy the existing import in ClassroomPage.tsx.
 *
 * If you ever need to add a subtle "Live" dot in the ClassroomHeader, do it
 * there using `useLiveSession().connected` — not here.
 */

export function LiveSessionBanner() {
  return null;
}