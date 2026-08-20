/**
 * useAuthMobileFix.ts
 *
 * Root cause of "opens from Instagram bio → page zooms into top-right corner,
 * register form not visible":
 *
 * Instagram/Facebook/TikTok open links in their own in-app WKWebView, not real
 * Safari. React's `autoFocus` prop is not the HTML attribute — React calls
 * .focus() imperatively the moment the component mounts, which is *before*
 * webfonts have loaded and layout has settled. The in-app WebView starts its
 * keyboard zoom animation against that half-settled layout and latches the
 * viewport onto a stale element rect, which reads to the user as "zoomed into
 * the corner, form gone". Real Safari and Chrome do not do this, so the
 * behavior change is scoped to detected in-app browsers only.
 *
 * Scope note: the race exists on ROUTE ENTRY, not on page load. It fires just
 * as reliably when the landing page is already open and the user taps through
 * to /register client-side — React mounts the route and calls .focus() in the
 * same commit, before the new route has been laid out, so the WebView latches
 * onto a rect that is still at the origin. That reads as "zoomed into the
 * top-left corner, form gone". Steps that mount later within an already-
 * visible page (OTP entry, details form) are safe to autofocus normally,
 * because layout has long since settled — this module does not suppress those.
 */

import { useEffect, useState } from 'react';

// Window after an auth page *component mounts* during which its layout is
// treated as still settling. Anchored to mount rather than to module eval or
// document.readyState, because in an SPA the fragile moment is route entry —
// which happens on client-side navigation just as much as on a cold load.
const ROUTE_SETTLE_WINDOW_MS = 1200;

// Detects known in-app browser WebViews (Instagram, Facebook, TikTok, LINE,
// Snapchat, Twitter/X). Regular Safari/Chrome deliberately do not match.
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /Instagram/i.test(ua) ||
    /FBAN|FBAV|FB_IAB/i.test(ua) ||
    /Line\//i.test(ua) ||
    /TikTok|musical_ly|BytedanceWebview/i.test(ua) ||
    /Snapchat/i.test(ua) ||
    /Twitter/i.test(ua)
  );
}

/**
 * Use in place of a bare `autoFocus` prop on the first field of an auth form.
 *
 * In an in-app browser this starts false and flips to true once the page has
 * had ROUTE_SETTLE_WINDOW_MS to lay out. Normal browsers get true immediately
 * and are never affected.
 *
 * The value is deliberately LIVE rather than frozen, which is the opposite of
 * what it used to be. React only honours `autoFocus` when an input mounts, so:
 *   - the first field, which mounts in the same commit as the page, reads
 *     false and never steals focus during route entry — the flip afterwards is
 *     invisible to it, because it is already mounted;
 *   - fields that mount later in the flow (details, OTP) read the settled true
 *     and keep their autofocus, since layout has long since stabilised.
 * That is exactly the split we want, and it needs no call-site changes.
 *
 * Why not the old readyState/elapsed check: on a client-side navigation
 * (landing → /register) the document has been `complete` for a long time, so
 * that check reported "not first paint" and let the email field autofocus into
 * a freshly-mounted, not-yet-laid-out route. Anchoring to mount fixes it.
 */
export function useSafeAutoFocus(): boolean {
  const [safe, setSafe] = useState(() => !isInAppBrowser());

  useEffect(() => {
    if (safe) return;
    const timer = window.setTimeout(() => setSafe(true), ROUTE_SETTLE_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [safe]);

  return safe;
}

/**
 * Repairs the viewport for in-app browsers, then puts it back exactly as it
 * was on unmount.
 *
 * Two things happen, both only inside in-app browsers:
 *   1. If the viewport meta tag is missing entirely, a correct one is added.
 *      A missing tag alone is enough to cause this bug before any JS runs.
 *   2. A one-shot zoom reset: clamp maximum-scale for a single frame, then
 *      release it. This is what actually unsticks an already-zoomed WKWebView
 *      (scrollTo cannot — scroll position and zoom scale are separate).
 *
 * The clamp is released on the next frame and the original attribute value is
 * restored on unmount, so pinch-to-zoom is never permanently disabled. That
 * matters both for accessibility (WCAG 1.4.4) and because this app is a SPA —
 * a permanent change here would leak into every page the user visits next.
 */
export function useAuthViewportGuard(): void {
  useEffect(() => {
    if (!isInAppBrowser()) return;

    const head = document.head;
    if (!head) return;

    const existing = head.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const meta: HTMLMetaElement = existing ?? document.createElement('meta');

    // Remembers what to put back, and whether we own the tag we created.
    const createdByUs = existing === null;
    const originalContent = existing ? existing.getAttribute('content') : null;
    const baseContent =
      originalContent ?? 'width=device-width, initial-scale=1, viewport-fit=cover';

    if (createdByUs) {
      meta.setAttribute('name', 'viewport');
      meta.setAttribute('content', baseContent);
      head.appendChild(meta);
    }

    // One-shot zoom reset: clamp, let the engine apply it, then release.
    // Strips any scale keys already in the tag first, so we never emit a
    // duplicated key like "maximum-scale=1, ..., maximum-scale=1".
    const clampBase = baseContent
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part && !/^(maximum-scale|user-scalable)\s*=/i.test(part))
      .join(', ');
    meta.setAttribute('content', `${clampBase}, maximum-scale=1`);
    const frame = requestAnimationFrame(() => {
      meta.setAttribute('content', baseContent);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (createdByUs) {
        meta.remove();
        return;
      }
      // Restores the page's own viewport exactly, clamp included or not.
      if (originalContent === null) meta.removeAttribute('content');
      else meta.setAttribute('content', originalContent);
    };
  }, []);
}