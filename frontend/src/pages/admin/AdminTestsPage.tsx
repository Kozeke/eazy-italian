
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { testsApi } from '../../services/api';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye, 
  Copy,
  Calendar,
  ClipboardList,
  ChevronDown,
  ChevronUp
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
    orderIndex: 1
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
    orderIndex: 2
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
    orderIndex: 3
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
  const [sortField, setSortField] = useState('orderIndex');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);

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
        orderIndex: test.order_index || 0,
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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = () => {
    if (selectedTests.length === tests.length) {
      setSelectedTests([]);
    } else {
      setSelectedTests(tests.map(test => test.id));
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

  const handleDeleteTest = (testId: number) => {
    if (window.confirm('Вы уверены, что хотите удалить этот тест?')) {
      setTests(prev => prev.filter(test => test.id !== testId));
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

  const getLevelBadge = (level: string) => {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
        {level}
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

  const getDifficultyBadge = (difficulty: string) => {
    const difficultyConfig = {
      easy: { color: 'bg-green-100 text-green-800', label: 'Легко' },
      medium: { color: 'bg-yellow-100 text-yellow-800', label: 'Средне' },
      hard: { color: 'bg-red-100 text-red-800', label: 'Сложно' }
    };
    
    const config = difficultyConfig[difficulty as keyof typeof difficultyConfig] || difficultyConfig.easy;
    
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
    
    if (sortDirection === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('admin.nav.tests')}
          </h1>
          <p className="text-gray-600">
            Управление тестами
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/tests/new')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          Создать тест
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск по названию или описанию..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <Filter className="w-4 h-4 mr-2" />
              Фильтры
              {showFilters ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
            </button>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Level Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Уровень
                  </label>
                  <select
                    value={selectedLevel}
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedTests.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
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

      {/* Tests Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedTests.length === tests.length}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('title')}
                >
                  <div className="flex items-center">
                    Название
                    {sortField === 'title' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('level')}
                >
                  <div className="flex items-center">
                    Уровень
                    {sortField === 'level' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Сложность
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Статус
                    {sortField === 'status' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статистика
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('dueDate')}
                >
                  <div className="flex items-center">
                    Дедлайн
                    {sortField === 'dueDate' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTests.map((test) => (
                <tr key={test.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedTests.includes(test.id)}
                      onChange={() => handleSelectTest(test.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {test.title}
                      </div>
                      <div className="text-sm text-gray-500">
                        {test.description}
                      </div>
                      <div className="text-xs text-gray-400">
                        {test.questionsCount} вопросов | {test.duration} мин | {test.passingScore}% для прохождения
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getLevelBadge(test.level)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getTypeBadge(test.type)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getDifficultyBadge(test.difficulty)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(test.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {test.attemptsCount} попыток
                    </div>
                    <div className="text-sm text-gray-500">
                      {test.averageScore > 0 ? `${test.averageScore}%` : 'Нет данных'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {test.dueDate ? (
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        {new Date(test.dueDate).toLocaleDateString('ru-RU')}
                      </div>
                    ) : (
                      <span className="text-gray-400">Не установлен</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => navigate(`/admin/tests/${test.id}`)}
                        className="text-primary-600 hover:text-primary-900"
                        title="Просмотр"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/admin/tests/${test.id}/edit`)}
                        className="text-gray-600 hover:text-gray-900"
                        title="Редактировать"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleBulkAction('duplicate')}
                        className="text-gray-600 hover:text-gray-900"
                        title="Дублировать"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTest(test.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
