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
import { unitsApi, videosApi, tasksApi, testsApi, coursesApi } from '../../services/api';
import toast from 'react-hot-toast';
import { BookMarked } from 'lucide-react';

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
  const [showPreview, setShowPreview] = useState(false);
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
      
      console.log(`✅ Unit created with ${tasksUpdated} tasks and ${testsUpdated} tests`);
      toast.success(
        publish 
          ? `Юнит опубликован! Добавлено: ${tasksUpdated} заданий, ${testsUpdated} тестов` 
          : `Юнит сохранен! Добавлено: ${tasksUpdated} заданий, ${testsUpdated} тестов`
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
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/units')}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад к юнитам
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                  Создать новый юнит
                </h1>
              </div>
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                Настройте структуру юнита — как модули и лекции на Coursera/Udemy
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="hidden sm:inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? 'Скрыть предпросмотр' : 'Предпросмотр'}
            </button>

            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>

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
              </div>

              {/* Описание */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Описание
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={4}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                  {/* Course Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                      <BookMarked className="h-4 w-4 mr-1 text-gray-400" />
                      Курс (опционально)
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

            {/* Preview as a student */}
            {showPreview && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Предпросмотр юнита (вид студента)
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Небольшой обзор того, как юнит будет выглядеть в списке уроков.
                </p>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        {formData.title || 'Без названия'}
                      </h3>
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                        {formData.description || 'Описание юнита пока не заполнено.'}
                      </p>
                    </div>
                    <div>
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                        {formData.level}
                      </span>
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

                  <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    <span>{videos.length} видео</span>
                    <span>{tasks.length} заданий</span>
                    <span>{tests.length} тестов</span>
                  </div>
                  </div>
                </div>
              )}
        </div>
      </div>
    </div>
  );
}
