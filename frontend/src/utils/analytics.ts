/**
 * Google Analytics 4 (GA4) initialization and helpers for the SPA.
 * Measurement ID is read from VITE_GA_MEASUREMENT_ID; tracking is skipped when unset.
 */

import ReactGA from 'react-ga4';

// GA4 measurement ID from Vite env (e.g. G-XXXXXXXXXX); empty in local dev when not configured
const measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID ?? '').trim();

// Whether GA4 was successfully initialized for this session
let isInitialized = false;

/** sessionStorage key for checkout context between Stripe redirect and /success */
export const PENDING_CHECKOUT_STORAGE_KEY = 'ga_pending_checkout';

/** Checkout metadata stored before redirecting to Stripe Checkout */
export type PendingCheckout = {
  plan: 'standard' | 'pro';
  duration: string;
  value: number;
  currency: string;
};

/**
 * Initializes GA4 once at app startup when a measurement ID is configured.
 */
export function initAnalytics(): void {
  if (isInitialized || !measurementId) return;

  ReactGA.initialize(measurementId);
  isInitialized = true;
}

/**
 * Sends a pageview hit for SPA route changes (pathname + query string).
 */
export function trackPageView(path: string): void {
  if (!isInitialized) return;

  ReactGA.send({
    hitType: 'pageview',
    page: path,
  });
}

/**
 * Sends a custom GA4 event (e.g. button clicks, form submissions).
 */
export function trackEvent(options: {
  category: string;
  action: string;
  label?: string;
  value?: number;
}): void {
  if (!isInitialized) return;

  ReactGA.event(options);
}

/**
 * Fires GA4 recommended sign_up after a new account is created.
 */
export function trackSignUp(role: 'teacher' | 'student'): void {
  if (!isInitialized) return;

  ReactGA.gtag('event', 'sign_up', {
    method: 'email',
    role,
  });
}

/**
 * Persists checkout details so purchase can be attributed after the Stripe redirect.
 */
export function storePendingCheckout(checkout: PendingCheckout): void {
  try {
    sessionStorage.setItem(PENDING_CHECKOUT_STORAGE_KEY, JSON.stringify(checkout));
  } catch {
    // Ignore quota/private-mode errors so checkout redirect still works
  }
}

/**
 * Reads and clears checkout context written before Stripe redirect.
 */
export function consumePendingCheckout(): PendingCheckout | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CHECKOUT_STORAGE_KEY);
    sessionStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingCheckout;
  } catch {
    return null;
  }
}

/**
 * Fires GA4 begin_checkout when the user starts a tariff subscription checkout.
 */
export function trackBeginCheckout(checkout: PendingCheckout): void {
  if (!isInitialized) return;

  ReactGA.gtag('event', 'begin_checkout', {
    currency: checkout.currency,
    value: checkout.value,
    items: [
      {
        item_id: checkout.plan,
        item_name: checkout.plan,
        item_category: 'subscription',
        item_variant: checkout.duration,
        price: checkout.value,
        quantity: 1,
      },
    ],
  });
}

/**
 * Fires GA4 purchase on the post-checkout success page.
 */
export function trackPurchase(checkout: PendingCheckout): void {
  if (!isInitialized) return;

  ReactGA.gtag('event', 'purchase', {
    currency: checkout.currency,
    value: checkout.value,
    items: [
      {
        item_id: checkout.plan,
        item_name: checkout.plan,
        item_category: 'subscription',
        item_variant: checkout.duration,
        price: checkout.value,
        quantity: 1,
      },
    ],
  });
}
