import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Globe } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

interface LoginFormData {
  email: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
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
      toast.success('Успешный вход в систему!');
      if (loggedInUser?.role === 'teacher') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Ошибка входа в систему');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left panel - marketing */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-500 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top,_#fff,_transparent_60%)]" />
        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">
          <div>
            <div className="flex items-center mb-8">
              <Globe className="w-9 h-9 text-white" />
              <span className="ml-3 text-2xl font-bold tracking-tight">
                Eazy Italian
              </span>
            </div>
            <div className="max-w-lg space-y-4">
              <h1 className="text-3xl xl:text-4xl font-bold leading-tight">
                {t('auth.loginHeroTitle') ||
                  'Учите итальянский как на лучших онлайн-платформах'}
              </h1>
              <p className="text-base xl:text-lg text-primary-100">
                {t('auth.loginHeroSubtitle') ||
                  'Доступ к интерактивным урокам, заданиям и тестам в одном удобном личном кабинете.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 max-w-lg mt-10">
            <div>
              <div className="text-3xl font-bold">5000+</div>
              <div className="text-sm text-primary-100">
                {t('landing.stats.students')}
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold">200+</div>
              <div className="text-sm text-primary-100">
                {t('landing.stats.lessons')}
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold">4.9/5</div>
              <div className="text-sm text-primary-100">
                {t('auth.loginHeroRating') || 'Средний рейтинг студентов'}
              </div>
            </div>
          </div>

          <div className="text-xs text-primary-100 mt-8">
            {t('auth.loginHeroNote') ||
              'Демо-аккаунты преподавателя и студента доступны справа — войдите и протестируйте платформу.'}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center lg:hidden">
            <Globe className="w-10 h-10 text-primary-600" />
            <span className="ml-2 text-2xl font-bold text-gray-900">
              Eazy Italian
            </span>
          </div>

          <div className="bg-white shadow-xl rounded-xl px-6 py-8 sm:px-8 sm:py-10 border border-gray-100">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-gray-900">
                {t('auth.login')}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {t('auth.or') || 'Или'}{' '}
                <Link
                  to="/register"
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  {t('auth.dontHaveAccount')}
                </Link>
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t('auth.email')}
                </label>
                <div className="mt-1">
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="input"
                    {...register('email', {
                      required: 'Email обязателен',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Неверный формат email',
                      },
                    })}
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.email.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t('auth.password')}
                </label>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="input pr-10"
                    {...register('password', {
                      required: 'Пароль обязателен',
                      minLength: {
                        value: 6,
                        message: 'Пароль должен содержать минимум 6 символов',
                      },
                    })}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.password.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 block text-sm text-gray-900">
                    {t('auth.rememberMe')}
                  </span>
                </label>

                <div className="text-sm">
                  <Link
                    to="/forgot-password"
                    className="font-medium text-primary-600 hover:text-primary-500"
                  >
                    {t('auth.forgotPassword')}
                  </Link>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Вход...
                    </div>
                  ) : (
                    t('auth.loginButton')
                  )}
                </button>
              </div>
            </form>

            {/* Demo accounts */}
            <div className="mt-7">
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-gray-500">
                    Демо аккаунты
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 text-xs">
                <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-gray-900">
                      Преподаватель
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-semibold">
                      teacher
                    </span>
                  </div>
                  <p className="text-gray-600">
                    Email: <span className="font-mono">teacher@eazyitalian.com</span>
                  </p>
                  <p className="text-gray-600">
                    Пароль: <span className="font-mono">password123</span>
                  </p>
                </div>
                <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-gray-900">
                      Студент
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
                      student
                    </span>
                  </div>
                  <p className="text-gray-600">
                    Email: <span className="font-mono">student@eazyitalian.com</span>
                  </p>
                  <p className="text-gray-600">
                    Пароль: <span className="font-mono">password123</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">
            © {new Date().getFullYear()} Eazy Italian. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
