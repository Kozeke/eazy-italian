
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye, 
  Copy,
  Calendar,
  Users,
  Mail,
  Phone,
  ChevronDown,
  ChevronUp,
  UserCheck,
  UserX
} from 'lucide-react';
import { progressApi, usersApi } from '../../services/api';
// Mock data - replace with actual API calls
const mockStudents = [
  {
    id: 1,
    firstName: 'Анна',
    lastName: 'Иванова',
    email: 'anna.ivanova@example.com',
    phone: '+7 (999) 123-45-67',
    level: 'A2',
    status: 'active',
    registrationDate: '2024-01-15T10:30:00Z',
    lastLogin: '2024-01-20T14:25:00Z',
    completedUnits: 5,
    averageScore: 85,
    totalPoints: 1250,
    subscriptionType: 'premium',
    subscriptionExpiry: '2024-12-31T23:59:00Z'
  },
  {
    id: 2,
    firstName: 'Иван',
    lastName: 'Петров',
    email: 'ivan.petrov@example.com',
    phone: '+7 (999) 234-56-78',
    level: 'A1',
    status: 'active',
    registrationDate: '2024-01-10T09:15:00Z',
    lastLogin: '2024-01-19T16:30:00Z',
    completedUnits: 3,
    averageScore: 72,
    totalPoints: 850,
    subscriptionType: 'basic',
    subscriptionExpiry: '2024-06-30T23:59:00Z'
  },
  {
    id: 3,
    firstName: 'Мария',
    lastName: 'Сидорова',
    email: 'maria.sidorova@example.com',
    phone: '+7 (999) 345-67-89',
    level: 'B1',
    status: 'inactive',
    registrationDate: '2023-12-01T11:00:00Z',
    lastLogin: '2024-01-05T10:15:00Z',
    completedUnits: 8,
    averageScore: 91,
    totalPoints: 2100,
    subscriptionType: 'premium',
    subscriptionExpiry: '2024-03-15T23:59:00Z'
  }
];

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const statuses = ['active', 'inactive', 'suspended', 'graduated'];
const subscriptionTypes = ['free', 'premium', 'pro'];



export default function AdminStudentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [students, setStudents] = useState(mockStudents);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedSubscription, setSelectedSubscription] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [sortField, setSortField] = useState('lastName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  useEffect(() => {
    progressApi.getStudentsProgress()
      .then((data) => {
        const normalized = data.map((s: any) => ({
          id: s.id,
          firstName: s.first_name,
          lastName: s.last_name,
          email: s.email,
          phone: '—',
          level: '—',
          status: s.is_active ? 'active' : 'inactive',
          registrationDate: s.created_at,
          lastLogin: null,
  
          // 🔥 REAL PROGRESS
          completedUnits: s.passed_tests,
          averageScore: s.progress_percent,
          totalPoints: `${s.passed_tests}/${s.total_tests}`,
  
          subscriptionType: s.subscription,
          subscriptionExpiry: s.subscription_ends_at ?? null,
        }));
  
        setStudents(normalized);
      })
      .catch(console.error);
  }, []);
  
  const changeSubscription = async (studentId: number, subscription: string) => {
    try {
      await usersApi.changeSubscription(studentId, subscription);
  
      // Optimistic UI update (optional but nice)
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? { ...s, subscriptionType: subscription }
            : s
        )
      );
    } catch (err) {
      console.error(err);
      alert('Не удалось изменить подписку');
    }
  };
  
  

  const handleSelectAll = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map(student => student.id));
    }
  };

  const handleSelectStudent = (studentId: number) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleBulkAction = (action: string) => {
    console.log(`Bulk action: ${action} on students:`, selectedStudents);
    // Implement bulk actions
    setSelectedStudents([]);
  };

  const handleDeleteStudent = (studentId: number) => {
    if (window.confirm('Вы уверены, что хотите удалить этого студента?')) {
      setStudents(prev => prev.filter(student => student.id !== studentId));
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { color: 'bg-green-100 text-green-800', label: 'Активен', icon: UserCheck },
      inactive: { color: 'bg-gray-100 text-gray-800', label: 'Неактивен', icon: UserX },
      suspended: { color: 'bg-red-100 text-red-800', label: 'Приостановлен', icon: UserX },
      graduated: { color: 'bg-blue-100 text-blue-800', label: 'Выпускник', icon: UserCheck }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.inactive;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
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

  const getSubscriptionBadge = (type: string) => {
    const subscriptionConfig = {
      free: { color: 'bg-gray-100 text-gray-800', label: 'Бесплатный' },
      premium: { color: 'bg-yellow-100 text-yellow-800', label: 'Премиум' },
      pro: { color: 'bg-indigo-100 text-indigo-800', label: 'Pro' },
    };
    
    
    const config = subscriptionConfig[type as keyof typeof subscriptionConfig] || subscriptionConfig.free;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const filteredStudents = students.filter(student => {
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase()) ||
                         student.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = !selectedLevel || student.level === selectedLevel;
    const matchesStatus = !selectedStatus || student.status === selectedStatus;
    const matchesSubscription = !selectedSubscription || student.subscriptionType === selectedSubscription;
    
    return matchesSearch && matchesLevel && matchesStatus && matchesSubscription;
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    const aValue = a[sortField as keyof typeof a];
    const bValue = b[sortField as keyof typeof b];
    
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
            {t('admin.nav.students')}
          </h1>
          <p className="text-gray-600">
            Управление студентами
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/students/new')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          Добавить студента
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
                  placeholder="Поиск по имени, фамилии или email..."
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
                        {status === 'active' ? 'Активен' : 
                         status === 'inactive' ? 'Неактивен' :
                         status === 'suspended' ? 'Приостановлен' : 'Выпускник'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subscription Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Подписка
                  </label>
                  <select
                    value={selectedSubscription}
                    onChange={(e) => setSelectedSubscription(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Все типы</option>
                    {subscriptionTypes.map(type => (
                      <option key={type} value={type}>
                        {type === 'free' ? 'Бесплатный'
                          : type === 'premium' ? 'Премиум'
                          : 'Pro'}
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
      {selectedStudents.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-800">
              Выбрано {selectedStudents.length} студентов
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => handleBulkAction('activate')}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded text-green-700 bg-green-100 hover:bg-green-200"
              >
                Активировать
              </button>
              <button
                onClick={() => handleBulkAction('suspend')}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded text-red-700 bg-red-100 hover:bg-red-200"
              >
                Приостановить
              </button>
              <button
                onClick={() => setSelectedStudents([])}
                className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
              >
                Отменить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Students Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedStudents.length === students.length}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('lastName')}
                >
                  <div className="flex items-center">
                    Студент
                    {sortField === 'lastName' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Контакты
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
                  Прогресс
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Подписка
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('registrationDate')}
                >
                  <div className="flex items-center">
                    Регистрация
                    {sortField === 'registrationDate' && (
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
              {sortedStudents.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(student.id)}
                      onChange={() => handleSelectStudent(student.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                          {student.firstName?.[0] ?? '?'}{student.lastName?.[0] ?? '?'}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {student.firstName} {student.lastName}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {student.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      <div className="flex items-center">
                        <Mail className="w-4 h-4 mr-1 text-gray-400" />
                        {student.email}
                      </div>
                      <div className="flex items-center mt-1">
                        <Phone className="w-4 h-4 mr-1 text-gray-400" />
                        {student.phone}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getLevelBadge(student.level)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(student.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      Тесты: {student.totalPoints}
                    </div>
                    <div className="text-sm text-gray-500">
                      Прогресс: {student.averageScore}%
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                    <select
                        value={student.subscriptionType}
                        onChange={(e) => changeSubscription(student.id, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                      >
                        <option value="free">Бесплатный</option>
                        <option value="premium">Премиум</option>
                        <option value="pro">Pro</option>
                      </select>
                      <div className="text-xs text-gray-500 mt-1">
                        До: {new Date(student.subscriptionExpiry).toLocaleDateString('ru-RU')}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      {new Date(student.registrationDate).toLocaleDateString('ru-RU')}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Последний вход: {new Date(student.lastLogin).toLocaleDateString('ru-RU')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => navigate(`/admin/students/${student.id}`)}
                        className="text-primary-600 hover:text-primary-900"
                        title="Просмотр"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/admin/students/${student.id}/edit`)}
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
                        onClick={() => handleDeleteStudent(student.id)}
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
        {sortedStudents.length === 0 && (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет студентов</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery || selectedLevel || selectedStatus || selectedSubscription
                ? 'Попробуйте изменить фильтры поиска.'
                : 'Начните с добавления первого студента.'
              }
            </p>
            {!searchQuery && !selectedLevel && !selectedStatus && !selectedSubscription && (
              <div className="mt-6">
                <button
                  onClick={() => navigate('/admin/students/new')}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить студента
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
