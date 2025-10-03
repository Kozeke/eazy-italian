import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  ArrowLeft, 
  Edit, 
  Eye, 
  Users, 
  Calendar, 
  FileText, 
  BarChart3,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Activity
} from 'lucide-react';
import { Task, TaskSubmission } from '../../types';
import { tasksApi } from '../../services/api';

export default function AdminTaskDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTaskData = async () => {
      if (!id) return;
      
      setIsLoading(true);
      try {
        const [taskData, submissionsData, statsData] = await Promise.all([
          tasksApi.getAdminTask(parseInt(id)),
          tasksApi.getTaskSubmissions(parseInt(id)),
          tasksApi.getTaskStatistics(parseInt(id))
        ]);
        
        setTask(taskData);
        setSubmissions(submissionsData);
        setStatistics(statsData);
      } catch (error) {
        console.error('Failed to load task data:', error);
        toast.error('Ошибка при загрузке данных задания');
        navigate('/admin/tasks');
      } finally {
        setIsLoading(false);
      }
    };

    loadTaskData();
  }, [id, navigate]);

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
      manual: { color: 'bg-blue-100 text-blue-800', label: 'Ручная проверка' },
      auto: { color: 'bg-green-100 text-green-800', label: 'Авто-проверка' },
      practice: { color: 'bg-yellow-100 text-yellow-800', label: 'Практика' },
      writing: { color: 'bg-purple-100 text-purple-800', label: 'Письменная работа' }
    };
    
    const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.manual;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getSubmissionStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', label: 'Черновик' },
      submitted: { color: 'bg-yellow-100 text-yellow-800', label: 'Сдано' },
      graded: { color: 'bg-green-100 text-green-800', label: 'Оценено' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка задания...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Задание не найдено</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/admin/tasks')}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к заданиям
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {task.title}
            </h1>
            <p className="text-gray-600">
              ID: {task.id} • {getStatusBadge(task.status)} • {getTypeBadge(task.type)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate(`/admin/tasks/${task.id}/submissions`)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Eye className="w-4 h-4 mr-2" />
            Сдачи ({submissions.length})
          </button>
          <button
            onClick={() => navigate(`/admin/tasks/${task.id}/edit`)}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            <Edit className="w-4 h-4 mr-2" />
            Редактировать
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <Users className="w-8 h-8 text-blue-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Назначено</p>
              <p className="text-lg font-semibold text-gray-900">
                {task.assigned_student_count || 0} студентов
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <FileText className="w-8 h-8 text-green-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Сдано</p>
              <p className="text-lg font-semibold text-gray-900">
                {task.submission_stats?.submitted || 0} работ
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <CheckCircle className="w-8 h-8 text-yellow-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Оценено</p>
              <p className="text-lg font-semibold text-gray-900">
                {task.submission_stats?.graded || 0} работ
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <TrendingUp className="w-8 h-8 text-purple-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Средний балл</p>
              <p className="text-lg font-semibold text-gray-900">
                {task.average_score ? `${task.average_score.toFixed(1)}%` : 'Нет данных'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {[
              { id: 'basic', label: 'Основное', icon: FileText },
              { id: 'submissions', label: 'Сдачи', icon: Users },
              { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
              { id: 'activity', label: 'Активность', icon: Activity }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {/* Basic Information Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Основная информация</h3>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Название</dt>
                      <dd className="text-sm text-gray-900">{task.title}</dd>
                    </div>
                    {task.description && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Описание</dt>
                        <dd className="text-sm text-gray-900">{task.description}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Юнит</dt>
                      <dd className="text-sm text-gray-900">{task.unit_title || 'Без юнита'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Тип</dt>
                      <dd className="text-sm text-gray-900">{getTypeBadge(task.type)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Статус</dt>
                      <dd className="text-sm text-gray-900">{getStatusBadge(task.status)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Макс. баллов</dt>
                      <dd className="text-sm text-gray-900">{task.max_score}</dd>
                    </div>
                  </dl>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Настройки</h3>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Срок сдачи</dt>
                      <dd className="text-sm text-gray-900">
                        {task.due_at ? (
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            {new Date(task.due_at).toLocaleString('ru-RU')}
                          </div>
                        ) : (
                          'Не установлен'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Попытки</dt>
                      <dd className="text-sm text-gray-900">
                        {task.max_attempts ? `Максимум ${task.max_attempts}` : 'Неограниченно'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Опоздания</dt>
                      <dd className="text-sm text-gray-900">
                        {task.allow_late_submissions ? `Разрешены (штраф ${task.late_penalty_percent}%)` : 'Запрещены'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Порядок</dt>
                      <dd className="text-sm text-gray-900">{task.order_index}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              {task.instructions && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Инструкции</h3>
                  <div className="prose max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: task.instructions }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submissions Tab */}
          {activeTab === 'submissions' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Сдачи ({submissions.length})</h3>
                <button
                  onClick={() => navigate(`/admin/tasks/${task.id}/submissions`)}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Просмотреть все
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Студент
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Статус
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Сдано
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Балл
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Попытка
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {submissions.slice(0, 10).map((submission) => (
                      <tr key={submission.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {submission.student_name || `Студент ${submission.student_id}`}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getSubmissionStatusBadge(submission.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {submission.submitted_at ? (
                            <div className="flex items-center">
                              <Clock className="w-4 h-4 mr-1" />
                              {new Date(submission.submitted_at).toLocaleString('ru-RU')}
                            </div>
                          ) : (
                            'Не сдано'
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {submission.score !== null ? `${submission.score}/${task.max_score}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {submission.attempt_number}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {submissions.length === 0 && (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">Нет сдач</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Студенты еще не сдали это задание.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && statistics && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800">Процент выполнения</h4>
                  <p className="text-2xl font-bold text-blue-900">
                    {statistics.completion_rate?.toFixed(1) || 0}%
                  </p>
                </div>
                
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-green-800">Средний балл</h4>
                  <p className="text-2xl font-bold text-green-900">
                    {statistics.average_score?.toFixed(1) || 0}%
                  </p>
                </div>
                
                <div className="bg-yellow-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-yellow-800">Среднее время</h4>
                  <p className="text-2xl font-bold text-yellow-900">
                    {statistics.average_time_minutes ? `${statistics.average_time_minutes} мин` : 'Нет данных'}
                  </p>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h4 className="text-lg font-medium text-gray-900 mb-4">Распределение баллов</h4>
                <div className="space-y-3">
                  {Object.entries(statistics.score_distribution || {}).map(([range, count]) => (
                    <div key={range} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{range}</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary-600 h-2 rounded-full"
                            style={{
                              width: `${(count as number / statistics.total_submissions) * 100}%`
                            }}
                          />
                        </div>
                        <span className="text-sm text-gray-900 w-8">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">История изменений</h4>
                <p className="text-sm text-gray-600">
                  История изменений будет отображаться здесь.
                </p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Аудит</h4>
                <p className="text-sm text-gray-600">
                  Аудит действий будет отображаться здесь.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
