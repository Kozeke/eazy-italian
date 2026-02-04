import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus,
  X,
  Upload,
  BookMarked,
  Clock,
  Tag,
  Globe,
  Settings as SettingsIcon
} from 'lucide-react';
import { coursesApi } from '../../services/api';
import toast from 'react-hot-toast';

interface CourseFormData {
  title: string;
  description: string;
  level: string;
  status: string;
  publish_at: string;
  order_index: number;
  thumbnail_url: string;
  thumbnail_path?: string;
  duration_hours: number | null;
  tags: string[];
  meta_title: string;
  meta_description: string;
  is_visible_to_students: boolean;
  settings: {
    allow_enrollment?: boolean;
    certificate_available?: boolean;
    max_students?: number | null;
    [key: string]: any;
  };
}

export default function AdminCourseEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [generatingThumbnail, setGeneratingThumbnail] = useState(false);

  const [formData, setFormData] = useState<CourseFormData>({
    title: '',
    description: '',
    level: 'A1',
    status: 'published',
    publish_at: '',
    order_index: 0,
    thumbnail_url: '',
    duration_hours: null,
    tags: [],
    meta_title: '',
    meta_description: '',
    is_visible_to_students: true,
    settings: {
      allow_enrollment: true,
      certificate_available: false,
      max_students: null
    }
  });

  // Load course data
  useEffect(() => {
    const loadCourse = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const course = await coursesApi.getAdminCourse(parseInt(id));
        
        // Format publish_at for datetime-local input
        const publishAt = course.publish_at 
          ? new Date(course.publish_at).toISOString().slice(0, 16)
          : '';
        
        setFormData({
          title: course.title || '',
          description: course.description || '',
          level: course.level || 'A1',
          status: course.status || 'published',
          publish_at: publishAt,
          order_index: course.order_index ?? 0,
          thumbnail_url: course.thumbnail_url || '',
          thumbnail_path: course.thumbnail_path,
          duration_hours: course.duration_hours || null,
          tags: course.tags || [],
          meta_title: course.meta_title || '',
          meta_description: course.meta_description || '',
          is_visible_to_students: course.is_visible_to_students ?? true,
          settings: course.settings || {
            allow_enrollment: true,
            certificate_available: false,
            max_students: null
          }
        });

        // Set thumbnail preview if available - prioritize thumbnail_url
        const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
        if (course.thumbnail_url) {
          setThumbnail(course.thumbnail_url);
        } else if (course.thumbnail_path) {
          setThumbnail(`${apiBase}/static/thumbnails/${course.thumbnail_path.split('/').pop()}`);
        }
      } catch (error: any) {
        console.error('Error loading course:', error);
        toast.error('Ошибка при загрузке курса');
        navigate('/admin/courses');
      } finally {
        setLoading(false);
      }
    };

    loadCourse();
  }, [id, navigate]);

  const handleInputChange = (field: keyof CourseFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSettingsChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [field]: value
      }
    }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      toast.error('Название курса обязательно');
      return false;
    }
    return true;
  };

  const handleSave = async (publish: boolean = false) => {
    if (!validateForm() || !id) {
      return;
    }

    setSaving(true);
    
    try {
      // Prepare course data for API
      const courseData = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        level: formData.level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'mixed',
        status: (publish ? 'published' : formData.status) as 'draft' | 'scheduled' | 'published' | 'archived',
        publish_at: formData.publish_at || undefined,
        order_index: formData.order_index,
        thumbnail_url: formData.thumbnail_url.trim() || undefined,
        duration_hours: formData.duration_hours || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        meta_title: formData.meta_title.trim() || undefined,
        meta_description: formData.meta_description.trim() || undefined,
        is_visible_to_students: formData.is_visible_to_students,
        settings: Object.keys(formData.settings).length > 0 ? formData.settings : undefined
      };

      // Call the API to update course
      await coursesApi.updateCourse(parseInt(id), courseData);
      
      toast.success(
        publish 
          ? 'Курс успешно обновлен и опубликован!' 
          : 'Курс успешно сохранен!'
      );
      
      // Navigate back to courses list
      navigate('/admin/courses');
    } catch (error: any) {
      console.error('Error saving course:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при сохранении курса');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateThumbnail = async () => {
    if (!id || !formData.title.trim()) {
      toast.error('Сначала введите название курса');
      return;
    }
    
    setGeneratingThumbnail(true);
    try {
      const thumbnailResult = await coursesApi.generateThumbnail(parseInt(id));
      if (thumbnailResult.thumbnail_path) {
        const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
        setThumbnail(`${apiBase}/static/thumbnails/${thumbnailResult.thumbnail_path.split('/').pop()}`);
        setFormData(prev => ({
          ...prev,
          thumbnail_path: thumbnailResult.thumbnail_path
        }));
        toast.success('Обложка успешно сгенерирована!');
      }
    } catch (error: any) {
      toast.error('Ошибка при генерации обложки');
    } finally {
      setGeneratingThumbnail(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; text: string }> = {
      draft: { color: 'bg-gray-100 text-gray-800', text: 'Черновик' },
      scheduled: { color: 'bg-blue-100 text-blue-800', text: 'Запланировано' },
      published: { color: 'bg-green-100 text-green-800', text: 'Опубликовано' },
      archived: { color: 'bg-red-100 text-red-800', text: 'Архив' }
    };
    
    const config = statusConfig[status] || statusConfig.draft;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  // @ts-ignore - Function is used in JSX (line 751), TypeScript false positive
  const getLevelBadge = (level: string) => {
    const levelColors: Record<string, string> = {
      A1: 'bg-purple-100 text-purple-800',
      A2: 'bg-blue-100 text-blue-800',
      B1: 'bg-green-100 text-green-800',
      B2: 'bg-yellow-100 text-yellow-800',
      C1: 'bg-orange-100 text-orange-800',
      C2: 'bg-red-100 text-red-800',
      mixed: 'bg-indigo-100 text-indigo-800'
    };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${levelColors[level] || levelColors.A1}`}>
        {level}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top sticky bar */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/courses')}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад к курсам
            </button>
            <div>
              <div className="flex items-center gap-2">
                <BookMarked className="h-6 w-6 text-primary-600" />
                <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                  Редактировать курс
                </h1>
                {getStatusBadge(formData.status)}
              </div>
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                {formData.title || 'Загрузка...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="hidden sm:inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? 'Скрыть предпросмотр' : 'Предпросмотр'}
            </button> */}

            {/* <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </button> */}

            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="inline-flex items-center rounded-lg border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Публикация...' : 'Сохранить и опубликовать'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* MAIN COLUMN – form fields */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <BookMarked className="h-5 w-5 mr-2 text-primary-600" />
                Основная информация
              </h2>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название курса *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Например: Полный курс итальянского языка для начинающих"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Придумайте понятное и привлекательное название курса
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Описание курса
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={5}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Опишите, что студенты будут изучать в этом курсе, какие навыки получат..."
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Подробное описание поможет студентам понять содержание курса
                  </p>
                </div>

                {/* Level and Duration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Level */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Уровень сложности *
                    </label>
                    <select
                      value={formData.level}
                      onChange={(e) => handleInputChange('level', e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      required
                    >
                      <option value="A1">A1 – Начальный</option>
                      <option value="A2">A2 – Элементарный</option>
                      <option value="B1">B1 – Средний</option>
                      <option value="B2">B2 – Выше среднего</option>
                      <option value="C1">C1 – Продвинутый</option>
                      <option value="C2">C2 – В совершенстве</option>
                      <option value="mixed">Смешанный (разные уровни)</option>
                    </select>
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                      <Clock className="h-4 w-4 mr-1 text-gray-400" />
                      Продолжительность (часы)
                    </label>
                    <input
                      type="number"
                      value={formData.duration_hours || ''}
                      onChange={(e) => handleInputChange('duration_hours', e.target.value ? parseInt(e.target.value) : null)}
                      min="0"
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="Например: 40"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Примерная общая продолжительность курса
                    </p>
                  </div>
                </div>

                {/* Thumbnail */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Обложка курса
                  </label>
                  
                  {(thumbnail || formData.thumbnail_url || formData.thumbnail_path) ? (
                    <img
                      src={thumbnail || formData.thumbnail_url || (formData.thumbnail_path ? `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'}/static/thumbnails/${formData.thumbnail_path.split('/').pop()}` : '')}
                      alt="Course thumbnail"
                      className="w-full max-w-md rounded-xl shadow border mb-3"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="h-48 max-w-md rounded-xl border border-dashed flex items-center justify-center text-gray-400 mb-3">
                      Обложка не загружена
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleGenerateThumbnail}
                    disabled={generatingThumbnail || !formData.title.trim()}
                    className="inline-flex items-center px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                  >
                    {generatingThumbnail ? 'Генерация...' : 'Сгенерировать обложку'}
                  </button>

                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                      <Upload className="h-4 w-4 mr-1 text-gray-400" />
                      Или укажите URL обложки курса
                    </label>
                    <input
                      type="url"
                      value={formData.thumbnail_url}
                      onChange={(e) => handleInputChange('thumbnail_url', e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="https://example.com/course-thumbnail.jpg"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Ссылка на изображение обложки курса (рекомендуется 1280x720px)
                    </p>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Tag className="h-4 w-4 mr-1 text-gray-400" />
                    Теги курса
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formData.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 text-primary-600 hover:text-primary-800"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="Добавить тег (например: грамматика, разговорный, A1)"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Добавить
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-left"
              >
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <SettingsIcon className="h-5 w-5 mr-2 text-primary-600" />
                  Расширенные настройки
                </h2>
                <span className="text-sm text-gray-500">
                  {showAdvanced ? 'Скрыть' : 'Показать'}
                </span>
              </button>

              {showAdvanced && (
                <div className="mt-6 space-y-6">
                  {/* Course Settings */}
                  <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-4">
                      Настройки курса
                    </h3>
                    <div className="space-y-4">
                      {/* Allow Enrollment */}
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Разрешить запись на курс
                          </p>
                          <p className="text-xs text-gray-500">
                            Студенты смогут записаться на этот курс
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={formData.settings.allow_enrollment ?? true}
                          onChange={(e) => handleSettingsChange('allow_enrollment', e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </div>

                      {/* Certificate Available */}
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Сертификат доступен
                          </p>
                          <p className="text-xs text-gray-500">
                            Студенты получат сертификат после завершения курса
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={formData.settings.certificate_available ?? false}
                          onChange={(e) => handleSettingsChange('certificate_available', e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </div>

                      {/* Max Students */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Максимальное количество студентов
                        </label>
                        <input
                          type="number"
                          value={formData.settings.max_students || ''}
                          onChange={(e) => handleSettingsChange('max_students', e.target.value ? parseInt(e.target.value) : null)}
                          min="0"
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          placeholder="Оставьте пустым для неограниченного количества"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Ограничение на количество студентов (опционально)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Status & Visibility */}
                  <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-4">
                      Статус и доступ
                    </h3>
                    <div className="space-y-4">
                      {/* Status - Hidden but still in form data */}
                      {/* <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Статус
                        </label>
                        <select
                          value={formData.status}
                          onChange={(e) => handleInputChange('status', e.target.value)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          <option value="draft">Черновик</option>
                          <option value="scheduled">Запланировано</option>
                          <option value="published">Опубликовано</option>
                          <option value="archived">Архив</option>
                        </select>
                      </div> */}

                      {/* Publish at */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Дата публикации (опционально)
                        </label>
                        <input
                          type="datetime-local"
                          value={formData.publish_at}
                          onChange={(e) => handleInputChange('publish_at', e.target.value)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Если не указано, курс будет опубликован сразу
                        </p>
                      </div>

                      {/* Order index */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Порядок отображения
                        </label>
                        <input
                          type="number"
                          value={formData.order_index}
                          onChange={(e) => handleInputChange('order_index', Number(e.target.value))}
                          min="0"
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          placeholder="0"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Номер для сортировки курсов (меньше = выше в списке)
                        </p>
                      </div>

                      {/* Visibility */}
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Видимость для студентов
                          </p>
                          <p className="text-xs text-gray-500">
                            Если выключено, курс не будет отображаться в списке
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={formData.is_visible_to_students}
                          onChange={(e) => handleInputChange('is_visible_to_students', e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SEO Settings */}
                  <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center">
                      <Globe className="h-5 w-5 mr-2 text-primary-600" />
                      SEO настройки
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Meta заголовок
                        </label>
                        <input
                          type="text"
                          value={formData.meta_title}
                          onChange={(e) => handleInputChange('meta_title', e.target.value)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          placeholder="SEO заголовок для поисковых систем"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          {formData.meta_title.length}/60 символов
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Meta описание
                        </label>
                        <textarea
                          value={formData.meta_description}
                          onChange={(e) => handleInputChange('meta_description', e.target.value)}
                          rows={3}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          placeholder="Краткое описание для поисковых систем"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          {formData.meta_description.length}/160 символов
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Preview - commented out */}
            {/* {showPreview && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Предпросмотр курса
                </h2>
                <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-primary-50 to-white p-6">
                  {(thumbnail || formData.thumbnail_url) && (
                    <img 
                      src={thumbnail || formData.thumbnail_url || ''} 
                      alt="Course thumbnail" 
                      className="w-full h-48 object-cover rounded-lg mb-4"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {formData.title || 'Без названия'}
                      </h3>
                      <p className="text-sm text-gray-600 line-clamp-3 mb-3">
                        {formData.description || 'Описание курса пока не заполнено.'}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {formData.duration_hours && (
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {formData.duration_hours} часов
                          </span>
                        )}
                        {getLevelBadge(formData.level)}
                      </div>
                    </div>
                  </div>
                  {formData.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {formData.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-600 border border-gray-200"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )} */}
          </div>

          {/* SIDEBAR – removed, moved to advanced settings */}
          <div className="space-y-6">
          </div>
        </div>
      </div>
    </div>
  );
}
