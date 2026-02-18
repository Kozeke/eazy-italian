
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('profile.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Управляйте своим профилем и настройками
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('profile.personalInfo')}</h2>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  ФИО
                </label>
                <p className="mt-1 text-sm text-gray-900">
                  {user?.first_name} {user?.last_name}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <p className="mt-1 text-sm text-gray-900">{user?.email}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Роль
                </label>
                <p className="mt-1 text-sm text-gray-900">
                  {user?.role === 'teacher' ? 'Преподаватель' : 'Студент'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
