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
  const [attempts, setAttempts] = useState<any[]>([]);
  const [attemptsData, setAttemptsData] = useState<any>(null);

  useEffect(() => {
    const fetchTest = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const testData = await testsApi.getTest(parseInt(id));
        setTest(testData);
        console.log('Loaded test:', testData);
        
        try {
          const attemptsResponse = await testsApi.getTestAttempts(parseInt(id));
          setAttempts(attemptsResponse.attempts || []);
          setAttemptsData(attemptsResponse);
          console.log('Loaded attempts:', attemptsResponse);
        } catch (error) {
          console.error('Error loading attempts:', error);
        }
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
    if (!id) return;
    
    try {
      navigate(`/tests/${id}/take`);
    } catch (error: any) {
      console.error('Error starting test:', error);
      toast.error('Ошибка при начале теста');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">Тест не найден</h2>
        <p className="text-sm text-gray-500 mt-1">Запрашиваемый тест не существует или недоступен.</p>
      </div>
    );
  }

  const isTestAvailable = test.status === 'published';
  const hasAttemptsRemaining = attemptsData?.attempts_remaining === null || attemptsData?.attempts_remaining > 0;
  const canStartTest = isTestAvailable && hasAttemptsRemaining;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Назад
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="bg-indigo-600 px-6 py-6 text-white">
              <h1 className="text-2xl font-bold mb-1">{test.title}</h1>
              {test.description && (
                <p className="text-indigo-100 text-sm">{test.description}</p>
              )}
            </div>
            
            {/* Body */}
            <div className="p-6">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Время</p>
                    <p className="text-sm font-semibold text-gray-900">{test.time_limit_minutes} минут</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Award className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Проходной балл</p>
                    <p className="text-sm font-semibold text-gray-900">{test.passing_score}%</p>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              {test.instructions && (
                <div className="mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                  <h3 className="text-sm font-medium text-indigo-900 mb-2">Инструкции</h3>
                  <div 
                    className="prose prose-sm max-w-none text-indigo-800"
                    dangerouslySetInnerHTML={{ __html: test.instructions }}
                  />
                </div>
              )}

              {/* Start Button */}
              <div className="pt-4 border-t border-gray-200">
                {canStartTest ? (
                  <button
                    onClick={handleStartTest}
                    className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Начать тест
                  </button>
                ) : (
                  <div className="text-center">
                    <div className="inline-flex items-center px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm">
                      <XCircle className="h-4 w-4 mr-2" />
                      {!isTestAvailable ? 'Тест не опубликован' : 'Попытки исчерпаны'}
                    </div>
                    {!hasAttemptsRemaining && attemptsData && (
                      <p className="mt-2 text-xs text-gray-500">
                        Использовано попыток: {attempts.length} из {test.settings?.max_attempts || 'неограниченно'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Progress */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Ваш прогресс</h3>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Попытки</span>
                  <span className="font-medium text-gray-900">{attempts.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Лучший результат</span>
                  <span className="font-medium text-gray-900">
                    {attemptsData?.best_score ? `${attemptsData.best_score.toFixed(1)}%` : '—'}
                  </span>
                </div>
                {attemptsData && attemptsData.attempts_remaining !== null && (
                  <div className="flex items-center justify-between text-sm pt-3 border-t border-gray-200">
                    <span className="text-gray-600">Осталось попыток</span>
                    <span className="font-medium text-indigo-600">{attemptsData.attempts_remaining}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Attempt History */}
          {attempts.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900">История попыток</h3>
              </div>
              <div className="p-4">
                <div className="space-y-2">
                  {attempts.map((attempt, index) => (
                    <div key={attempt.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 text-sm">
                      <span className="text-gray-600">Попытка {attempts.length - index}</span>
                      <div className="flex items-center gap-2">
                        {attempt.score !== null ? (
                          <>
                            <span className={`font-medium ${
                              attempt.passed ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {attempt.score.toFixed(1)}%
                            </span>
                            {attempt.passed && (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400 text-xs">В процессе</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4">
            <h4 className="text-sm font-medium text-indigo-900 mb-2">💡 Советы</h4>
            <ul className="text-xs text-indigo-700 space-y-1">
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