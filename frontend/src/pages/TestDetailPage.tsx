import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Award, CheckCircle, XCircle, Play } from 'lucide-react';
import { testsApi } from '../services/api';
import toast from 'react-hot-toast';
import { Test } from '../types';

export default function TestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTest = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const testData = await testsApi.getTest(parseInt(id));
        setTest(testData);
        console.log('Loaded test:', testData);
      } catch (error: any) {
        console.error('Error fetching test:', error);
        toast.error('Ошибка при загрузке теста');
      } finally {
        setLoading(false);
      }
    };

    fetchTest();
  }, [id]);

  const handleStartTest = async () => {
    toast('Функция прохождения тестов находится в разработке', { 
      icon: '🚧',
      duration: 4000,
    });
    console.log('Test taking feature is under development');
    // TODO: Implement test taking functionality
    // 1. Create backend endpoint: POST /api/v1/tests/{id}/start
    // 2. Create test taking page with timer and questions
    // 3. Create submit endpoint: POST /api/v1/tests/{id}/submit
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-medium text-gray-900">Тест не найден</h2>
        <p className="text-gray-500 mt-2">Запрашиваемый тест не существует или недоступен.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Назад
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Test Info Card */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-8 text-white">
              <h1 className="text-3xl font-bold mb-2">{test.title}</h1>
              {test.description && (
                <p className="text-primary-100">{test.description}</p>
              )}
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Clock className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Время</p>
                    <p className="text-lg font-semibold text-gray-900">{test.time_limit_minutes} минут</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <Award className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Проходной балл</p>
                    <p className="text-lg font-semibold text-gray-900">{test.passing_score}%</p>
                  </div>
                </div>
              </div>

              {test.instructions && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Инструкции</h3>
                  <div 
                    className="prose max-w-none text-gray-700"
                    dangerouslySetInnerHTML={{ __html: test.instructions }}
                  />
                </div>
              )}

              <div className="flex items-center justify-center pt-4">
                <button
                  onClick={handleStartTest}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  <Play className="h-5 w-5 mr-2" />
                  Начать тест
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Test Stats */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Статистика</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Ваши попытки</span>
                <span className="text-sm font-medium text-gray-900">0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Лучший результат</span>
                <span className="text-sm font-medium text-gray-900">—</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Статус</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  Не начат
                </span>
              </div>
            </div>
          </div>

          {/* Settings */}
          {test.settings && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Настройки</h3>
              <div className="space-y-3 text-sm">
                {test.settings.max_attempts && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Попытки</span>
                    <span className="font-medium text-gray-900">{test.settings.max_attempts}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Перемешивать вопросы</span>
                  {test.settings.shuffle_questions ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-gray-400" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Показать результаты</span>
                  {test.settings.show_results_immediately ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">💡 Советы</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Внимательно читайте вопросы</li>
              <li>• Следите за временем</li>
              <li>• Проверьте ответы перед отправкой</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

