/**
 * Cookie consent storage and GA4 Consent Mode v2 updates for EEA visitors.
 */

// localStorage key for the user's analytics/cookie choice
export const COOKIE_CONSENT_KEY = 'linguai_cookie_consent';

/** Valid stored consent values */
export type CookieConsentChoice = 'granted' | 'denied';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Returns the stored cookie consent choice, if any.
 */
export function getCookieConsent(): CookieConsentChoice | null {
  try {
    const value = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (value === 'granted' || value === 'denied') return value;
    return null;
  } catch {
    return null;
  }
}

/**
 * Applies GA4 Consent Mode update and persists the user's choice.
 */
export function setCookieConsent(choice: CookieConsentChoice): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, choice);
  } catch {
    // Private browsing may block storage; still apply in-memory consent for this session
  }

  if (typeof window.gtag !== 'function') return;

  const granted = choice === 'granted';
  window.gtag('consent', 'update', {
    ad_storage: granted ? 'granted' : 'denied',
    ad_user_data: granted ? 'granted' : 'denied',
    ad_personalization: granted ? 'granted' : 'denied',
    analytics_storage: granted ? 'granted' : 'denied',
  });
}

/**
 * Whether analytics hits are allowed for this browser session.
 */
export function hasAnalyticsConsent(): boolean {
  return getCookieConsent() === 'granted';
}
