/**
 * Admin Video Edit Page
 * 
 * Coursera/Udemy-style video editing interface for admins.
 * Allows editing video metadata, source URLs, visibility settings, and previewing videos.
 * Consistent with AdminUnitEditPage and AdminVideoCreatePage design patterns.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Eye, Youtube, Upload, Image as ImageIcon, Sparkles, Settings as SettingsIcon, Trash2, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { videosApi, unitsApi } from '../../services/api';

// Form data interface for video editing
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
  duration_sec?: number;
  created_at?: string;
  updated_at?: string;
}

export default function AdminVideoEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  // Loading state for initial video data fetch
  const [loading, setLoading] = useState(true);
  // Saving state to prevent duplicate submissions
  const [saving, setSaving] = useState(false);
  // Preview toggle state
  const [showPreview, setShowPreview] = useState(false);
  // Advanced settings toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form state for video editing
  const [formData, setFormData] = useState<VideoFormData>({
    title: '',
    description: '',
    unit_id: 0,
    source_type: 'url',
    external_url: '',
    status: 'draft',
    order_index: 0,
    is_visible_to_students: true,
    duration_sec: undefined,
    created_at: undefined,
    updated_at: undefined
  });

  // Available units for dropdown selection
  const [availableUnits, setAvailableUnits] = useState<any[]>([]);
  // Loading state for units fetch
  const [loadingUnits, setLoadingUnits] = useState(true);
  // Thumbnail state
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [thumbnailKey, setThumbnailKey] = useState(0); // For cache busting

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  
  // Local state for order_index input to allow clearing
  const [orderIndexInput, setOrderIndexInput] = useState<string>('0');

  // Load available units on mount
  useEffect(() => {
    const loadUnits = async () => {
      try {
        setLoadingUnits(true);
        const unitsData = await unitsApi.getAdminUnits({ limit: 100 });
        setAvailableUnits(unitsData || []);
      } catch (error) {
        console.error('Error loading units:', error);
        toast.error('Ошибка при загрузке юнитов');
      } finally {
        setLoadingUnits(false);
      }
    };
    loadUnits();
  }, []);

  // Load video data when ID is available
  useEffect(() => {
    const loadVideo = async () => {
      if (!id) {
        toast.error('ID видео не найден');
        navigate('/admin/videos');
        return;
      }

      try {
        setLoading(true);
        const videoData = await videosApi.getAdminVideo(parseInt(id));

        setFormData({
          title: videoData.title || '',
          description: videoData.description || '',
          unit_id: videoData.unit_id || 0,
          source_type: (videoData.source_type || 'url') as 'file' | 'url',
          external_url: videoData.external_url || '',
          file_path: videoData.file_path || '',
          status: (videoData.status || 'draft') as 'draft' | 'published' | 'archived',
          order_index: videoData.order_index || 0,
          is_visible_to_students: videoData.is_visible_to_students ?? true,
          duration_sec: videoData.duration_sec,
          created_at: videoData.created_at,
          updated_at: videoData.updated_at
        });
        
        // Set thumbnail path
        setThumbnailPath((videoData as any).thumbnail_path || null);
        
        // Set uploaded file path if exists
        if (videoData.file_path) {
          setUploadedFilePath(videoData.file_path);
        }
      } catch (error) {
        console.error('Error loading video:', error);
        toast.error('Ошибка при загрузке видео');
        navigate('/admin/videos');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadVideo();
    }
  }, [id, navigate]);

  // Sync orderIndexInput with formData.order_index when formData changes
  useEffect(() => {
    setOrderIndexInput(formData.order_index.toString());
  }, [formData.order_index]);

  // Handle form input changes (text, select, textarea)
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    
    // Skip order_index here - it's handled by handleOrderIndexChange
    if (name === 'order_index') {
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]:
        name === 'unit_id'
          ? Number(value)
          : value === 'true' || value === 'false'
          ? value === 'true'
          : value
    }));
  };
  
  // Handle order_index input specifically to allow clearing
  const handleOrderIndexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOrderIndexInput(value); // Update local state immediately
    
    // Update formData only if value is valid number
    if (value === '') {
      // Allow empty, will be set to 0 on blur
      return;
    }
    const numValue = Number(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setFormData(prev => ({ ...prev, order_index: numValue }));
    }
  };
  
  // Handle blur to ensure we have a valid number
  const handleOrderIndexBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    if (value === '' || isNaN(Number(value)) || Number(value) < 0) {
      setFormData(prev => ({ ...prev, order_index: 0 }));
      setOrderIndexInput('0');
    } else {
      const numValue = Number(value);
      setFormData(prev => ({ ...prev, order_index: numValue }));
      setOrderIndexInput(numValue.toString());
    }
  };

  // Handle checkbox changes
  const handleCheckboxChange = (name: keyof VideoFormData, checked: boolean) => {
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

  // Extract YouTube video ID for embed preview
  const extractYouTubeVideoId = (url: string): string | null => {
    const regex =
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // Extract Vimeo video ID for embed preview
  const extractVimeoVideoId = (url: string): string | null => {
    const match = url.match(/vimeo\.com\/(\d+)/);
    return match ? match[1] : null;
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/ogg', 'video/x-flv', 'video/3gpp', 'video/x-ms-wmv'];
    const allowedExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogv', '.flv', '.3gp', '.wmv'];
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExt)) {
      toast.error('Неподдерживаемый формат файла. Разрешены: MP4, WebM, MOV, AVI, MKV, OGV, FLV, 3GP, WMV');
      return;
    }
    
    // Check file size (max 2GB)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > maxSize) {
      toast.error('Файл слишком большой. Максимальный размер: 2GB');
      return;
    }
    
    setSelectedFile(file);
    setUploadedFilePath(null);
  };
  
  // Handle file upload
  const handleFileUpload = async () => {
    if (!selectedFile) return;
    
    try {
      setUploading(true);
      setUploadProgress(0);
      
      const result = await videosApi.uploadVideoFile(selectedFile);
      
      setUploadedFilePath(result.file_path);
      setFormData(prev => ({ ...prev, file_path: result.file_path }));
      setUploadProgress(100);
      
      toast.success('Видео успешно загружено!');
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при загрузке видео');
      setSelectedFile(null);
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };
  
  // Remove selected file
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadedFilePath(null);
    setFormData(prev => ({ ...prev, file_path: '' }));
    setUploadProgress(0);
  };
  
  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Handle form submission and validation
  const handleSave = async () => {
    if (!id) {
      toast.error('ID видео не найден');
      return;
    }

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

      // Validate video URL format (YouTube or Vimeo)
      if (formData.source_type === 'url' && formData.external_url) {
        const isValidYouTube = validateYouTubeUrl(formData.external_url);
        const isValidVimeo = validateVimeoUrl(formData.external_url);

        if (!isValidYouTube && !isValidVimeo) {
          toast.error('Пожалуйста, введите корректную ссылку на YouTube или Vimeo');
          return;
        }
      }

      if (formData.source_type === 'file' && !formData.file_path) {
        toast.error('Пожалуйста, загрузите видео файл');
        return;
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
        if (!formData.file_path) {
          toast.error('Пожалуйста, загрузите видео файл');
          return;
        }
        submitData.file_path = formData.file_path;
      }

      console.log('Updating video with data:', submitData);

      await videosApi.updateVideo(parseInt(id), submitData);
      toast.success('Видео успешно обновлено!');
      navigate('/admin/videos');
    } catch (error: any) {
      console.error('Error saving video:', error);
      // Handle validation errors (422)
      if (error.response?.status === 422) {
        const detail = error.response?.data?.detail;
        if (Array.isArray(detail)) {
          const msg = detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
          toast.error(`Ошибка валидации: ${msg}`);
        } else {
          toast.error('Ошибка валидации данных');
        }
      } else {
        toast.error(error.response?.data?.detail || 'Ошибка при сохранении видео');
      }
    } finally {
      setSaving(false);
    }
  };

  // Loading state UI
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="text-sm text-gray-500">Загрузка данных видео...</p>
        </div>
      </div>
    );
  }

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
                  Редактирование видео
                </h1>
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {formData.status === 'published'
                    ? 'Опубликовано'
                    : formData.status === 'draft'
                    ? 'Черновик'
                    : 'Архивировано'}
                </span>
              </div>
              <p className="mt-1 text-xs md:text-sm text-gray-500 line-clamp-1">
                {formData.title || 'Название видео еще не заполнено'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* <button
              onClick={() => setShowPreview(!showPreview)}
              className="hidden sm:inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? 'Скрыть предпросмотр' : 'Предпросмотр'}
            </button> */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
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

                {/* Unit selection */}
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


            {/* Video source */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Источник видео
              </h2>

              <div className="space-y-4">
                {/* Source type (readonly-ish, but you can still allow changing if needed) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Тип источника
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, source_type: 'url' }));
                        // Reset file states when switching to URL
                        setSelectedFile(null);
                        setUploadedFilePath(null);
                      }}
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
                      onClick={() => {
                        setFormData(prev => ({ ...prev, source_type: 'file' }));
                        // Reset URL when switching to file
                        setFormData(prev => ({ ...prev, external_url: '' }));
                      }}
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

                {/* URL input */}
                {formData.source_type === 'url' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      URL видео (YouTube/Vimeo)
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

                {/* File Upload */}
                {formData.source_type === 'file' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Загрузка видео файла *
                    </label>
                    
                    {!selectedFile && !uploadedFilePath && !formData.file_path ? (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 hover:bg-gray-100 transition-colors">
                        <input
                          type="file"
                          id="video-upload"
                          accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,video/ogg,video/x-flv,video/3gpp,video/x-ms-wmv,.mp4,.webm,.mov,.avi,.mkv,.ogv,.flv,.3gp,.wmv"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <label
                          htmlFor="video-upload"
                          className="cursor-pointer flex flex-col items-center"
                        >
                          <Upload className="h-12 w-12 text-gray-400 mb-3" />
                          <p className="mt-2 text-sm text-gray-600">
                            <span className="font-medium text-primary-600 hover:text-primary-700">
                              Нажмите для выбора файла
                            </span>{' '}
                            или перетащите файл сюда
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Поддерживаемые форматы: MP4, WebM, MOV, AVI, MKV, OGV, FLV, 3GP, WMV
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            Максимальный размер: 2GB
                          </p>
                        </label>
                      </div>
                    ) : selectedFile && !uploadedFilePath ? (
                      <div className="border-2 border-gray-300 rounded-lg p-4 bg-white">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="flex-shrink-0">
                              <svg className="h-10 w-10 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {selectedFile.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(selectedFile.size)}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="ml-2 flex-shrink-0 text-gray-400 hover:text-red-600"
                            disabled={uploading}
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                        
                        {uploading && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                              <span>Загрузка...</span>
                              <span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        
                        {!uploading && (
                          <button
                            type="button"
                            onClick={handleFileUpload}
                            className="w-full mt-3 inline-flex items-center justify-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Загрузить видео
                          </button>
                        )}
                      </div>
                    ) : (uploadedFilePath || formData.file_path) ? (
                      <div className="border-2 border-green-300 rounded-lg p-4 bg-green-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="flex-shrink-0">
                              <Check className="h-10 w-10 text-green-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {selectedFile?.name || formData.file_path?.split('/').pop() || 'Видео загружено'}
                              </p>
                              <p className="text-xs text-green-600">
                                {uploadedFilePath ? 'Файл успешно загружен' : 'Текущий файл'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="ml-2 flex-shrink-0 text-gray-400 hover:text-red-600"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                        {formData.file_path && !uploadedFilePath && (
                          <p className="mt-2 text-xs text-gray-500">
                            Текущий файл: {formData.file_path}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SIDEBAR – advanced settings */}
          <div className="space-y-6">
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

                  {/* Order index */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Порядок
                    </label>
                    <input
                      type="number"
                      name="order_index"
                      value={orderIndexInput}
                      onChange={handleOrderIndexChange}
                      onBlur={handleOrderIndexBlur}
                      min={0}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Определяет порядок видео среди других материалов в юните. Оставьте пустым для значения 0.
                    </p>
                  </div>

                  {/* Visibility */}
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Видимость для студентов
                      </p>
                      <p className="text-xs text-gray-500">
                        Если выключено, видео будет скрыто в интерфейсе студента.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.is_visible_to_students}
                      onChange={(e) =>
                        handleCheckboxChange('is_visible_to_students', e.target.checked)
                      }
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                  </div>

                  {/* Thumbnail */}
                  <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-4">
                      Миниатюра видео
                    </h3>
                    
                    <div className="space-y-4">
                      {/* Thumbnail preview */}
                      <div className="relative w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg overflow-hidden border-2 border-dashed border-gray-300">
                        {thumbnailPath ? (
                          <>
                            <img
                              key={thumbnailKey}
                              src={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'}/static/${thumbnailPath}?t=${Date.now()}`}
                              alt="Video thumbnail"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                              onLoad={() => {
                                // Image loaded successfully
                                console.log('Thumbnail loaded successfully');
                              }}
                            />
                            {/* Remove thumbnail button */}
                            <button
                              type="button"
                              onClick={async () => {
                                if (!id) return;
                                if (!window.confirm('Вы уверены, что хотите удалить миниатюру?')) {
                                  return;
                                }
                                
                                setUploadingThumbnail(true);
                                try {
                                  // Update video to remove thumbnail_path
                                  await videosApi.updateVideo(parseInt(id), { thumbnail_path: null } as any);
                                  setThumbnailPath(null);
                                  setThumbnailKey(prev => prev + 1);
                                  toast.success('Миниатюра успешно удалена!');
                                  
                                  // Reload video data to ensure we have the latest state
                                  try {
                                    const videoData = await videosApi.getAdminVideo(parseInt(id));
                                    const latestThumbnailPath = (videoData as any).thumbnail_path;
                                    setThumbnailPath(latestThumbnailPath || null);
                                  } catch (reloadError) {
                                    console.error('Error reloading video data:', reloadError);
                                  }
                                } catch (error: any) {
                                  toast.error(error.response?.data?.detail || 'Ошибка при удалении миниатюры');
                                } finally {
                                  setUploadingThumbnail(false);
                                }
                              }}
                              disabled={uploadingThumbnail}
                              className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Удалить миниатюру"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <ImageIcon className="w-12 h-12 text-gray-400" />
                          </div>
                        )}
                      </div>
                      
                      {/* Upload buttons */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <label className="flex-1 cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !id) return;
                              
                              setUploadingThumbnail(true);
                              try {
                                const result = await videosApi.uploadThumbnail(parseInt(id), file);
                                // Update thumbnail path and force image reload
                                const newThumbnailPath = result.thumbnail_path;
                                setThumbnailPath(newThumbnailPath);
                                setThumbnailKey(prev => prev + 1); // Force image reload
                                toast.success('Миниатюра успешно загружена!');
                                
                                // Reload video data to ensure we have the latest thumbnail path
                                try {
                                  const videoData = await videosApi.getAdminVideo(parseInt(id));
                                  const latestThumbnailPath = (videoData as any).thumbnail_path;
                                  if (latestThumbnailPath) {
                                    setThumbnailPath(latestThumbnailPath);
                                    setThumbnailKey(prev => prev + 1); // Force another reload with latest path
                                  }
                                } catch (reloadError) {
                                  console.error('Error reloading video data:', reloadError);
                                  // Non-critical, continue with the path from upload response
                                }
                              } catch (error: any) {
                                toast.error(error.response?.data?.detail || 'Ошибка при загрузке миниатюры');
                              } finally {
                                setUploadingThumbnail(false);
                              }
                            }}
                            disabled={uploadingThumbnail}
                          />
                          <div className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                            <Upload className="w-4 h-4" />
                            {uploadingThumbnail ? 'Загрузка...' : 'Загрузить миниатюру'}
                          </div>
                        </label>
                        
                        <button
                          type="button"
                          onClick={async () => {
                            if (!id) return;
                            setUploadingThumbnail(true);
                            try {
                              const result = await videosApi.generateThumbnail(parseInt(id));
                              // Update thumbnail path and force image reload
                              const newThumbnailPath = result.thumbnail_path;
                              setThumbnailPath(newThumbnailPath);
                              setThumbnailKey(prev => prev + 1); // Force image reload
                              toast.success('Миниатюра успешно сгенерирована!');
                              
                              // Reload video data to ensure we have the latest thumbnail path
                              try {
                                const videoData = await videosApi.getAdminVideo(parseInt(id));
                                const latestThumbnailPath = (videoData as any).thumbnail_path;
                                if (latestThumbnailPath) {
                                  setThumbnailPath(latestThumbnailPath);
                                  setThumbnailKey(prev => prev + 1); // Force another reload with latest path
                                }
                              } catch (reloadError) {
                                console.error('Error reloading video data:', reloadError);
                                // Non-critical, continue with the path from generate response
                              }
                            } catch (error: any) {
                              toast.error(error.response?.data?.detail || 'Ошибка при генерации миниатюры');
                            } finally {
                              setUploadingThumbnail(false);
                            }
                          }}
                          disabled={uploadingThumbnail || !formData.unit_id}
                          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-primary-300 rounded-lg text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Sparkles className="w-4 h-4" />
                          Сгенерировать автоматически
                        </button>
                      </div>
                      
                      <p className="text-xs text-gray-500">
                        Загрузите свою миниатюру или сгенерируйте автоматическую на основе уровня юнита.
                      </p>
                    </div>
                  </div>

                  {/* Meta info */}
                  {(formData.created_at || formData.updated_at) && (
                    <div className="border-t border-gray-100 pt-3 text-xs text-gray-500 space-y-1">
                      {formData.created_at && (
                        <p>
                          Создано:{' '}
                          {new Date(formData.created_at).toLocaleString('ru-RU')}
                        </p>
                      )}
                      {formData.updated_at && (
                        <p>
                          Обновлено:{' '}
                          {new Date(formData.updated_at).toLocaleString('ru-RU')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Preview - commented out */}
            {/* {showPreview && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Предпросмотр видео
                </h2>
                ...
              </div>
            )} */}
          </div>
        </div>
      </div>
    </div>
  );
}
