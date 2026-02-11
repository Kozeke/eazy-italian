import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Award, FileText, BookOpen, X, Play, XCircle } from 'lucide-react';
import { tasksApi } from '../services/api';
import toast from 'react-hot-toast';
import { Task } from '../types';

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [submissionText, setSubmissionText] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchTask = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const taskData = await tasksApi.getTask(parseInt(id));
        setTask(taskData);
        console.log('Loaded task:', taskData);
      } catch (error: any) {
        console.error('Error fetching task:', error);
        const errorMessage = error.response?.data?.detail || error.message || 'Ошибка при загрузке задания';
        toast.error(errorMessage);
        
        // Only navigate away if it's a 404 or 403, otherwise show error on page
        if (error.response?.status === 404 || error.response?.status === 403) {
          setTimeout(() => navigate('/tasks'), 2000);
        } else {
          setTask(null);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTask();
  }, [id, navigate]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Загрузка задания...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Задание не найдено</h2>
          <p className="text-sm text-gray-500 mt-1">Запрашиваемое задание не существует или недоступно.</p>
          <button
            onClick={() => navigate('/tasks')}
            className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Вернуться к заданиям
          </button>
        </div>
      </div>
    );
  }

  const isTaskAvailable = task.is_available;
  const dueDate = formatDate(task.due_at);

  // Helper function to extract YouTube video ID
  const extractYouTubeVideoId = (url: string): string | null => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // Helper function to extract Vimeo video ID
  const extractVimeoVideoId = (url: string): string | null => {
    const regex = /(?:vimeo\.com\/)(\d+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // Check if content is a URL
  const isContentUrl = task.content && (task.content.startsWith('http://') || task.content.startsWith('https://'));
  const isContentFile = task.content && !isContentUrl;

  return (
    <div className="max-w-6xl mx-auto px-4">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/tasks')}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Назад
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="bg-amber-600 px-6 py-6 text-white">
              <h1 className="text-2xl font-bold mb-1">{task.title}</h1>
              {task.description && (
                <p className="text-amber-100 text-sm">{task.description}</p>
              )}
            </div>
            
            {/* Body */}
            <div className="p-6">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Award className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Максимальный балл</p>
                    <p className="text-sm font-semibold text-gray-900">{task.max_score || 0} баллов</p>
                  </div>
                </div>
                
                {task.due_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Срок сдачи</p>
                      <p className="text-sm font-semibold text-gray-900">{dueDate}</p>
                    </div>
                  </div>
                )}

                {task.type && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Тип задания</p>
                      <p className="text-sm font-semibold text-gray-900">{getTypeLabel(task.type)}</p>
                    </div>
                  </div>
                )}

                {task.unit && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <BookOpen className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Юнит</p>
                      <p className="text-sm font-semibold text-gray-900">{task.unit.title || '—'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Video/Audio Player for Listening Tasks */}
              {task.type === 'listening' && task.content && (
                <div className="mb-6">
                  <div className="bg-gray-900 rounded-lg overflow-hidden">
                    {isContentUrl ? (
                      (() => {
                        const youtubeId = extractYouTubeVideoId(task.content);
                        const vimeoId = extractVimeoVideoId(task.content);
                        
                        if (youtubeId) {
                          return (
                            <div className="aspect-video">
                              <iframe
                                src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
                                className="w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                title={task.title}
                              />
                            </div>
                          );
                        } else if (vimeoId) {
                          return (
                            <div className="aspect-video">
                              <iframe
                                src={`https://player.vimeo.com/video/${vimeoId}`}
                                className="w-full h-full"
                                allow="autoplay; fullscreen; picture-in-picture"
                                allowFullScreen
                                title={task.title}
                              />
                            </div>
                          );
                        } else {
                          // Generic video URL - try to embed directly
                          return (
                            <div className="aspect-video">
                              <video
                                controls
                                className="w-full h-full"
                                src={task.content}
                              >
                                Ваш браузер не поддерживает видео.
                                <a href={task.content} target="_blank" rel="noopener noreferrer">
                                  Скачать видео
                                </a>
                              </video>
                            </div>
                          );
                        }
                      })()
                    ) : isContentFile ? (
                      // File-based video/audio
                      <div className="aspect-video">
                        <video
                          controls
                          className="w-full h-full"
                          src={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'}/static/${task.content}`}
                        >
                          Ваш браузер не поддерживает видео.
                        </video>
                      </div>
                    ) : null}
                  </div>
                  {task.type === 'listening' && (
                    <p className="mt-2 text-xs text-gray-500 text-center">
                      <Play className="h-3 w-3 inline mr-1" />
                      Прослушайте/просмотрите видео и ответьте на вопросы ниже
                    </p>
                  )}
                </div>
              )}

              {/* Content for Reading Tasks */}
              {task.type === 'reading' && task.content && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Текст для чтения</h3>
                  <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                    {task.content}
                  </div>
                </div>
              )}

              {/* Instructions */}
              {task.instructions && (
                <div className="mb-6 p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <h3 className="text-sm font-medium text-amber-900 mb-2">Инструкции</h3>
                  <div 
                    className="prose prose-sm max-w-none text-amber-800"
                    dangerouslySetInnerHTML={{ __html: task.instructions }}
                  />
                </div>
              )}

              {/* Questions for Listening/Reading Tasks */}
              {task.questions && task.questions.length > 0 && (
                <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">
                    Вопросы ({task.questions.length})
                  </h3>
                  <div className="space-y-4">
                    {task.questions.map((q, index) => {
                      const questionId = q.id || `q-${index}`;
                      const questionType = q.type || 'short_answer';
                      
                      return (
                        <div key={questionId} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-start justify-between mb-3">
                            <h4 className="text-sm font-medium text-gray-900">
                              {index + 1}. {q.question}
                            </h4>
                            {q.points && (
                              <span className="text-xs text-gray-500 ml-2">
                                ({q.points} {q.points === 1 ? 'балл' : 'баллов'})
                              </span>
                            )}
                          </div>
                          
                          {questionType === 'single_choice' || questionType === 'true_false' ? (
                            <div className="space-y-2">
                              {q.options?.map((option, optIndex) => (
                                <label
                                  key={optIndex}
                                  className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer"
                                >
                                  <input
                                    type="radio"
                                    name={questionId}
                                    value={option}
                                    checked={questionAnswers[questionId] === option}
                                    onChange={(e) => {
                                      setQuestionAnswers({
                                        ...questionAnswers,
                                        [questionId]: e.target.value
                                      });
                                    }}
                                    className="text-primary-600 focus:ring-primary-500"
                                  />
                                  <span className="text-sm text-gray-700">{option}</span>
                                </label>
                              ))}
                            </div>
                          ) : questionType === 'multiple_choice' ? (
                            <div className="space-y-2">
                              {q.options?.map((option, optIndex) => (
                                <label
                                  key={optIndex}
                                  className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    value={option}
                                    checked={(questionAnswers[questionId] as string[] || []).includes(option)}
                                    onChange={(e) => {
                                      const currentAnswers = (questionAnswers[questionId] as string[] || []);
                                      const newAnswers = e.target.checked
                                        ? [...currentAnswers, option]
                                        : currentAnswers.filter(a => a !== option);
                                      setQuestionAnswers({
                                        ...questionAnswers,
                                        [questionId]: newAnswers
                                      });
                                    }}
                                    className="rounded text-primary-600 focus:ring-primary-500"
                                  />
                                  <span className="text-sm text-gray-700">{option}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <textarea
                              value={(questionAnswers[questionId] as string) || ''}
                              onChange={(e) => {
                                setQuestionAnswers({
                                  ...questionAnswers,
                                  [questionId]: e.target.value
                                });
                              }}
                              placeholder="Введите ваш ответ..."
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 min-h-[80px]"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-4 border-t border-gray-200">
                {isTaskAvailable ? (
                  <button
                    onClick={() => setShowSubmissionModal(true)}
                    className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium rounded-lg text-white bg-amber-600 hover:bg-amber-700 transition-colors"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Выполнить задание
                  </button>
                ) : (
                  <div className="text-center">
                    <div className="inline-flex items-center px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm">
                      <XCircle className="h-4 w-4 mr-2" />
                      Задание недоступно
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Task Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Информация о задании</h3>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Тип задания</span>
                  <span className="font-medium text-gray-900">{getTypeLabel(task.type)}</span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Максимальный балл</span>
                  <span className="font-medium text-gray-900">{task.max_score || 0}</span>
                </div>

                {task.due_at && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Срок сдачи</span>
                    <span className="font-medium text-gray-900">{dueDate}</span>
                  </div>
                )}

                {task.unit && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Юнит</span>
                    <span className="font-medium text-gray-900">{task.unit.title || '—'}</span>
                  </div>
                )}

                {task.questions && task.questions.length > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Вопросов</span>
                    <span className="font-medium text-gray-900">{task.questions.length}</span>
                  </div>
                )}

                {task.max_attempts && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Максимум попыток</span>
                    <span className="font-medium text-gray-900">{task.max_attempts}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Опоздания</span>
                  <span className={`font-medium ${task.allow_late_submissions ? 'text-green-600' : 'text-gray-500'}`}>
                    {task.allow_late_submissions ? 'Разрешены' : 'Запрещены'}
                  </span>
                </div>

                {task.allow_late_submissions && task.late_penalty_percent && task.late_penalty_percent > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Штраф за опоздание</span>
                    <span className="font-medium text-gray-900">{task.late_penalty_percent}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
            <h4 className="text-sm font-medium text-amber-900 mb-2">💡 Советы</h4>
            <ul className="text-xs text-amber-700 space-y-1">
              <li>• Внимательно прочитайте инструкции</li>
              <li>• Следите за сроком сдачи</li>
              <li>• Проверьте работу перед отправкой</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Submission Modal */}
      {showSubmissionModal && task && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Отправить задание</h2>
              <button
                onClick={() => {
                  setShowSubmissionModal(false);
                  setSubmissionText('');
                  setQuestionAnswers({});
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-gray-900 mb-2">{task.title}</h3>
                {task.description && (
                  <p className="text-sm text-gray-600">{task.description}</p>
                )}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!id || !task) return;

                  // Validate: if task has questions, all must be answered
                  if (task.questions && task.questions.length > 0) {
                    const unansweredQuestions = task.questions.filter((q, index) => {
                      const questionId = q.id || `q-${index}`;
                      const answer = questionAnswers[questionId];
                      return answer === undefined || 
                             answer === '' || 
                             (Array.isArray(answer) && answer.length === 0);
                    });
                    
                    if (unansweredQuestions.length > 0) {
                      toast.error(`Пожалуйста, ответьте на все вопросы (${unansweredQuestions.length} не отвечено)`);
                      return;
                    }
                  } else if (!submissionText.trim()) {
                    // For tasks without questions, require text answer
                    toast.error('Пожалуйста, введите ответ');
                    return;
                  }

                  setSubmitting(true);
                  try {
                    // Prepare answers object
                    const answers: Record<string, any> = {};
                    
                    // Add question answers if there are questions
                    if (task.questions && task.questions.length > 0) {
                      task.questions.forEach((q, index) => {
                        const questionId = q.id || `q-${index}`;
                        if (questionAnswers[questionId] !== undefined) {
                          answers[questionId] = questionAnswers[questionId];
                        }
                      });
                    }
                    
                    // Add text answer if provided (for manual tasks without questions)
                    if (submissionText.trim()) {
                      answers.text = submissionText.trim();
                    }
                    
                    await tasksApi.submitTask(parseInt(id), {
                      answers: answers,
                      attachments: []
                    });
                    
                    toast.success('Задание успешно отправлено!');
                    setShowSubmissionModal(false);
                    setSubmissionText('');
                    setQuestionAnswers({});
                    // Reload task to show updated status
                    const taskData = await tasksApi.getTask(parseInt(id));
                    setTask(taskData);
                  } catch (error: any) {
                    console.error('Error submitting task:', error);
                    toast.error(error.response?.data?.detail || 'Ошибка при отправке задания');
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {/* Show questions summary if there are questions */}
                {task.questions && task.questions.length > 0 ? (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-3">
                      Проверьте ваши ответы на вопросы перед отправкой:
                    </p>
                    <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                      {task.questions.map((q, index) => {
                        const questionId = q.id || `q-${index}`;
                        const answer = questionAnswers[questionId];
                        return (
                          <div key={questionId} className="text-sm">
                            <span className="font-medium text-gray-700">{index + 1}. {q.question}</span>
                            <div className="text-gray-600 mt-1">
                              {answer ? (
                                Array.isArray(answer) ? (
                                  <span>{answer.join(', ')}</span>
                                ) : (
                                  <span>{answer}</span>
                                )
                              ) : (
                                <span className="text-red-500">Не отвечено</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ваш ответ
                    </label>
                    <textarea
                      value={submissionText}
                      onChange={(e) => setSubmissionText(e.target.value)}
                      placeholder="Введите ваш ответ на задание..."
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 min-h-[200px]"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubmissionModal(false);
                      setSubmissionText('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    disabled={submitting}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        Отправка...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Отправить задание
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
