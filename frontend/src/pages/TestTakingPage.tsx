import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Send, AlertCircle } from 'lucide-react';
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

  // Load test and start attempt
  useEffect(() => {
    const startTest = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const data = await testsApi.startTest(parseInt(id));
        setTestData(data);
        setQuestions(data.questions || []);
        setTimeRemaining(data.time_limit_minutes * 60); // Convert to seconds
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

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0 || !startTime) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up - auto submit
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, startTime]);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle answer change
  const handleAnswerChange = (questionId: number, answer: any) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer
    }));
  };

  // Submit test
  const handleSubmit = useCallback(async () => {
    if (!id) return;
    
    if (submitting) return;
    
    const confirmed = window.confirm('Вы уверены, что хотите отправить тест? Это действие нельзя отменить.');
    if (!confirmed) return;
    
    try {
      setSubmitting(true);
      const result = await testsApi.submitTest(parseInt(id), { answers });
      
      // Save result to sessionStorage for results page
      sessionStorage.setItem(`test_result_${result.attempt_id}`, JSON.stringify(result));
      
      toast.success(`Тест отправлен! Ваш результат: ${result.score.toFixed(1)}%`);
      
      // Navigate to results page
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка теста...</p>
        </div>
      </div>
    );
  }

  const timeWarning = timeRemaining < 300; // Less than 5 minutes
  const timeCritical = timeRemaining < 60; // Less than 1 minute

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Sticky Header with Timer */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{testData?.test_title}</h1>
              <p className="text-sm text-gray-500">Вопросов: {questions.length}</p>
            </div>
            
            {/* Timer */}
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
              timeCritical ? 'bg-red-100 text-red-700' :
              timeWarning ? 'bg-yellow-100 text-yellow-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              <Clock className="h-5 w-5" />
              <span className="text-lg font-mono font-bold">{formatTime(timeRemaining)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {questions.map((question, index) => (
            <div key={question.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start space-x-3 mb-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-semibold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-medium text-gray-900"
                        dangerouslySetInnerHTML={{ __html: question.prompt }} 
                    />
                    <span className="text-sm text-gray-500 ml-4">{question.score} баллов</span>
                  </div>
                </div>
              </div>

              {/* Multiple Choice */}
              {question.type === 'multiple_choice' && question.options && (
                <div className="space-y-3 ml-11">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option.id}
                        checked={answers[question.id] === option.id}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-gray-700">{option.id}. {option.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Open Answer */}
              {question.type === 'open_answer' && (
                <div className="ml-11">
                  <textarea
                    value={answers[question.id] || ''}
                    onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    rows={4}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    placeholder="Введите ваш ответ..."
                  />
                </div>
              )}

              {/* Cloze (Fill in the gaps) */}
              {question.type === 'cloze' && (
                <div className="ml-11">
                  <div className="text-gray-700">
                    {/* Simple gap input for now */}
                    {Array.from({ length: question.gaps_count || 0 }, (_, i) => (
                      <div key={i} className="mb-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Пропуск {i + 1}:
                        </label>
                        <input
                          type="text"
                          value={answers[question.id]?.[`gap_${i + 1}`] || ''}
                          onChange={(e) => handleAnswerChange(question.id, {
                            ...answers[question.id],
                            [`gap_${i + 1}`]: e.target.value
                          })}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                          placeholder="Введите ответ..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Answer indicator */}
              {!answers[question.id] && (
                <div className="ml-11 mt-2 flex items-center text-sm text-gray-400">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  <span>Ответ не дан</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Progress indicator */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Отвечено: {Object.keys(answers).length} из {questions.length}
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2" style={{ width: '300px' }}>
                <div 
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }}
                />
              </div>
            </div>
            
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              <Send className="h-5 w-5 mr-2" />
              {submitting ? 'Отправка...' : 'Отправить тест'}
            </button>
          </div>
        </div>
      </div>

      {/* Warning for unanswered questions */}
      {Object.keys(answers).length < questions.length && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-lg max-w-md">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-2" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">
                Не все вопросы отвечены
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                Осталось: {questions.length - Object.keys(answers).length} вопросов
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

