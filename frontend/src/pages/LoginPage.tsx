import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { signInWithGoogleButton } from '../utils/googleAuth';
import './AuthPage.css';

interface LoginFormData {
  email: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, register: registerUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>();

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const loggedInUser = await login(data.email, data.password);
      toast.success(t('auth.loginSuccess') || 'Successfully logged in!');
      if (loggedInUser?.role === 'teacher') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || t('auth.loginError') || 'Login error');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePassword = () => {
    setShowPassword(!showPassword);
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      signInWithGoogleButton(
        async (googleUser) => {
          try {
            // Generate a secure random password for Google OAuth users
            const generatePassword = () => {
              return `go_${Date.now()}_${Math.random().toString(36).slice(2, 15)}_${Math.random().toString(36).slice(2, 15)}`;
            };

            const tempPassword = generatePassword();
            
            // Try to register the user (will fail if already exists, which is fine)
            try {
              await registerUser({
                email: googleUser.email,
                first_name: googleUser.given_name || 'User',
                last_name: googleUser.family_name || '',
                password: tempPassword,
                role: 'student',
              });
              // Registration successful, now login
              const loggedInUser = await login(googleUser.email, tempPassword);
              toast.success(t('auth.loginSuccess') || 'Successfully logged in!');
              if (loggedInUser?.role === 'teacher') {
                navigate('/admin');
              } else {
                navigate('/dashboard');
              }
            } catch (registerError: any) {
              // User might already exist, try to login
              // Note: This won't work if user registered with email/password
              // In production, you'd need a backend endpoint for Google OAuth
              if (registerError.response?.status === 400) {
                toast.error(
                  t('auth.googleUserExists') ||
                    'An account with this email already exists. Please use email/password login or contact support to link your Google account.'
                );
              } else {
                throw registerError;
              }
            }
            setIsLoading(false);
          } catch (error: any) {
            toast.error(
              error.message ||
                t('auth.googleSignInError') ||
                'Google Sign-In failed. Please try again or use email/password.'
            );
            setIsLoading(false);
          }
        },
        (error) => {
          toast.error(error.message || 'Failed to sign in with Google');
          setIsLoading(false);
        }
      );
    } catch (error: any) {
      toast.error(error.message || 'Failed to initialize Google Sign-In');
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-wrapper">
        {/* LEFT PANEL */}
        <div className="panel-left">
          <Link to="/" className="logo">
            Teach<span>Flow</span>
          </Link>

          <div className="panel-illustration">
            <h2
              className="panel-headline"
              dangerouslySetInnerHTML={{
                __html: t('auth.authPanel.headline'),
              }}
            />
            <p className="panel-sub">{t('auth.authPanel.subtitle')}</p>

            <div className="mini-cards">
              <div className="mini-card">
                <div className="mini-card-icon">📚</div>
                <div className="mini-card-text">
                  <strong>{t('auth.authPanel.stats.courses')}</strong>
                  <span>{t('auth.authPanel.stats.coursesDesc')}</span>
                </div>
              </div>
              <div className="mini-card">
                <div className="mini-card-icon">👩‍🎓</div>
                <div className="mini-card-text">
                  <strong>{t('auth.authPanel.stats.students')}</strong>
                  <span>{t('auth.authPanel.stats.studentsDesc')}</span>
                </div>
              </div>
              <div className="mini-card">
                <div className="mini-card-icon">⚡</div>
                <div className="mini-card-text">
                  <strong>{t('auth.authPanel.stats.timeSaved')}</strong>
                  <span>{t('auth.authPanel.stats.timeSavedDesc')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="panel-footer">{t('auth.authPanel.footer')}</div>
        </div>

        {/* RIGHT PANEL */}
        <div className="panel-right">
          <div className="form-card">
            <div className="tabs">
              <button className="tab-btn active">{t('auth.authForm.signIn')}</button>
              <Link to="/register" className="tab-btn">
                {t('auth.authForm.createAccount')}
              </Link>
            </div>

            <div className="view active">
              <h1
                className="form-title"
                dangerouslySetInnerHTML={{
                  __html: t('auth.authForm.welcomeBack'),
                }}
              />
              <p className="form-tagline">{t('auth.authForm.welcomeSubtitle')}</p>

              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="field">
                  <label>{t('auth.authForm.emailLabel')}</label>
                  <input
                    type="email"
                    placeholder={t('auth.authForm.emailPlaceholder')}
                    autoComplete="email"
                    className={errors.email ? 'error' : ''}
                    {...register('email', {
                      required: t('auth.emailRequired') || 'Email is required',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: t('auth.emailInvalid') || 'Invalid email format',
                      },
                    })}
                  />
                  {errors.email && (
                    <p className="field-error">{errors.email.message}</p>
                  )}
                </div>

                <div className="field field-pass">
                  <label>{t('auth.authForm.passwordLabel')}</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="login-pass"
                    placeholder={t('auth.authForm.passwordPlaceholder')}
                    autoComplete="current-password"
                    className={errors.password ? 'error' : ''}
                    {...register('password', {
                      required: t('auth.passwordRequired') || 'Password is required',
                      minLength: {
                        value: 6,
                        message:
                          t('auth.passwordMinLength') ||
                          'Password must be at least 6 characters',
                      },
                    })}
                  />
                  <button
                    type="button"
                    className="pass-toggle"
                    onClick={togglePassword}
                    tabIndex={-1}
                  >
                    {showPassword ? '🔒' : '👁'}
                  </button>
                  {errors.password && (
                    <p className="field-error">{errors.password.message}</p>
                  )}
                </div>

                <Link to="/forgot-password" className="forgot-link">
                  {t('auth.authForm.forgotPassword')}
                </Link>

                <button
                  type="submit"
                  className="submit-btn"
                  disabled={isLoading}
                >
                  <span>
                    {isLoading
                      ? t('auth.loggingIn') || 'Logging in...'
                      : t('auth.authForm.signInButton')}
                  </span>
                </button>
              </form>

              <div className="form-divider">
                <span>{t('auth.authForm.continueWith')}</span>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="social-btn"
                disabled={isLoading}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t('auth.authForm.continueGoogle')}
              </button>

              <p className="switch-link">
                {t('auth.authForm.dontHaveAccount')}{' '}
                <Link to="/register">{t('auth.authForm.createOneFree')}</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
