
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { testsApi } from '../../services/api';
import AdminSearchFilters from '../../components/admin/AdminSearchFilters';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  Copy,
  Calendar,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Clock,
  Brain,
  Percent,
  Archive,
  BookOpen
} from 'lucide-react';

// Mock data - replace with actual API calls
const mockTests = [
  {
    id: 1,
    title: 'Тест по грамматике A1',
    description: 'Проверка знаний базовой грамматики итальянского языка',
    level: 'A1',
    status: 'published',
    type: 'grammar',
    difficulty: 'easy',
    duration: 30,
    questionsCount: 20,
    passingScore: 70,
    attemptsCount: 156,
    averageScore: 78,
    dueDate: '2024-02-20T23:59:00Z',
    lastUpdated: '2024-01-10T10:30:00Z',
    createdAt: '2024-01-05T10:30:00Z',
    orderIndex: 1,
    course_id: 1,
    course_title: 'Итальянский A1'
  },
  {
    id: 2,
    title: 'Лексический тест: Еда и рестораны',
    description: 'Тест на знание лексики по теме еды и ресторанов',
    level: 'A2',
    status: 'draft',
    type: 'vocabulary',
    difficulty: 'medium',
    duration: 25,
    questionsCount: 15,
    passingScore: 75,
    attemptsCount: 0,
    averageScore: 0,
    dueDate: null,
    lastUpdated: '2024-01-12T14:20:00Z',
    createdAt: '2024-01-12T14:20:00Z',
    orderIndex: 2,
    course_id: 1,
    course_title: 'Итальянский A1'
  },
  {
    id: 3,
    title: 'Аудирование: Диалоги в городе',
    description: 'Тест на понимание разговорной речи в городской среде',
    level: 'A2',
    status: 'scheduled',
    type: 'listening',
    difficulty: 'medium',
    duration: 35,
    questionsCount: 12,
    passingScore: 80,
    attemptsCount: 0,
    averageScore: 0,
    dueDate: '2024-02-25T23:59:00Z',
    lastUpdated: '2024-01-08T09:15:00Z',
    createdAt: '2024-01-08T09:15:00Z',
    orderIndex: 3,
    course_id: 2,
    course_title: 'Итальянский A2'
  }
];

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const statuses = ['draft', 'published', 'scheduled', 'archived'];
const types = ['grammar', 'vocabulary', 'listening', 'reading', 'writing', 'speaking'];

export default function AdminTestsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tests, setTests] = useState(mockTests);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedTests, setSelectedTests] = useState<number[]>([]);
  const [sortField] = useState('createdAt');
  const [sortDirection] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Load tests from API
  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = async () => {
    try {
      const response = await testsApi.getTests();
      const fetchedTests = Array.isArray(response) ? response : response.items || [];
      console.log('Loaded tests from API:', fetchedTests);
      
      // Map backend tests to frontend format
      const mappedTests = fetchedTests.map((test: any) => ({
        id: test.id,
        title: test.title,
        description: test.description || '',
        level: test.unit?.level || 'A1',
        status: test.status,
        type: 'grammar', // Default type
        difficulty: 'medium',
        duration: test.time_limit_minutes || 30,
        questionsCount: test.test_questions?.length || 0,
        passingScore: test.passing_score || 70,
        attemptsCount: test.attempts?.length || 0,
        averageScore: 0,
        dueDate: null,
        lastUpdated: test.updated_at || test.created_at,
        createdAt: test.created_at || test.updated_at || new Date().toISOString(),
        orderIndex: test.order_index || 0,
        course_id: test.course_id || null,
        course_title: test.course_title || null,
      }));
      
      // If we have real tests from API, show them; otherwise show mock tests
      if (mappedTests.length > 0) {
        setTests(mappedTests);
      } else {
        // Show mock tests only if no real tests exist
        setTests(mockTests);
      }
    } catch (error) {
      console.error('Error loading tests:', error);
      toast.error('Ошибка загрузки тестов');
      // Keep mock data on error
      setTests(mockTests);
    }
  };


  const handleSelectTest = (testId: number) => {
    setSelectedTests(prev => 
      prev.includes(testId) 
        ? prev.filter(id => id !== testId)
        : [...prev, testId]
    );
  };

  const handleBulkAction = (action: string) => {
    console.log(`Bulk action: ${action} on tests:`, selectedTests);
    // Implement bulk actions
    setSelectedTests([]);
  };

  const handleDeleteTest = async (testId: number) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот тест? Это действие нельзя отменить.')) {
      return;
    }

    try {
      await testsApi.deleteTest(testId);
      toast.success('Тест успешно удален');
      // Reload tests from API
      await loadTests();
    } catch (error: any) {
      console.error('Error deleting test:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при удалении теста');
    }
  };

  const toggleRow = (testId: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(testId)) {
        newSet.delete(testId);
      } else {
        newSet.add(testId);
      }
      return newSet;
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Не указано';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      });
    } catch {
      return 'Не указано';
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', label: 'Черновик' },
      published: { color: 'bg-green-100 text-green-800', label: 'Опубликовано' },
      scheduled: { color: 'bg-blue-100 text-blue-800', label: 'Запланировано' },
      archived: { color: 'bg-red-100 text-red-800', label: 'Архивировано' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const typeConfig = {
      grammar: { color: 'bg-blue-100 text-blue-800', label: 'Грамматика' },
      vocabulary: { color: 'bg-green-100 text-green-800', label: 'Лексика' },
      listening: { color: 'bg-yellow-100 text-yellow-800', label: 'Аудирование' },
      reading: { color: 'bg-purple-100 text-purple-800', label: 'Чтение' },
      writing: { color: 'bg-indigo-100 text-indigo-800', label: 'Письмо' },
      speaking: { color: 'bg-pink-100 text-pink-800', label: 'Говорение' }
    };
    
    const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.grammar;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };


  const filteredTests = tests.filter(test => {
    const matchesSearch = test.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         test.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = !selectedLevel || test.level === selectedLevel;
    const matchesStatus = !selectedStatus || test.status === selectedStatus;
    const matchesType = !selectedType || test.type === selectedType;
    
    return matchesSearch && matchesLevel && matchesStatus && matchesType;
  });

  const sortedTests = [...filteredTests].sort((a, b) => {
    const aValue = a[sortField as keyof typeof a];
    const bValue = b[sortField as keyof typeof b];
    
    // Handle null values
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    
    // Special handling for date fields (createdAt, lastUpdated, dueDate)
    if (sortField === 'createdAt' || sortField === 'lastUpdated' || sortField === 'dueDate') {
      const aDate = new Date(aValue as string).getTime();
      const bDate = new Date(bValue as string).getTime();
      if (sortDirection === 'asc') {
        return aDate - bDate;
      } else {
        return bDate - aDate;
      }
    }
    
    if (sortDirection === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary-600" />
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                {t('admin.nav.tests')}
              </h1>
              {tests.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {tests.length} тестов
                </span>
              )}
            </div>
            <p className="mt-1 text-xs md:text-sm text-gray-500">
              Управляйте тестами и проверяйте знания студентов
            </p>
          </div>

          <button
            onClick={() => navigate('/admin/tests/new')}
            className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Создать тест
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">

        {/* Search and Filters */}
        <AdminSearchFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Поиск по названию или описанию..."
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          filters={
            <>
              {/* Level Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Уровень
                </label>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Все уровни</option>
                  {levels.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Статус
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Все статусы</option>
                  {statuses.map(status => (
                    <option key={status} value={status}>
                      {status === 'draft' ? 'Черновик' : 
                       status === 'published' ? 'Опубликовано' :
                       status === 'scheduled' ? 'Запланировано' : 'Архивировано'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Тип
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Все типы</option>
                  {types.map(type => (
                    <option key={type} value={type}>
                      {type === 'grammar' ? 'Грамматика' :
                       type === 'vocabulary' ? 'Лексика' :
                       type === 'listening' ? 'Аудирование' :
                       type === 'reading' ? 'Чтение' :
                       type === 'writing' ? 'Письмо' : 'Говорение'}
                    </option>
                  ))}
                </select>
              </div>
            </>
          }
        />

        {/* Bulk Actions */}
        {selectedTests.length > 0 && (
          <div className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-800">
              Выбрано {selectedTests.length} тестов
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => handleBulkAction('publish')}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200"
              >
                Опубликовать
              </button>
              <button
                onClick={() => handleBulkAction('archive')}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded text-red-700 bg-red-100 hover:bg-red-200"
              >
                Архивировать
              </button>
              <button
                onClick={() => setSelectedTests([])}
                className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
              >
                Отменить
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Tests List with Expandable Rows */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-200">
            {sortedTests.map((test) => {
              const isExpanded = expandedRows.has(test.id);
              
              return (
                <div key={test.id} className="transition-colors hover:bg-gray-50">
                  {/* Collapsed Row */}
                  <div 
                    className="flex items-center justify-between px-6 py-4 cursor-pointer"
                    onClick={() => toggleRow(test.id)}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* Checkbox */}
                      <div 
                        className="flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTests.includes(test.id)}
                          onChange={() => handleSelectTest(test.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </div>

                      {/* Chevron Icon */}
                      <div className="flex-shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>

                      {/* Title */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {test.title}
                        </h3>
                      </div>

                      {/* Status Badge */}
                      <div className="flex-shrink-0">
                        {getStatusBadge(test.status)}
                      </div>

                      {/* Metadata Icons */}
                      <div className="flex items-center gap-4 flex-shrink-0 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          {test.duration} мин
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Brain className="w-4 h-4" />
                          {test.questionsCount} Q
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Percent className="w-4 h-4" />
                          {test.passingScore}%
                        </span>
                      </div>

                      {/* Actions */}
                      <div 
                        className="flex items-center gap-2 flex-shrink-0 ml-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => navigate(`/admin/tests/${test.id}`)}
                          className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Просмотр"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => navigate(`/admin/tests/${test.id}/edit`)}
                          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Редактировать"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTest(test.id)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Row */}
                  {isExpanded && (
                    <div className="px-6 pb-4 pt-0 bg-gray-50 border-t border-gray-200">
                      <div className="pl-9 space-y-4">
                        {/* Description */}
                        {test.description && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-1">Описание:</p>
                            <p className="text-sm text-gray-600">{test.description}</p>
                          </div>
                        )}

                        {/* Details Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Unit */}
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-1">Юнит:</p>
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-gray-400" />
                              <span className="text-sm text-gray-600">
                                {test.level ? `Уровень ${test.level}` : 'Не указан'}
                              </span>
                              {getTypeBadge(test.type)}
                            </div>
                          </div>

                          {/* Created At */}
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-1">Создан:</p>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <span className="text-sm text-gray-600">
                                {formatDate(test.lastUpdated)}
                              </span>
                            </div>
                          </div>

                          {/* Attempts */}
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-1">Попытки:</p>
                            <span className="text-sm text-gray-600">
                              {test.attemptsCount || 0} попыток
                            </span>
                          </div>

                          {/* Average Score */}
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-1">Средний балл:</p>
                            <span className="text-sm text-gray-600">
                              {test.averageScore > 0 ? `${test.averageScore}%` : 'Нет данных'}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          <button
                            onClick={() => navigate(`/admin/tests/${test.id}`)}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Просмотр
                          </button>
                          <button
                            onClick={() => navigate(`/admin/tests/${test.id}/edit`)}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Редактировать
                          </button>
                          <button
                            onClick={() => {
                              // TODO: Implement duplicate functionality
                              toast('Функция дублирования будет реализована', { icon: 'ℹ️' });
                            }}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Дублировать
                          </button>
                          <button
                            onClick={() => {
                              // TODO: Implement archive functionality
                              toast('Функция архивирования будет реализована', { icon: 'ℹ️' });
                            }}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Archive className="w-4 h-4 mr-2" />
                            Архивировать
                          </button>
                          <button
                            onClick={() => handleDeleteTest(test.id)}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Удалить
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        {/* Empty State */}
        {sortedTests.length === 0 && (
          <div className="text-center py-12">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет тестов</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery || selectedLevel || selectedStatus || selectedType
                ? 'Попробуйте изменить фильтры поиска.'
                : 'Начните с создания первого теста.'
              }
            </p>
            {!searchQuery && !selectedLevel && !selectedStatus && !selectedType && (
              <div className="mt-6">
                <button
                  onClick={() => navigate('/admin/tests/new')}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Создать тест
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
