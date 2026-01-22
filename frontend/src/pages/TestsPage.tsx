
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentTestsApi } from '../services/api';
import toast from 'react-hot-toast';

export default function TestsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    studentTestsApi.getTests()
      .then(setTests)
      .catch(() => toast.error('Ошибка загрузки тестов'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-10">Загрузка…</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Тесты</h1>

      {tests.map(test => (
        <div
          key={test.id}
          onClick={() => navigate(`/tests/${test.id}`)}
          className="card cursor-pointer hover:border-primary-300"
        >
          <div className="card-content">
            <h3 className="text-lg font-medium text-gray-900">
              {test.title}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {test.description}
            </p>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span>{test.time_limit_minutes} мин</span>
              <span>Проходной балл: {test.passing_score}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}