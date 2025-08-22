import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

export default function AdminVideoEditPage() {
  const { t } = useTranslation();
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Редактирование {t('admin.nav.videos')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Редактирование видео ID: {id}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Форма редактирования видео будет здесь</p>
      </div>
    </div>
  );
}
