
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  Calendar,
  FileText,
  ChevronDown,
  ChevronUp,
  Users
} from 'lucide-react';
import { Task } from '../../types';
import { tasksApi } from '../../services/api';
import AdminSearchFilters from '../../components/admin/AdminSearchFilters';

const statuses = ['draft', 'published', 'scheduled', 'archived'];
const types = ['writing', 'listening', 'reading'];

export default function AdminTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = () => {
    if (selectedTasks.length === tasks.length) {
      setSelectedTasks([]);
    } else {
      setSelectedTasks(tasks.map(task => task.id));
    }
  };

  const handleSelectTask = (taskId: number) => {
    setSelectedTasks(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  // Load tasks
  useEffect(() => {
    const loadTasks = async () => {
      setIsLoading(true);
      try {
        const params: any = {
          search: searchQuery || undefined,
          unit_id: selectedUnit || undefined,
          type: selectedType || undefined,
          status: selectedStatus || undefined,
          sort_by: sortField,
          sort_order: sortDirection,
          skip: 0,
          limit: 100
        };
        
        const tasksData = await tasksApi.getAdminTasks(params);
        setTasks(tasksData);
      } catch (error) {
        console.error('Failed to load tasks:', error);
        toast.error('Ошибка при загрузке заданий');
      } finally {
        setIsLoading(false);
      }
    };

    loadTasks();
  }, [searchQuery, selectedUnit, selectedType, selectedStatus, sortField, sortDirection]);

  const handleBulkAction = async (action: string) => {
    if (selectedTasks.length === 0) return;
    
    try {
      await tasksApi.bulkActionTasks({
        task_ids: selectedTasks,
        action
      });
      
      toast.success(`Действие "${action}" выполнено успешно`);
      setSelectedTasks([]);
      
      // Reload tasks
      const params: any = {
        search: searchQuery || undefined,
        unit_id: selectedUnit || undefined,
        type: selectedType || undefined,
        status: selectedStatus || undefined,
        sort_by: sortField,
        sort_order: sortDirection,
        skip: 0,
        limit: 100
      };
      const tasksData = await tasksApi.getAdminTasks(params);
      setTasks(tasksData);
    } catch (error) {
      console.error('Bulk action failed:', error);
      toast.error('Ошибка при выполнении действия');
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (window.confirm('Вы уверены, что хотите удалить это задание?')) {
      try {
        await tasksApi.deleteTask(taskId);
        setTasks(prev => prev.filter(task => task.id !== taskId));
        toast.success('Задание удалено');
      } catch (error) {
        console.error('Failed to delete task:', error);
        toast.error('Ошибка при удалении задания');
      }
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
      writing: { color: 'bg-purple-100 text-purple-800', label: 'Письмо', icon: '✍️' },
      listening: { color: 'bg-blue-100 text-blue-800', label: 'Аудирование', icon: '🎧' },
      reading: { color: 'bg-green-100 text-green-800', label: 'Чтение', icon: '📖' }
    };
    
    const config = typeConfig[type as keyof typeof typeConfig] || { color: 'bg-gray-100 text-gray-800', label: type, icon: '' };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.icon && <span className="mr-1">{config.icon}</span>}
        {config.label}
      </span>
    );
  };

  const isTaskFullyGraded = (task: Task): boolean => {
    // Task is fully graded if all submitted work is graded
    if (!task.submission_stats) return false;
    const submitted = task.submission_stats.submitted || 0;
    const graded = task.submission_stats.graded || 0;
    return submitted > 0 && submitted === graded;
  };

  const hasPendingGrading = (task: Task): boolean => {
    // Task has pending grading if there are submitted but not graded
    if (!task.submission_stats) return false;
    const submitted = task.submission_stats.submitted || 0;
    const graded = task.submission_stats.graded || 0;
    return submitted > graded;
  };

  const getRowClassName = (task: Task): string => {
    const baseClass = "transition-colors";
    
    if (isTaskFullyGraded(task)) {
      return `${baseClass} bg-green-100 hover:bg-green-200 border-l-4 border-green-500`;
    } else if (hasPendingGrading(task)) {
      return `${baseClass} bg-yellow-100 hover:bg-yellow-200 border-l-4 border-yellow-500`;
    }
    
    return `${baseClass} hover:bg-gray-50`;
  };

  const getGradingTypeBadge = (task: Task) => {
    // Writing tasks are always manual
    if (task.type === 'writing') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Ручная
        </span>
      );
    }
    
    // For listening/reading, check auto_check_config
    // Handle both cases: auto_check_config might be undefined, null, empty object, or have grading_type
    const autoCheckConfig = task.auto_check_config || {};
    let gradingType = autoCheckConfig.grading_type;
    
    // Fallback: if no grading_type is set but task has questions, assume automatic
    // (for backward compatibility with tasks created before grading_type was added)
    if (!gradingType && (task.type === 'listening' || task.type === 'reading')) {
      if (task.questions && task.questions.length > 0) {
        gradingType = 'automatic';
      } else {
        gradingType = 'manual';
      }
    }
    
    gradingType = gradingType || 'manual';
    
    if (gradingType === 'automatic') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          ⚡ Автоматическая
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          ✋ Ручная
        </span>
      );
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка заданий...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary-600" />
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                Задания
              </h1>
              {tasks.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {tasks.length} заданий
                </span>
              )}
            </div>
            <p className="mt-1 text-xs md:text-sm text-gray-500">
              Управление заданиями
            </p>
          </div>

          <button
            onClick={() => navigate('/admin/tasks/new')}
            className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Создать задание
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
              {/* Unit Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Юнит
                </label>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Все юниты</option>
                  {/* Units will be loaded dynamically */}
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
                      {type === 'writing' ? 'Письмо' :
                       type === 'listening' ? 'Аудирование' :
                       type === 'reading' ? 'Чтение' : type}
                    </option>
                  ))}
                </select>
              </div>
            </>
          }
        />

      {/* Bulk Actions */}
      {selectedTasks.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-800">
              Выбрано {selectedTasks.length} заданий
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
                onClick={() => setSelectedTasks([])}
                className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
              >
                Отменить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Table */}
      {/* Legend */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-200 border-2 border-green-400"></div>
            <span className="text-sm text-gray-700">Все сдачи оценены</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-200 border-2 border-yellow-400"></div>
            <span className="text-sm text-gray-700">Есть неоцененные сдачи</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gray-100 border-2 border-gray-300"></div>
            <span className="text-sm text-gray-700">Нет сдач</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedTasks.length === tasks.length}
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
                  onClick={() => handleSort('unit_id')}
                >
                  <div className="flex items-center">
                    Юнит
                    {sortField === 'unit_id' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип задания
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип проверки
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Назначено
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
                  onClick={() => handleSort('due_at')}
                >
                  <div className="flex items-center">
                    Дедлайн
                    {sortField === 'due_at' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-10">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tasks.map((task) => (
                <tr key={task.id} className={getRowClassName(task)}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedTasks.includes(task.id)}
                      onChange={() => handleSelectTask(task.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {task.title}
                      </div>
                      <div className="text-sm text-gray-500">
                        {task.description}
                      </div>
                      <div className="text-xs text-gray-400">
                        Порядок: {task.order_index} | {task.max_score} баллов
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {task.unit_title || 'Без юнита'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getTypeBadge(task.type)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getGradingTypeBadge(task)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-1">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-900">
                        {task.assigned_student_count || 0}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(task.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {task.submission_stats?.submitted || 0} сдач
                    </div>
                    <div className="text-sm text-gray-500">
                      {task.average_score ? `${task.average_score.toFixed(1)}%` : 'Нет данных'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {task.due_at ? (
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        {new Date(task.due_at).toLocaleDateString('ru-RU')}
                      </div>
                    ) : (
                      <span className="text-gray-400">Не установлен</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white z-10 border-l border-gray-200 hover:bg-gray-50">
                    <div className="flex items-center justify-end gap-4 md:gap-3 lg:gap-2">
                      <button
                        onClick={() => navigate(`/admin/tasks/${task.id}`)}
                        className="p-2 md:p-1.5 text-primary-600 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Просмотр"
                      >
                        <Eye className="h-6 w-6 md:h-5 md:w-5 lg:h-4 lg:w-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/admin/tasks/${task.id}/edit`)}
                        className="p-2 md:p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Редактировать"
                      >
                        <Edit className="h-6 w-6 md:h-5 md:w-5 lg:h-4 lg:w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
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
        {tasks.length === 0 && (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет заданий</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery || selectedUnit || selectedStatus || selectedType
                ? 'Попробуйте изменить фильтры поиска.'
                : 'Начните с создания первого задания.'
              }
            </p>
            {!searchQuery && !selectedUnit && !selectedStatus && !selectedType && (
              <div className="mt-6">
                <button
                  onClick={() => navigate('/admin/tasks/new')}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Создать задание
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
