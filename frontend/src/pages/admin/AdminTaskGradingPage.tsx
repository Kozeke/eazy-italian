import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  ArrowLeft, 
  Save, 
  CheckCircle,
  AlertCircle,
  Clock,
  Calendar,
  FileText,
  User,
  Star,
  MessageSquare
} from 'lucide-react';
import { Task, TaskSubmission } from '../../types';
import { tasksApi } from '../../services/api';
import RichTextEditor from '../../components/RichTextEditor';

export default function AdminTaskGradingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id, submissionId } = useParams<{ id: string; submissionId: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [submission, setSubmission] = useState<TaskSubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [score, setScore] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');

  useEffect(() => {
    const loadData = async () => {
      if (!id || !submissionId) return;
      
      setIsLoading(true);
      try {
        const [taskData, submissionData] = await Promise.all([
          tasksApi.getAdminTask(parseInt(id)),
          tasksApi.getTaskSubmission(parseInt(id), parseInt(submissionId))
        ]);
        
        setTask(taskData);
        setSubmission(submissionData);
        setScore(submissionData.score || 0);
        setFeedback(submissionData.feedback_rich || '');
      } catch (error) {
        console.error('Failed to load data:', error);
        toast.error('Ошибка при загрузке данных');
        navigate(`/admin/tasks/${id}/submissions`);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id, submissionId, navigate]);

  const handleSave = async () => {
    if (!id || !submissionId) return;
    
    setIsSaving(true);
    try {
      await tasksApi.gradeSubmission(parseInt(id), parseInt(submissionId), {
        score,
        feedback_rich: feedback
      });
      
      toast.success('Оценка сохранена');
      navigate(`/admin/tasks/${id}/submissions`);
    } catch (error) {
      console.error('Failed to save grade:', error);
      toast.error('Ошибка при сохранении оценки');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
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
          <p className="mt-4 text-gray-600">Загрузка сдачи...</p>
        </div>
      </div>
    );
  }

  if (!task || !submission) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Сдача не найдена</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(`/admin/tasks/${task.id}/submissions`)}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к сдачам
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Оценка: {task.title}
            </h1>
            <p className="text-gray-600">
              Студент: {submission.student_name || `Студент ${submission.student_id}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSave}
            disabled={isSaving || submission.status !== 'submitted'}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Сохранение...' : 'Сохранить оценку'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Submission Info */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Информация о сдаче</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Студент</dt>
                  <dd className="text-sm text-gray-900 flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    {submission.student_name || `Студент ${submission.student_id}`}
                  </dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Статус</dt>
                  <dd className="text-sm text-gray-900">
                    {getStatusBadge(submission.status)}
                  </dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Попытка</dt>
                  <dd className="text-sm text-gray-900">
                    {submission.attempt_number}
                  </dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Сдано</dt>
                  <dd className="text-sm text-gray-900">
                    {submission.submitted_at ? (
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        {new Date(submission.submitted_at).toLocaleString('ru-RU')}
                      </div>
                    ) : (
                      'Не сдано'
                    )}
                  </dd>
                </div>
                
                {submission.time_spent_minutes && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Время выполнения</dt>
                    <dd className="text-sm text-gray-900 flex items-center">
                      <Clock className="w-4 h-4 mr-2" />
                      {submission.time_spent_minutes} минут
                    </dd>
                  </div>
                )}
                
                {submission.is_late && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Опоздание</dt>
                    <dd className="text-sm text-red-600 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Сдано с опозданием
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Оценка</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Балл (макс. {task.max_score})
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={task.max_score}
                    value={score}
                    onChange={(e) => setScore(parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    disabled={submission.status !== 'submitted'}
                  />
                </div>
                
                {submission.is_late && task.allow_late_submissions && task.late_penalty_percent > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <div className="flex items-center">
                      <AlertCircle className="w-4 h-4 text-yellow-600 mr-2" />
                      <span className="text-sm text-yellow-800">
                        Штраф за опоздание: {task.late_penalty_percent}%
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-yellow-700">
                      Итоговый балл: {Math.max(0, score - (score * task.late_penalty_percent / 100)).toFixed(1)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Submission Content and Feedback */}
        <div className="lg:col-span-2 space-y-6">
          {/* Task Instructions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Задание
            </h3>
            <div className="prose max-w-none">
              <h4 className="text-lg font-semibold text-gray-900">{task.title}</h4>
              {task.description && (
                <p className="text-gray-600">{task.description}</p>
              )}
              {task.instructions && (
                <div dangerouslySetInnerHTML={{ __html: task.instructions }} />
              )}
            </div>
          </div>

          {/* Student's Answer */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <User className="w-5 h-5 mr-2" />
              Ответ студента
            </h3>
            
            {Object.keys(submission.answers || {}).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(submission.answers).map(([key, value]) => (
                  <div key={key} className="border border-gray-200 rounded-md p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">{key}</h4>
                    <div className="text-sm text-gray-900">
                      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Студент не предоставил ответов</p>
            )}
            
            {submission.attachments && submission.attachments.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Прикрепленные файлы</h4>
                <div className="space-y-2">
                  {submission.attachments.map((attachment, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <a
                        href={attachment}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-600 hover:text-primary-800"
                      >
                        Файл {index + 1}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Feedback */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <MessageSquare className="w-5 h-5 mr-2" />
              Обратная связь
            </h3>
            <RichTextEditor
              value={feedback}
              onChange={setFeedback}
              placeholder="Введите обратную связь для студента..."
              disabled={submission.status !== 'submitted'}
            />
            <p className="mt-2 text-sm text-gray-500">
              Используйте панель инструментов для форматирования текста
            </p>
          </div>

          {/* Previous Grade (if exists) */}
          {submission.status === 'graded' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-blue-900 mb-4 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                Текущая оценка
              </h3>
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-blue-700">Балл: </span>
                  <span className="text-sm text-blue-900">
                    {submission.score}/{task.max_score}
                  </span>
                </div>
                {submission.feedback_rich && (
                  <div>
                    <span className="text-sm font-medium text-blue-700">Обратная связь: </span>
                    <div className="mt-2 text-sm text-blue-900 prose prose-sm max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: submission.feedback_rich }} />
                    </div>
                  </div>
                )}
                {submission.grader_name && (
                  <div>
                    <span className="text-sm font-medium text-blue-700">Оценил: </span>
                    <span className="text-sm text-blue-900">{submission.grader_name}</span>
                  </div>
                )}
                {submission.graded_at && (
                  <div>
                    <span className="text-sm font-medium text-blue-700">Дата оценки: </span>
                    <span className="text-sm text-blue-900">
                      {new Date(submission.graded_at).toLocaleString('ru-RU')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
