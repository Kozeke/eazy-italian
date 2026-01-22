import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { gradesApi } from '../../services/api';
import { Eye, Users, ChevronUp, ChevronDown } from 'lucide-react';

type GradeRow = {
  attempt_id: number;
  student: string;
  unit: string;
  test: string;
  score: number;
  passing_score: number;
  passed: boolean;
  status: string;
  submitted_at: string;
};
export default function AdminGradesPage() {
  const { t } = useTranslation();
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [selectedAttempt, setSelectedAttempt] = useState<number | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const closeModal = () => {
    setSelectedAttempt(null);
    setDetail(null);
  };
  
  useEffect(() => {
    if (!selectedAttempt) return;
    gradesApi.getGradeDetail(selectedAttempt).then(setDetail);
  }, [selectedAttempt]);
  
  useEffect(() => {
    gradesApi.getGrades({
      page,
      page_size: pageSize,
      sort_by: 'submitted_at',
      sort_dir: sortDir,
    }).then((res) => {
      setGrades(res.items);
      setTotal(res.total);
    });
  }, [page, sortDir]);
  
  
  const getResultBadge = (passed: boolean) => {
    return passed ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Сдан
      </span>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        Не сдан
      </span>
    );
  };
  
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Студент
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Юнит
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Тест
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Оценка
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Результат
          </th>
          <th
            onClick={() =>
              setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
            }            
            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
          >
            <div className="flex items-center">
              Дата
              {sortDir === 'asc' ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </div>
          </th>
          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
            Действия
          </th>
          
        </tr>
      </thead>

      <tbody className="bg-white divide-y divide-gray-200">
        {grades.map((g) => (
          <tr key={g.attempt_id} className="hover:bg-gray-50">
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="text-sm font-medium text-gray-900">
                {g.student}
              </div>
            </td>

            <td className="px-6 py-4 whitespace-nowrap">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                {g.unit}
              </span>
            </td>

            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              {g.test}
            </td>

            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              {g.score} / {g.passing_score}
            </td>

            <td className="px-6 py-4 whitespace-nowrap">
              {getResultBadge(g.passed)}
            </td>

            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {g.submitted_at
                ? new Date(g.submitted_at).toLocaleDateString('ru-RU')
                : '—'}
            </td>

            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <button
                onClick={() => setSelectedAttempt(g.attempt_id)}
                className="text-primary-600 hover:text-primary-900"
                title="Посмотреть ошибки"
              >
                <Eye className="w-4 h-4" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="flex items-center justify-between px-6 py-4 border-t">
  <span className="text-sm text-gray-600">
    Показано {(page - 1) * pageSize + 1}–
    {Math.min(page * pageSize, total)} из {total}
  </span>

  <div className="flex space-x-2">
    <button
      disabled={page === 1}
      onClick={() => setPage(page - 1)}
      className="px-3 py-1 border rounded disabled:opacity-50"
    >
      ←
    </button>

    <button
      disabled={page * pageSize >= total}
      onClick={() => setPage(page + 1)}
      className="px-3 py-1 border rounded disabled:opacity-50"
    >
      →
    </button>
  </div>
</div>

  </div>

  {/* Empty State (same UX as students) */}
  {grades.length === 0 && (
    <div className="text-center py-12">
      <Users className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-2 text-sm font-medium text-gray-900">
        Нет оценок
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        Тесты ещё не были сданы студентами.
      </p>
    </div>
  )}
  {/* Grade Details Modal */}
{detail && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">
          Детали теста
        </h2>
        <button
          onClick={closeModal}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* Questions table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Вопрос
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Ответ студента
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Правильный ответ
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Результат
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {Object.values(detail.detail || {}).map((q: any) => (
              <tr key={q.question_id}>
                <td className="px-4 py-2 text-sm text-gray-900">
                  Вопрос #{q.question_id}
                </td>

                <td className="px-4 py-2 text-sm text-gray-900">
                  {String(q.student_answer ?? '—')}
                </td>

                <td className="px-4 py-2 text-sm text-gray-900">
                  {q.is_correct ? '—' : 'Ошибка'}
                </td>

                <td className="px-4 py-2">
                  {q.is_correct ? (
                    <span className="text-green-600 font-medium">✔</span>
                  ) : (
                    <span className="text-red-600 font-medium">✘</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-6 text-right">
        <button
          onClick={closeModal}
          className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
        >
          Закрыть
        </button>
      </div>
    </div>
  </div>
)}

</div>

  
  );
}
