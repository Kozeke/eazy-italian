import { useTranslation } from 'react-i18next';

export default function AdminAuditLogPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('admin.nav.auditLog')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Журнал аудита системы
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Журнал аудита будет здесь</p>
      </div>
    </div>
  );
}
