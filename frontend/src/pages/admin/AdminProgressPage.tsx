import { useTranslation } from 'react-i18next';

export default function AdminProgressPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('admin.nav.progress')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Отслеживание прогресса студентов
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Прогресс студентов будет здесь</p>
      </div>
    </div>
  );
}
