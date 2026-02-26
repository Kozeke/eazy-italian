import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus,
  X,
  Eye,
  Pencil,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { unitsApi, videosApi, tasksApi, testsApi, coursesApi, ingestApi, ALLOWED_RAG_EXTENSIONS, MAX_RAG_FILE_BYTES } from '../../services/api';
import toast from 'react-hot-toast';
import { BookMarked, FileText, Upload } from 'lucide-react';
import RichTextEditor from '../../components/admin/RichTextEditor';

interface UnitFormData {
  title: string;
  level: string;
  description: string;
  goals: string;
  tags: string[];
  status: string;
  publish_at: string;
  order_index: number;
  course_id: number | null;
  is_visible_to_students: boolean;
  meta_title: string;
  meta_description: string;
}

interface ContentItem {
  id: number;
  title: string;
  status: string;
  order_index: number;
  type: 'video' | 'task' | 'test';
}

interface VideoItem extends ContentItem {
  source_type: 'file' | 'url';
  external_url?: string;
  file_path?: string;
  description?: string;
  duration_sec?: number;
  thumbnail_path?: string;
}

export default function AdminUnitCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newTag, setNewTag] = useState('');

  const [formData, setFormData] = useState<UnitFormData>({
    title: '',
    level: 'A1',
    description: '',
    goals: '',
    tags: [],
    status: 'draft',
    publish_at: '',
    order_index: 0,
    course_id: null,
    is_visible_to_students: false,
    meta_title: '',
    meta_description: ''
  });

  // Mock content data
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [tasks, setTasks] = useState<ContentItem[]>([]);
  const [tests, setTests] = useState<ContentItem[]>([]);
  
  // Available content from API
  const [availableVideos, setAvailableVideos] = useState<any[]>([]);
  const [availableTasks, setAvailableTasks] = useState<any[]>([]);
  const [availableTests, setAvailableTests] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);

  // RAG document upload (PDF, DOCX) — uploaded after unit is created
  const [ragFiles, setRagFiles] = useState<File[]>([]);
  const [ragUploading, setRagUploading] = useState(false);
  const maxRagFiles = 10;
  const allowedRagExtStr = ALLOWED_RAG_EXTENSIONS.join(', ');
  const maxRagMb = Math.round(MAX_RAG_FILE_BYTES / (1024 * 1024));

  // Load available content on mount
  useEffect(() => {
    const loadAvailableContent = async () => {
      try {
        setLoadingContent(true);
        
        // Load all available courses
        const coursesData = await coursesApi.getAdminCourses({ limit: 100 });
        setAvailableCourses(coursesData || []);
        
        // Load all available videos
        try {
          const videosData = await videosApi.getAdminVideos({ limit: 100 });
          setAvailableVideos(videosData || []);
          console.log('Loaded available videos:', videosData?.length || 0);
        } catch (error) {
          console.error('Error loading available videos:', error);
        }
        
        // Load all available tasks
        const tasksData = await tasksApi.getAdminTasks({ limit: 100 });
        setAvailableTasks(tasksData || []);
        
        // Load all available tests  
        const testsData = await testsApi.getTests({ limit: 100 });
        setAvailableTests(testsData.items || testsData || []);
        
        console.log('Loaded available content:', { 
          courses: coursesData?.length, 
          videos: availableVideos?.length || 0,
          tasks: tasksData?.length, 
          tests: testsData?.items?.length || 0
        });
      } catch (error) {
        console.error('Error loading available content:', error);
        toast.error('Ошибка при загрузке доступного контента');
      } finally {
        setLoadingContent(false);
      }
    };
    
    loadAvailableContent();
  }, []);

  const handleInputChange = (field: keyof UnitFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
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

  const getRagFileExtension = (file: File): string =>
    (file.name || '').split('.').pop()?.toLowerCase() || '';
  const isAllowedRagFile = (file: File): boolean =>
    ALLOWED_RAG_EXTENSIONS.includes(getRagFileExtension(file) as any);
  const isWithinRagSize = (file: File): boolean => file.size <= MAX_RAG_FILE_BYTES;

  const handleRagFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = '';
    const errors: string[] = [];
    const toAdd: File[] = [];
    for (const file of chosen) {
      if (!isAllowedRagFile(file)) {
        errors.push(`"${file.name}": допустимы только ${allowedRagExtStr}`);
        continue;
      }
      if (!isWithinRagSize(file)) {
        errors.push(`"${file.name}": размер не более ${maxRagMb} МБ`);
        continue;
      }
      toAdd.push(file);
    }
    if (errors.length) errors.forEach((msg) => toast.error(msg));
    setRagFiles((prev) => {
      const next = [...prev, ...toAdd].slice(0, maxRagFiles);
      if (next.length > maxRagFiles) toast.error(`Максимум ${maxRagFiles} файлов`);
      return next;
    });
  };

  const removeRagFile = (index: number) => {
    setRagFiles((prev) => prev.filter((_, i) => i !== index));
  };


  const handleRemoveContent = (type: 'video' | 'task' | 'test', id: number) => {
    if (type === 'video') {
      setVideos(prev => prev.filter(item => item.id !== id));
    } else if (type === 'task') {
      setTasks(prev => prev.filter(item => item.id !== id));
    } else {
      setTests(prev => prev.filter(item => item.id !== id));
    }
  };

  const handleVideoChange = (id: number, field: keyof VideoItem, value: any) => {
    setVideos(prev => prev.map(video => 
      video.id === id ? { ...video, [field]: value } : video
    ));
  };

  const validateYouTubeUrl = (url: string): boolean => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
  };

  // const extractYouTubeVideoId = (url: string): string | null => {
  //   const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  //   const match = url.match(regex);
  //   return match ? match[1] : null;
  // };

  const handleSave = async (publish: boolean = false) => {
    setSaving(true);
    
    try {
      // Smart defaults: status and visibility derived from publish action
      const status = publish ? 'published' : 'draft';
      const is_visible_to_students = publish; // Always true when published
      
      // Auto-calculate order_index (backend should handle this, but we can set a default)
      // For now, let backend handle it by not sending it or sending 0
      
      // Prepare unit data for API
      const unitData = {
        title: formData.title,
        level: formData.level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
        description: formData.description,
        goals: formData.goals,
        tags: formData.tags,
        status: status as 'draft' | 'published' | 'archived',
        publish_at: formData.publish_at || undefined,
        order_index: 0, // Backend should auto-calculate, but we send 0 as default
        course_id: formData.course_id || undefined,
        is_visible_to_students: is_visible_to_students,
        meta_title: formData.meta_title,
        meta_description: formData.meta_description
      };

      console.log('Saving unit:', unitData);
      
      // Call the actual API
      const savedUnit = await unitsApi.createUnit(unitData);
      
      console.log('Unit saved successfully:', savedUnit);
      
      // Save videos if any exist
      if (videos.length > 0) {
        for (const video of videos) {
          try {
            const videoData = {
              unit_id: savedUnit.id,
              title: video.title,
              description: video.description,
              source_type: video.source_type,
              external_url: video.source_type === 'url' ? video.external_url : undefined,
              file_path: video.source_type === 'file' ? video.file_path : undefined,
              status: publish ? 'published' : 'draft',
              order_index: video.order_index,
              is_visible_to_students: true
            };
            
            await videosApi.createVideo(videoData);
          } catch (error: any) {
            console.error('Error saving video:', error);
            toast.error(`Ошибка при сохранении видео "${video.title}"`);
          }
        }
      }
      
      // Update tasks to associate with the newly created unit
      let tasksUpdated = 0;
      for (const task of tasks) {
        try {
          console.log(`Associating task ${task.id} with new unit ${savedUnit.id}...`);
          await tasksApi.updateTask(task.id, { unit_id: savedUnit.id } as any);
          tasksUpdated++;
          console.log(`✅ Task ${task.id} associated`);
        } catch (error) {
          console.error(`❌ Error associating task ${task.id}:`, error);
        }
      }
      
      // Update tests to associate with the newly created unit
      let testsUpdated = 0;
      for (const test of tests) {
        try {
          console.log(`Associating test ${test.id} with new unit ${savedUnit.id}...`);
          await testsApi.updateTest(test.id, { unit_id: savedUnit.id } as any);
          testsUpdated++;
          console.log(`✅ Test ${test.id} associated`);
        } catch (error) {
          console.error(`❌ Error associating test ${test.id}:`, error);
        }
      }
      
      let ragIngested = 0;
      const courseId = formData.course_id ?? savedUnit.course_id;
      if (ragFiles.length > 0 && courseId) {
        setRagUploading(true);
        try {
          const results = await ingestApi.uploadMany(ragFiles, savedUnit.id, courseId);
          ragIngested = results?.length ?? 0;
          if (ragIngested > 0) {
            toast.success(`Загружено документов для RAG: ${ragIngested}`);
          }
        } catch (err: any) {
          toast.error(err.response?.data?.detail || 'Ошибка загрузки документов для RAG');
        } finally {
          setRagUploading(false);
          setRagFiles([]);
        }
      }

      console.log(`✅ Unit created with ${tasksUpdated} tasks and ${testsUpdated} tests${ragIngested ? `, ${ragIngested} RAG docs` : ''}`);
      toast.success(
        publish 
          ? `Юнит опубликован! Добавлено: ${tasksUpdated} заданий, ${testsUpdated} тестов${ragIngested ? `, ${ragIngested} док. для RAG` : ''}` 
          : `Юнит сохранен! Добавлено: ${tasksUpdated} заданий, ${testsUpdated} тестов${ragIngested ? `, ${ragIngested} док. для RAG` : ''}`
      );
      
      // Navigate back to units list
      navigate('/admin/units');
    } catch (error: any) {
      console.error('Error saving unit:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при сохранении юнита');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', text: 'Черновик' },
      scheduled: { color: 'bg-blue-100 text-blue-800', text: 'Запланировано' },
      published: { color: 'bg-green-100 text-green-800', text: 'Опубликовано' },
      archived: { color: 'bg-red-100 text-red-800', text: 'Архив' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const handleAddExistingContent = (type: 'video' | 'task' | 'test', contentId: number) => {
    const availableContent = type === 'video' ? availableVideos : type === 'task' ? availableTasks : availableTests;
    const content = availableContent.find(item => item.id === contentId);
    
    if (!content) return;
    
    if (type === 'video') {
      const newVideoItem: VideoItem = {
        id: content.id,
        title: content.title,
        status: content.status || 'draft',
        order_index: videos.length,
        type: 'video',
        source_type: content.source_type || 'url',
        external_url: content.external_url,
        file_path: content.file_path,
        description: content.description,
        duration_sec: content.duration_sec,
        thumbnail_path: content.thumbnail_path
      };
      setVideos(prev => [...prev, newVideoItem]);
    } else {
      const newItem: ContentItem = {
        id: content.id,
        title: content.title,
        status: content.status || 'draft',
        order_index: type === 'task' ? tasks.length : tests.length,
        type
      };
      
      if (type === 'task') {
        setTasks(prev => [...prev, newItem]);
      } else {
        setTests(prev => [...prev, newItem]);
      }
    }
  };

  const renderContentSection = (
    title: string,
    items: ContentItem[] | VideoItem[],
    type: 'video' | 'task' | 'test',
    icon: React.ReactNode
  ) => {
    const availableContent = type === 'video' ? availableVideos : type === 'task' ? availableTasks : type === 'test' ? availableTests : [];
    const unusedContent = availableContent.filter(content => 
      !items.some(item => item.id === content.id)
    );
    
    const createPageUrl = type === 'video' ? '/admin/videos/new' : 
                          type === 'task' ? '/admin/tasks/new' : 
                          '/admin/tests/new';
    
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            {icon}
            <span className="ml-2">{title}</span>
            <span className="ml-2 text-sm text-gray-500">({items.length})</span>
          </h3>
          <div className="flex items-center space-x-2">
            {unusedContent.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddExistingContent(type, parseInt(e.target.value));
                    e.target.value = '';
                  }
                }}
                className="text-sm px-3 py-1 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Добавить существующий...</option>
                {unusedContent.map(content => (
                  <option key={content.id} value={content.id}>
                    {content.title}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => navigate(createPageUrl)}
              className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              title={`Создать новый ${type === 'video' ? 'видео' : type === 'task' ? 'задание' : 'тест'}`}
            >
              <Plus className="h-4 w-4 mr-1" />
              Создать новый
            </button>
          </div>
        </div>
        
        {availableContent.length === 0 && !loadingContent ? (
          <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-500 mb-3">
              Нет доступных {type === 'video' ? 'видео' : type === 'task' ? 'заданий' : 'тестов'}
            </p>
            <button
              onClick={() => navigate(createPageUrl)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Создать первый {type === 'video' ? 'видео' : type === 'task' ? 'задание' : 'тест'}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>В этом юните нет {type === 'video' ? 'видео' : type === 'task' ? 'заданий' : 'тестов'}</p>
            <p className="text-sm mt-1">Выберите существующий или создайте новый выше</p>
          </div>
        ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id} className="bg-white p-3 rounded-md border">
              {type === 'video' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm text-gray-500">#{index + 1}</span>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={(item as VideoItem).title}
                          onChange={(e) => handleVideoChange(item.id, 'title', e.target.value)}
                          className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          placeholder="Название видео"
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(item.status)}
                      <button 
                        onClick={() => handleRemoveContent(type, item.id)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Тип видео
                      </label>
                      <select
                        value={(item as VideoItem).source_type}
                        onChange={(e) => handleVideoChange(item.id, 'source_type', e.target.value)}
                        className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="url">YouTube/Vimeo ссылка</option>
                        <option value="file">Загрузить файл</option>
                      </select>
                    </div>
                    
                    {(item as VideoItem).source_type === 'url' ? (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Ссылка на видео
                        </label>
                        <input
                          type="url"
                          value={(item as VideoItem).external_url || ''}
                          onChange={(e) => handleVideoChange(item.id, 'external_url', e.target.value)}
                          className={`block w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                            (item as VideoItem).external_url && !validateYouTubeUrl((item as VideoItem).external_url || '')
                              ? 'border-red-300 focus:ring-red-500'
                              : 'border-gray-300 focus:ring-primary-500'
                          }`}
                          placeholder="https://www.youtube.com/watch?v=..."
                        />
                        {(item as VideoItem).external_url && !validateYouTubeUrl((item as VideoItem).external_url || '') && (
                          <p className="text-xs text-red-600 mt-1">Пожалуйста, введите корректную ссылку на YouTube</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Загрузить файл
                        </label>
                        <input
                          type="file"
                          accept="video/*"
                          className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleVideoChange(item.id, 'file_path', file.name);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Описание
                    </label>
                    <textarea
                      value={(item as VideoItem).description || ''}
                      onChange={(e) => handleVideoChange(item.id, 'description', e.target.value)}
                      rows={2}
                      className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="Краткое описание видео"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500">#{index + 1}</span>
                <div>
                  <div className="font-medium text-gray-900">{item.title}</div>
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(item.status)}
                    <span className="text-sm text-gray-500">Порядок: {item.order_index}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button className="text-gray-400 hover:text-gray-600">
                  <Eye className="h-4 w-4" />
                </button>
                <button className="text-gray-400 hover:text-gray-600">
                  <Pencil className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => handleRemoveContent(type, item.id)}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top sticky bar – Udemy/Coursera style */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <button
                onClick={() => navigate('/admin/units')}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 flex-shrink-0"
              >
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="hidden sm:inline">Назад к юнитам</span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                  <h1 className="text-base sm:text-xl md:text-2xl font-semibold text-gray-900 truncate">
                    Создать новый юнит
                  </h1>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 hidden sm:block">
                  Настройте структуру юнита — как модули и лекции на Coursera/Udemy
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <button
                onClick={() => handleSave(true)}
                disabled={saving || ragUploading}
                className="inline-flex items-center justify-center rounded-lg border border-transparent bg-primary-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 flex-1 sm:flex-initial whitespace-nowrap"
              >
                {saving || ragUploading ? (ragUploading ? 'Загрузка документов...' : 'Публикация...') : 'Опубликовать'}
              </button>
            </div>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Название */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Например: Итальянский A1: Приветствия и базовые фразы"
                  />
                </div>

                {/* Уровень */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Уровень
                  </label>
                  <select
                    value={formData.level}
                    onChange={(e) => handleInputChange('level', e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="A1">A1 – Начальный</option>
                    <option value="A2">A2 – Элементарный</option>
                    <option value="B1">B1 – Средний</option>
                    <option value="B2">B2 – Выше среднего</option>
                    <option value="C1">C1 – Продвинутый</option>
                    <option value="C2">C2 – В совершенстве</option>
                  </select>
                </div>

                {/* Course Selection */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <BookMarked className="h-4 w-4 mr-1 text-gray-400" />
                    Курс
                  </label>
                  <select
                    value={formData.course_id || ''}
                    onChange={(e) => handleInputChange('course_id', e.target.value ? parseInt(e.target.value) : null)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Без курса (автономный юнит)</option>
                    {availableCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title} {course.level && `(${course.level})`}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Выберите курс, к которому будет принадлежать этот юнит. Если не выбран, юнит будет автономным.
                  </p>
                  {availableCourses.length === 0 && !loadingContent && (
                    <p className="mt-2 text-xs text-amber-600">
                      Нет доступных курсов. <button 
                        type="button"
                        onClick={() => navigate('/admin/courses/new')}
                        className="text-primary-600 hover:text-primary-700 underline"
                      >
                        Создать курс
                      </button>
                    </p>
                  )}
                </div>
              </div>

              {/* Описание */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Описание
                </label>
                <RichTextEditor
                  value={formData.description}
                  onChange={(value) => handleInputChange('description', value)}
                  placeholder="Кратко опишите, что студенты будут изучать в этом юните"
                />
              </div>

              {/* Цели */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ключевые цели обучения
                </label>
                <textarea
                  value={formData.goals}
                  onChange={(e) => handleInputChange('goals', e.target.value)}
                  rows={3}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Например: уметь представиться, поприветствовать, задать базовые вопросы…"
                />
              </div>
            </div>

            {/* Content builder – like course curriculum */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Контент юнита
                  </h2>
                  <p className="text-sm text-gray-500">
                    Добавьте видео, задания и тесты — как лекции и квизы в онлайн-курсе
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {renderContentSection(
                  'Видео-уроки',
                  videos,
                  'video',
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
                    <Eye className="h-4 w-4 text-red-500" />
                  </div>
                )}

                {renderContentSection(
                  'Задания',
                  tasks,
                  'task',
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10">
                    <Pencil className="h-4 w-4 text-blue-500" />
                  </div>
                )}

                {renderContentSection(
                  'Тесты',
                  tests,
                  'test',
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/10">
                    <span className="text-xs font-semibold text-purple-600">Q</span>
                  </div>
                )}
              </div>
            </div>

            {/* RAG documents — PDF/DOCX for vector search (only when course selected) */}
            {formData.course_id && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center">
                  <FileText className="h-5 w-5 text-gray-500 mr-2" />
                  Документы для RAG
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  PDF или DOCX, не более {maxRagMb} МБ на файл. Будут загружены после сохранения юнита и добавлены в поиск по курсу.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
                    <Upload className="h-4 w-4 mr-2 text-gray-500" />
                    Выбрать файлы
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      multiple
                      className="sr-only"
                      onChange={handleRagFilesSelect}
                      disabled={ragFiles.length >= maxRagFiles}
                    />
                  </label>
                  <span className="text-xs text-gray-500">
                    {ragFiles.length} / {maxRagFiles} файлов
                  </span>
                </div>
                {ragFiles.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {ragFiles.map((file, i) => (
                      <li key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                        <span className="truncate text-gray-800">{file.name}</span>
                        <span className="text-gray-500 flex-shrink-0 ml-2">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRagFile(i)}
                          className="text-red-500 hover:text-red-700 flex-shrink-0 ml-2"
                          aria-label="Удалить"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Advanced Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-left"
              >
                <h2 className="text-lg font-semibold text-gray-900">
                  Расширенные настройки
                </h2>
                <span className="text-sm text-gray-600 hover:text-primary-600">
                  {showAdvanced ? 'Скрыть' : 'Показать'}
                </span>
              </button>

              {showAdvanced && (
                <div className="mt-6 space-y-6">
                  {/* Order Index */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Порядок отображения
                    </label>
                    <input
                      type="number"
                      value={formData.order_index}
                      onChange={(e) => handleInputChange('order_index', parseInt(e.target.value) || 0)}
                      min="0"
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="0"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Порядок отображения юнита в списке. Меньшие значения отображаются первыми.
                    </p>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Теги
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
                        placeholder="Добавить тег (например: грамматика, A1, приветствия)"
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

                  {/* Publish at */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Запланировать публикацию (опционально)
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.publish_at}
                      onChange={(e) => handleInputChange('publish_at', e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Если указано, юнит будет опубликован в указанное время. Если не указано, публикация произойдет сразу.
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
                          value={formData.meta_title}
                          onChange={(e) => handleInputChange('meta_title', e.target.value)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          placeholder="SEO заголовок"
                        />
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
                      </div>
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
