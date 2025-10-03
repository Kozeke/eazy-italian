import { useParams } from 'react-router-dom';

export default function AdminTaskSubmissionsPage() {
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Сдачи задания #{id}
      </h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Список сдач заданий будет здесь</p>
      </div>
    </div>
  );
}

