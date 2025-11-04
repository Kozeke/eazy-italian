import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Globe } from 'lucide-react';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left panel - marketing (visible on lg+) */}
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
                {t('auth.registerHeroTitle') ||
                  'Создайте аккаунт и начните изучать итальянский уже сегодня'}
              </h1>
              <p className="text-base xl:text-lg text-primary-100">
                {t('auth.registerHeroSubtitle') ||
                  'Доступ к видео-урокам, интерактивным заданиям, тестам и отслеживанию прогресса — всё в одном месте.'}
              </p>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-6 max-w-lg text-sm">
            <div>
              <div className="text-3xl font-bold">A1 → B2</div>
              <div className="text-primary-100">
                Полный путь от нуля до уверенного общения
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold">CELI / CILS</div>
              <div className="text-primary-100">
                Подготовка к международным экзаменам
              </div>
            </div>
          </div>

          <div className="text-xs text-primary-100 mt-8">
            {t('auth.registerHeroNote') ||
              'Вы можете зарегистрироваться как студент или преподаватель. Роль можно будет изменить администратором позже.'}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-6 flex items-center justify-center lg:hidden">
            <Globe className="w-10 h-10 text-primary-600" />
            <span className="ml-2 text-2xl font-bold text-gray-900">
              Eazy Italian
            </span>
          </div>

          <div className="bg-white shadow-xl rounded-xl px-6 py-8 sm:px-8 sm:py-10 border border-gray-100">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-gray-900">
                {t('auth.register')}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {t('auth.alreadyHaveAccountQuestion') || 'Уже есть аккаунт?'}{' '}
                <Link
                  to="/login"
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  {t('auth.alreadyHaveAccount')}
                </Link>
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="first_name"
                    className="block text-sm font-medium text-gray-700"
                  >
                    {t('auth.firstName')}
                  </label>
                  <input
                    {...register('first_name', { required: 'Имя обязательно' })}
                    type="text"
                    className="input mt-1"
                    placeholder={t('auth.firstName')}
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
                    className="block text-sm font-medium text-gray-700"
                  >
                    {t('auth.lastName')}
                  </label>
                  <input
                    {...register('last_name', { required: 'Фамилия обязательна' })}
                    type="text"
                    className="input mt-1"
                    placeholder={t('auth.lastName')}
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
                  className="block text-sm font-medium text-gray-700"
                >
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
                  className="input mt-1"
                  placeholder={t('auth.email')}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700"
                  >
                    {t('auth.password')}
                  </label>
                  <div className="mt-1 relative">
                    <input
                      {...register('password', {
                        required: 'Пароль обязателен',
                        minLength: {
                          value: 6,
                          message: 'Пароль должен содержать минимум 6 символов',
                        },
                      })}
                      type={showPassword ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder={t('auth.password')}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400" />
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
                    className="block text-sm font-medium text-gray-700"
                  >
                    {t('auth.confirmPassword')}
                  </label>
                  <div className="mt-1 relative">
                    <input
                      {...register('confirmPassword', {
                        required: 'Подтверждение пароля обязательно',
                        validate: (value) =>
                          value === password || 'Пароли не совпадают',
                      })}
                      type={showConfirm ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder={t('auth.confirmPassword')}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowConfirm((v) => !v)}
                    >
                      {showConfirm ? (
                        <EyeOff className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400" />
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
                <label
                  htmlFor="role"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t('auth.role') || 'Роль'}
                </label>
                <select
                  {...register('role', { required: 'Выберите роль' })}
                  className="input mt-1"
                >
                  <option value="">{t('auth.chooseRole') || 'Выберите роль'}</option>
                  <option value="student">
                    {t('auth.roleStudent') || 'Студент'}
                  </option>
                  <option value="teacher">
                    {t('auth.roleTeacher') || 'Преподаватель'}
                  </option>
                </select>
                {errors.role && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.role.message}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-gray-400">
                  Можно зарегистрироваться как студент для обучения или как преподаватель
                  для создания юнитов, видео и тестов.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Регистрация...' : t('auth.registerButton')}
                </button>
              </div>
            </form>

            <p className="mt-4 text-[11px] text-gray-400 text-center">
              Нажимая «{t('auth.registerButton')}», вы принимаете условия обработки данных
              и правила использования платформы Eazy Italian.
            </p>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">
            © {new Date().getFullYear()} Eazy Italian. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
