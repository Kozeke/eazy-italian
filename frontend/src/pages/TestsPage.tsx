
import { useTranslation } from 'react-i18next';

export default function TestsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('tests.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Проверяйте свои знания с помощью тестов
          </p>
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="card-content">
              <h3 className="text-lg font-medium text-gray-900">
                Тест по приветствиям
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Проверьте свои знания по теме приветствий
              </p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">Время: 30 мин</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Пройден
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
