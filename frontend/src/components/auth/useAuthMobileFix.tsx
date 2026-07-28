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
 * Scope note: the race only exists on the FIRST paint of a page load. Steps
 * that mount later in a flow (OTP entry, details form) are safe to autofocus
 * normally, because layout has long since settled by then — so this module
 * deliberately does not suppress those.
 */

import { useEffect, useState } from 'react';

// Captures when this module was first evaluated, which is as close to
// "navigation start" as we can get from inside the bundle. Used to tell a
// first-paint mount apart from a later in-flow step mount.
const moduleInitAt = typeof performance !== 'undefined' ? performance.now() : 0;

// Window after page load during which a mount is treated as "first paint".
const FIRST_PAINT_WINDOW_MS = 1500;

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

// True only while we are still inside the fragile first-paint window.
function isDuringFirstPaint(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.readyState === 'complete') {
    const elapsed =
      typeof performance !== 'undefined' ? performance.now() - moduleInitAt : Infinity;
    return elapsed < FIRST_PAINT_WINDOW_MS;
  }
  return true;
}

/**
 * Use in place of a bare `autoFocus` prop on the first field of an auth form.
 *
 * Returns false ONLY when we are in an in-app browser during first paint —
 * i.e. exactly the case that triggers the zoom bug. Normal browsers, and
 * later-mounting steps in any browser, keep their existing autofocus.
 *
 * The value is captured once via the useState initializer so it stays stable
 * for the lifetime of the component. This matters: React only honours
 * `autoFocus` at mount, so a value that flipped on a later render would be
 * silently ignored and would only cause confusion.
 */
export function useSafeAutoFocus(): boolean {
  const [safe] = useState(() => !(isInAppBrowser() && isDuringFirstPaint()));
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