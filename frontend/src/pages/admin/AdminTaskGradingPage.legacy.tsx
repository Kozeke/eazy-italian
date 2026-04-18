import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Save, 
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Headphones,
  BookOpen,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { tasksApi } from '../../services/api';
import { TaskSubmission, Task } from '../../types';
import RichTextEditor from '../../components/admin/RichTextEditor';

export default function AdminTaskGradingPage() {
  const { id, submissionId } = useParams<{ id: string; submissionId: string }>();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<TaskSubmission | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Grading state
  const [score, setScore] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');
  const [questionScores, setQuestionScores] = useState<Record<string, number>>({});
  
  // Auto-grading results
  const [autoGradingResults, setAutoGradingResults] = useState<any>(null);

  useEffect(() => {
    if (!id || !submissionId) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const [submissionData, taskData] = await Promise.all([
          tasksApi.getTaskSubmission(parseInt(id), parseInt(submissionId)),
          tasksApi.getAdminTask(parseInt(id))
        ]);
        
        setSubmission(submissionData);
        setTask(taskData);
        
        // Set initial score and feedback
        if (submissionData.score !== null && submissionData.score !== undefined) {
          setScore(submissionData.score);
        }
        if (submissionData.feedback_rich) {
          setFeedback(submissionData.feedback_rich);
        }
        
        // Parse auto-grading results if available
        if (submissionData.feedback_rich) {
          try {
            const parsed = JSON.parse(submissionData.feedback_rich);
            if (parsed.auto_graded && parsed.question_results) {
              setAutoGradingResults(parsed);
              // Initialize question scores from auto-grading
              const scores: Record<string, number> = {};
              Object.keys(parsed.question_results).forEach(qId => {
                scores[qId] = parsed.question_results[qId].points_earned;
              });
              setQuestionScores(scores);
            }
          } catch (e) {
            // Not JSON, it's regular feedback
            setFeedback(submissionData.feedback_rich);
          }
        }
      } catch (error: any) {
        console.error('Error loading submission:', error);
        toast.error(error.response?.data?.detail || 'Ошибка загрузки сдачи');
        navigate(`/admin/tasks/${id}/submissions`);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, submissionId, navigate]);

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

  const handleSaveGrade = async () => {
    if (!id || !submissionId) return;
    
    if (score < 0 || (task && score > task.max_score)) {
      toast.error(`Балл должен быть от 0 до ${task?.max_score || 100}`);
      return;
    }

    setSaving(true);
    try {
      await tasksApi.gradeSubmission(parseInt(id), parseInt(submissionId), {
        score: score,
        feedback_rich: feedback.trim() || undefined
      });
      
      toast.success('Оценка сохранена');
      navigate(`/admin/tasks/${id}/submissions`);
    } catch (error: any) {
      console.error('Error saving grade:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при сохранении оценки');
    } finally {
      setSaving(false);
    }
  };

  const calculateScoreFromQuestions = () => {
    if (!task?.questions) return 0;
    
    let total = 0;
    task.questions.forEach((q, index) => {
      const qId = q.id || `q-${index}`;
      total += questionScores[qId] || 0;
    });
    
    // Convert to percentage
    const maxScore = task.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    return maxScore > 0 ? (total / maxScore) * 100 : 0;
  };

  const handleQuestionScoreChange = (questionId: string, newScore: number) => {
    setQuestionScores(prev => ({
      ...prev,
      [questionId]: newScore
    }));
    
    // Auto-update total score if using question-based grading
    if (task?.type === 'listening' || task?.type === 'reading') {
      const newTotal = calculateScoreFromQuestions();
      setScore(newTotal);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Загрузка сдачи...</p>
        </div>
      </div>
    );
  }

  if (!submission || !task) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Сдача не найдена</p>
      </div>
    );
  }

  const isWriting = task.type === 'writing';
  const isListeningOrReading = task.type === 'listening' || task.type === 'reading';
  const hasQuestions = task.questions && task.questions.length > 0;
  const isAutoGraded = autoGradingResults?.auto_graded === true;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => navigate(`/admin/tasks/${id}/submissions`)}
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к списку сдач
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                Оценка задания: {task.title}
              </h1>
              <p className="mt-1 text-xs md:text-sm text-gray-500">
                Студент: {submission.student_name || `ID ${submission.student_id}`} | 
                Попытка #{submission.attempt_number} | 
                Отправлено: {formatDate(submission.submitted_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {submission.is_late && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  <Clock className="w-3 h-3 mr-1" />
                  Опоздание
                </span>
              )}
              {submission.is_graded && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Оценено
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Submission Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Task Type Icon */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3 mb-4">
                {task.type === 'writing' ? (
                  <FileText className="w-6 h-6 text-purple-600" />
                ) : task.type === 'listening' ? (
                  <Headphones className="w-6 h-6 text-blue-600" />
                ) : (
                  <BookOpen className="w-6 h-6 text-green-600" />
                )}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {task.type === 'writing' ? 'Письменная работа' : 
                     task.type === 'listening' ? 'Аудирование' : 'Чтение'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {task.description || 'Описание отсутствует'}
                  </p>
                </div>
              </div>
            </div>

            {/* Writing Task - Show Text Answer */}
            {isWriting && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Ответ студента</h3>
                <div className="bg-gray-50 rounded-lg p-4 min-h-[200px]">
                  {submission.answers?.text ? (
                    <p className="whitespace-pre-wrap text-gray-900">{submission.answers.text}</p>
                  ) : (
                    <p className="text-gray-400 italic">Студент не предоставил ответ</p>
                  )}
                </div>
                
                {submission.attachments && submission.attachments.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Прикрепленные файлы:</h4>
                    <div className="space-y-2">
                      {submission.attachments.map((file, idx) => (
                        <a
                          key={idx}
                          href={file}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-sm text-primary-600 hover:text-primary-800"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          {file.split('/').pop()}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Listening/Reading Task - Show Questions and Answers */}
            {isListeningOrReading && hasQuestions && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Вопросы и ответы</h3>
                  {isAutoGraded && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      ⚡ Автоматически оценено
                    </span>
                  )}
                </div>

                <div className="space-y-6">
                  {task.questions && task.questions.map((question, index) => {
                    const qId = question.id || `q-${index}`;
                    const studentAnswer = submission.answers?.[qId] || submission.answers?.[index] || submission.answers?.[`q-${index}`];
                    const autoResult = autoGradingResults?.question_results?.[qId];
                    const questionScore = questionScores[qId] ?? (autoResult?.points_earned || 0);
                    const maxPoints = question.points || 1;
                    const isCorrect = autoResult?.is_correct;

                    return (
                      <div key={qId} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-gray-900">Вопрос {index + 1}</span>
                              <span className="text-xs text-gray-500">({maxPoints} балл{maxPoints !== 1 ? 'ов' : ''})</span>
                            </div>
                            <p className="text-gray-700 mb-3">{question.question}</p>
                          </div>
                          {isAutoGraded && (
                            <div className="ml-4">
                              {isCorrect ? (
                                <CheckCircle className="w-5 h-5 text-green-500" />
                              ) : (
                                <XCircle className="w-5 h-5 text-red-500" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Show options for multiple choice */}
                        {(question.type === 'multiple_choice' || question.type === 'true_false') && question.options && (
                          <div className="mb-3 space-y-2">
                            {question.options.map((option, optIdx) => {
                              const isSelected = Array.isArray(studentAnswer) 
                                ? studentAnswer.includes(option)
                                : studentAnswer === option;
                              const isCorrectAnswer = Array.isArray(question.correct_answer)
                                ? question.correct_answer.includes(option)
                                : question.correct_answer === option;
                              
                              return (
                                <div
                                  key={optIdx}
                                  className={`p-2 rounded border ${
                                    isSelected && isCorrectAnswer
                                      ? 'bg-green-50 border-green-300'
                                      : isSelected
                                      ? 'bg-red-50 border-red-300'
                                      : isCorrectAnswer
                                      ? 'bg-blue-50 border-blue-300'
                                      : 'bg-gray-50 border-gray-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    {isSelected && <span className="text-xs font-medium">✓ Выбрано</span>}
                                    {isCorrectAnswer && <span className="text-xs font-medium text-blue-600">✓ Правильный ответ</span>}
                                    <span className="flex-1">{option}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Show student answer for short answer */}
                        {question.type === 'short_answer' && (
                          <div className="mb-3">
                            <div className="bg-gray-50 rounded-lg p-3 mb-2">
                              <p className="text-sm text-gray-600 mb-1">Ответ студента:</p>
                              <p className="text-gray-900">{studentAnswer || 'Нет ответа'}</p>
                            </div>
                            {question.correct_answer && (
                              <div className="bg-blue-50 rounded-lg p-3">
                                <p className="text-sm text-blue-600 mb-1">Правильный ответ:</p>
                                <p className="text-blue-900">
                                  {Array.isArray(question.correct_answer) 
                                    ? question.correct_answer.join(', ')
                                    : question.correct_answer}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Manual score override */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700">Балл:</label>
                            <input
                              type="number"
                              min="0"
                              max={maxPoints}
                              step="0.1"
                              value={questionScore}
                              onChange={(e) => handleQuestionScoreChange(qId, parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                            <span className="text-sm text-gray-500">/ {maxPoints}</span>
                          </div>
                          {autoResult && (
                            <span className="text-xs text-gray-500">
                              Авто: {autoResult.points_earned.toFixed(1)} / {maxPoints}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Content for listening/reading */}
            {isListeningOrReading && task.content && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {task.type === 'listening' ? 'Аудио/Видео контент' : 'Текст для чтения'}
                </h3>
                {task.type === 'listening' && task.content.startsWith('http') ? (
                  <div className="aspect-video lg:aspect-video max-h-[300px] lg:max-h-none">
                    <iframe
                      src={task.content}
                      className="w-full h-full rounded-lg"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="whitespace-pre-wrap text-gray-900">{task.content}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Grading Panel */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6 sticky top-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Оценка</h3>
              
              {/* Score Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Балл {task.max_score && `(максимум: ${task.max_score})`}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={task.max_score || 100}
                    step="0.1"
                    value={score}
                    onChange={(e) => setScore(parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                {task.max_score && (
                  <p className="mt-1 text-xs text-gray-500">
                    {((score / 100) * task.max_score).toFixed(1)} из {task.max_score} баллов
                  </p>
                )}
              </div>

              {/* Auto-grading summary */}
              {isAutoGraded && autoGradingResults && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-medium text-green-800 mb-1">Автоматическая оценка:</p>
                  <p className="text-sm text-green-900">
                    {autoGradingResults.total_score.toFixed(1)} / {autoGradingResults.max_score} баллов
                    ({autoGradingResults.percentage.toFixed(1)}%)
                  </p>
                </div>
              )}

              {/* Feedback */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Обратная связь
                </label>
                <RichTextEditor
                  value={feedback}
                  onChange={setFeedback}
                  placeholder="Введите обратную связь для студента..."
                />
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={handleSaveGrade}
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Сохранение...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Сохранить оценку
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => navigate(`/admin/tasks/${id}/submissions`)}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
                >
                  Отмена
                </button>
              </div>

              {/* Submission Info */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Информация</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Статус:</span>
                    <span className="font-medium text-gray-900">
                      {submission.status === 'graded' ? 'Оценено' : 
                       submission.status === 'submitted' ? 'Отправлено' : 'Черновик'}
                    </span>
                  </div>
                  {submission.graded_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Оценено:</span>
                      <span className="font-medium text-gray-900">
                        {formatDate(submission.graded_at)}
                      </span>
                    </div>
                  )}
                  {submission.grader_name && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Оценил:</span>
                      <span className="font-medium text-gray-900">
                        {submission.grader_name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
