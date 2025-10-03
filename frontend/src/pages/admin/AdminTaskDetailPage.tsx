import { useParams } from 'react-router-dom';

export default function AdminTaskDetailPage() {
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Задание #{id}
      </h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Детали задания будут здесь</p>
      </div>
    </div>
  );
}

