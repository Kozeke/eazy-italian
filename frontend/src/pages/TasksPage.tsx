/**
 * Tasks Page
 * 
 * Student-facing tasks listing page with clean, compact table layout.
 * Similar to TestsPage structure.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar,
  FileText,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  AlertCircle
} from 'lucide-react';
import { tasksApi } from '../services/api';
import toast from 'react-hot-toast';
import SearchFilters from '../components/SearchFilters';

interface Task {
  id: number;
  title: string;
  description?: string;
  type?: string;
  max_score?: number;
  due_at?: string;
  unit_id?: number | null;
  unit?: {
    id: number;
    title?: string;
    level?: string;
  };
  status?: string;
  is_available?: boolean;
  is_overdue?: boolean;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const navigate = useNavigate();

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setLoading(true);
        const data = await tasksApi.getTasks();
        console.log('Loaded tasks:', data);
        const tasksData: Task[] = Array.isArray(data) ? data : [];
        setTasks(tasksData);
        if (tasksData.length === 0) {
          console.log('No tasks found. Student may not be enrolled in any courses or no tasks are published.');
        }
      } catch (error: any) {
        console.error('Error loading tasks:', error);
        toast.error(error.response?.data?.detail || 'Ошибка при загрузке заданий');
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedLevel]);

  // Filter tasks based on search and level
  const filteredTasks = tasks.filter((task) => {
    if (searchQuery.trim()) {
      const title = (task.title || '').toLowerCase();
      const desc = (task.description || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      if (!title.includes(q) && !desc.includes(q)) return false;
    }
    if (selectedLevel && task.unit?.level !== selectedLevel) return false;
    return true;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredTasks.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTasks = filteredTasks.slice(startIndex, endIndex);
  const showPagination = filteredTasks.length > pageSize;

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (task: Task) => {
    if (task.is_overdue) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertCircle className="w-3 h-3 mr-1" />
          Просрочено
        </span>
      );
    }
    if (!task.is_available) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Недоступно
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle className="w-3 h-3 mr-1" />
        Доступно
      </span>
    );
  };

  const getTypeLabel = (type?: string) => {
    const types: Record<string, string> = {
      'manual': 'Ручная проверка',
      'auto': 'Автоматическая',
      'practice': 'Практика',
      'writing': 'Письмо',
      'listening': 'Аудирование',
      'reading': 'Чтение'
    };
    return types[type || ''] || type || '—';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Загрузка заданий...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compact Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Задания
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Выполняйте задания для закрепления материала
          </p>
        </div>
        {tasks.length > 0 && (
          <div className="text-sm text-gray-500">
            {filteredTasks.length} из {tasks.length}
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <SearchFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Поиск по названию или описанию"
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        filters={
          <>
            {/* Level */}
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
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="B1">B1</option>
                <option value="B2">B2</option>
                <option value="C1">C1</option>
                <option value="C2">C2</option>
              </select>
            </div>
          </>
        }
      />

      {/* Tasks Table */}
      {filteredTasks.length > 0 ? (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-200">
              {paginatedTasks.map((task) => (
                <div
                  key={task.id}
                  className="group flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/tasks/${task.id}`)}
                >
                  {/* Left: Icon + Title */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-amber-600" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {task.title}
                      </h3>
                      
                      {/* Metadata */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        {task.max_score && (
                          <span>
                            {task.max_score} баллов
                          </span>
                        )}
                        {task.type && (
                          <span>
                            {getTypeLabel(task.type)}
                          </span>
                        )}
                        {task.unit?.title && (
                          <span className="inline-flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5" />
                            {task.unit.title}
                          </span>
                        )}
                        {task.due_at && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Срок: {formatDate(task.due_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Status Badge */}
                  <div className="flex-shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                    {getStatusBadge(task)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {showPagination && (
            <div className="flex items-center justify-between px-4 py-4 bg-white rounded-xl border border-gray-200">
              <span className="text-sm text-gray-600">
                Показано {filteredTasks.length > 0 ? startIndex + 1 : 0}–{Math.min(endIndex, filteredTasks.length)} из {filteredTasks.length}
              </span>

              <div className="flex items-center space-x-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Назад
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Show first page, last page, current page, and pages around current
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            currentPage === page
                              ? 'bg-primary-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (
                      page === currentPage - 2 ||
                      page === currentPage + 2
                    ) {
                      return (
                        <span key={page} className="px-2 text-gray-500">
                          ...
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Далее
                  <ChevronRight className="h-4 w-4 ml-1" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-3">
            <FileText className="h-12 w-12" />
          </div>
          <h3 className="mt-1 text-sm font-medium text-gray-900">
            Нет доступных заданий
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Пока нет доступных заданий. Как только преподаватель их добавит, они появятся здесь.
          </p>
        </div>
      )}
    </div>
  );
}
