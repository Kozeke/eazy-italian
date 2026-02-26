import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { signInWithGoogleButton } from '../utils/googleAuth';
import './AuthPage.css';

interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
  first_name: string;
  last_name: string;
  role: 'student' | 'teacher';
  school?: string;
  subject?: string;
}

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register: registerUser, login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher'>('student');
  const [passwordStrength, setPasswordStrength] = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormData>({
    defaultValues: {
      role: 'student',
    },
  });

  const password = watch('password');

  useEffect(() => {
    setValue('role', selectedRole);
  }, [selectedRole, setValue]);

  useEffect(() => {
    if (password) {
      checkPasswordStrength(password);
    } else {
      setPasswordStrength(0);
    }
  }, [password]);

  const checkPasswordStrength = (val: string) => {
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    setPasswordStrength(score);
  };

  const onSubmit = async (data: RegisterFormData) => {
    if (data.password !== data.confirmPassword) {
      toast.error(t('auth.passwordsDoNotMatch') || 'Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const registeredUser = await registerUser({
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role,
      });
      toast.success(t('auth.registerSuccess') || 'Registration successful!');
      if (registeredUser?.role === 'teacher') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast.error(error.message || t('auth.registerError') || 'Registration error');
    } finally {
      setIsLoading(false);
    }
  };

  const selectRole = (role: 'student' | 'teacher') => {
    setSelectedRole(role);
  };

  const getStrengthLabel = () => {
    if (passwordStrength === 0) return t('auth.authForm.passwordHint');
    if (passwordStrength <= 1) return t('auth.authForm.passwordStrength.weak');
    if (passwordStrength === 2) return t('auth.authForm.passwordStrength.medium');
    if (passwordStrength === 3) return t('auth.authForm.passwordStrength.good');
    return t('auth.authForm.passwordStrength.strong');
  };

  const handleGoogleSignUp = async () => {
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
            
            // Register the user
            try {
              const registeredUser = await registerUser({
                email: googleUser.email,
                first_name: googleUser.given_name || 'User',
                last_name: googleUser.family_name || '',
                password: tempPassword,
                role: selectedRole,
              });
              
              toast.success(t('auth.registerSuccess') || 'Registration successful!');
              if (registeredUser?.role === 'teacher') {
                navigate('/admin');
              } else {
                navigate('/dashboard');
              }
            } catch (regError: any) {
              // If registration fails because user exists, try to login
              if (regError.response?.status === 400) {
                try {
                  const loggedInUser = await login(googleUser.email, tempPassword);
                  toast.success(t('auth.loginSuccess') || 'Successfully logged in!');
                  if (loggedInUser?.role === 'teacher') {
                    navigate('/admin');
                  } else {
                    navigate('/dashboard');
                  }
                } catch (loginError: any) {
                  throw new Error('Account exists but Google sign-in is not linked. Please use email/password login.');
                }
              } else {
                throw regError;
              }
            }
            setIsLoading(false);
          } catch (error: any) {
            if (error.response?.status === 400 && error.response?.data?.detail?.includes('already registered')) {
              toast.error(
                t('auth.googleUserExists') ||
                  'An account with this email already exists. Please use email/password login.'
              );
            } else {
              toast.error(error.message || t('auth.registerError') || 'Registration error');
            }
            setIsLoading(false);
          }
        },
        (error) => {
          toast.error(error.message || 'Failed to sign up with Google');
          setIsLoading(false);
        }
      );
    } catch (error: any) {
      toast.error(error.message || 'Failed to initialize Google Sign-In');
      setIsLoading(false);
    }
  };

  const getStrengthClass = (index: number) => {
    if (passwordStrength === 0) return '';
    if (passwordStrength <= 1 && index === 0) return 'weak';
    if (passwordStrength === 2 && index <= 1) return 'medium';
    if (passwordStrength === 3 && index <= 2) return 'strong';
    if (passwordStrength >= 4) return 'strong';
    return '';
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
              <Link to="/login" className="tab-btn">
                {t('auth.authForm.signIn')}
              </Link>
              <button className="tab-btn active">
                {t('auth.authForm.createAccount')}
              </button>
            </div>

            <div className="view active">
              <h1
                className="form-title"
                dangerouslySetInnerHTML={{
                  __html: t('auth.authForm.startSchool'),
                }}
              />
              <p className="form-tagline">{t('auth.authForm.startSubtitle')}</p>

              <form onSubmit={handleSubmit(onSubmit)}>
                {/* ROLE SELECTOR */}
                <div className="role-selector">
                  <div
                    className={`role-card ${selectedRole === 'student' ? 'selected' : ''}`}
                    onClick={() => selectRole('student')}
                  >
                    <span className="role-icon">👩‍🎓</span>
                    <span className="role-label">{t('auth.roleStudent')}</span>
                    <span className="role-sublabel">
                      {t('auth.roleStudentDesc')}
                    </span>
                  </div>
                  <div
                    className={`role-card ${selectedRole === 'teacher' ? 'selected' : ''}`}
                    onClick={() => selectRole('teacher')}
                  >
                    <span className="role-icon">👩‍🏫</span>
                    <span className="role-label">{t('auth.roleTeacher')}</span>
                    <span className="role-sublabel">
                      {t('auth.roleTeacherDesc')}
                    </span>
                  </div>
                </div>

                <input
                  type="hidden"
                  {...register('role', { required: true })}
                />

                <div className="field-row">
                  <div className="field">
                    <label>{t('auth.authForm.firstNameLabel')}</label>
                    <input
                      type="text"
                      placeholder={t('auth.authForm.firstNamePlaceholder')}
                      autoComplete="given-name"
                      className={errors.first_name ? 'error' : ''}
                      {...register('first_name', {
                        required: t('auth.firstNameRequired') || 'First name is required',
                      })}
                    />
                    {errors.first_name && (
                      <p className="field-error">{errors.first_name.message}</p>
                    )}
                  </div>
                  <div className="field">
                    <label>{t('auth.authForm.lastNameLabel')}</label>
                    <input
                      type="text"
                      placeholder={t('auth.authForm.lastNamePlaceholder')}
                      autoComplete="family-name"
                      className={errors.last_name ? 'error' : ''}
                      {...register('last_name', {
                        required: t('auth.lastNameRequired') || 'Last name is required',
                      })}
                    />
                    {errors.last_name && (
                      <p className="field-error">{errors.last_name.message}</p>
                    )}
                  </div>
                </div>

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

                {/* Teacher-only fields */}
                {selectedRole === 'teacher' && (
                  <>
                    <div className="field teacher-only show">
                      <label>{t('auth.authForm.schoolLabel')}</label>
                      <input
                        type="text"
                        placeholder={t('auth.authForm.schoolPlaceholder')}
                        {...register('school')}
                      />
                    </div>
                    <div className="field teacher-only show">
                      <label>{t('auth.authForm.teachLabel')}</label>
                      <select {...register('subject')}>
                        <option value="" disabled selected>
                          {t('auth.authForm.teachPlaceholder')}
                        </option>
                        <option value="languages">
                          {t('auth.authForm.teachOptions.languages')}
                        </option>
                        <option value="mathematics">
                          {t('auth.authForm.teachOptions.mathematics')}
                        </option>
                        <option value="science">
                          {t('auth.authForm.teachOptions.science')}
                        </option>
                        <option value="music">
                          {t('auth.authForm.teachOptions.music')}
                        </option>
                        <option value="arts">
                          {t('auth.authForm.teachOptions.arts')}
                        </option>
                        <option value="coding">
                          {t('auth.authForm.teachOptions.coding')}
                        </option>
                        <option value="business">
                          {t('auth.authForm.teachOptions.business')}
                        </option>
                        <option value="health">
                          {t('auth.authForm.teachOptions.health')}
                        </option>
                        <option value="other">
                          {t('auth.authForm.teachOptions.other')}
                        </option>
                      </select>
                    </div>
                  </>
                )}

                <div className="field field-pass">
                  <label>{t('auth.authForm.passwordLabel')}</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="reg-pass"
                    placeholder={t('auth.authForm.passwordPlaceholder')}
                    autoComplete="new-password"
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
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? '🔒' : '👁'}
                  </button>
                  <div className="strength-bar">
                    <div
                      className={`strength-seg ${getStrengthClass(0)}`}
                      id="s1"
                    ></div>
                    <div
                      className={`strength-seg ${getStrengthClass(1)}`}
                      id="s2"
                    ></div>
                    <div
                      className={`strength-seg ${getStrengthClass(2)}`}
                      id="s3"
                    ></div>
                    <div
                      className={`strength-seg ${getStrengthClass(3)}`}
                      id="s4"
                    ></div>
                  </div>
                  <p className="field-hint" id="strength-label">
                    {getStrengthLabel()}
                  </p>
                  {errors.password && (
                    <p className="field-error">{errors.password.message}</p>
                  )}
                </div>

                <div className="check-row">
                  <input
                    type="checkbox"
                    id="terms"
                    defaultChecked
                    required
                  />
                  <label htmlFor="terms">
                    {t('auth.authForm.agreeTerms')}{' '}
                    <a href="#">{t('auth.authForm.terms')}</a>{' '}
                    {t('auth.authForm.and')}{' '}
                    <a href="#">{t('auth.authForm.privacy')}</a>
                  </label>
                </div>

                <button
                  type="submit"
                  className="submit-btn"
                  disabled={isLoading}
                >
                  <span>
                    {isLoading
                      ? t('auth.signingUp') || 'Signing up...'
                      : selectedRole === 'teacher'
                      ? t('auth.authForm.createTeacherButton')
                      : t('auth.authForm.createAccountButton')}
                  </span>
                </button>
              </form>

              <div className="form-divider">
                <span>{t('auth.authForm.signUpWith')}</span>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignUp}
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
                {t('auth.authForm.signUpGoogle')}
              </button>

              <p className="switch-link">
                {t('auth.authForm.alreadyHaveAccount')}{' '}
                <Link to="/login">{t('auth.authForm.signInLink')}</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
