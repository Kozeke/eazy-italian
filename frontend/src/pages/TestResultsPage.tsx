import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Award, Clock, Home, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TestResultsPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    // For now, we'll fetch from localStorage where we saved it
    // In future, create GET /api/v1/tests/{id}/attempts/{attemptId} endpoint
    const savedResult = sessionStorage.getItem(`test_result_${attemptId}`);
    if (savedResult) {
      setResult(JSON.parse(savedResult));
      setLoading(false);
    } else {
      toast.error('Результаты не найдены');
      navigate(`/tests/${id}`);
    }
  }, [id, attemptId, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const passed = result.passed;
  const percentage = result.score;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Results Card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header with result */}
          <div className={`px-6 py-12 text-center ${
            passed 
              ? 'bg-gradient-to-r from-green-500 to-green-600' 
              : 'bg-gradient-to-r from-red-500 to-red-600'
          } text-white`}>
            <div className="mx-auto w-20 h-20 mb-4">
              {passed ? (
                <CheckCircle className="w-full h-full" />
              ) : (
                <XCircle className="w-full h-full" />
              )}
            </div>
            <h1 className="text-3xl font-bold mb-2">
              {passed ? 'Тест пройден!' : 'Тест не пройден'}
            </h1>
            <p className="text-xl opacity-90">
              Ваш результат: {percentage.toFixed(1)}%
            </p>
          </div>

          {/* Scores */}
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-2">
                  <Award className="h-6 w-6 text-blue-600" />
                </div>
                <p className="text-sm text-gray-500">Набрано баллов</p>
                <p className="text-2xl font-bold text-gray-900">
                  {result.points_earned?.toFixed(1)} / {result.points_possible}
                </p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 rounded-full mb-2">
                  <CheckCircle className="h-6 w-6 text-purple-600" />
                </div>
                <p className="text-sm text-gray-500">Процент</p>
                <p className="text-2xl font-bold text-gray-900">{percentage.toFixed(1)}%</p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-2">
                  <Clock className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-sm text-gray-500">Время</p>
                <p className="text-2xl font-bold text-gray-900">
                  {result.duration_minutes || 'N/A'} мин
                </p>
              </div>
            </div>

            {/* Detailed Results */}
            {result.results && (
              <div className="border-t border-gray-200 pt-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Детальные результаты</h2>
                <div className="space-y-3">
                  {Object.entries(result.results).map(([questionId, details]: [string, any], index) => (
                    <div 
                      key={questionId}
                      className={`p-4 rounded-lg border ${
                        details.is_correct 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {details.is_correct ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-600" />
                          )}
                          <span className="font-medium text-gray-900">
                            Вопрос {index + 1}
                          </span>
                        </div>
                        <span className={`text-sm font-medium ${
                          details.is_correct ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {details.points_earned?.toFixed(1)} / {details.points_possible} баллов
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-8 flex items-center justify-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                <Home className="h-5 w-5 mr-2" />
                На главную
              </button>
              
              {!passed && result.attempts_remaining > 0 && (
                <button
                  onClick={() => navigate(`/tests/${id}`)}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  <RotateCcw className="h-5 w-5 mr-2" />
                  Попробовать снова
                </button>
              )}
            </div>

            {/* Feedback message */}
            <div className="mt-6 text-center">
              {passed ? (
                <p className="text-green-700 font-medium">
                  🎉 Поздравляем! Вы успешно прошли тест!
                </p>
              ) : (
                <p className="text-red-700">
                  {result.attempts_remaining > 0 
                    ? `Попробуйте еще раз. Осталось попыток: ${result.attempts_remaining}`
                    : 'К сожалению, попытки закончились.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

