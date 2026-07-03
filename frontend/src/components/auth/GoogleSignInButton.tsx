/**
 * GoogleSignInButton.tsx
 *
 * Renders a custom "Continue with Google" button labeled via i18next (en / ru / it).
 * An invisible official Google button overlay handles the OAuth click so we still
 * receive a credential JWT for POST /auth/google.
 */

import { useEffect, useRef } from 'react';
import { useGoogleOAuth, type CredentialResponse } from '@react-oauth/google';
import { useTranslation } from 'react-i18next';
import { normalizeInterfaceLanguage } from '../../i18n';
import { isGoogleAuthEnabled } from './GoogleAuthProvider';

interface GoogleSignInButtonProps {
  // Receives the Google ID token JWT to send to POST /auth/google.
  onSuccess: (credential: string) => void;
  // Called when the Google popup fails or returns no credential.
  onError?: () => void;
  disabled?: boolean;
}

// Renders the multicolor Google "G" mark for the custom sign-in button.
function GoogleGIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  disabled = false,
}: GoogleSignInButtonProps) {
  const { t, i18n } = useTranslation();
  const { clientId, scriptLoadedSuccessfully } = useGoogleOAuth();
  const overlayRef = useRef<HTMLDivElement>(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  // Keeps GIS button locale aligned with the active app language.
  const googleLocale = normalizeInterfaceLanguage(i18n.language);

  useEffect(() => {
    if (!scriptLoadedSuccessfully || !overlayRef.current || !clientId || disabled) {
      return;
    }

    const googleApi = (window as Window & { google?: { accounts?: { id?: {
      initialize: (config: Record<string, unknown>) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    } } } }).google?.accounts?.id;

    if (!googleApi) {
      return;
    }

    overlayRef.current.innerHTML = '';

    googleApi.initialize({
      client_id: clientId,
      callback: (credentialResponse: CredentialResponse) => {
        if (credentialResponse.credential) {
          onSuccessRef.current(credentialResponse.credential);
          return;
        }
        onErrorRef.current?.();
      },
    });

    googleApi.renderButton(overlayRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      width: 320,
      locale: googleLocale,
      text: 'continue_with',
    });
  }, [scriptLoadedSuccessfully, clientId, googleLocale, disabled]);

  if (!isGoogleAuthEnabled()) {
    return null;
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '42px',
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          background: '#FFFFFF',
          border: '1.5px solid #E8E8F0',
          borderRadius: '9px',
          fontSize: '13px',
          fontWeight: 600,
          color: '#18181B',
          pointerEvents: 'none',
        }}
      >
        <GoogleGIcon />
        {t('auth.continueWithGoogle')}
      </div>
      <div
        ref={overlayRef}
        aria-label={t('auth.continueWithGoogle')}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.01,
          zIndex: 1,
          overflow: 'hidden',
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

// Renders a horizontal "or" divider between Google sign-in and email fields.
export function AuthDivider() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        margin: '12px 0 10px',
      }}
    >
      <div style={{ flex: 1, height: 1, background: '#E8E8F0' }} />
      <span style={{ fontSize: '11px', color: '#A1A1AA', fontWeight: 500 }}>
        {t('auth.orContinueWithEmail')}
      </span>
      <div style={{ flex: 1, height: 1, background: '#E8E8F0' }} />
    </div>
  );
}
