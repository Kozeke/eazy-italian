import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Edit, 
  Calendar, 
  Award, 
  Users, 
  FileText, 
  Clock,
  CheckCircle,
  AlertCircle,
  BookOpen,
  Eye,
  BarChart3
} from 'lucide-react';
import toast from 'react-hot-toast';
import { tasksApi } from '../../services/api';
import { Task } from '../../types';

export default function AdminTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    
    const loadTask = async () => {
      try {
        setLoading(true);
        const taskData = await tasksApi.getAdminTask(parseInt(id));
        setTask(taskData);
        
        // Load statistics
        try {
          const stats = await tasksApi.getTaskStatistics(parseInt(id));
          setStatistics(stats);
        } catch (error) {
          console.error('Error loading statistics:', error);
        }
      } catch (error: any) {
        console.error('Error loading task:', error);
        toast.error(error.response?.data?.detail || 'Ошибка загрузки задания');
        navigate('/admin/tasks');
      } finally {
        setLoading(false);
      }
    };

    loadTask();
  }, [id, navigate]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  const getStatusBadge = (status?: string) => {
    const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
      'draft': { label: 'Черновик', color: 'text-gray-700', bgColor: 'bg-gray-100' },
      'scheduled': { label: 'Запланировано', color: 'text-blue-700', bgColor: 'bg-blue-100' },
      'published': { label: 'Опубликовано', color: 'text-green-700', bgColor: 'bg-green-100' },
      'archived': { label: 'Архивировано', color: 'text-gray-700', bgColor: 'bg-gray-100' }
    };
    
    const config = statusConfig[status || ''] || statusConfig['draft'];
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка задания...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Задание не найдено</h3>
          <button
            onClick={() => navigate('/admin/tasks')}
            className="mt-4 text-primary-600 hover:text-primary-700"
          >
            Вернуться к заданиям
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4">
          <button
            onClick={() => navigate('/admin/tasks')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Вернуться к заданиям</span>
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                {task.title}
              </h1>
              <p className="mt-1 text-xs md:text-sm text-gray-500">
                Детали задания
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/admin/tasks/${id}/submissions`)}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Eye className="w-4 h-4 mr-2" />
                Отправки
              </button>
              <button
                onClick={() => navigate(`/admin/tasks/${id}/edit`)}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
              >
                <Edit className="w-4 h-4 mr-2" />
                Редактировать
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Всего отправок</p>
                  <p className="text-2xl font-bold text-gray-900">{statistics.total_submissions || 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Проверено</p>
                  <p className="text-2xl font-bold text-gray-900">{statistics.graded_count || 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ожидает проверки</p>
                  <p className="text-2xl font-bold text-gray-900">{statistics.pending_count || 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Средний балл</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {statistics.average_score ? statistics.average_score.toFixed(1) : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900">Основная информация</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Название</label>
                  <p className="mt-1 text-sm text-gray-900">{task.title}</p>
                </div>
                
                {task.description && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Описание</label>
                    <p className="mt-1 text-sm text-gray-900">{task.description}</p>
                  </div>
                )}

                {task.instructions && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Инструкции</label>
                    <div 
                      className="mt-1 text-sm text-gray-900 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: task.instructions }}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Тип задания</label>
                    <p className="mt-1 text-sm text-gray-900">{getTypeLabel(task.type)}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Статус</label>
                    <div className="mt-1">
                      {getStatusBadge(task.status)}
                    </div>
                  </div>
                </div>

                {task.unit_title && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Юнит</label>
                    <div className="mt-1 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-gray-400" />
                      <p className="text-sm text-gray-900">{task.unit_title}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Content (for listening/reading) */}
            {(task.type === 'listening' || task.type === 'reading') && task.content && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {task.type === 'listening' ? 'Аудио/Видео контент' : 'Текст для чтения'}
                  </h2>
                </div>
                <div className="p-6">
                  {task.type === 'listening' && task.content.startsWith('http') ? (
                    <div>
                      <a 
                        href={task.content} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 underline"
                      >
                        {task.content}
                      </a>
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{task.content}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Questions (for listening/reading) */}
            {task.questions && task.questions.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900">Вопросы</h2>
                </div>
                <div className="p-6 space-y-4">
                  {task.questions.map((q: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          Вопрос {index + 1}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                          {q.type === 'multiple_choice' ? 'Множественный выбор' : 
                           q.type === 'open_ended' ? 'Открытый вопрос' : 
                           q.type === 'true_false' ? 'Верно/Неверно' : q.type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-3">{q.question}</p>
                      
                      {q.options && q.options.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-500">Варианты ответов:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {q.options.map((opt: string, optIdx: number) => (
                              <li key={optIdx} className="text-sm text-gray-600">
                                {opt}
                                {Array.isArray(q.correct_answer) && q.correct_answer.includes(opt) && (
                                  <CheckCircle className="inline w-4 h-4 text-green-600 ml-2" />
                                )}
                                {!Array.isArray(q.correct_answer) && q.correct_answer === opt && (
                                  <CheckCircle className="inline w-4 h-4 text-green-600 ml-2" />
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {q.points && (
                        <div className="mt-2 text-xs text-gray-500">
                          Баллов: <span className="font-medium">{q.points}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Settings */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900">Настройки</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Award className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">Максимальный балл</p>
                    <p className="text-lg font-semibold text-gray-900">{task.max_score || 0}</p>
                  </div>
                </div>

                {task.due_at && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Срок сдачи</p>
                      <p className="text-sm text-gray-900">{formatDate(task.due_at)}</p>
                    </div>
                  </div>
                )}

                {task.max_attempts && (
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Максимум попыток</p>
                      <p className="text-sm text-gray-900">{task.max_attempts}</p>
                    </div>
                  </div>
                )}

                {task.allow_late_submissions && (
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Разрешены опоздания</p>
                      <p className="text-sm text-gray-900">
                        Да {task.late_penalty_percent ? `(штраф ${task.late_penalty_percent}%)` : ''}
                      </p>
                    </div>
                  </div>
                )}

                {task.publish_at && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Дата публикации</p>
                      <p className="text-sm text-gray-900">{formatDate(task.publish_at)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Assignment Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900">Назначение</h2>
              </div>
              <div className="p-6 space-y-2">
                {task.assign_to_all ? (
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-gray-900">Назначено всем студентам</span>
                  </div>
                ) : (
                  <>
                    {task.assigned_students && task.assigned_students.length > 0 && (
                      <div className="text-sm text-gray-600">
                        Назначено студентам: <span className="font-medium">{task.assigned_students.length}</span>
                      </div>
                    )}
                    {task.assigned_cohorts && task.assigned_cohorts.length > 0 && (
                      <div className="text-sm text-gray-600">
                        Назначено когортам: <span className="font-medium">{task.assigned_cohorts.length}</span>
                      </div>
                    )}
                    {(!task.assigned_students || task.assigned_students.length === 0) && 
                     (!task.assigned_cohorts || task.assigned_cohorts.length === 0) && (
                      <div className="text-sm text-gray-500">Не назначено</div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900">Метаданные</h2>
              </div>
              <div className="p-6 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Создано:</span>
                  <span className="text-gray-900">{formatDate(task.created_at)}</span>
                </div>
                {task.updated_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Обновлено:</span>
                    <span className="text-gray-900">{formatDate(task.updated_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
