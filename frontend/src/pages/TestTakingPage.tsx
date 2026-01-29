import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Send, AlertCircle, CheckCircle } from 'lucide-react';
import { testsApi } from '../services/api';
import toast from 'react-hot-toast';

interface Question {
  id: number;
  type: string;
  prompt: string;
  score: number;
  options?: Array<{ id: string; text: string }>;
  gaps_count?: number;
}

export default function TestTakingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testData, setTestData] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);

  useEffect(() => {
    const startTest = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const data = await testsApi.startTest(parseInt(id));
        setTestData(data);
        setQuestions(data.questions || []);
        setTimeRemaining(data.time_limit_minutes * 60);
        setStartTime(new Date());
        console.log('Test started:', data);
      } catch (error: any) {
        console.error('Error starting test:', error);
        toast.error(error.response?.data?.detail || 'Ошибка при начале теста');
        navigate(`/tests/${id}`);
      } finally {
        setLoading(false);
      }
    };

    startTest();
  }, [id, navigate]);

  useEffect(() => {
    if (timeRemaining <= 0 || !startTime) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, startTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (questionId: number, answer: any) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleSubmit = useCallback(async () => {
    if (!id) return;
    if (submitting) return;
    
    const confirmed = window.confirm('Вы уверены, что хотите отправить тест? Это действие нельзя отменить.');
    if (!confirmed) return;
    
    try {
      setSubmitting(true);
      const result = await testsApi.submitTest(parseInt(id), { answers });
      
      sessionStorage.setItem(`test_result_${result.attempt_id}`, JSON.stringify(result));
      
      toast.success(`Тест отправлен! Ваш результат: ${result.score.toFixed(1)}%`);
      
      navigate(`/tests/${id}/results/${result.attempt_id}`);
    } catch (error: any) {
      console.error('Error submitting test:', error);
      const message = error.response?.data?.detail || 'Ошибка при отправке теста';
      toast.error(typeof message === 'string' ? message : 'Ошибка при отправке теста');
    } finally {
      setSubmitting(false);
    }
  }, [id, answers, navigate, submitting]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Загрузка теста...</p>
        </div>
      </div>
    );
  }

  const timeWarning = timeRemaining < 300;
  const timeCritical = timeRemaining < 60;
  const answeredCount = Object.keys(answers).length;
  const progressPercent = (answeredCount / questions.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{testData?.test_title}</h1>
              <p className="text-xs text-gray-500">Вопрос {answeredCount} из {questions.length}</p>
            </div>
            
            {/* Timer */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
              timeCritical ? 'bg-red-100 text-red-700' :
              timeWarning ? 'bg-yellow-100 text-yellow-700' :
              'bg-indigo-100 text-indigo-700'
            }`}>
              <Clock className="h-4 w-4" />
              <span className="font-mono">{formatTime(timeRemaining)}</span>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className="bg-indigo-600 h-1.5 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        <div className="space-y-4">
          {questions.map((question, index) => (
            <div key={question.id} className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0 w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-medium text-gray-900"
                        dangerouslySetInnerHTML={{ __html: question.prompt }} 
                    />
                    <span className="text-xs text-gray-500 whitespace-nowrap">{question.score} б.</span>
                  </div>
                </div>
              </div>

              {/* Multiple Choice */}
              {question.type === 'multiple_choice' && question.options && (
                <div className="space-y-2 ml-10">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        answers[question.id] === option.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option.id}
                        checked={answers[question.id] === option.id}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">{option.id}. {option.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Open Answer */}
              {question.type === 'open_answer' && (
                <div className="ml-10">
                  <textarea
                    value={answers[question.id] || ''}
                    onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    rows={4}
                    className="block w-full rounded-lg border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="Введите ваш ответ..."
                  />
                </div>
              )}

              {/* Cloze */}
              {question.type === 'cloze' && (
                <div className="ml-10 space-y-2">
                  {Array.from({ length: question.gaps_count || 0 }, (_, i) => (
                    <div key={i}>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Пропуск {i + 1}:
                      </label>
                      <input
                        type="text"
                        value={answers[question.id]?.[`gap_${i + 1}`] || ''}
                        onChange={(e) => handleAnswerChange(question.id, {
                          ...answers[question.id],
                          [`gap_${i + 1}`]: e.target.value
                        })}
                        className="block w-full rounded-lg border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="Введите ответ..."
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Status indicator */}
              {answers[question.id] ? (
                <div className="ml-10 mt-2 flex items-center text-xs text-green-600">
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                  <span>Отвечено</span>
                </div>
              ) : (
                <div className="ml-10 mt-2 flex items-center text-xs text-gray-400">
                  <AlertCircle className="h-3.5 w-3.5 mr-1" />
                  <span>Ответ не дан</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{answeredCount}</span> / {questions.length} отвечено
            </div>
            
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4 mr-2" />
              {submitting ? 'Отправка...' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}