import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Award, Clock, Home, RotateCcw, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { testsApi } from '../services/api';

export default function TestResultsPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [questionMap, setQuestionMap] = useState<Record<string, any>>({});
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      
      try {
        const testData = await testsApi.getTest(parseInt(id));
        if (testData.unit_id) {
          setUnitId(testData.unit_id);
        }
        
        // Get saved result from sessionStorage
        const savedResult = sessionStorage.getItem(`test_result_${attemptId}`);
        if (savedResult) {
          const parsedResult = JSON.parse(savedResult);

          if (attemptId) {
            const savedQuestions = sessionStorage.getItem(`test_questions_${attemptId}`);
            if (savedQuestions) {
              const parsedQuestions = JSON.parse(savedQuestions);
              if (Array.isArray(parsedQuestions)) {
                const map: Record<string, any> = {};
                parsedQuestions.forEach((question: any) => {
                  if (question?.id !== undefined) {
                    map[String(question.id)] = question;
                  }
                });
                setQuestionMap(map);
              }
            }
          }

          if (parsedResult?.results) {
            const map: Record<string, any> = {};
            Object.entries(parsedResult.results).forEach(([questionId, details]: [string, any]) => {
              if (details?.question) {
                map[String(questionId)] = details.question;
              }
            });
            setQuestionMap((prev) => ({ ...prev, ...map }));
          }
          
          // Fetch current attempts data to get accurate attempts_remaining
          try {
            const attemptsData = await testsApi.getTestAttempts(parseInt(id));
            // Update result with current attempts_remaining
            parsedResult.attempts_remaining = attemptsData.attempts_remaining;
            setResult(parsedResult);
          } catch (error) {
            // If fetching attempts fails, use saved result as fallback
            console.error('Error fetching attempts:', error);
            setResult(parsedResult);
          }
        } else {
          toast.error('Результаты не найдены');
          navigate(`/tests/${id}`);
          return;
        }
      } catch (error: any) {
        console.error('Error loading test data:', error);
        const savedResult = sessionStorage.getItem(`test_result_${attemptId}`);
        if (savedResult) {
          const parsedResult = JSON.parse(savedResult);

          if (attemptId) {
            const savedQuestions = sessionStorage.getItem(`test_questions_${attemptId}`);
            if (savedQuestions) {
              const parsedQuestions = JSON.parse(savedQuestions);
              if (Array.isArray(parsedQuestions)) {
                const map: Record<string, any> = {};
                parsedQuestions.forEach((question: any) => {
                  if (question?.id !== undefined) {
                    map[String(question.id)] = question;
                  }
                });
                setQuestionMap(map);
              }
            }
          }

          if (parsedResult?.results) {
            const map: Record<string, any> = {};
            Object.entries(parsedResult.results).forEach(([questionId, details]: [string, any]) => {
              if (details?.question) {
                map[String(questionId)] = details.question;
              }
            });
            setQuestionMap((prev) => ({ ...prev, ...map }));
          }
          
          // Try to fetch attempts data even if test data failed
          try {
            const attemptsData = await testsApi.getTestAttempts(parseInt(id));
            parsedResult.attempts_remaining = attemptsData.attempts_remaining;
            setResult(parsedResult);
          } catch (err) {
            setResult(parsedResult);
          }
        } else {
          toast.error('Результаты не найдены');
          navigate(`/tests/${id}`);
          return;
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [id, attemptId, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const passed = result.passed;
  const percentage = result.score;
  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  const normalizeAnswerIds = (value: any) => {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === '') return [];
    return [value];
  };

  const renderSimpleAnswer = (value: any) => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return JSON.stringify(value);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className={`px-8 py-10 text-center ${
            passed ? 'bg-green-600' : 'bg-red-600'
          } text-white`}>
            <div className="mx-auto w-16 h-16 mb-3">
              {passed ? (
                <CheckCircle className="w-full h-full" />
              ) : (
                <XCircle className="w-full h-full" />
              )}
            </div>
            <h1 className="text-2xl font-bold mb-1">
              {passed ? 'Тест пройден!' : 'Тест не пройден'}
            </h1>
            <p className="text-lg opacity-90">
              {percentage.toFixed(1)}%
            </p>
          </div>

          {/* Stats */}
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg mb-2">
                  <Award className="h-5 w-5 text-blue-600" />
                </div>
                <p className="text-xs text-blue-600 font-medium mb-1">Баллы</p>
                <p className="text-lg font-bold text-blue-900">
                  {result.points_earned?.toFixed(1)} / {result.points_possible}
                </p>
              </div>

              <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-100">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-purple-100 rounded-lg mb-2">
                  <CheckCircle className="h-5 w-5 text-purple-600" />
                </div>
                <p className="text-xs text-purple-600 font-medium mb-1">Процент</p>
                <p className="text-lg font-bold text-purple-900">{percentage.toFixed(1)}%</p>
              </div>

              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-100">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-green-100 rounded-lg mb-2">
                  <Clock className="h-5 w-5 text-green-600" />
                </div>
                <p className="text-xs text-green-600 font-medium mb-1">Время</p>
                <p className="text-lg font-bold text-green-900">
                  {result.time_taken_seconds !== undefined 
                    ? `${Math.floor(result.time_taken_seconds / 60)}:${String(result.time_taken_seconds % 60).padStart(2, '0')}`
                    : result.duration_minutes 
                      ? `${result.duration_minutes} мин`
                      : 'N/A'}
                </p>
                {result.time_taken_seconds !== undefined && (
                  <p className="text-xs text-green-600 mt-1">
                    ({result.time_taken_seconds} сек)
                  </p>
                )}
              </div>
            </div>

            {/* Detailed Results */}
            {result.results && (
              <div className="border-t border-gray-200 pt-6 mb-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Детальные результаты</h2>
                <div className="space-y-2">
                  {Object.entries(result.results).map(([questionId, details]: [string, any], index) => (
                    (() => {
                      const question = details?.question || questionMap[questionId];
                      const isCorrect = details?.is_correct ?? details?.correct ?? false;
                      const pointsEarned = details?.points_earned ?? details?.points ?? 0;
                      const pointsPossible = details?.points_possible ?? details?.max_points ?? 0;
                      const isExpanded = expandedQuestions.has(questionId);
                      const studentAnswer = details?.student_answer ?? details?.answer;
                      const correctAnswer = question?.correct_answer;
                      const options = question?.options as Array<{ id: string; text: string }> | undefined;
                      const studentIds = normalizeAnswerIds(studentAnswer);
                      const correctIds = normalizeAnswerIds(correctAnswer?.correct_option_ids);

                      return (
                    <div 
                      key={questionId}
                      className={`p-3 rounded-lg border ${
                        isCorrect 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {isCorrect ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="text-sm font-medium text-gray-900">
                            Вопрос {index + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-medium ${
                            isCorrect ? 'text-green-700' : 'text-red-700'
                          }`}>
                            {pointsEarned?.toFixed(1)} / {pointsPossible}
                          </span>
                          <button
                            onClick={() => toggleQuestion(questionId)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                          >
                            {isExpanded ? 'Скрыть' : 'Показать'}
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 border-t border-gray-200 pt-3 space-y-3">
                          {question?.prompt ? (
                            <div className="text-sm text-gray-900"
                              dangerouslySetInnerHTML={{ __html: question.prompt }}
                            />
                          ) : (
                            <div className="text-xs text-gray-500">
                              Детали вопроса недоступны для этого результата.
                            </div>
                          )}

                          {question?.type === 'multiple_choice' && options?.length ? (
                            <div className="space-y-2">
                              {options.map((option) => {
                                const isCorrectOption = correctIds.includes(option.id);
                                const isSelectedOption = studentIds.includes(option.id);
                                const baseClass = 'border-gray-200 bg-white';
                                const correctClass = 'border-green-200 bg-green-50';
                                const selectedWrongClass = 'border-red-200 bg-red-50';
                                const optionClass = isCorrectOption
                                  ? correctClass
                                  : isSelectedOption
                                    ? selectedWrongClass
                                    : baseClass;
                                return (
                                  <div
                                    key={option.id}
                                    className={`p-2 rounded-md border text-sm ${optionClass}`}
                                  >
                                    <span className="font-medium">{option.id}.</span> {option.text}
                                    {isCorrectOption && (
                                      <span className="ml-2 text-xs text-green-700">Правильный</span>
                                    )}
                                    {isSelectedOption && !isCorrectOption && (
                                      <span className="ml-2 text-xs text-red-700">Ваш выбор</span>
                                    )}
                                    {isSelectedOption && isCorrectOption && (
                                      <span className="ml-2 text-xs text-green-700">Ваш выбор</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              <div className="rounded-md border border-gray-200 bg-white p-2">
                                <p className="text-xs font-medium text-gray-500 mb-1">Ваш ответ</p>
                                <p className="text-gray-900">
                                  {renderSimpleAnswer(studentAnswer)}
                                </p>
                              </div>
                              <div className="rounded-md border border-gray-200 bg-white p-2">
                                <p className="text-xs font-medium text-gray-500 mb-1">Правильный ответ</p>
                                <p className="text-gray-900">
                                  {question?.type === 'open_answer' && question?.expected_answer_config?.keywords?.length
                                    ? question.expected_answer_config.keywords.map((kw: any) => kw.text).join(', ')
                                    : renderSimpleAnswer(correctAnswer)}
                                </p>
                              </div>
                            </div>
                          )}

                          {question?.type === 'cloze' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              <div className="rounded-md border border-gray-200 bg-white p-2">
                                <p className="text-xs font-medium text-gray-500 mb-1">Ваши ответы</p>
                                <p className="text-gray-900">
                                  {typeof studentAnswer === 'object' && studentAnswer !== null
                                    ? Object.entries(studentAnswer).map(([key, value]) => `${key}: ${value}`).join(', ')
                                    : renderSimpleAnswer(studentAnswer)}
                                </p>
                              </div>
                              <div className="rounded-md border border-gray-200 bg-white p-2">
                                <p className="text-xs font-medium text-gray-500 mb-1">Правильные ответы</p>
                                <p className="text-gray-900">
                                  {Array.isArray(question?.gaps_config) && question.gaps_config.length
                                    ? question.gaps_config.map((gap: any) => `${gap.id}: ${gap.answer}`).join(', ')
                                    : renderSimpleAnswer(correctAnswer)}
                                </p>
                              </div>
                            </div>
                          )}

                          {question?.explanation && (
                            <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700"
                              dangerouslySetInnerHTML={{ __html: question.explanation }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                      );
                    })()
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 border-t border-gray-200 pt-6">
              {unitId ? (
                <button
                  onClick={() => navigate(`/units/${unitId}`)}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Вернуться к юниту
                </button>
              ) : (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <Home className="h-4 w-4 mr-2" />
                  На главную
                </button>
              )}
              
              {!passed && (result.attempts_remaining === null || result.attempts_remaining === undefined || result.attempts_remaining > 0) && (
                <button
                  onClick={() => navigate(`/tests/${id}`)}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Попробовать снова
                </button>
              )}
            </div>

            {/* Feedback */}
            <div className="mt-6 text-center">
              {passed ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg border border-green-200">
                  <span className="text-lg">🎉</span>
                  <p className="text-sm text-green-700 font-medium">
                    Поздравляем! Тест успешно пройден
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  {result.attempts_remaining === null || result.attempts_remaining === undefined
                    ? 'Попытки не ограничены'
                    : result.attempts_remaining > 0 
                      ? `Осталось попыток: ${result.attempts_remaining}`
                      : 'Попытки исчерпаны'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}