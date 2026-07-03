/**
 * EEA cookie consent banner — grants GA4 Consent Mode before analytics fires.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getCookieConsent,
  setCookieConsent,
  type CookieConsentChoice,
} from '../../utils/consent';
import { trackPageView } from '../../utils/analytics';

/**
 * Bottom banner shown until the user accepts or declines optional analytics cookies.
 */
export default function CookieConsent() {
  const { t } = useTranslation();
  // Whether the banner should be visible (null = still checking storage)
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  // Persists choice, hides banner, and sends the current pageview after accept
  const handleChoice = (choice: CookieConsentChoice) => {
    setCookieConsent(choice);
    setVisible(false);
    if (choice === 'granted') {
      trackPageView(window.location.pathname + window.location.search);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('cookieConsent.title', { defaultValue: 'Cookie preferences' })}
      className="fixed inset-x-0 bottom-0 z-[9999] border-t border-[#E8E8F0] bg-white/95 px-4 py-4 shadow-[0_-8px_32px_rgba(24,24,27,0.12)] backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-900">
            {t('cookieConsent.title', { defaultValue: 'We use cookies' })}
          </p>
          <p className="mt-1">
            {t('cookieConsent.body', {
              defaultValue:
                'We use analytics cookies to understand how LinguAI is used and improve the product. You can accept or decline optional cookies. Essential cookies are always active.',
            })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleChoice('denied')}
            className="rounded-xl border border-[#E8E8F0] bg-white px-4 py-2 text-sm font-bold text-[#4F52C2] transition hover:border-violet-300 hover:bg-violet-50"
          >
            {t('cookieConsent.decline', { defaultValue: 'Decline' })}
          </button>
          <button
            type="button"
            onClick={() => handleChoice('granted')}
            className="rounded-xl border border-violet-600 bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700"
          >
            {t('cookieConsent.accept', { defaultValue: 'Accept' })}
          </button>
        </div>
      </div>
    </div>
  );
}
