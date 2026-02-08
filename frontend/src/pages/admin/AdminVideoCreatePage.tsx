import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Youtube, Upload, X, Check, Settings as SettingsIcon, Image as ImageIcon, Sparkles } from 'lucide-react';
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
  publish_at: string;
  meta_title: string;
  meta_description: string;
}

export default function AdminVideoCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Form state for video creation
  const [formData, setFormData] = useState<VideoFormData>({
    title: '',
    description: '',
    unit_id: 0,
    source_type: 'url',
    external_url: '',
    status: 'draft',
    order_index: 0,
    is_visible_to_students: false,
    publish_at: '',
    meta_title: '',
    meta_description: ''
  });
  
  // Available units dropdown
  const [availableUnits, setAvailableUnits] = useState<any[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);

  // Thumbnail state
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [autoGenerateThumbnail, setAutoGenerateThumbnail] = useState(true);
  
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
    setFormData(prev => ({ ...prev, file_path: undefined }));
    setUploadProgress(0);
  };

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailFile(file);
    setThumbnailPreviewUrl(URL.createObjectURL(file));
    setAutoGenerateThumbnail(false);
  };

  const handleRemoveThumbnail = () => {
    setThumbnailFile(null);
    if (thumbnailPreviewUrl) {
      URL.revokeObjectURL(thumbnailPreviewUrl);
    }
    setThumbnailPreviewUrl(null);
  };
  
  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };
  
  // Handle form submission
  const handleSave = async (publish: boolean = false) => {
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
      
      if (formData.source_type === 'file' && !formData.file_path) {
        toast.error('Пожалуйста, загрузите видео файл');
        return;
      }
      
      setSaving(true);
      
      // Smart defaults: status and visibility derived from publish action
      const status = publish ? 'published' : 'draft';
      const is_visible_to_students = publish; // Always true when published
      
      // Prepare data for submission
      const submitData: any = {
        title: formData.title,
        description: formData.description || null,
        unit_id: formData.unit_id,
        source_type: formData.source_type,
        status: status,
        order_index: 0, // Backend should auto-calculate
        is_visible_to_students: is_visible_to_students,
        publish_at: formData.publish_at || undefined,
        meta_title: formData.meta_title || undefined,
        meta_description: formData.meta_description || undefined
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
      
      console.log('Sending video data:', submitData);
      
      const createdVideo = await videosApi.createVideo(submitData);

      // Handle thumbnail after video creation
      if (createdVideo?.id) {
        if (thumbnailFile) {
          setUploadingThumbnail(true);
          try {
            await videosApi.uploadThumbnail(createdVideo.id, thumbnailFile);
            toast.success('Миниатюра успешно загружена!');
          } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Ошибка при загрузке миниатюры');
          } finally {
            setUploadingThumbnail(false);
          }
        } else if (autoGenerateThumbnail) {
          setUploadingThumbnail(true);
          try {
            await videosApi.generateThumbnail(createdVideo.id);
            toast.success('Миниатюра автоматически сгенерирована!');
          } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Ошибка при генерации миниатюры');
          } finally {
            setUploadingThumbnail(false);
          }
        }
      }
      
      console.log('✅ Video created:', createdVideo);
      toast.success(
        publish 
          ? 'Видео успешно опубликовано!' 
          : 'Видео успешно сохранено!'
      );
      
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
      } else if (error.response?.status === 400) {
        // Bad request - show the error message
        const errorMessage = error.response?.data?.detail || 'Неверные данные';
        toast.error(`Ошибка: ${errorMessage}`);
      } else if (error.response?.status === 404) {
        // Not found
        toast.error('Юнит не найден. Пожалуйста, выберите другой юнит.');
      } else if (error.response?.status === 500) {
        // Server error - check for specific error types
        const errorDetail = error.response?.data?.detail || '';
        if (errorDetail.includes('duplicate') || errorDetail.includes('unique') || errorDetail.includes('slug')) {
          toast.error('Видео с таким названием уже существует. Пожалуйста, измените название.');
        } else {
          toast.error('Ошибка сервера. Пожалуйста, попробуйте еще раз.');
        }
      } else {
        // Generic error
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
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                Создание нового видео
              </h1>
              <p className="mt-1 text-xs md:text-sm text-gray-500">
                Добавьте новый видео-урок в юнит — как лекцию в онлайн-курсе.
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
              onClick={() => handleSave(true)}
              disabled={saving}
              className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Публикация...' : 'Опубликовать'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
        <div className="space-y-6">
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
                      onClick={() => {
                        setFormData(prev => ({ ...prev, source_type: 'url' }));
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
                        setFormData(prev => ({ ...prev, source_type: 'file', external_url: undefined }));
                        setSelectedFile(null);
                        setUploadedFilePath(null);
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
                
                {/* File Upload */}
                {formData.source_type === 'file' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Загрузка видео файла *
                    </label>
                    
                    {!selectedFile && !uploadedFilePath ? (
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
                    ) : uploadedFilePath ? (
                      <div className="border-2 border-green-300 rounded-lg p-4 bg-green-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="flex-shrink-0">
                              <Check className="h-10 w-10 text-green-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {selectedFile?.name || 'Видео загружено'}
                              </p>
                              <p className="text-xs text-green-600">
                                Файл успешно загружен
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
                      </div>
                    ) : null}
                  </div>
                )}
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
                  {/* Order index */}
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
                      Определяет порядок видео среди других материалов в юните.
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
                        {thumbnailPreviewUrl ? (
                          <>
                            <img
                              src={thumbnailPreviewUrl}
                              alt="Video thumbnail"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={handleRemoveThumbnail}
                              disabled={uploadingThumbnail}
                              className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Удалить миниатюру"
                            >
                              <X className="w-4 h-4" />
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
                            onChange={handleThumbnailSelect}
                            disabled={uploadingThumbnail}
                          />
                          <div className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                            <Upload className="w-4 h-4" />
                            {uploadingThumbnail ? 'Загрузка...' : 'Загрузить миниатюру'}
                          </div>
                        </label>
                        
                        <button
                          type="button"
                          onClick={() => {
                            setAutoGenerateThumbnail(true);
                            toast.success('Миниатюра будет сгенерирована после сохранения');
                          }}
                          disabled={uploadingThumbnail}
                          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-primary-300 rounded-lg text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Sparkles className="w-4 h-4" />
                          Сгенерировать автоматически
                        </button>
                      </div>
                      
                      <p className="text-xs text-gray-500">
                        Если миниатюра не загружена, она будет сгенерирована автоматически после сохранения.
                      </p>
                    </div>
                  </div>

                  {/* Publish at */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Запланировать публикацию (опционально)
                    </label>
                    <input
                      type="datetime-local"
                      name="publish_at"
                      value={formData.publish_at}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Если указано, видео будет опубликовано в указанное время. Если не указано, публикация произойдет сразу.
                    </p>
                  </div>

                  {/* SEO */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">
                      SEO настройки
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Meta заголовок
                        </label>
                        <input
                          type="text"
                          name="meta_title"
                          value={formData.meta_title}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                          placeholder="SEO заголовок"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Meta описание
                        </label>
                        <textarea
                          name="meta_description"
                          value={formData.meta_description}
                          onChange={handleChange}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                          placeholder="Краткое описание для поисковых систем"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Preview Section - commented out */}
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
  );
}
