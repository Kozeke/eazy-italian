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
      // Navigate based on user role
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
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Globe className="w-12 h-12 text-primary-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {t('auth.login')}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Или{' '}
          <Link
            to="/register"
            className="font-medium text-primary-600 hover:text-primary-500"
          >
            {t('auth.dontHaveAccount')}
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
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
                  <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
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
                  <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                  {t('auth.rememberMe')}
                </label>
              </div>

              <div className="text-sm">
                <Link
                  to="/forgot-password"
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  {t('auth.forgotPassword')}
                </Link>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Вход...
                  </div>
                ) : (
                  t('auth.loginButton')
                )}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Демо аккаунты</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Преподаватель</h4>
                <p className="text-xs text-gray-600 mb-1">Email: teacher@eazyitalian.com</p>
                <p className="text-xs text-gray-600">Пароль: password123</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Студент</h4>
                <p className="text-xs text-gray-600 mb-1">Email: student@eazyitalian.com</p>
                <p className="text-xs text-gray-600">Пароль: password123</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
