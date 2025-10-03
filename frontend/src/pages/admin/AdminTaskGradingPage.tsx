import { useParams } from 'react-router-dom';

export default function AdminTaskGradingPage() {
  const { id, submissionId } = useParams();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Оценка задания #{id} - Сдача #{submissionId}
      </h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Форма оценки задания будет здесь</p>
      </div>
    </div>
  );
}

