import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  Save, 
  Plus, 
  Trash2, 
  ArrowLeft,
  FileText,
  Headphones,
  BookOpen,
  Calendar,
  Clock,
  Settings,
  Upload,
  X,
  Loader,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { tasksApi, unitsApi, usersApi } from '../../services/api';
import RichTextEditor from '../../components/admin/RichTextEditor';
import { Task, Unit, Student } from '../../types';

interface Question {
  id: string;
  question: string;
  type: 'multiple_choice' | 'short_answer' | 'true_false';
  options?: string[];
  correct_answer?: string | string[];
  points?: number;
}

export default function AdminTaskCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const unitId = searchParams.get('unitId');

  // Basic fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [taskType, setTaskType] = useState<'writing' | 'listening' | 'reading'>('writing');
  const [gradingType, setGradingType] = useState<'automatic' | 'manual'>('manual');
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(unitId ? parseInt(unitId) : null);
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'published' | 'archived'>('published');
  
  // Content for listening/reading
  const [content, setContent] = useState('');
  const [contentSource, setContentSource] = useState<'url' | 'file' | 'text'>('url'); // 'url' for listening, 'text' for reading, 'file' for both
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ file_path: string; filename: string; original_filename: string; size: number; url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // Settings
  const [maxScore, setMaxScore] = useState(100);
  const [dueAt, setDueAt] = useState('');
  const [publishAt, setPublishAt] = useState(''); // For scheduled status
  const [allowLateSubmissions, setAllowLateSubmissions] = useState(false);
  const [latePenaltyPercent, setLatePenaltyPercent] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  
  // Assignment settings
  const [assignToAll, setAssignToAll] = useState(true); // Default to true
  const [assignedStudents, setAssignedStudents] = useState<number[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  
  // Units
  const [units, setUnits] = useState<Unit[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUnits();
    loadStudents();
  }, []);

  useEffect(() => {
    // When unit changes, we could filter students by course, but for now load all
    // The backend will handle assignment to enrolled students
  }, [selectedUnitId]);

  const loadUnits = async () => {
    try {
      const fetchedUnits = await unitsApi.getAdminUnits();
      setUnits(fetchedUnits as any);
    } catch (error) {
      console.error('Error loading units:', error);
      toast.error('Ошибка загрузки юнитов');
    }
  };

  const loadStudents = async () => {
    setLoadingStudents(true);
    try {
      const fetchedStudents = await usersApi.getStudents();
      setStudents(fetchedStudents);
    } catch (error) {
      console.error('Error loading students:', error);
      toast.error('Ошибка загрузки студентов');
    } finally {
      setLoadingStudents(false);
    }
  };

  const addQuestion = (type: Question['type']) => {
    const newQuestion: Question = {
      id: `q-${Date.now()}-${Math.random()}`,
      question: '',
      type,
      points: 1,
      ...(type === 'multiple_choice' || type === 'true_false' 
        ? { options: type === 'true_false' ? ['True', 'False'] : ['', ''] }
        : {}),
      ...(type === 'true_false' 
        ? { correct_answer: '' }
        : type === 'multiple_choice'
        ? { correct_answer: [] }
        : {})
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const addOption = (questionId: string) => {
    setQuestions(questions.map(q => 
      q.id === questionId 
        ? { ...q, options: [...(q.options || []), ''] }
        : q
    ));
  };

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    setQuestions(questions.map(q => 
      q.id === questionId 
        ? { 
            ...q, 
            options: q.options?.map((opt, idx) => idx === optionIndex ? value : opt)
          }
        : q
    ));
  };

  const removeOption = (questionId: string, optionIndex: number) => {
    setQuestions(questions.map(q => 
      q.id === questionId 
        ? { 
            ...q, 
            options: q.options?.filter((_, idx) => idx !== optionIndex)
          }
        : q
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error('Введите название задания');
      return;
    }

    if ((taskType === 'listening' || taskType === 'reading')) {
      if (contentSource === 'file' && uploadedFiles.length === 0) {
        toast.error('Загрузите хотя бы один файл или выберите другой способ ввода');
        return;
      }
      if ((contentSource === 'url' || contentSource === 'text') && !content.trim()) {
        toast.error('Введите содержание задания');
        return;
      }
    }

    if (status === 'scheduled' && !publishAt) {
      toast.error('Укажите дату публикации для запланированного задания');
      return;
    }

    if ((taskType === 'listening' || taskType === 'reading') && gradingType === 'automatic' && questions.length === 0) {
      toast.error('Для автоматической проверки необходимо добавить хотя бы один вопрос');
      return;
    }

    // Validate questions
    for (const q of questions) {
      if (!q.question.trim()) {
        toast.error('Все вопросы должны иметь текст');
        return;
      }
      if ((q.type === 'multiple_choice' || q.type === 'true_false')) {
        if (!q.options || q.options.length < 2) {
          toast.error('Вопросы с выбором должны иметь минимум 2 варианта');
          return;
        }
        if (q.type === 'true_false') {
          if (!q.correct_answer) {
            toast.error('Укажите правильный ответ для каждого вопроса');
            return;
          }
        }
        if (q.type === 'multiple_choice') {
          if (!q.correct_answer || (q.correct_answer as string[]).length === 0) {
            toast.error('Укажите хотя бы один правильный ответ');
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      const taskData: Partial<Task> = {
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        type: taskType,
        unit_id: selectedUnitId || undefined,
        status,
        max_score: maxScore,
        due_at: dueAt || undefined,
        publish_at: status === 'scheduled' && publishAt ? publishAt : undefined,
        allow_late_submissions: allowLateSubmissions,
        late_penalty_percent: allowLateSubmissions ? latePenaltyPercent : undefined,
        max_attempts: maxAttempts || undefined,
        content: (taskType === 'listening' || taskType === 'reading') ? content.trim() : undefined,
        attachments: (taskType === 'listening' || taskType === 'reading') && contentSource === 'file' && uploadedFiles.length > 0 
          ? uploadedFiles.map(f => f.file_path) 
          : undefined,
        questions: (taskType === 'listening' || taskType === 'reading') ? questions.map(q => ({
          question: q.question,
          type: q.type,
          options: q.options,
          correct_answer: q.correct_answer,
          points: q.points || 1
        })) : undefined,
        auto_check_config: {
          grading_type: (taskType === 'listening' || taskType === 'reading') ? gradingType : 'manual'
        },
        assign_to_all: assignToAll,
        assigned_students: assignToAll ? [] : assignedStudents
      };

      const createdTask = await tasksApi.createTask(taskData);
      toast.success('Задание успешно создано');
      navigate(`/admin/tasks/${createdTask.id}`);
    } catch (error: any) {
      console.error('Error creating task:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при создании задания');
    } finally {
      setSaving(false);
    }
  };

  const isListeningOrReading = taskType === 'listening' || taskType === 'reading';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/tasks')}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                Создать задание
              </h1>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Основная информация</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название задания *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder="Введите название задания"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Описание
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder="Краткое описание задания"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Тип задания *
                  </label>
                  <select
                    value={taskType}
                    onChange={(e) => {
                      const newType = e.target.value as 'writing' | 'listening' | 'reading';
                      setTaskType(newType);
                      if (newType === 'writing') {
                        // Writing tasks are always manual
                        setGradingType('manual');
                        setContent('');
                        setQuestions([]);
                        setContentSource('url');
                        setSelectedFiles([]);
                        setUploadedFiles([]);
                      } else {
                        // Listening/Reading can be automatic or manual
                        // Set default source based on type
                        setContentSource(newType === 'listening' ? 'url' : 'text');
                      }
                    }}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  >
                    <option value="writing">Письмо</option>
                    <option value="listening">Аудирование</option>
                    <option value="reading">Чтение</option>
                  </select>
                </div>

                {(taskType === 'listening' || taskType === 'reading') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Тип проверки *
                    </label>
                    <select
                      value={gradingType}
                      onChange={(e) => setGradingType(e.target.value as 'automatic' | 'manual')}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    >
                      <option value="automatic">Автоматическая проверка</option>
                      <option value="manual">Ручная проверка</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {gradingType === 'automatic' 
                        ? 'Задание будет проверено автоматически после отправки (требуются вопросы с правильными ответами)'
                        : 'Задание требует проверки преподавателем'}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Юнит
                  </label>
                  <select
                    value={selectedUnitId || ''}
                    onChange={(e) => setSelectedUnitId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  >
                    <option value="">Без юнита</option>
                    {units.map(unit => (
                      <option key={unit.id} value={unit.id}>
                        {unit.title} {unit.level ? `(${unit.level})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Content for Listening/Reading */}
            {isListeningOrReading && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  {taskType === 'listening' ? (
                    <Headphones className="w-5 h-5 text-primary-600" />
                  ) : (
                    <BookOpen className="w-5 h-5 text-primary-600" />
                  )}
                  <h2 className="text-lg font-semibold text-gray-900">
                    {taskType === 'listening' ? 'Аудио/Видео контент' : 'Текст для чтения'}
                  </h2>
                </div>
                
                <div className="space-y-4">
                  {/* Source Toggle */}
                  <div className="flex gap-2 border-b border-gray-200 pb-3">
                    {taskType === 'listening' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setContentSource('url');
                            setSelectedFiles([]);
                            setUploadedFiles([]);
                          }}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            contentSource === 'url'
                              ? 'bg-primary-100 text-primary-700 border border-primary-300'
                              : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                          }`}
                        >
                          URL
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setContentSource('file');
                            setContent('');
                          }}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            contentSource === 'file'
                              ? 'bg-primary-100 text-primary-700 border border-primary-300'
                              : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                          }`}
                        >
                          Загрузить файл
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setContentSource('text');
                            setSelectedFiles([]);
                            setUploadedFiles([]);
                          }}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            contentSource === 'text'
                              ? 'bg-primary-100 text-primary-700 border border-primary-300'
                              : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                          }`}
                        >
                          Текст
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setContentSource('file');
                            setContent('');
                          }}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            contentSource === 'file'
                              ? 'bg-primary-100 text-primary-700 border border-primary-300'
                              : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                          }`}
                        >
                          Загрузить файл
                        </button>
                      </>
                    )}
                  </div>

                  {/* URL Input for Listening */}
                  {taskType === 'listening' && contentSource === 'url' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        URL аудио или видео *
                      </label>
                      <input
                        type="url"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                        placeholder="https://youtube.com/watch?v=... или https://vimeo.com/..."
                        required={contentSource === 'url'}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Поддерживаются YouTube и Vimeo ссылки
                      </p>
                    </div>
                  )}

                  {/* Text Input for Reading */}
                  {taskType === 'reading' && contentSource === 'text' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Текст для чтения *
                      </label>
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={10}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                        placeholder="Введите текст, который студенты должны прочитать..."
                        required={contentSource === 'text'}
                      />
                    </div>
                  )}

                  {/* File Upload for Both */}
                  {(contentSource === 'file') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {taskType === 'listening' ? 'Аудио или видео файлы *' : 'Документы для чтения *'}
                      </label>
                      
                      {selectedFiles.length === 0 && uploadedFiles.length === 0 && (
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-primary-400 transition-colors">
                          <div className="space-y-1 text-center">
                            <Upload className="mx-auto h-12 w-12 text-gray-400" />
                            <div className="flex text-sm text-gray-600">
                              <label className="relative cursor-pointer rounded-md font-medium text-primary-600 hover:text-primary-500">
                                <span>Выберите файлы</span>
                                <input
                                  type="file"
                                  multiple
                                  className="sr-only"
                                  accept={
                                    taskType === 'listening'
                                      ? 'audio/*,video/*,.mp3,.wav,.ogg,.webm,.aac,.flac,.mp4,.mov,.avi,.mkv'
                                      : '.pdf,.doc,.docx,.txt,.html,.rtf'
                                  }
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    if (files.length > 0) {
                                      setSelectedFiles(files);
                                    }
                                  }}
                                />
                              </label>
                              <p className="pl-1">или перетащите сюда</p>
                            </div>
                            <p className="text-xs text-gray-500">
                              {taskType === 'listening'
                                ? 'MP3, WAV, OGG, MP4, MOV, AVI и другие аудио/видео форматы (можно выбрать несколько)'
                                : 'PDF, DOC, DOCX, TXT, HTML, RTF (можно выбрать несколько)'}
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {selectedFiles.map((file, index) => (
                            <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <FileText className="w-5 h-5 text-gray-400" />
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                                    <p className="text-xs text-gray-500">
                                      {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-red-600"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                if (selectedFiles.length === 0) return;
                                setUploading(true);
                                try {
                                  const result = await tasksApi.uploadTaskFile(selectedFiles, taskType);
                                  setUploadedFiles([...uploadedFiles, ...result.files]);
                                  setSelectedFiles([]);
                                  toast.success(`${result.files.length} файл(ов) успешно загружено`);
                                } catch (error: any) {
                                  console.error('Error uploading files:', error);
                                  toast.error(error.response?.data?.detail || 'Ошибка при загрузке файлов');
                                } finally {
                                  setUploading(false);
                                }
                              }}
                              disabled={uploading || selectedFiles.length === 0}
                              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
                            >
                              {uploading ? (
                                <>
                                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                                  Загрузка...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 mr-2" />
                                  Загрузить все ({selectedFiles.length})
                                </>
                              )}
                            </button>
                            <label className="relative cursor-pointer inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                              <span>Добавить еще</span>
                              <input
                                type="file"
                                multiple
                                className="sr-only"
                                accept={
                                  taskType === 'listening'
                                    ? 'audio/*,video/*,.mp3,.wav,.ogg,.webm,.aac,.flac,.mp4,.mov,.avi,.mkv'
                                    : '.pdf,.doc,.docx,.txt,.html,.rtf'
                                }
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || []);
                                  if (files.length > 0) {
                                    setSelectedFiles([...selectedFiles, ...files]);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}

                      {uploadedFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                          <p className="text-sm font-medium text-gray-700">
                            Загруженные файлы ({uploadedFiles.length}):
                          </p>
                          {uploadedFiles.map((file, index) => (
                            <div key={index} className="p-4 bg-green-50 rounded-lg border border-green-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <FileText className="w-5 h-5 text-green-600" />
                                  <div>
                                    <p className="text-sm font-medium text-green-900">{file.original_filename}</p>
                                    <p className="text-xs text-green-700">{file.file_path}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
                                  }}
                                  className="p-1.5 text-green-600 hover:text-red-600"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                          <label className="relative cursor-pointer inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                            <span>Добавить еще файлы</span>
                            <input
                              type="file"
                              multiple
                              className="sr-only"
                              accept={
                                taskType === 'listening'
                                  ? 'audio/*,video/*,.mp3,.wav,.ogg,.webm,.aac,.flac,.mp4,.mov,.avi,.mkv'
                                  : '.pdf,.doc,.docx,.txt,.html,.rtf'
                              }
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                if (files.length > 0) {
                                  setSelectedFiles([...selectedFiles, ...files]);
                                }
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Questions for Listening/Reading */}
            {isListeningOrReading && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Вопросы о содержании</h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => addQuestion('multiple_choice')}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Множественный выбор
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion('short_answer')}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Открытый вопрос
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion('true_false')}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Верно/Неверно
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {questions.map((question, index) => (
                    <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-gray-500">Вопрос {index + 1}</span>
                            <select
                              value={question.type}
                              onChange={(e) => updateQuestion(question.id, { type: e.target.value as any })}
                              className="text-xs rounded border border-gray-300 px-2 py-1"
                            >
                              <option value="multiple_choice">Множественный выбор</option>
                              <option value="short_answer">Открытый вопрос</option>
                              <option value="true_false">Верно/Неверно</option>
                            </select>
                            <input
                              type="number"
                              value={question.points || 1}
                              onChange={(e) => updateQuestion(question.id, { points: parseInt(e.target.value) || 1 })}
                              className="w-16 text-xs rounded border border-gray-300 px-2 py-1"
                              placeholder="Баллы"
                              min="1"
                            />
                            <span className="text-xs text-gray-500">баллов</span>
                          </div>
                          <textarea
                            value={question.question}
                            onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                            rows={2}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            placeholder="Введите вопрос..."
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuestion(question.id)}
                          className="ml-2 p-1 text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Options for choice questions */}
                      {(question.type === 'multiple_choice' || question.type === 'true_false') && (
                        <div className="mt-3 space-y-2">
                          {question.type === 'true_false' ? (
                            <div className="space-y-2">
                              {question.options?.map((opt, optIdx) => (
                                <label key={optIdx} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`correct-${question.id}`}
                                    checked={question.correct_answer === opt}
                                    onChange={() => updateQuestion(question.id, { correct_answer: opt })}
                                    className="text-primary-600"
                                  />
                                  <span className="text-sm">{opt}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <>
                              {question.options?.map((opt, optIdx) => (
                                <div key={optIdx} className="flex items-center gap-2">
                                  <input
                                    type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                                    name={`correct-${question.id}`}
                                    checked={
                                      question.type === 'multiple_choice'
                                        ? (question.correct_answer as string[] || []).includes(opt)
                                        : question.correct_answer === opt
                                    }
                                    onChange={() => {
                                      if (question.type === 'multiple_choice') {
                                        const current = (question.correct_answer as string[] || []);
                                        const updated = current.includes(opt)
                                          ? current.filter(a => a !== opt)
                                          : [...current, opt];
                                        updateQuestion(question.id, { correct_answer: updated });
                                      } else {
                                        updateQuestion(question.id, { correct_answer: opt });
                                      }
                                    }}
                                    className="text-primary-600"
                                  />
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => updateOption(question.id, optIdx, e.target.value)}
                                    className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                    placeholder={`Вариант ${optIdx + 1}`}
                                  />
                                  {question.options && question.options.length > 2 && (
                                    <button
                                      type="button"
                                      onClick={() => removeOption(question.id, optIdx)}
                                      className="p-1 text-red-600 hover:text-red-800"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {question.type === 'multiple_choice' && (
                                <button
                                  type="button"
                                  onClick={() => addOption(question.id)}
                                  className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  Добавить вариант
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {questions.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm">Добавьте вопросы о содержании</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Инструкции</h2>
              <RichTextEditor
                value={instructions}
                onChange={setInstructions}
                placeholder="Введите инструкции для студентов..."
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-gray-900">Настройки</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Максимальный балл
                  </label>
                  <input
                    type="number"
                    value={maxScore}
                    onChange={(e) => setMaxScore(parseInt(e.target.value) || 100)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    min="1"
                    max="1000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Срок сдачи
                  </label>
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  />
                </div>
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <button
                type="button"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="w-full flex items-center justify-between gap-2 mb-4"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Дополнительные настройки</h2>
                </div>
                {showAdvancedSettings ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              
              {showAdvancedSettings && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Статус
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    >
                      <option value="draft">Черновик</option>
                      <option value="scheduled">Запланировано</option>
                      <option value="published">Опубликовано</option>
                      <option value="archived">Архив</option>
                    </select>
                  </div>

                  {status === 'scheduled' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        Дата публикации
                      </label>
                      <input
                        type="datetime-local"
                        value={publishAt}
                        onChange={(e) => setPublishAt(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                        required={status === 'scheduled'}
                      />
                    </div>
                  )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Максимум попыток
                  </label>
                  <input
                    type="number"
                    value={maxAttempts || ''}
                    onChange={(e) => setMaxAttempts(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder="Неограничено"
                    min="1"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allowLate"
                    checked={allowLateSubmissions}
                    onChange={(e) => setAllowLateSubmissions(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="allowLate" className="text-sm text-gray-700">
                    Разрешить опоздания
                  </label>
                </div>

                  {allowLateSubmissions && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Штраф за опоздание (%)
                      </label>
                      <input
                        type="number"
                        value={latePenaltyPercent}
                        onChange={(e) => setLatePenaltyPercent(parseFloat(e.target.value) || 0)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                        min="0"
                        max="100"
                      />
                    </div>
                  )}

                  {/* Assignment Settings */}
                  <div className="border-t pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Назначение задания</h3>
                    
                    <div className="flex items-center gap-2 mb-4">
                      <input
                        type="checkbox"
                        id="assignToAll"
                        checked={assignToAll}
                        onChange={(e) => {
                          setAssignToAll(e.target.checked);
                          if (e.target.checked) {
                            setAssignedStudents([]);
                          }
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <label htmlFor="assignToAll" className="text-sm text-gray-700">
                        Назначить всем студентам курса
                      </label>
                    </div>

                    {!assignToAll && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Выберите студентов
                        </label>
                        {loadingStudents ? (
                          <div className="text-sm text-gray-500">Загрузка студентов...</div>
                        ) : (
                          <div className="max-h-60 overflow-y-auto border border-gray-300 rounded-lg p-3 space-y-2">
                            {students.map((student) => (
                              <label
                                key={student.id}
                                className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={assignedStudents.includes(student.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setAssignedStudents([...assignedStudents, student.id]);
                                    } else {
                                      setAssignedStudents(assignedStudents.filter(id => id !== student.id));
                                    }
                                  }}
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-gray-700">
                                  {student.first_name} {student.last_name} ({student.email})
                                </span>
                              </label>
                            ))}
                            {students.length === 0 && (
                              <p className="text-sm text-gray-500 text-center py-4">
                                Нет доступных студентов
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Сохранение...' : 'Создать задание'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/admin/tasks')}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
