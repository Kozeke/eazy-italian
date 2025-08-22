import { useTranslation } from 'react-i18next';

export default function AdminSettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('admin.nav.settings')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Настройки системы
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Настройки будут здесь</p>
      </div>
    </div>
  );
}
