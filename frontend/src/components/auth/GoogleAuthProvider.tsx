/**
 * GoogleAuthProvider.tsx
 *
 * Wraps the app with Google Identity Services using the active i18next locale so
 * the GIS script loads with ?hl= and re-initializes when the user switches language.
 */

import React from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useTranslation } from 'react-i18next';
import { normalizeInterfaceLanguage } from '../../i18n';

// Stores the OAuth client id from Vite env (must match backend GOOGLE_CLIENT_ID).
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface GoogleAuthProviderProps {
  children: React.ReactNode;
}

export function isGoogleAuthEnabled(): boolean {
  return Boolean(googleClientId?.trim());
}

export default function GoogleAuthProvider({ children }: GoogleAuthProviderProps) {
  const { i18n } = useTranslation();

  if (!isGoogleAuthEnabled() || !googleClientId) {
    return <>{children}</>;
  }

  // Maps app language (en / ru / it) to the GIS hl parameter and renderButton locale.
  const googleLocale = normalizeInterfaceLanguage(i18n.language);

  return (
    <GoogleOAuthProvider clientId={googleClientId} locale={googleLocale}>
      {children}
    </GoogleOAuthProvider>
  );
}
