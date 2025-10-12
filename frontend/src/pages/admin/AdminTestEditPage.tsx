import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { testsApi } from '../../services/api';

interface Unit {
  id: number;
  title: string;
  level: string;
}

interface QuestionOption {
  id: string;
  text: string;
}

interface Question {
  id: string | number;
  type: 'multiple_choice' | 'open_answer' | 'cloze';
  prompt: string;
  score: number;
  autograde: boolean;
  question_metadata: {
    difficulty?: string;
    tags?: string[];
  };
  options?: QuestionOption[];
  correct_option_ids?: string[];
  shuffle_options?: boolean;
  expected?: {
    mode: 'keywords' | 'regex';
    keywords?: Array<{ text: string; weight: number }>;
    pattern?: string;
    case_insensitive?: boolean;
    normalize_accents?: boolean;
    allow_typos?: number;
  };
  manual_review_if_below?: number;
  gaps?: Array<{
    id: string;
    answer: string;
    variants?: string[];
    case_insensitive?: boolean;
    trim?: boolean;
    partial_credit?: boolean;
    score: number;
  }>;
}

interface TestSettings {
  passing_score: number;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_results_immediately: boolean;
  allow_review: boolean;
  availability_from?: string;
  availability_to?: string;
}

type TestStatus = 'draft' | 'ready' | 'published' | 'archived';

const AdminTestEditPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'questions' | 'settings' | 'preview' | 'review'>('questions');
  const [testTitle, setTestTitle] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [timeLimit, setTimeLimit] = useState(30);
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [status, setStatus] = useState<TestStatus>('draft');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState<TestSettings>({
    passing_score: 70,
    max_attempts: 1,
    shuffle_questions: false,
    shuffle_options: true,
    show_results_immediately: true,
    allow_review: true,
  });
  const [units, setUnits] = useState<Unit[]>([]);

  // Load test data
  useEffect(() => {
    loadTestData();
    loadUnits();
  }, [id]);

  const loadTestData = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      const testData = await testsApi.getTest(parseInt(id));
      
      setTestTitle(testData.title);
      setSelectedUnitId(testData.unit_id || null);
      setDescription(testData.description || '');
      setInstructions(testData.instructions || '');
      setTimeLimit(testData.time_limit_minutes || 30);
      setStatus(testData.status as TestStatus);
      
      if (testData.settings) {
        setSettings({
          passing_score: testData.settings.passing_score || testData.passing_score || 70,
          max_attempts: testData.settings.max_attempts || 1,
          shuffle_questions: testData.settings.shuffle_questions || false,
          shuffle_options: testData.settings.shuffle_options || true,
          show_results_immediately: testData.settings.show_results_immediately !== false,
          allow_review: testData.settings.allow_review !== false,
          availability_from: testData.settings.availability_from,
          availability_to: testData.settings.availability_to,
        });
      }

      // Load questions
      try {
        const questionsData = await testsApi.getTestQuestions(parseInt(id));
        if (questionsData.questions) {
          setQuestions(questionsData.questions.map((tq: any) => ({
            id: tq.question.id,
            type: tq.question.type,
            prompt: tq.question.prompt_rich,
            score: tq.points || tq.question.points,
            autograde: tq.question.autograde,
            question_metadata: tq.question.question_metadata || {},
            options: tq.question.options || [],
            correct_option_ids: tq.question.correct_answer?.correct_option_ids || [],
            shuffle_options: tq.question.shuffle_options,
            expected: tq.question.expected_answer_config,
            manual_review_if_below: tq.question.manual_review_threshold,
            gaps: tq.question.gaps_config || [],
          })));
        }
      } catch (qError) {
        console.error('Error loading questions:', qError);
      }

    } catch (error: any) {
      console.error('Error loading test:', error);
      toast.error('Ошибка загрузки теста');
      navigate('/admin/tests');
    } finally {
      setLoading(false);
    }
  };

  const loadUnits = async () => {
    try {
      const response = await testsApi.getTestResources();
      setUnits(response.units || []);
    } catch (error) {
      console.error('Error loading units:', error);
    }
  };
  
  // Add a new blank question to the test
  const addMCQQuestion = async () => {
    if (!id) return;
    
    try {
      const questionData = {
        type: 'multiple_choice',
        prompt: 'Новый вопрос с выбором ответа',
        score: 1,
        autograde: true,
        metadata: { difficulty: 'medium', tags: [] },
        options: [
          { id: 'A', text: 'Вариант A' },
          { id: 'B', text: 'Вариант B' },
          { id: 'C', text: 'Вариант C' },
        ],
        correct_option_ids: ['A'],
        shuffle_options: true,
      };
      
      await testsApi.addQuestionToTest(parseInt(id), questionData);
      toast.success('Вопрос добавлен');
      await loadTestData();
    } catch (error: any) {
      console.error('Error adding question:', error);
      toast.error('Ошибка при добавлении вопроса');
    }
  };
  
  const addOpenAnswerQuestion = async () => {
    if (!id) return;
    
    try {
      const questionData = {
        type: 'open_answer',
        prompt: 'Новый открытый вопрос',
        score: 2,
        autograde: true,
        metadata: { difficulty: 'medium', tags: [] },
        expected: {
          mode: 'keywords',
          keywords: [{ text: 'ключевое слово', weight: 1.0 }],
          case_insensitive: true,
          normalize_accents: true,
        },
        manual_review_if_below: 0.6,
      };
      
      await testsApi.addQuestionToTest(parseInt(id), questionData);
      toast.success('Вопрос добавлен');
      await loadTestData();
    } catch (error: any) {
      console.error('Error adding question:', error);
      toast.error('Ошибка при добавлении вопроса');
    }
  };
  
  // Remove question from test
  const handleRemoveQuestion = async (questionId: number | string) => {
    if (!id) return;
    
    if (!window.confirm('Удалить этот вопрос из теста?')) return;
    
    try {
      await testsApi.removeQuestionFromTest(parseInt(id), typeof questionId === 'string' ? parseInt(questionId) : questionId);
      toast.success('Вопрос удален');
      // Reload questions
      await loadTestData();
    } catch (error: any) {
      console.error('Error removing question:', error);
      toast.error('Ошибка при удалении вопроса');
    }
  };

  const handleSave = async () => {
    if (!testTitle.trim()) {
      toast.error('Укажите название теста');
      return;
    }

    setSaving(true);
    try {
      const testData = {
        title: testTitle,
        description,
        instructions,
        unit_id: selectedUnitId,
        time_limit_minutes: timeLimit,
        passing_score: settings.passing_score,
        settings: {
          max_attempts: settings.max_attempts,
          shuffle_questions: settings.shuffle_questions,
          shuffle_options: settings.shuffle_options,
          show_results_immediately: settings.show_results_immediately,
          allow_review: settings.allow_review,
          availability_from: settings.availability_from,
          availability_to: settings.availability_to,
        },
      };

      await testsApi.updateTest(parseInt(id!), testData);
      toast.success('Тест сохранен');
      navigate('/admin/tests');
    } catch (error: any) {
      console.error('Error saving test:', error);
      toast.error(error.response?.data?.detail || 'Ошибка сохранения теста');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: TestStatus) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'ready': return 'bg-blue-100 text-blue-800';
      case 'published': return 'bg-green-100 text-green-800';
      case 'archived': return 'bg-red-100 text-red-800';
    }
  };

  const getStatusText = (status: TestStatus) => {
    switch (status) {
      case 'draft': return 'Черновик';
      case 'ready': return 'Готов';
      case 'published': return 'Опубликован';
      case 'archived': return 'Архивирован';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/admin/tests')}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-md"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900">Редактировать тест</h1>
                <div className="mt-2 flex items-center space-x-4">
                  <select
                    value={selectedUnitId || ''}
                    onChange={(e) => setSelectedUnitId(e.target.value ? parseInt(e.target.value) : null)}
                    className="block w-64 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    disabled={status === 'published'}
                  >
                    <option value="">Без юнита</option>
                    {units.map(unit => (
                      <option key={unit.id} value={unit.id}>
                        {unit.level} - {unit.title}
                      </option>
                    ))}
                  </select>

                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(status)}`}>
                    {getStatusText(status)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Test Title and Time Limit */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <input
                type="text"
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                placeholder="Название теста"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-lg"
                disabled={status === 'published'}
              />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Время:</label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value) || 0)}
                  min="1"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  disabled={status === 'published'}
                />
                <span className="text-sm text-gray-500">мин</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'questions', label: 'Вопросы', count: questions.length },
                { id: 'settings', label: 'Настройки' },
                { id: 'preview', label: 'Предпросмотр' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-900">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
        {activeTab === 'questions' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Вопросы теста ({questions.length})
                </h2>
                <div className="flex items-center space-x-2">
                  {status === 'published' ? (
                    <div className="text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-md">
                      Опубликованный тест - только просмотр
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={addMCQQuestion}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        title="Добавить вопрос с выбором ответа"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Выбор ответа
                      </button>
                      <button
                        onClick={addOpenAnswerQuestion}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        title="Добавить открытый вопрос"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Открытый ответ
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {questions.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 mb-4">В этом тесте пока нет вопросов</p>
                  {status !== 'published' ? (
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={addMCQQuestion}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Выбор ответа
                      </button>
                      <button
                        onClick={addOpenAnswerQuestion}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Открытый ответ
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 mt-2">Опубликованный тест не может быть изменен</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {questions.map((question, index) => (
                    <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          {status !== 'published' && (
                            <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
                          )}
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">Вопрос {index + 1}</span>
                            <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                              {question.type === 'multiple_choice' ? 'Выбор ответа' : 
                               question.type === 'open_answer' ? 'Открытый ответ' : 'Пропуски'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-600">{question.score} баллов</span>
                          {status !== 'published' && (
                            <button
                              onClick={() => handleRemoveQuestion(question.id)}
                              className="p-1 text-red-600 hover:text-red-800"
                              title="Удалить вопрос"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-gray-700">{question.prompt}</p>
                      
                      {question.type === 'multiple_choice' && question.options && (
                        <div className="mt-2 ml-4 space-y-1">
                          {question.options.map(opt => (
                            <div key={opt.id} className="flex items-center space-x-2 text-sm">
                              <span className={`w-4 h-4 rounded-full border ${
                                question.correct_option_ids?.includes(opt.id) 
                                  ? 'bg-green-500 border-green-500' 
                                  : 'border-gray-300'
                              }`}></span>
                              <span className="text-gray-600">{opt.id}.</span>
                              <span>{opt.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {status !== 'published' && questions.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  💡 Используйте кнопки "Выбор ответа" или "Открытый ответ" выше, чтобы добавить новые вопросы.
                  Вопросы можно удалить, нажав на иконку корзины.
                </p>
              </div>
            )}
            
            {status === 'published' && questions.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ Этот тест опубликован. Чтобы изменить вопросы, сначала переведите его в черновик.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Настройки теста</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Проходной балл (%)
                </label>
                <input
                  type="number"
                  value={settings.passing_score}
                  onChange={(e) => setSettings({ ...settings, passing_score: parseInt(e.target.value) || 0 })}
                  min="0"
                  max="100"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Максимум попыток
                </label>
                <input
                  type="number"
                  value={settings.max_attempts}
                  onChange={(e) => setSettings({ ...settings, max_attempts: parseInt(e.target.value) || 0 })}
                  min="1"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.shuffle_questions}
                  onChange={(e) => setSettings({ ...settings, shuffle_questions: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ml-2 text-sm text-gray-700">Перемешивать вопросы</label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.shuffle_options}
                  onChange={(e) => setSettings({ ...settings, shuffle_options: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ml-2 text-sm text-gray-700">Перемешивать варианты ответов</label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.show_results_immediately}
                  onChange={(e) => setSettings({ ...settings, show_results_immediately: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ml-2 text-sm text-gray-700">Показывать результаты сразу</label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.allow_review}
                  onChange={(e) => setSettings({ ...settings, allow_review: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ml-2 text-sm text-gray-700">Разрешить просмотр ответов</label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{testTitle || 'Без названия'}</h1>
              <p className="text-gray-600">Время: {timeLimit} минут | Вопросов: {questions.length}</p>
            </div>

            <div className="space-y-6">
              {questions.map((question, index) => (
                <div key={question.id} className="pb-6 border-b border-gray-200 last:border-0">
                  <div className="flex items-start space-x-3 mb-4">
                    <span className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-semibold">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium">{question.prompt || 'Текст вопроса'}</p>
                      <p className="text-sm text-gray-500 mt-1">{question.score} баллов</p>
                    </div>
                  </div>

                  {question.type === 'multiple_choice' && (
                    <div className="ml-11 space-y-2">
                      {question.options?.map(option => (
                        <div key={option.id} className="flex items-center space-x-2">
                          <input type="radio" name={`preview-${question.id}`} className="text-primary-600" disabled />
                          <label className="text-gray-700">{option.text || 'Вариант ответа'}</label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/admin/tests')}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Отменить
            </button>
            <div className="flex space-x-3">
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminTestEditPage;
