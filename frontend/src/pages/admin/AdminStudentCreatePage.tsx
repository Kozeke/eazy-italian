import { useTranslation } from 'react-i18next';

export default function AdminStudentCreatePage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('admin.actions.new')} {t('admin.nav.students')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Создание нового студента
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Форма создания нового студента будет здесь</p>
      </div>
    </div>
  );
}
