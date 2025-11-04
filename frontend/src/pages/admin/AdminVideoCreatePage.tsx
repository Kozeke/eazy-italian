import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Eye, Youtube } from 'lucide-react';
import { videosApi, unitsApi } from '../../services/api';
import toast from 'react-hot-toast';

interface VideoFormData {
  title: string;
  description: string;
  unit_id: number;
  source_type: 'file' | 'url';
  external_url?: string;
  file_path?: string;
  status: 'draft' | 'published' | 'archived';
  order_index: number;
  is_visible_to_students: boolean;
}

export default function AdminVideoCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // Form state for video creation
  const [formData, setFormData] = useState<VideoFormData>({
    title: '',
    description: '',
    unit_id: 0,
    source_type: 'url',
    external_url: '',
    status: 'draft',
    order_index: 0,
    is_visible_to_students: false
  });
  
  // Available units dropdown
  const [availableUnits, setAvailableUnits] = useState<any[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  
  // Load available units on mount
  useEffect(() => {
    const loadUnits = async () => {
      try {
        setLoadingUnits(true);
        const unitsData = await unitsApi.getAdminUnits({ limit: 100 });
        setAvailableUnits(unitsData || []);
        console.log('Loaded available units:', unitsData?.length);
      } catch (error) {
        console.error('Error loading units:', error);
        toast.error('Ошибка при загрузке юнитов');
      } finally {
        setLoadingUnits(false);
      }
    };
    
    loadUnits();
  }, []);
  
  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value === 'true' || value === 'false' ? value === 'true' : value
    }));
  };
  
  // Handle checkbox changes
  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };
  
  // Validate YouTube URL format
  const validateYouTubeUrl = (url: string): boolean => {
    const patterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/,
      /^https?:\/\/(www\.)?youtu\.be\/[a-zA-Z0-9_-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]+/
    ];
    return patterns.some(pattern => pattern.test(url));
  };
  
  // Validate Vimeo URL format
  const validateVimeoUrl = (url: string): boolean => {
    const patterns = [
      /^https?:\/\/(www\.)?vimeo\.com\/\d+/,
      /^https?:\/\/(www\.)?vimeo\.com\/embed\/\d+/
    ];
    return patterns.some(pattern => pattern.test(url));
  };
  
  // Extract YouTube video ID for preview
  const extractYouTubeVideoId = (url: string): string | null => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };
  
  // Extract Vimeo video ID for preview
  const extractVimeoVideoId = (url: string): string | null => {
    const match = url.match(/vimeo\.com\/(\d+)/);
    return match ? match[1] : null;
  };
  
  // Handle form submission
  const handleSave = async () => {
    try {
      // Validate required fields
      if (!formData.title) {
        toast.error('Пожалуйста, введите название видео');
        return;
      }
      
      if (!formData.unit_id) {
        toast.error('Пожалуйста, выберите юнит');
        return;
      }
      
      if (formData.source_type === 'url' && !formData.external_url) {
        toast.error('Пожалуйста, введите URL видео');
        return;
      }
      
      // Validate video URL format
      if (formData.source_type === 'url' && formData.external_url) {
        const isValidYouTube = validateYouTubeUrl(formData.external_url);
        const isValidVimeo = validateVimeoUrl(formData.external_url);
        
        if (!isValidYouTube && !isValidVimeo) {
          toast.error('Пожалуйста, введите корректную ссылку на YouTube или Vimeo');
          return;
        }
      }
      
      setSaving(true);
      
      // Prepare data for submission
      const submitData: any = {
        title: formData.title,
        description: formData.description || null,
        unit_id: formData.unit_id,
        source_type: formData.source_type,
        status: formData.status,
        order_index: formData.order_index,
        is_visible_to_students: formData.is_visible_to_students
      };
      
      // Add source-specific fields
      if (formData.source_type === 'url') {
        submitData.external_url = formData.external_url;
      } else {
        submitData.file_path = formData.file_path || 'placeholder.mp4'; // Temporary placeholder
      }
      
      console.log('Sending video data:', submitData);
      
      const createdVideo = await videosApi.createVideo(submitData);
      
      console.log('✅ Video created:', createdVideo);
      toast.success('Видео успешно создано!');
      
      // Navigate back to videos page
      navigate('/admin/videos');
    } catch (error: any) {
      console.error('Error saving video:', error);
      
      // Handle validation errors
      if (error.response?.status === 422) {
        const errors = error.response.data.detail;
        if (Array.isArray(errors)) {
          const errorMessages = errors.map((e: any) => e.msg).join(', ');
          toast.error(`Ошибка валидации: ${errorMessages}`);
        } else {
          toast.error('Ошибка валидации данных');
        }
      } else {
        toast.error(error.response?.data?.detail || 'Ошибка при создании видео');
      }
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top sticky bar – Udemy/Coursera style */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/videos')}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад к видео
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                  Создание нового видео
                </h1>
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {formData.status === 'published'
                    ? 'Опубликовано'
                    : formData.status === 'draft'
                    ? 'Черновик'
                    : 'Архивировано'}
                </span>
              </div>
              <p className="mt-1 text-xs md:text-sm text-gray-500">
                Добавьте новый видео-урок в юнит — как лекцию в онлайн-курсе.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="hidden sm:inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? 'Скрыть предпросмотр' : 'Предпросмотр'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Сохранение...' : 'Сохранить видео'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* MAIN COLUMN – basic info + source */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Основная информация
              </h2>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название видео *
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Например: Итальянский A1 – Приветствия и знакомства"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Описание
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    placeholder="Кратко опишите, о чем это видео и что студент выучит."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                
                {/* Unit Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Юнит *
                  </label>
                  <select
                    name="unit_id"
                    value={formData.unit_id}
                    onChange={handleChange}
                    disabled={loadingUnits}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value={0}>Выберите юнит</option>
                    {availableUnits.map(unit => (
                      <option key={unit.id} value={unit.id}>
                        {unit.title} ({unit.level})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Выберите юнит, к которому относится это видео.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Video Source Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Источник видео
              </h2>
              
              <div className="space-y-4">
                {/* Source Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Тип источника *
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData(prev => ({ ...prev, source_type: 'url' }))
                      }
                      className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-colors ${
                        formData.source_type === 'url'
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <Youtube className="h-8 w-8 text-red-600 mb-2" />
                      <span className="text-sm font-medium text-gray-900">
                        YouTube/Vimeo
                      </span>
                      <span className="text-xs text-gray-500 mt-1">
                        Внешняя ссылка
                      </span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() =>
                        setFormData(prev => ({ ...prev, source_type: 'file' }))
                      }
                      className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-colors ${
                        formData.source_type === 'file'
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <svg
                        className="h-8 w-8 text-gray-600 mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="text-sm font-medium text-gray-900">
                        Файл
                      </span>
                      <span className="text-xs text-gray-500 mt-1">
                        Локально загруженное видео
                      </span>
                    </button>
                  </div>
                </div>
                
                {/* URL Input */}
                {formData.source_type === 'url' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      URL видео (YouTube/Vimeo) *
                    </label>
                    <input
                      type="text"
                      name="external_url"
                      value={formData.external_url}
                      onChange={handleChange}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Поддерживаются ссылки YouTube и Vimeo.
                    </p>
                  </div>
                )}
                
                {/* File Upload (placeholder) */}
                {formData.source_type === 'file' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Загрузка файла
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                      >
                        <path
                          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <p className="mt-2 text-sm text-gray-600">
                        <span className="font-medium">Загрузка файлов</span> будет доступна позже
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Пока используйте ссылки YouTube/Vimeo.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SIDEBAR – settings + preview */}
          <div className="space-y-6">
            {/* Settings Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Настройки
              </h2>
              
              <div className="space-y-4">
                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Статус
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="draft">Черновик</option>
                    <option value="published">Опубликовано</option>
                    <option value="archived">Архивировано</option>
                  </select>
                </div>
                
                {/* Order Index */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Порядок
                  </label>
                  <input
                    type="number"
                    name="order_index"
                    value={formData.order_index}
                    onChange={handleChange}
                    min={0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Определяет порядок видео среди других материалов юнита.
                  </p>
                </div>
                
                {/* Visibility */}
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Видимость для студентов
                    </p>
                    <p className="text-xs text-gray-500">
                      Если выключено, видео не будет показано в интерфейсе студента.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="is_visible_to_students"
                    checked={formData.is_visible_to_students}
                    onChange={(e) =>
                      handleCheckboxChange('is_visible_to_students', e.target.checked)
                    }
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
              </div>
            </div>

            {/* Preview Section */}
            {showPreview && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Предпросмотр видео
                </h2>
                
                {/* Video player preview */}
                {formData.source_type === 'url' && formData.external_url && (
                  <div className="mb-4">
                    {validateYouTubeUrl(formData.external_url) && (
                      <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-lg">
                        <iframe
                          className="absolute top-0 left-0 w-full h-full"
                          src={`https://www.youtube.com/embed/${extractYouTubeVideoId(
                            formData.external_url
                          )}`}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    )}
                    
                    {validateVimeoUrl(formData.external_url) && (
                      <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-lg">
                        <iframe
                          className="absolute top-0 left-0 w-full h-full"
                          src={`https://player.vimeo.com/video/${extractVimeoVideoId(
                            formData.external_url
                          )}`}
                          frameBorder="0"
                          allow="autoplay; fullscreen"
                          allowFullScreen
                        />
                      </div>
                    )}
                  </div>
                )}

                {formData.source_type === 'file' && (
                  <div className="text-center py-8 text-gray-500">
                    Предпросмотр загруженных файлов недоступен.
                  </div>
                )}
                
                {!formData.external_url &&
                  formData.source_type === 'url' && (
                    <div className="text-center py-8 text-gray-500">
                      Введите URL для предпросмотра.
                    </div>
                  )}
                
                {/* Video info card */}
                <div className="mt-2 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-1">
                    {formData.title || 'Без названия'}
                  </h3>
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {formData.description ||
                      'Описание видео еще не заполнено.'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span>
                      Статус:{' '}
                      {formData.status === 'published'
                        ? 'Опубликовано'
                        : formData.status === 'draft'
                        ? 'Черновик'
                        : 'Архивировано'}
                    </span>
                    <span>Порядок: {formData.order_index}</span>
                    <span>
                      Видимость:{' '}
                      {formData.is_visible_to_students
                        ? 'видно студентам'
                        : 'скрыто от студентов'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
