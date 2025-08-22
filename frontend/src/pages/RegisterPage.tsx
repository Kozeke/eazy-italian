import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

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
  const navigate = useNavigate();
  const { register: registerUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>();

  const password = watch('password');

  const onSubmit = async (data: RegisterFormData) => {
    if (data.password !== data.confirmPassword) {
      toast.error(t('auth.passwordsDoNotMatch'));
      return;
    }

    setIsLoading(true);
    try {
      await registerUser({
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role,
      });
      toast.success('Регистрация успешна!');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Ошибка регистрации');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {t('auth.register')}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="first_name" className="sr-only">
                {t('auth.firstName')}
              </label>
              <input
                {...register('first_name', { required: 'Имя обязательно' })}
                type="text"
                className="input rounded-t-md"
                placeholder={t('auth.firstName')}
              />
              {errors.first_name && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.first_name.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="last_name" className="sr-only">
                {t('auth.lastName')}
              </label>
              <input
                {...register('last_name', { required: 'Фамилия обязательна' })}
                type="text"
                className="input"
                placeholder={t('auth.lastName')}
              />
              {errors.last_name && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.last_name.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="email" className="sr-only">
                {t('auth.email')}
              </label>
              <input
                {...register('email', {
                  required: 'Email обязателен',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Неверный формат email',
                  },
                })}
                type="email"
                className="input"
                placeholder={t('auth.email')}
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                {t('auth.password')}
              </label>
              <input
                {...register('password', {
                  required: 'Пароль обязателен',
                  minLength: {
                    value: 6,
                    message: 'Пароль должен содержать минимум 6 символов',
                  },
                })}
                type="password"
                className="input"
                placeholder={t('auth.password')}
              />
              {errors.password && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                {t('auth.confirmPassword')}
              </label>
              <input
                {...register('confirmPassword', {
                  required: 'Подтверждение пароля обязательно',
                  validate: (value) =>
                    value === password || 'Пароли не совпадают',
                })}
                type="password"
                className="input"
                placeholder={t('auth.confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
            <div>
              <select
                {...register('role', { required: 'Выберите роль' })}
                className="input rounded-b-md"
              >
                <option value="">Выберите роль</option>
                <option value="student">Студент</option>
                <option value="teacher">Преподаватель</option>
              </select>
              {errors.role && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.role.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full btn-lg"
            >
              {isLoading ? 'Регистрация...' : t('auth.registerButton')}
            </button>
          </div>

          <div className="text-center">
            <Link
              to="/login"
              className="text-primary-600 hover:text-primary-500"
            >
              {t('auth.alreadyHaveAccount')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
