
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
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
import AdminSearchFilters from '../../components/admin/AdminSearchFilters';

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const statuses = ['active', 'inactive', 'suspended', 'graduated'];
const subscriptionTypes = ['free', 'premium', 'pro'];

type ProgressData = {
  id: number;
  passed_tests: number;
  progress_percent: number;
  total_tests: number;
};

type StudentRow = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  level: string;
  status: string;
  registrationDate: string;
  lastLogin: string | null;
  completedUnits: number;
  averageScore: number;
  totalPoints: string; // Changed to string for "X/Y" format
  subscriptionType: string;
  subscriptionExpiry: string | null;
  enrolledCoursesCount: number; // Add courses count
};

export default function AdminStudentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentRow[]>([]);
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
    // Fetch all students
    usersApi.getStudents()
      .then((data) => {
        const normalized: StudentRow[] = data.map((s: any) => ({
          id: s.id,
          firstName: s.first_name,
          lastName: s.last_name,
          email: s.email,
          phone: '—',
          level: '—',
          status: s.is_active ? 'active' : 'inactive',
          registrationDate: s.created_at,
          lastLogin: s.last_login ?? null,
  
          // Will be filled from progress data
          completedUnits: 0,
          averageScore: 0,
          totalPoints: '0/0',
          enrolledCoursesCount: s.enrolled_courses_count || 0,
  
          subscriptionType: s.subscription || 'free',
          subscriptionExpiry: s.subscription_ends_at ?? null,
        }));
  
        setStudents(normalized);

        // Fetch progress data separately and merge
        progressApi.getStudentsProgress()
          .then((progressData: ProgressData[]) => {
            const progressMap = new Map(
              progressData.map((p) => [p.id, p])
            );

            const merged: StudentRow[] = normalized.map((student) => {
              const progress = progressMap.get(student.id);
              if (progress) {
                return {
                  ...student,
                  completedUnits: progress.passed_tests || 0,
                  averageScore: progress.progress_percent || 0,
                  totalPoints: `${progress.passed_tests || 0}/${progress.total_tests || 0}`,
                };
              }
              return student;
            });

            setStudents(merged);
          })
          .catch(console.error);
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
    const aValue = a[sortField as keyof StudentRow];
    const bValue = b[sortField as keyof StudentRow];
    
    // Handle null values
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;
    
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
              <Users className="h-6 w-6 text-primary-600" />
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                {t('admin.nav.students')}
              </h1>
              {students.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {students.length} студентов
                </span>
              )}
            </div>
            <p className="mt-1 text-xs md:text-sm text-gray-500">
              Управляйте студентами и отслеживайте их прогресс
            </p>
          </div>

          <button
            onClick={() => navigate('/admin/students/new')}
            className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Добавить студента
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">

        {/* Search and Filters */}
        <AdminSearchFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Поиск по имени, фамилии или email..."
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
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
            </>
          }
        />

        {/* Bulk Actions */}
        {selectedStudents.length > 0 && (
          <div className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Курсы
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
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-10 border-l border-gray-200">
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
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="inline-flex items-center gap-1">
                      <span className="text-sm font-semibold text-gray-900">
                        {student.enrolledCoursesCount}
                      </span>
                      <span className="text-xs text-gray-500">
                        {student.enrolledCoursesCount === 1 ? 'курс' : 
                         student.enrolledCoursesCount >= 2 && student.enrolledCoursesCount <= 4 ? 'курса' : 
                         'курсов'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                          {student.firstName?.[0] ?? '?'}{student.lastName?.[0] ?? '?'}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 break-words max-w-xs">
                          {student.firstName} {student.lastName}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {student.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      <div className="flex items-center break-words max-w-xs">
                        <Mail className="w-4 h-4 mr-1 text-gray-400 flex-shrink-0" />
                        <span className="break-words">{student.email}</span>
                      </div>
                      <div className="flex items-center mt-1">
                        <Phone className="w-4 h-4 mr-1 text-gray-400 flex-shrink-0" />
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
                        До: {student.subscriptionExpiry 
                          ? new Date(student.subscriptionExpiry).toLocaleDateString('ru-RU')
                          : '—'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      {new Date(student.registrationDate).toLocaleDateString('ru-RU')}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Последний вход: {student.lastLogin 
                        ? new Date(student.lastLogin).toLocaleDateString('ru-RU')
                        : 'Никогда'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white z-10 border-l border-gray-200 hover:bg-gray-50">
                    <div className="flex items-center justify-end gap-4 md:gap-3 lg:gap-2">
                      <button
                        onClick={() => navigate(`/admin/students/${student.id}`)}
                        className="p-2 md:p-1.5 text-primary-600 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Просмотр"
                      >
                        <Eye className="h-6 w-6 md:h-5 md:w-5 lg:h-4 lg:w-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/admin/students/${student.id}/edit`)}
                        className="p-2 md:p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Редактировать"
                      >
                        <Edit className="h-6 w-6 md:h-5 md:w-5 lg:h-4 lg:w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteStudent(student.id)}
                        className="p-2 md:p-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                        title="Удалить"
                      >
                        <Trash2 className="h-6 w-6 md:h-5 md:w-5 lg:h-4 lg:w-4" />
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
      </main>
    </div>
  );
}
