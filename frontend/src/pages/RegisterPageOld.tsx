import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Globe } from 'lucide-react';
import i18n from '../i18n';

interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
  first_name: string;
  last_name: string;
  role: 'student' | 'teacher';
}

export default function RegisterPage() {
  const { t } = useTranslation();
  const currentLang = i18n.language;
  const navigate = useNavigate();
  const { register: registerUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    defaultValues: {
      role: 'student',
    },
  });

  const password = watch('password');

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
      // Navigate based on user role
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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Simple header */}
      <div className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center">
              <Globe className="w-8 h-8 text-purple-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">
                EZ Italian
              </span>
            </Link>
            <button
              onClick={() => i18n.changeLanguage(currentLang === 'ru' ? 'en' : 'ru')}
              className="text-sm text-gray-700 hover:text-gray-900 font-medium"
            >
              {currentLang === 'ru' ? 'EN' : 'RU'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {t('auth.createAccount') || 'Sign up and start learning'}
            </h1>
            <p className="text-gray-600">
              {t('auth.alreadyHaveAccountQuestion') || 'Already have an account?'}{' '}
              <Link
                to="/login"
                className="text-purple-600 font-medium hover:text-purple-700"
              >
                {t('auth.logIn') || 'Log in'}
              </Link>
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-8">
            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label
                    htmlFor="first_name"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('auth.firstName') || 'First Name'}
                  </label>
                  <input
                    {...register('first_name', {
                      required: t('auth.firstNameRequired') || 'First name is required',
                    })}
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder={t('auth.firstNamePlaceholder') || 'John'}
                  />
                  {errors.first_name && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.first_name.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="last_name"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('auth.lastName') || 'Last Name'}
                  </label>
                  <input
                    {...register('last_name', {
                      required: t('auth.lastNameRequired') || 'Last name is required',
                    })}
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder={t('auth.lastNamePlaceholder') || 'Doe'}
                  />
                  {errors.last_name && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.last_name.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t('auth.email') || 'Email'}
                </label>
                <input
                  {...register('email', {
                    required: t('auth.emailRequired') || 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: t('auth.emailInvalid') || 'Invalid email format',
                    },
                  })}
                  type="email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder={t('auth.emailPlaceholder') || 'name@example.com'}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('auth.password') || 'Password'}
                  </label>
                  <div className="relative">
                    <input
                      {...register('password', {
                        required: t('auth.passwordRequired') || 'Password is required',
                        minLength: {
                          value: 6,
                          message:
                            t('auth.passwordMinLength') ||
                            'Password must be at least 6 characters',
                        },
                      })}
                      type={showPassword ? 'text' : 'password'}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="••••••"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('auth.confirmPassword') || 'Confirm Password'}
                  </label>
                  <div className="relative">
                    <input
                      {...register('confirmPassword', {
                        required:
                          t('auth.confirmPasswordRequired') ||
                          'Please confirm your password',
                        validate: (value) =>
                          value === password ||
                          t('auth.passwordsDoNotMatch') ||
                          'Passwords do not match',
                      })}
                      type={showConfirm ? 'text' : 'password'}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="••••••"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowConfirm((v) => !v)}
                    >
                      {showConfirm ? (
                        <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                      )}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {t('auth.iAmA') || 'I am a'}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="relative flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-purple-300 transition-colors">
                    <input
                      {...register('role', { required: true })}
                      type="radio"
                      value="student"
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                    />
                    <div className="ml-3">
                      <div className="text-sm font-semibold text-gray-900">
                        {t('auth.roleStudent') || 'Student'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('auth.roleStudentDesc') || 'I want to learn Italian'}
                      </div>
                    </div>
                  </label>

                  <label className="relative flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-purple-300 transition-colors">
                    <input
                      {...register('role', { required: true })}
                      type="radio"
                      value="teacher"
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                    />
                    <div className="ml-3">
                      <div className="text-sm font-semibold text-gray-900">
                        {t('auth.roleTeacher') || 'Teacher'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('auth.roleTeacherDesc') || 'I want to teach Italian'}
                      </div>
                    </div>
                  </label>
                </div>
                {errors.role && (
                  <p className="mt-1 text-xs text-red-600">
                    {t('auth.roleRequired') || 'Please select a role'}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-purple-600 text-white py-3 px-4 rounded-md font-semibold hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                      {t('auth.signingUp') || 'Signing up...'}
                    </span>
                  ) : (
                    t('auth.registerButton') || 'Sign Up'
                  )}
                </button>
              </div>
            </form>

            {/* Optional: Social signup */}
            {/*
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or sign up with</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button className="w-full inline-flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="ml-2">Google</span>
                </button>
                <button className="w-full inline-flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <svg className="w-5 h-5" fill="#1877F2" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <span className="ml-2">Facebook</span>
                </button>
              </div>
            </div>
            */}
          </div>

          <p className="mt-8 text-center text-xs text-gray-500">
            {t('auth.termsAgreement') || 'By signing up, you agree to our'}{' '}
            <a href="#" className="text-purple-600 hover:text-purple-700">
              {t('auth.terms') || 'Terms of Service'}
            </a>{' '}
            {t('auth.and') || 'and'}{' '}
            <a href="#" className="text-purple-600 hover:text-purple-700">
              {t('auth.privacy') || 'Privacy Policy'}
            </a>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            © {new Date().getFullYear()} EZ Italian. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}