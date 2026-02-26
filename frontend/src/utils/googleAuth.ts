// Google OAuth utility functions

interface GoogleUser {
  email: string;
  given_name: string;
  family_name: string;
  picture?: string;
  sub: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: {
              credential: string;
            }) => void;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

// Load Google Identity Services script
export const loadGoogleScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.google) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google script'));
    document.head.appendChild(script);
  });
};

// Get Google Client ID from environment or use a default
const getGoogleClientId = (): string => {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
};

// Decode JWT token to get user info
const decodeJWT = (token: string): GoogleUser | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
};

// Initialize Google Sign-In
export const initializeGoogleSignIn = (
  onSuccess: (user: GoogleUser) => void,
  onError: (error: Error) => void
): void => {
  const clientId = getGoogleClientId();
  
  if (!clientId) {
    onError(new Error('Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your .env file.'));
    return;
  }

  loadGoogleScript()
    .then(() => {
      if (!window.google) {
        onError(new Error('Google script failed to load'));
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          const user = decodeJWT(response.credential);
          if (user) {
            onSuccess(user);
          } else {
            onError(new Error('Failed to decode user information'));
          }
        },
      });

      window.google.accounts.id.prompt();
    })
    .catch((error) => {
      onError(error);
    });
};

// Trigger Google Sign-In
export const signInWithGoogle = (
  onSuccess: (user: GoogleUser) => void,
  onError: (error: Error) => void
): void => {
  const clientId = getGoogleClientId();
  
  if (!clientId) {
    onError(new Error('Google Client ID is not configured'));
    return;
  }

  loadGoogleScript()
    .then(() => {
      if (!window.google) {
        onError(new Error('Google script failed to load'));
        return;
      }

      window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'email profile',
        callback: (response) => {
          if (response.access_token) {
            // Use the access token to get user info
            fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: {
                Authorization: `Bearer ${response.access_token}`,
              },
            })
              .then((res) => res.json())
              .then((data) => {
                onSuccess({
                  email: data.email,
                  given_name: data.given_name || '',
                  family_name: data.family_name || '',
                  picture: data.picture,
                  sub: data.id,
                });
              })
              .catch((error) => {
                onError(new Error('Failed to fetch user information'));
              });
          }
        },
      }).requestAccessToken();
    })
    .catch((error) => {
      onError(error);
    });
};

// Alternative: Use One Tap Sign-In (simpler) - Button-based approach
export const signInWithGoogleOneTap = (
  onSuccess: (user: GoogleUser) => void,
  onError: (error: Error) => void
): void => {
  const clientId = getGoogleClientId();
  
  if (!clientId) {
    onError(new Error('Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your .env file.'));
    return;
  }

  loadGoogleScript()
    .then(() => {
      if (!window.google) {
        onError(new Error('Google script failed to load'));
        return;
      }

      // Use button-based approach instead of One Tap for better compatibility
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          const user = decodeJWT(response.credential);
          if (user) {
            onSuccess(user);
          } else {
            onError(new Error('Failed to decode user information'));
          }
        },
      });

      // Render button programmatically
      window.google.accounts.id.renderButton(
        document.createElement('div'), // We'll trigger it manually
        {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
        }
      );

      // Trigger the sign-in flow
      window.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // If One Tap is not available, use the button click approach
          // This will show the Google Sign-In popup
          const button = document.createElement('button');
          button.style.display = 'none';
          document.body.appendChild(button);
          
          window.google.accounts.id.renderButton(button, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
          });
          
          // Trigger click programmatically
          setTimeout(() => {
            (button as HTMLElement).click();
            document.body.removeChild(button);
          }, 100);
        }
      });
    })
    .catch((error) => {
      onError(error);
    });
};

// Button-based Google Sign-In (more reliable)
export const signInWithGoogleButton = (
  onSuccess: (user: GoogleUser) => void,
  onError: (error: Error) => void
): void => {
  const clientId = getGoogleClientId();
  
  if (!clientId) {
    onError(new Error('Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your .env file.'));
    return;
  }

  loadGoogleScript()
    .then(() => {
      if (!window.google) {
        onError(new Error('Google script failed to load'));
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          try {
            const user = decodeJWT(response.credential);
            if (user) {
              onSuccess(user);
            } else {
              onError(new Error('Failed to decode user information'));
            }
          } catch (error: any) {
            onError(new Error('Failed to process Google sign-in: ' + (error.message || 'Unknown error')));
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Trigger the sign-in popup directly
      // This will show the Google Sign-In popup
      window.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed()) {
          // If prompt is not displayed, try alternative method
          console.log('One Tap not available, trying alternative method');
          // Create a temporary button and click it
          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'fixed';
          tempDiv.style.left = '-9999px';
          document.body.appendChild(tempDiv);
          
          window.google.accounts.id.renderButton(tempDiv, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
          });
          
          setTimeout(() => {
            const button = tempDiv.querySelector('div[role="button"]') as HTMLElement;
            if (button) {
              button.click();
            }
            setTimeout(() => document.body.removeChild(tempDiv), 1000);
          }, 100);
        } else if (notification.isSkippedMoment()) {
          console.log('One Tap was skipped');
        } else if (notification.isDismissedMoment()) {
          console.log('One Tap was dismissed');
        }
      });
    })
    .catch((error) => {
      onError(new Error('Failed to load Google Sign-In: ' + (error.message || 'Unknown error')));
    });
};
