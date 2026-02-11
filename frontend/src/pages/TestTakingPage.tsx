import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Send, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { testsApi } from '../services/api';
import toast from 'react-hot-toast';

interface Question {
  id: number;
  type: string;
  prompt: string;
  score: number;
  options?: Array<{ id: string; text: string }>;
  gaps_count?: number;
  media?: Array<{ type: string; url?: string; path?: string }>;
  answer_type?: 'multiple_choice' | 'single_choice' | 'open_answer' | 'true_false';
}

interface TestState {
  answers: Record<string, any>;
  startTime: string;
  attemptId: number;
  testData: any;
  questions: Question[];
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
  const [testStarted, setTestStarted] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const isNavigatingRef = useRef(false);
  const autoSaveIntervalRef = useRef<number | null>(null);

  const STORAGE_KEY = `test_state_${id}`;
  const TAB_SWITCH_KEY = `test_tabs_${id}`;

  // Auto-save answers to localStorage
  const saveTestState = useCallback(() => {
    if (!testStarted || !startTime || !id) return;

    const state: TestState = {
      answers,
      startTime: startTime.toISOString(),
      attemptId: testData?.attempt_id,
      testData,
      questions
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(`${STORAGE_KEY}_lastSaved`, new Date().toISOString());
  }, [answers, startTime, testData, questions, testStarted, id, STORAGE_KEY]);

  // Auto-save every 5 seconds
  useEffect(() => {
    if (!testStarted) return;

    autoSaveIntervalRef.current = setInterval(() => {
      saveTestState();
    }, 5000);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [testStarted, saveTestState]);

  // Save immediately when answers change
  useEffect(() => {
    if (testStarted) {
      saveTestState();
    }
  }, [answers, saveTestState, testStarted]);

  // Load saved state or start new test
  useEffect(() => {
    const initializeTest = async () => {
      if (!id) return;
      
      try {
        setLoading(true);

        // Check for saved state
        const savedStateStr = localStorage.getItem(STORAGE_KEY);
        const savedTabCount = localStorage.getItem(TAB_SWITCH_KEY);

        if (savedStateStr) {
          // Restore from saved state
          const savedState: TestState = JSON.parse(savedStateStr);
          const savedStartTime = new Date(savedState.startTime);
          const elapsedSeconds = Math.floor((Date.now() - savedStartTime.getTime()) / 1000);
          const timeLimitSeconds = savedState.testData.time_limit_minutes * 60;
          const remaining = Math.max(0, timeLimitSeconds - elapsedSeconds);

          if (remaining > 0) {
            // Test still valid, restore state
            setTestData(savedState.testData);
            setQuestions(savedState.questions);
            setAnswers(savedState.answers);
            setStartTime(savedStartTime);
            setTimeRemaining(remaining);
            setTestStarted(true);
            setTabSwitchCount(savedTabCount ? parseInt(savedTabCount) : 0);

            toast.success('Тест восстановлен. Продолжайте с того места, где остановились.', {
              duration: 4000,
              icon: '🔄'
            });
          } else {
            // Time expired, auto-submit
            toast.error('Время теста истекло');
            await autoSubmitExpiredTest(savedState);
            return;
          }
        } else {
          // Start new test
          const data = await testsApi.startTest(parseInt(id));
          setTestData(data);
          setQuestions(data.questions || []);
          setTimeRemaining(data.time_limit_minutes * 60);
          const now = new Date();
          setStartTime(now);
          setTestStarted(true);
          
          // Store initial state
          sessionStorage.setItem('test_active', 'true');
          sessionStorage.setItem('test_id', id);
          if (data.attempt_id) {
            sessionStorage.setItem(
              `test_questions_${data.attempt_id}`,
              JSON.stringify(data.questions || [])
            );
          }
        }
      } catch (error: any) {
        console.error('Error initializing test:', error);
        toast.error(error.response?.data?.detail || 'Ошибка при загрузке теста');
        navigate(`/tests/${id}`);
      } finally {
        setLoading(false);
      }
    };

    initializeTest();
  }, [id, navigate]);

  // Auto-submit if time expired
  const autoSubmitExpiredTest = async (state: TestState) => {
    try {
      const result = await testsApi.submitTest(parseInt(id!), { answers: state.answers });
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TAB_SWITCH_KEY);
      sessionStorage.removeItem('test_active');
      sessionStorage.removeItem('test_id');
      
      toast.success(`Тест автоматически отправлен. Результат: ${result.score.toFixed(1)}%`);
      navigate(`/tests/${id}/results/${result.attempt_id}`);
    } catch (error) {
      console.error('Error auto-submitting expired test:', error);
      navigate(`/tests/${id}`);
    }
  };

  // Timer countdown
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

  // Track tab visibility (optional - for proctored tests)
  useEffect(() => {
    if (!testStarted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab became hidden
        const newCount = tabSwitchCount + 1;
        setTabSwitchCount(newCount);
        localStorage.setItem(TAB_SWITCH_KEY, newCount.toString());

        // Show warning for first few switches
        if (newCount <= 3) {
          setShowTabWarning(true);
          setTimeout(() => setShowTabWarning(false), 3000);
        }

        // Optional: Log tab switch event
        console.log(`Tab switch detected (${newCount} times)`);
        
        // You could send this to backend for proctoring
        // testsApi.logTabSwitch(testData.attempt_id, newCount);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [testStarted, tabSwitchCount, testData]);

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

  // Submit without confirmation (for auto-submit on navigation)
  const submitWithoutConfirmation = useCallback(async () => {
    if (!id) return;
    if (submitting) return;
    
    try {
      setSubmitting(true);
      const result = await testsApi.submitTest(parseInt(id), { 
        answers,
        tab_switches: tabSwitchCount // Optional: send tab switch count
      });
      
      // Clear saved state
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TAB_SWITCH_KEY);
      sessionStorage.removeItem('test_active');
      sessionStorage.removeItem('test_id');
      
      sessionStorage.setItem(`test_result_${result.attempt_id}`, JSON.stringify(result));
      
      toast.success(`Тест отправлен! Ваш результат: ${result.score.toFixed(1)}%`);
      
      isNavigatingRef.current = true;
      setTestStarted(false);
      navigate(`/tests/${id}/results/${result.attempt_id}`);
    } catch (error: any) {
      console.error('Error submitting test:', error);
      const message = error.response?.data?.detail || 'Ошибка при отправке теста';
      toast.error(typeof message === 'string' ? message : 'Ошибка при отправке теста');
      setSubmitting(false);
    }
  }, [id, answers, tabSwitchCount, navigate, submitting, STORAGE_KEY, TAB_SWITCH_KEY]);

  const handleSubmit = useCallback(async () => {
    if (!id) return;
    if (submitting) return;
    
    const confirmed = window.confirm('Вы уверены, что хотите отправить тест? Это действие нельзя отменить.');
    if (!confirmed) return;
    
    try {
      setSubmitting(true);
      const result = await testsApi.submitTest(parseInt(id), { 
        answers,
        tab_switches: tabSwitchCount
      });
      
      // Clear saved state
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TAB_SWITCH_KEY);
      sessionStorage.removeItem('test_active');
      sessionStorage.removeItem('test_id');
      
      sessionStorage.setItem(`test_result_${result.attempt_id}`, JSON.stringify(result));
      
      toast.success(`Тест отправлен! Ваш результат: ${result.score.toFixed(1)}%`);
      
      isNavigatingRef.current = true;
      setTestStarted(false);
      navigate(`/tests/${id}/results/${result.attempt_id}`);
    } catch (error: any) {
      console.error('Error submitting test:', error);
      const message = error.response?.data?.detail || 'Ошибка при отправке теста';
      toast.error(typeof message === 'string' ? message : 'Ошибка при отправке теста');
    } finally {
      setSubmitting(false);
    }
  }, [id, answers, tabSwitchCount, navigate, submitting, STORAGE_KEY, TAB_SWITCH_KEY]);

  // Handle navigation away
  const handleConfirmNavigation = useCallback(async () => {
    setShowConfirmDialog(false);
    if (pendingNavigation) {
      const targetPath = pendingNavigation;
      setPendingNavigation(null);
      isNavigatingRef.current = true;
      await submitWithoutConfirmation();
      
      if (!targetPath.includes('/results/')) {
        setTimeout(() => {
          if (targetPath === '/login') {
            window.dispatchEvent(new CustomEvent('perform-logout'));
          } else {
            navigate(targetPath);
          }
        }, 500);
      }
    }
  }, [pendingNavigation, submitWithoutConfirmation, navigate]);

  const handleCancelNavigation = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingNavigation(null);
  }, []);

  // Block browser navigation (refresh, close tab, etc.)
  useEffect(() => {
    if (!testStarted) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Auto-save before potentially leaving
      saveTestState();
      
      e.preventDefault();
      e.returnValue = 'Ваши ответы сохранены. При возвращении вы продолжите с того же места.';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [testStarted, saveTestState]);

  // Block browser back/forward button
  useEffect(() => {
    if (!testStarted || isNavigatingRef.current) return;

    const handlePopState = () => {
      if (isNavigatingRef.current) return;
      
      // Push state back to prevent navigation
      window.history.pushState(null, '', window.location.href);
      setPendingNavigation(window.location.pathname);
      setShowConfirmDialog(true);
    };

    // Push a state to enable back button blocking
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [testStarted]);

  // Intercept link clicks
  useEffect(() => {
    if (!testStarted) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      
      if (link && link.href) {
        const url = new URL(link.href);
        const currentUrl = new URL(window.location.href);
        
        // Only intercept if navigating to a different page (not results page)
        if (url.pathname !== currentUrl.pathname && !url.pathname.includes('/results/')) {
          e.preventDefault();
          e.stopPropagation();
          setPendingNavigation(url.pathname);
          setShowConfirmDialog(true);
        }
      }
    };

    document.addEventListener('click', handleClick, true);
    
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [testStarted]);

  // Intercept logout attempts
  useEffect(() => {
    if (!testStarted) return;

    const handleLogoutAttempt = (e: Event) => {
      const customEvent = e as CustomEvent;
      customEvent.preventDefault();
      customEvent.stopPropagation();
      
      // Show confirmation dialog for logout
      setPendingNavigation('/login'); // Logout will navigate to login
      setShowConfirmDialog(true);
    };

    window.addEventListener('logout-attempt', handleLogoutAttempt);
    
    return () => {
      window.removeEventListener('logout-attempt', handleLogoutAttempt);
    };
  }, [testStarted]);

  const answeredCount = Object.keys(answers).filter(key => {
    const answer = answers[key];
    if (Array.isArray(answer)) return answer.length > 0;
    if (typeof answer === 'object') return Object.values(answer).some(v => v);
    return answer !== null && answer !== undefined && answer !== '';
  }).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Tab Switch Warning */}
      {showTabWarning && (
        <div className="fixed top-4 right-4 bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg p-4 max-w-sm z-50 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-yellow-900">
                Смена вкладки обнаружена
              </h3>
              <p className="text-xs text-yellow-700 mt-1">
                Переключения вкладки отслеживаются. Количество: {tabSwitchCount}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-yellow-500 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Покинуть тест?
                </h3>
                <p className="text-sm text-gray-600">
                  Ваши ответы будут автоматически отправлены. Это действие нельзя отменить.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelNavigation}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Остаться
              </button>
              <button
                onClick={handleConfirmNavigation}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Отправить и выйти
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Timer and Progress Widget on Right Side */}
      <div className="hidden md:flex fixed right-4 top-20 z-50 flex-col gap-3">
        {/* Question Progress Widget */}
        <div className="bg-white border-2 border-gray-200 rounded-xl shadow-lg px-4 py-3 flex flex-col items-center gap-2 min-w-[140px]">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-base font-semibold text-gray-900">
              <span className="text-gray-700">{answeredCount}</span> / {questions.length}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-600">Отвечено</span>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-gray-600 h-2 rounded-full transition-all"
              style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Timer Widget */}
        <div className={`flex flex-col items-center gap-2 px-4 py-3 rounded-xl shadow-lg transition-all min-w-[140px] ${
          timeRemaining <= 60 ? 'bg-red-100 text-red-700 border-2 border-red-300' :
          timeRemaining <= 300 ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300' :
          'bg-gray-100 text-gray-700 border-2 border-gray-300'
        }`}>
          <Clock className="h-6 w-6" />
          <span className="font-mono text-xl font-bold">{formatTime(timeRemaining)}</span>
          <span className="text-xs font-medium opacity-75">Осталось</span>
        </div>

        {/* Tab Switch Warning Badge */}
        {tabSwitchCount > 0 && (
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl shadow-lg px-3 py-2 text-center">
            <div className="text-xs font-semibold text-yellow-900">Переключений</div>
            <div className="text-lg font-bold text-yellow-700">{tabSwitchCount}</div>
          </div>
        )}
      </div>

      {/* Header with improved styling */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">
                {testData?.test_title || testData?.title}
              </h1>
              {testData?.description && (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {testData.description}
                </p>
              )}
            </div>
            
            {/* Mobile: Show timer and progress inline */}
            <div className="md:hidden flex flex-col gap-2 items-end flex-shrink-0">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                timeRemaining <= 60 ? 'bg-red-50 text-red-700 border border-red-300' : 
                timeRemaining <= 300 ? 'bg-yellow-50 text-yellow-700 border border-yellow-300' : 
                'bg-gray-50 text-gray-700 border border-gray-300'
              }`}>
                <Clock className="h-4 w-4" />
                <span className="font-mono font-semibold text-sm">
                  {formatTime(timeRemaining)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-semibold text-gray-700">
                  {answeredCount}/{questions.length}
                </span>
              </div>
            </div>
          </div>
          
          {/* Auto-save indicator */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500">Автосохранение активно</span>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pr-4 sm:pr-6 lg:pr-8">
        <div className="space-y-6">
          {questions.map((question, index) => (
            <div
              key={question.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              {/* Question Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-sm font-semibold">
                      {index + 1}
                    </span>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {question.type === 'visual' ? 'Визуальный' :
                       question.type === 'multiple_choice' ? 'Множественный выбор' :
                       question.type === 'open_answer' ? 'Открытый ответ' :
                       question.type === 'cloze' ? 'Заполнение пропусков' : question.type}
                    </span>
                  </div>
                  <div
                    className="text-gray-900 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: question.prompt }}
                  />
                </div>
                <div className="ml-4 text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                  {question.score} {question.score === 1 ? 'балл' : 'баллов'}
                </div>
              </div>

              {/* Media content - Images/Videos for visual questions */}
              {question.type === 'visual' && question.media && question.media.length > 0 && (
                <div className="mb-4 ml-10">
                  <div className="grid grid-cols-1 gap-3">
                    {question.media.map((item, mediaIndex) => (
                      <div key={mediaIndex}>
                        {item.type === 'image' && (
                          <img
                            src={item.url || item.path}
                            alt={`Question ${index + 1} visual ${mediaIndex + 1}`}
                            className="rounded-lg border border-gray-200 max-w-full h-auto"
                          />
                        )}
                        {item.type === 'video' && (
                          <video
                            controls
                            src={item.url || item.path}
                            className="rounded-lg border border-gray-200 max-w-full h-auto"
                          >
                            Ваш браузер не поддерживает видео.
                          </video>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Answer options based on question type */}
              {/* Visual Question with Multiple/Single Choice */}
              {question.type === 'visual' && (question.answer_type === 'multiple_choice' || question.answer_type === 'single_choice') && question.options && (
                <div className="space-y-2 ml-10">
                  {[...question.options].sort((a, b) => a.id.localeCompare(b.id)).map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        (question.answer_type === 'single_choice' ? answers[question.id] === option.id : 
                         Array.isArray(answers[question.id]) ? answers[question.id].includes(option.id) : false)
                          ? 'border-gray-500 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type={question.answer_type === 'single_choice' ? 'radio' : 'checkbox'}
                        name={`question-${question.id}`}
                        value={option.id}
                        checked={question.answer_type === 'single_choice' 
                          ? answers[question.id] === option.id
                          : Array.isArray(answers[question.id]) && answers[question.id].includes(option.id)}
                        onChange={(e) => {
                          if (question.answer_type === 'single_choice') {
                            handleAnswerChange(question.id, option.id);
                          } else {
                            const currentAnswers = Array.isArray(answers[question.id]) ? answers[question.id] : [];
                            if (e.target.checked) {
                              handleAnswerChange(question.id, [...currentAnswers, option.id]);
                            } else {
                              handleAnswerChange(question.id, currentAnswers.filter((id: string) => id !== option.id));
                            }
                          }
                        }}
                        className="w-4 h-4 text-gray-600 focus:ring-gray-500"
                      />
                      <span className="text-sm text-gray-700">{option.id}. {option.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Visual Question with Open Answer */}
              {question.type === 'visual' && question.answer_type === 'open_answer' && (
                <div className="ml-10">
                  <textarea
                    value={answers[question.id] || ''}
                    onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    placeholder="Введите ваш ответ..."
                    rows={4}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 text-sm"
                  />
                </div>
              )}

              {/* Visual Question with True/False */}
              {question.type === 'visual' && question.answer_type === 'true_false' && question.options && (
                <div className="space-y-2 ml-10">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        answers[question.id] === option.id
                          ? 'border-gray-500 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option.id}
                        checked={answers[question.id] === option.id}
                        onChange={() => handleAnswerChange(question.id, option.id)}
                        className="w-4 h-4 text-gray-600 focus:ring-gray-500"
                      />
                      <span className="text-sm text-gray-700">{option.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Multiple Choice (non-visual) */}
              {question.type === 'multiple_choice' && question.options && (
                <div className="space-y-2 ml-10">
                  {[...question.options].sort((a, b) => a.id.localeCompare(b.id)).map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        answers[question.id] === option.id
                          ? 'border-gray-500 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option.id}
                        checked={answers[question.id] === option.id}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                        className="w-4 h-4 text-gray-600 focus:ring-gray-500"
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
                    className="block w-full rounded-lg border-gray-300 text-sm focus:border-gray-500 focus:ring-gray-500"
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
                        className="block w-full rounded-lg border-gray-300 text-sm focus:border-gray-500 focus:ring-gray-500"
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