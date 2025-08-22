
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('dashboard.welcome')}, {user?.first_name}!
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Добро пожаловать в панель управления Eazy Italian
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card">
            <div className="card-content">
              <h3 className="text-lg font-medium text-gray-900">
                {t('dashboard.myCourses')}
              </h3>
              <p className="text-3xl font-bold text-primary-600">3</p>
            </div>
          </div>

          <div className="card">
            <div className="card-content">
              <h3 className="text-lg font-medium text-gray-900">
                {t('dashboard.completedUnits')}
              </h3>
              <p className="text-3xl font-bold text-green-600">12</p>
            </div>
          </div>

          <div className="card">
            <div className="card-content">
              <h3 className="text-lg font-medium text-gray-900">
                {t('dashboard.averageScore')}
              </h3>
              <p className="text-3xl font-bold text-blue-600">85%</p>
            </div>
          </div>

          <div className="card">
            <div className="card-content">
              <h3 className="text-lg font-medium text-gray-900">
                {t('dashboard.timeSpent')}
              </h3>
              <p className="text-3xl font-bold text-purple-600">24ч</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">{t('dashboard.recentActivity')}</h3>
            </div>
            <div className="card-content">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">
                    Завершен урок "Приветствие и знакомство"
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">
                    Отправлено задание "Практика приветствий"
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">
                    Пройден тест "Тест по приветствиям"
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">{t('dashboard.upcomingDeadlines')}</h3>
            </div>
            <div className="card-content">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Задание "Перевод чисел"
                  </span>
                  <span className="text-sm text-red-600">Через 2 дня</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Задание "Описание семьи"
                  </span>
                  <span className="text-sm text-orange-600">Через 5 дней</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
