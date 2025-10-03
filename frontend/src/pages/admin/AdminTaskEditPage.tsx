import { useParams, useNavigate } from 'react-router-dom';

export default function AdminTaskEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Редактировать задание #{id}
        </h1>
        <button
          onClick={() => navigate('/admin/tasks')}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
        >
          Отмена
        </button>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Форма редактирования задания будет здесь</p>
      </div>
    </div>
  );
}
