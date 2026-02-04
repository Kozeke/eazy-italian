import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Save,
  CheckCircle,
  Send,
  Plus,
  Trash2,
  GripVertical,
  AlertCircle
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
  id: string; // temporary ID for frontend
  type: 'multiple_choice' | 'open_answer' | 'cloze';
  prompt: string;
  score: number;
  question_metadata: Record<string, any>; // Simplified - no specific fields
  // MCQ specific
  options?: QuestionOption[];
  correct_option_ids?: string[];
  shuffle_options?: boolean;
  // Open answer specific
  expected?: {
    mode: 'keywords' | 'regex';
    keywords?: Array<{ text: string; weight: number }>;
    pattern?: string;
    case_insensitive?: boolean;
    allow_typos?: number;
  };
  // Cloze specific
  gaps?: Array<{
    id: string;
    answer: string;
    case_insensitive?: boolean;
    score: number; // Auto-calculated proportionally
  }>;
}

interface TestSettings {
  passing_score: number;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_results_immediately: boolean;
  allow_review: boolean;
  deadline?: string;
  availability_from?: string;
  availability_to?: string;
}

type TestStatus = 'draft' | 'ready' | 'published' | 'archived';

const AdminTestCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const unitId = searchParams.get('unitId');

  // State
  const [activeTab, setActiveTab] = useState<'questions' | 'settings' | 'preview' | 'review'>('questions');
  const [testTitle, setTestTitle] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(unitId ? parseInt(unitId) : null);
  const [timeLimit, setTimeLimit] = useState(30);
  const [description] = useState('');
  const [instructions] = useState('');
  const [status, setStatus] = useState<TestStatus>('draft');
  const [questions, setQuestions] = useState<Question[]>([]);
  // Calculate deadline: 1 week from now
  const getDefaultDeadline = () => {
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    // Format as datetime-local string (YYYY-MM-DDTHH:mm)
    return oneWeekFromNow.toISOString().slice(0, 16);
  };

  const [settings, setSettings] = useState<TestSettings>({
    passing_score: 70,
    max_attempts: 1,
    shuffle_questions: false,
    shuffle_options: true,
    show_results_immediately: true,
    allow_review: true,
    deadline: getDefaultDeadline(),
  });
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Load units
  useEffect(() => {
    loadUnits();
  }, []);

  const loadUnits = async () => {
    try {
      const response = await testsApi.getTestResources();
      setUnits(response.units || []);
    } catch (error) {
      console.error('Error loading units:', error);
      toast.error('Ошибка загрузки юнитов');
      // Fallback to mock data if API fails
      const mockUnits: Unit[] = [
        { id: 1, title: 'Приветствие и знакомство', level: 'A1' },
        { id: 2, title: 'Числа и время', level: 'A1' },
        { id: 3, title: 'Повседневные фразы', level: 'A2' },
      ];
      setUnits(mockUnits);
    }
  };

  // Add question handlers
  const addMCQQuestion = () => {
    const newQuestion: Question = {
      id: `temp-${Date.now()}`,
      type: 'multiple_choice',
      prompt: '',
      score: 1,
      question_metadata: {},
      options: [
        { id: 'A', text: '' },
        { id: 'B', text: '' },
      ],
      correct_option_ids: [],
      shuffle_options: true,
    };
    setQuestions([...questions, newQuestion]);
  };

  const addOpenAnswerQuestion = () => {
    const newQuestion: Question = {
      id: `temp-${Date.now()}`,
      type: 'open_answer',
      prompt: '',
      score: 2,
      question_metadata: {},
      expected: {
        mode: 'keywords',
        keywords: [{ text: '', weight: 1.0 }],
        case_insensitive: true,
        allow_typos: 0,
      },
    };
    setQuestions([...questions, newQuestion]);
  };

  const addClozeQuestion = () => {
    const newQuestion: Question = {
      id: `temp-${Date.now()}`,
      type: 'cloze',
      prompt: '',
      score: 1,
      question_metadata: {},
      gaps: [
        { id: 'gap_1', answer: '', case_insensitive: true, score: 0.5 },
      ],
    };
    setQuestions([...questions, newQuestion]);
  };

  const removeQuestion = (questionId: string) => {
    setQuestions(questions.filter(q => q.id !== questionId));
  };

  const updateQuestion = (questionId: string, updates: Partial<Question>) => {
    setQuestions(questions.map(q => q.id === questionId ? { ...q, ...updates } : q));
  };

  // Validation
  const validateTest = (): string[] => {
    const errors: string[] = [];

    if (!testTitle.trim()) {
      errors.push('Название теста обязательно');
    }

    if (questions.length === 0) {
      errors.push('Добавьте хотя бы один вопрос');
    }

    questions.forEach((q, index) => {
      if (!q.prompt.trim()) {
        errors.push(`Вопрос ${index + 1}: требуется текст вопроса`);
      }

      if (q.type === 'multiple_choice') {
        if (!q.options || q.options.length < 2) {
          errors.push(`Вопрос ${index + 1}: нужно минимум 2 варианта ответа`);
        }
        if (!q.correct_option_ids || q.correct_option_ids.length === 0) {
          errors.push(`Вопрос ${index + 1}: выберите правильный ответ`);
        }
        if (q.options?.some(opt => !opt.text.trim())) {
          errors.push(`Вопрос ${index + 1}: все варианты должны иметь текст`);
        }
      }

      if (q.type === 'open_answer') {
        if (q.expected?.mode === 'keywords' && (!q.expected.keywords || q.expected.keywords.length === 0)) {
          errors.push(`Вопрос ${index + 1}: добавьте ключевые слова`);
        }
        if (q.expected?.mode === 'regex' && !q.expected.pattern) {
          errors.push(`Вопрос ${index + 1}: укажите regex паттерн`);
        }
      }

      if (q.type === 'cloze') {
        if (!q.gaps || q.gaps.length === 0) {
          errors.push(`Вопрос ${index + 1}: добавьте хотя бы один пропуск`);
        }
        q.gaps?.forEach((gap, gapIndex) => {
          const gapToken = `{{${gap.id}}}`;
          if (!q.prompt.includes(gapToken)) {
            errors.push(`Вопрос ${index + 1}: пропуск ${gapToken} не найден в тексте`);
          }
          if (!gap.answer.trim()) {
            errors.push(`Вопрос ${index + 1}, пропуск ${gapIndex + 1}: укажите правильный ответ`);
          }
        });
      }
    });

    return errors;
  };

  // Save and publish handlers
  const handleSaveDraft = async () => {
    if (!testTitle.trim()) {
      toast.error('Укажите название теста');
      return;
    }

    setLoading(true);
    try {
      // Create test
      const testData = {
        unit_id: selectedUnitId,
        title: testTitle,
        description,
        instructions,
        time_limit_minutes: timeLimit,
        passing_score: settings.passing_score,
        status: 'draft',
        settings: {
          max_attempts: settings.max_attempts,
          shuffle_questions: settings.shuffle_questions,
          shuffle_options: settings.shuffle_options,
          show_results_immediately: settings.show_results_immediately,
          allow_review: settings.allow_review,
          deadline: settings.deadline,
          availability_from: settings.availability_from,
          availability_to: settings.availability_to,
        },
      };

      const createdTest = await testsApi.createTest(testData);
      
      // Add questions to the test
      for (const question of questions) {
        const questionPayload: any = {
          type: question.type,
          prompt: question.prompt,
          score: question.score,
      metadata: question.question_metadata || {},
        };

        if (question.type === 'multiple_choice') {
          questionPayload.options = question.options;
          questionPayload.correct_option_ids = question.correct_option_ids;
          questionPayload.shuffle_options = question.shuffle_options;
        } else if (question.type === 'open_answer') {
          questionPayload.expected = question.expected;
        } else if (question.type === 'cloze') {
          questionPayload.gaps = question.gaps;
        }

        await testsApi.addQuestionToTest(createdTest.id, questionPayload);
      }

      toast.success('Тест сохранен как черновик');
      navigate('/admin/tests');
    } catch (error: any) {
      console.error('Error saving test:', error);
      toast.error(error.response?.data?.detail || 'Ошибка сохранения теста');
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = () => {
    const errors = validateTest();
    setValidationErrors(errors);
    
    if (errors.length === 0) {
      toast.success('Валидация пройдена! Тест готов к публикации');
      setStatus('ready');
    } else {
      toast.error(`Найдено ошибок: ${errors.length}`);
      setActiveTab('review');
    }
  };

  const handlePublish = async () => {
    const errors = validateTest();
    if (errors.length > 0) {
      setValidationErrors(errors);
      setActiveTab('review');
      toast.error('Исправьте ошибки перед публикацией');
      return;
    }

    if (!testTitle.trim()) {
      toast.error('Укажите название теста');
      return;
    }

    setLoading(true);
    try {
      // Create test
      const testData = {
        unit_id: selectedUnitId,
        title: testTitle,
        description,
        instructions,
        time_limit_minutes: timeLimit,
        passing_score: settings.passing_score,
        status: 'draft', // Will be published after adding questions
        settings: {
          max_attempts: settings.max_attempts,
          shuffle_questions: settings.shuffle_questions,
          shuffle_options: settings.shuffle_options,
          show_results_immediately: settings.show_results_immediately,
          allow_review: settings.allow_review,
          deadline: settings.deadline,
          availability_from: settings.availability_from,
          availability_to: settings.availability_to,
        },
      };

      const createdTest = await testsApi.createTest(testData);
      
      // Add questions to the test
      for (const question of questions) {
        const questionPayload: any = {
          type: question.type,
          prompt: question.prompt,
          score: question.score,
      metadata: question.question_metadata || {},
        };

        if (question.type === 'multiple_choice') {
          questionPayload.options = question.options;
          questionPayload.correct_option_ids = question.correct_option_ids;
          questionPayload.shuffle_options = question.shuffle_options;
        } else if (question.type === 'open_answer') {
          questionPayload.expected = question.expected;
        } else if (question.type === 'cloze') {
          questionPayload.gaps = question.gaps;
        }

        await testsApi.addQuestionToTest(createdTest.id, questionPayload);
      }

      // Publish the test
      await testsApi.publishTest(createdTest.id);

      toast.success('Тест опубликован!');
      navigate('/admin/tests');
    } catch (error: any) {
      console.error('Error publishing test:', error);
      toast.error(error.response?.data?.detail || 'Ошибка публикации теста');
    } finally {
      setLoading(false);
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">Создать тест</h1>
              <div className="mt-2 flex items-center space-x-4">
                {/* Unit Selector */}
                <select
                  value={selectedUnitId || ''}
                  onChange={(e) => setSelectedUnitId(e.target.value ? parseInt(e.target.value) : null)}
                  className="block w-64 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                >
                  <option value="">Без юнита</option>
                  {units.map(unit => (
                    <option key={unit.id} value={unit.id}>
                      {unit.level} - {unit.title}
                    </option>
                  ))}
                </select>

                {/* Status Pill */}
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(status)}`}>
                  {getStatusText(status)}
                </span>
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
                { id: 'review', label: 'Проверка и публикация', count: validationErrors.length },
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
                    <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                      tab.id === 'review' && validationErrors.length > 0
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
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
        {/* Questions Tab */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Вопросы теста</h2>
              <div className="flex space-x-2">
                <button
                  onClick={addMCQQuestion}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Выбор ответа
                </button>
                <button
                  onClick={addOpenAnswerQuestion}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Открытый ответ
                </button>
                <button
                  onClick={addClozeQuestion}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Пропуски
                </button>
              </div>
            </div>

            {questions.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-gray-500">Нет вопросов. Добавьте первый вопрос используя кнопки выше.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {questions.map((question, index) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    index={index}
                    onUpdate={(updates) => updateQuestion(question.id, updates)}
                    onRemove={() => removeQuestion(question.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <SettingsTab 
            settings={settings} 
            onUpdate={setSettings}
            showAdvanced={showAdvancedSettings}
            onToggleAdvanced={() => setShowAdvancedSettings(!showAdvancedSettings)}
          />
        )}

        {/* Preview Tab */}
        {activeTab === 'preview' && (
          <PreviewTab 
            testTitle={testTitle}
            timeLimit={timeLimit}
            questions={questions}
          />
        )}

        {/* Review Tab */}
        {activeTab === 'review' && (
          <ReviewTab 
            validationErrors={validationErrors}
            testTitle={testTitle}
            questionCount={questions.length}
            totalPoints={questions.reduce((sum, q) => sum + q.score, 0)}
          />
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
                onClick={handleSaveDraft}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-2" />
                Сохранить черновик
              </button>
              <button
                onClick={handleValidate}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-primary-300 shadow-sm text-sm font-medium rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Проверить
              </button>
              <button
                onClick={handlePublish}
                disabled={loading || status !== 'ready'}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4 mr-2" />
                Опубликовать
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Question Card Component
interface QuestionCardProps {
  question: Question;
  index: number;
  onUpdate: (updates: Partial<Question>) => void;
  onRemove: () => void;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ question, index, onUpdate, onRemove }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'multiple_choice': return 'Multiple Choice';
      case 'open_answer': return 'Open Answer';
      case 'cloze': return 'Cloze';
      default: return type;
    }
  };

  const getPreviewText = () => {
    if (question.type === 'multiple_choice' && question.options && question.options.length > 0) {
      const preview = question.options.slice(0, 3).map((opt) => {
        const isCorrect = question.correct_option_ids?.includes(opt.id);
        return `${opt.id}. ${opt.text || '...'}${isCorrect ? ' ✅' : ''}`;
      }).join(' | ');
      return preview + (question.options.length > 3 ? '...' : '');
    }
    if (question.type === 'open_answer') {
      return question.expected?.mode === 'keywords' 
        ? `Keywords: ${question.expected.keywords?.map(k => k.text).join(', ') || '...'}`
        : `Regex: ${question.expected?.pattern || '...'}`;
    }
    if (question.type === 'cloze' && question.gaps && question.gaps.length > 0) {
      return `${question.gaps.length} gap(s)`;
    }
    return '...';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Collapsed Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-sm font-medium text-gray-900">Question {index + 1}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  {getQuestionTypeLabel(question.type)}
                </span>
                <span className="text-xs text-gray-500">{question.score} pts</span>
              </div>
              <div className="text-sm text-gray-700 line-clamp-1">
                {question.prompt || 'No question text'}
              </div>
              {(question.type === 'multiple_choice' || question.type === 'open_answer' || question.type === 'cloze') && (
                <div className="text-xs text-gray-500 mt-1">
                  {getPreviewText()}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-gray-600 hover:text-gray-900"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
            <button
              onClick={onRemove}
              className="p-1 text-red-600 hover:text-red-800"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Question Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question text</label>
            <textarea
              value={question.prompt}
              onChange={(e) => onUpdate({ prompt: e.target.value })}
              placeholder="Enter question text..."
              rows={3}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            />
          </div>

          {/* Points */}
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Points:</label>
            <input
              type="number"
              value={question.score}
              onChange={(e) => {
                const newScore = parseFloat(e.target.value) || 0;
                // Update gap scores proportionally for cloze questions
                if (question.type === 'cloze' && question.gaps && question.gaps.length > 0) {
                  const scorePerGap = newScore / question.gaps.length;
                  const updatedGaps = question.gaps.map(gap => ({
                    ...gap,
                    score: scorePerGap
                  }));
                  onUpdate({ score: newScore, gaps: updatedGaps });
                } else {
                  onUpdate({ score: newScore });
                }
              }}
              className="w-20 rounded-md border-gray-300 text-sm"
              step="0.5"
              min="0"
            />
          </div>

          {/* Type-specific fields */}
          {question.type === 'multiple_choice' && (
            <MCQFields question={question} onUpdate={onUpdate} showAdvanced={showAdvanced} onToggleAdvanced={() => setShowAdvanced(!showAdvanced)} />
          )}
          {question.type === 'open_answer' && (
            <OpenAnswerFields question={question} onUpdate={onUpdate} showAdvanced={showAdvanced} onToggleAdvanced={() => setShowAdvanced(!showAdvanced)} />
          )}
          {question.type === 'cloze' && (
            <ClozeFields question={question} onUpdate={onUpdate} showAdvanced={showAdvanced} onToggleAdvanced={() => setShowAdvanced(!showAdvanced)} />
          )}
        </div>
      )}
    </div>
  );
};

// MCQ Fields Component
const MCQFields: React.FC<{ question: Question; onUpdate: (updates: Partial<Question>) => void; showAdvanced: boolean; onToggleAdvanced: () => void }> = ({ question, onUpdate, showAdvanced, onToggleAdvanced }) => {

  const addOption = () => {
    const newId = String.fromCharCode(65 + (question.options?.length || 0));
    const newOptions = [...(question.options || []), { id: newId, text: '' }];
    onUpdate({ options: newOptions });
  };

  const updateOption = (optionId: string, text: string) => {
    const newOptions = question.options?.map(opt => 
      opt.id === optionId ? { ...opt, text } : opt
    );
    onUpdate({ options: newOptions });
  };

  const toggleCorrect = (optionId: string) => {
    const currentCorrect = question.correct_option_ids || [];
    const newCorrect = currentCorrect.includes(optionId)
      ? currentCorrect.filter(id => id !== optionId)
      : [...currentCorrect, optionId];
    onUpdate({ correct_option_ids: newCorrect });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Варианты ответов</label>
        <button
          onClick={addOption}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          + Добавить вариант
        </button>
      </div>
      {question.options?.map(option => (
        <div key={option.id} className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={question.correct_option_ids?.includes(option.id)}
            onChange={() => toggleCorrect(option.id)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="w-8 text-sm font-medium text-gray-500">{option.id}.</span>
          <input
            type="text"
            value={option.text}
            onChange={(e) => updateOption(option.id, e.target.value)}
            placeholder="Текст варианта..."
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>
      ))}

      {/* Advanced Question Settings */}
      <div className="pt-3 border-t">
        <button
          type="button"
          onClick={onToggleAdvanced}
          className="flex items-center justify-between w-full text-left text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          <span>⚙ Advanced grading options</span>
          <span className="text-gray-400">{showAdvanced ? '▼' : '▶'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-2 pt-3 border-t">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={question.shuffle_options ?? true}
                onChange={(e) => onUpdate({ shuffle_options: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label className="ml-2 text-xs text-gray-700">Shuffle options</label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Open Answer Fields Component
const OpenAnswerFields: React.FC<{ question: Question; onUpdate: (updates: Partial<Question>) => void; showAdvanced: boolean; onToggleAdvanced: () => void }> = ({ question, onUpdate, showAdvanced, onToggleAdvanced }) => {

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Режим проверки</label>
        <select
          value={question.expected?.mode || 'keywords'}
          onChange={(e) => onUpdate({ 
            expected: { ...question.expected!, mode: e.target.value as 'keywords' | 'regex' }
          })}
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="keywords">Ключевые слова</option>
          <option value="regex">Regex паттерн</option>
        </select>
      </div>

      {question.expected?.mode === 'keywords' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ключевые слова</label>
          {question.expected.keywords?.map((kw, index) => (
            <div key={index} className="flex items-center space-x-2 mb-2">
              <input
                type="text"
                value={kw.text}
                onChange={(e) => {
                  const newKeywords = [...(question.expected?.keywords || [])];
                  newKeywords[index] = { ...kw, text: e.target.value };
                  onUpdate({ expected: { ...question.expected!, keywords: newKeywords } });
                }}
                placeholder="Слово..."
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
          ))}
        </div>
      )}

      {question.expected?.mode === 'regex' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Regex паттерн</label>
          <input
            type="text"
            value={question.expected.pattern || ''}
            onChange={(e) => onUpdate({ 
              expected: { ...question.expected!, pattern: e.target.value }
            })}
            placeholder="^\\s*pattern\\s*$"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 font-mono text-sm"
          />
        </div>
      )}

      {/* Advanced Question Settings */}
      <div className="pt-3 border-t">
        <button
          type="button"
          onClick={onToggleAdvanced}
          className="flex items-center justify-between w-full text-left text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          <span>⚙ Advanced grading options</span>
          <span className="text-gray-400">{showAdvanced ? '▼' : '▶'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-2 pt-3 border-t">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={question.expected?.case_insensitive ?? true}
                onChange={(e) => onUpdate({
                  expected: { ...question.expected!, case_insensitive: e.target.checked }
                })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label className="ml-2 text-xs text-gray-700">Case insensitive</label>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Allow typos</label>
              <input
                type="number"
                value={question.expected?.allow_typos ?? 0}
                onChange={(e) => onUpdate({
                  expected: { ...question.expected!, allow_typos: parseInt(e.target.value) || 0 }
                })}
                min="0"
                max="5"
                className="block w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Cloze Fields Component
const ClozeFields: React.FC<{ question: Question; onUpdate: (updates: Partial<Question>) => void; showAdvanced: boolean; onToggleAdvanced: () => void }> = ({ question, onUpdate, showAdvanced, onToggleAdvanced }) => {
  // Calculate proportional score per gap (total question score / number of gaps)
  const scorePerGap = question.gaps && question.gaps.length > 0 
    ? question.score / question.gaps.length 
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Gaps (use {"{{gap_1}}"}, {"{{gap_2}}"} etc. in question text)
        </label>
        {question.gaps?.map((gap, index) => (
          <div key={gap.id} className="flex items-center space-x-2 mb-2 p-2 bg-gray-50 rounded">
            <span className="text-xs font-mono text-gray-600">{`{{${gap.id}}}`}</span>
            <input
              type="text"
              value={gap.answer}
              onChange={(e) => {
                const newGaps = [...(question.gaps || [])];
                newGaps[index] = { ...gap, answer: e.target.value, score: scorePerGap };
                onUpdate({ gaps: newGaps });
              }}
              placeholder="Correct answer..."
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            />
          </div>
        ))}
      </div>

      {/* Advanced Question Settings */}
      <div className="pt-3 border-t">
        <button
          type="button"
          onClick={onToggleAdvanced}
          className="flex items-center justify-between w-full text-left text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          <span>⚙ Advanced grading options</span>
          <span className="text-gray-400">{showAdvanced ? '▼' : '▶'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-2 pt-3 border-t">
            {question.gaps?.map((gap, index) => (
              <div key={gap.id} className="p-2 bg-gray-50 rounded space-y-2">
                <div className="text-xs font-medium text-gray-700">{`{{${gap.id}}}`}</div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={gap.case_insensitive ?? true}
                    onChange={(e) => {
                      const newGaps = [...(question.gaps || [])];
                      newGaps[index] = { ...gap, case_insensitive: e.target.checked };
                      onUpdate({ gaps: newGaps });
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className="ml-2 text-xs text-gray-700">Case insensitive</label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Settings Tab Component
const SettingsTab: React.FC<{ settings: TestSettings; onUpdate: (settings: TestSettings) => void; showAdvanced: boolean; onToggleAdvanced: () => void }> = ({ settings, onUpdate, showAdvanced, onToggleAdvanced }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Настройки теста</h2>

      {/* Simple Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Проходной балл (%)
          </label>
          <input
            type="number"
            value={settings.passing_score}
            onChange={(e) => onUpdate({ ...settings, passing_score: parseInt(e.target.value) || 0 })}
            min="0"
            max="100"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Дедлайн
          </label>
          <input
            type="datetime-local"
            value={settings.deadline || ''}
            onChange={(e) => onUpdate({ ...settings, deadline: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="pt-6 border-t">
        <button
          type="button"
          onClick={onToggleAdvanced}
          className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <span>Advanced test behavior</span>
          <span className="text-gray-400">{showAdvanced ? '▼' : '▶'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-6 pt-4 border-t">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Максимум попыток
              </label>
              <input
                type="number"
                value={settings.max_attempts}
                onChange={(e) => onUpdate({ ...settings, max_attempts: parseInt(e.target.value) || 0 })}
                min="1"
                className="block w-full max-w-xs rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.shuffle_questions}
                  onChange={(e) => onUpdate({ ...settings, shuffle_questions: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ml-2 text-sm text-gray-700">Перемешивать вопросы</label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.shuffle_options}
                  onChange={(e) => onUpdate({ ...settings, shuffle_options: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ml-2 text-sm text-gray-700">Перемешивать варианты ответов (глобально)</label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.show_results_immediately}
                  onChange={(e) => onUpdate({ ...settings, show_results_immediately: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ml-2 text-sm text-gray-700">Показывать результаты сразу</label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.allow_review}
                  onChange={(e) => onUpdate({ ...settings, allow_review: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ml-2 text-sm text-gray-700">Разрешить просмотр ответов</label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Доступен с
                </label>
                <input
                  type="datetime-local"
                  value={settings.availability_from || ''}
                  onChange={(e) => onUpdate({ ...settings, availability_from: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Доступен до
                </label>
                <input
                  type="datetime-local"
                  value={settings.availability_to || ''}
                  onChange={(e) => onUpdate({ ...settings, availability_to: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Preview Tab Component
const PreviewTab: React.FC<{ testTitle: string; timeLimit: number; questions: Question[] }> = ({ testTitle, timeLimit, questions }) => {
  return (
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

            {question.type === 'open_answer' && (
              <div className="ml-11">
                <textarea
                  rows={3}
                  placeholder="Ваш ответ..."
                  className="block w-full rounded-md border-gray-300 bg-gray-50"
                  disabled
                />
              </div>
            )}

            {question.type === 'cloze' && (
              <div className="ml-11">
                <p className="text-gray-700">
                  {question.prompt.split(/(\{\{gap_\d+\}\})/).map((part, i) => 
                    part.match(/\{\{gap_\d+\}\}/) ? (
                      <input
                        key={i}
                        type="text"
                        className="inline-block w-32 mx-1 rounded border-gray-300 bg-gray-50"
                        disabled
                      />
                    ) : part
                  )}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Review Tab Component
const ReviewTab: React.FC<{ 
  validationErrors: string[]; 
  testTitle: string; 
  questionCount: number;
  totalPoints: number;
}> = ({ validationErrors, testTitle, questionCount, totalPoints }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Сводка теста</h2>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Название</dt>
            <dd className="mt-1 text-lg font-semibold text-gray-900">{testTitle || 'Без названия'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Вопросов</dt>
            <dd className="mt-1 text-lg font-semibold text-gray-900">{questionCount}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Всего баллов</dt>
            <dd className="mt-1 text-lg font-semibold text-gray-900">{totalPoints}</dd>
          </div>
        </dl>
      </div>

      {validationErrors.length > 0 ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <h3 className="text-lg font-semibold text-red-900">
              Найдено ошибок: {validationErrors.length}
            </h3>
          </div>
          <ul className="list-disc list-inside space-y-2">
            {validationErrors.map((error, index) => (
              <li key={index} className="text-red-700">{error}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
            <p className="text-green-900 font-medium">
              Тест готов к публикации! Все проверки пройдены успешно.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTestCreatePage;
