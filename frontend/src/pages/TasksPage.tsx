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
  AlertCircle,
  Award,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Headphones,
  PenTool
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
  unit_title?: string;
  course_title?: string;
  student_submission?: {
    id: number;
    status: 'draft' | 'submitted' | 'graded';
    score?: number;
    final_score?: number;
    is_submitted: boolean;
    is_graded: boolean;
    submitted_at?: string;
    graded_at?: string;
    feedback_rich?: string;
    attempt_number: number;
  } | null;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const pageSize = 15;
  const navigate = useNavigate();
  
  const toggleExpand = (taskId: number) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

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

  // Sort tasks: urgent (not done + overdue or due soon) first, then by due date
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aIsDone = a.student_submission?.is_graded || false;
    const bIsDone = b.student_submission?.is_graded || false;
    
    // Urgent tasks (not done and overdue or due soon) come first
    const aIsUrgent = !aIsDone && (a.is_overdue || (a.due_at && new Date(a.due_at) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
    const bIsUrgent = !bIsDone && (b.is_overdue || (b.due_at && new Date(b.due_at) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
    
    if (aIsUrgent && !bIsUrgent) return -1;
    if (!aIsUrgent && bIsUrgent) return 1;
    
    // Within urgent or non-urgent, sort by due date (earliest first)
    if (a.due_at && b.due_at) {
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    }
    if (a.due_at) return -1;
    if (b.due_at) return 1;
    
    return 0;
  });

  // Calculate pagination
  const totalPages = Math.ceil(sortedTasks.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTasks = sortedTasks.slice(startIndex, endIndex);
  const showPagination = sortedTasks.length > pageSize;
  
  // Count urgent tasks (not done and overdue or due within 7 days)
  const urgentTasks = sortedTasks.filter(task => {
    const isDone = task.student_submission?.is_graded || false;
    if (isDone) return false;
    if (task.is_overdue) return true;
    if (task.due_at) {
      const dueDate = new Date(task.due_at);
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      return dueDate <= sevenDaysFromNow;
    }
    return false;
  });

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
    // If task is graded, show grade
    if (task.student_submission?.is_graded) {
      const score = task.student_submission.final_score ?? task.student_submission.score ?? 0;
      const maxScore = task.max_score || 100;
      const percentage = (score / maxScore) * 100;
      
      return (
        <div className="flex flex-col items-end gap-1">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Оценено
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-primary-100 text-primary-800">
            <Award className="w-3 h-3 mr-1" />
            {score.toFixed(1)} / {maxScore} ({percentage.toFixed(0)}%)
          </span>
        </div>
      );
    }
    
    // If task is submitted but not graded
    if (task.student_submission?.is_submitted) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Отправлено
        </span>
      );
    }
    
    // If task is overdue
    if (task.is_overdue) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertCircle className="w-3 h-3 mr-1" />
          Просрочено
        </span>
      );
    }
    
    // If task is not available
    if (!task.is_available) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Недоступно
        </span>
      );
    }
    
    // Task is available but not submitted
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        К выполнению
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

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'writing':
        return <PenTool className="w-5 h-5 text-purple-600" />;
      case 'listening':
        return <Headphones className="w-5 h-5 text-blue-600" />;
      case 'reading':
        return <BookOpen className="w-5 h-5 text-green-600" />;
      default:
        return <FileText className="w-5 h-5 text-amber-600" />;
    }
  };

  const getTypeIconBg = (type?: string) => {
    switch (type) {
      case 'writing':
        return 'bg-purple-100';
      case 'listening':
        return 'bg-blue-100';
      case 'reading':
        return 'bg-green-100';
      default:
        return 'bg-amber-100';
    }
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
            {sortedTasks.length} из {tasks.length}
          </div>
        )}
      </div>

      {/* Urgent Tasks Alert */}
      {urgentTasks.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                Срочные задания: {urgentTasks.length} {urgentTasks.length === 1 ? 'задание требует' : 'заданий требуют'} внимания
              </p>
              <p className="text-xs text-red-700 mt-1">
                {urgentTasks.filter(t => t.is_overdue).length > 0 && 
                  `${urgentTasks.filter(t => t.is_overdue).length} ${urgentTasks.filter(t => t.is_overdue).length === 1 ? 'просрочено' : 'просрочено'}, `}
                {urgentTasks.filter(t => !t.is_overdue && t.due_at).length > 0 && 
                  `${urgentTasks.filter(t => !t.is_overdue && t.due_at).length} ${urgentTasks.filter(t => !t.is_overdue && t.due_at).length === 1 ? 'срок истекает' : 'сроки истекают'} в ближайшие 7 дней`}
              </p>
            </div>
          </div>
        </div>
      )}

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
              {paginatedTasks.map((task) => {
                const isExpanded = expandedTasks.has(task.id);
                return (
                  <div key={task.id} className="hover:bg-gray-50 transition-colors">
                    {/* Minimal Row - Always Visible */}
                    <div
                      className="flex items-center justify-between px-5 py-3 cursor-pointer"
                      onClick={() => toggleExpand(task.id)}
                    >
                      {/* Left: Icon + Minimal Info */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div 
                          className={`flex-shrink-0 w-10 h-10 rounded-lg ${getTypeIconBg(task.type)} flex items-center justify-center`}
                          title={task.type ? getTypeLabel(task.type) : 'Задание'}
                        >
                          {getTypeIcon(task.type)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {task.title}
                          </h3>
                          
                          {/* Minimal Metadata */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                            {task.course_title && (
                              <span className="inline-flex items-center gap-1">
                                <GraduationCap className="w-3.5 h-3.5" />
                                {task.course_title}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Deadline + Status Badge + Expand Icon */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {task.due_at && (
                          <div className="text-xs text-gray-500" onClick={(e) => e.stopPropagation()}>
                            <span className={`inline-flex items-center gap-1 ${task.is_overdue ? 'text-red-600 font-medium' : ''}`}>
                              <Calendar className="w-3.5 h-3.5" />
                              {formatDate(task.due_at)}
                            </span>
                          </div>
                        )}
                        <div onClick={(e) => e.stopPropagation()}>
                          {getStatusBadge(task)}
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-2 border-t border-gray-100 bg-gray-50">
                        <div className="ml-14 space-y-2">
                          {/* Additional Details */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                            {(task.unit_title || task.unit?.title) && (
                              <span className="inline-flex items-center gap-1">
                                <BookOpen className="w-3.5 h-3.5" />
                                {task.unit_title || task.unit?.title}
                              </span>
                            )}
                            {task.max_score && (
                              <span>
                                {task.max_score} баллов
                              </span>
                            )}
                            {task.due_at && (
                              <span className={`inline-flex items-center gap-1 ${task.is_overdue ? 'text-red-600 font-medium' : ''}`}>
                                <Calendar className="w-3.5 h-3.5" />
                                Срок: {formatDate(task.due_at)}
                              </span>
                            )}
                          </div>
                          
                          {/* Description if available */}
                          {task.description && (
                            <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                          
                          {/* Action Button */}
                          <div className="pt-2">
                            <button
                              onClick={() => navigate(`/tasks/${task.id}`)}
                              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
                            >
                              {task.student_submission?.is_graded ? 'Просмотреть результаты' : 
                               task.student_submission?.is_submitted ? 'Просмотреть отправку' : 
                               'Выполнить задание'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pagination */}
          {showPagination && (
            <div className="flex items-center justify-between px-4 py-4 bg-white rounded-xl border border-gray-200">
              <span className="text-sm text-gray-600">
                Показано {sortedTasks.length > 0 ? startIndex + 1 : 0}–{Math.min(endIndex, sortedTasks.length)} из {sortedTasks.length}
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
