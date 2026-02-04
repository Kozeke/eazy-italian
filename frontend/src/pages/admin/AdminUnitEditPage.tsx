import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus,
  X,
  Eye,
  Pencil,
  Trash2,
  ExternalLink,
  BookMarked,
  AlertTriangle
} from 'lucide-react';
import { unitsApi, tasksApi, testsApi, videosApi, coursesApi } from '../../services/api';
import toast from 'react-hot-toast';

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
  is_visible_to_students?: boolean;
}

export default function AdminUnitEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
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
  const [videos, setVideos] = useState<ContentItem[]>([]);
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
        } catch (error) {
          console.error('Error loading available videos:', error);
        }
        
        // Load all available tasks
        const tasksData = await tasksApi.getAdminTasks({ limit: 100 });
        setAvailableTasks(tasksData || []);
        
        // Load all available tests  
        const testsData = await testsApi.getTests({ limit: 100 });
        const testsList = testsData?.items || (Array.isArray(testsData) ? testsData : []);
        setAvailableTests(testsList);
        
        console.log('Loaded available content:', { 
          videos: availableVideos?.length || 0,
          tasks: tasksData?.length || 0, 
          tests: testsList?.length || 0,
          tasksData,
          testsData 
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

  useEffect(() => {
    // Load unit data
    const loadUnitData = async () => {
      if (!id) {
        toast.error('ID юнита не найден');
        navigate('/admin/units');
        return;
      }

      try {
        setLoading(true);
        const unitData = await unitsApi.getAdminUnit(parseInt(id));
        
        setFormData({
          title: unitData.title || '',
          level: unitData.level || 'A1',
          description: unitData.description || '',
          goals: (unitData as any).goals || '',
          tags: (unitData as any).tags || [],
          status: unitData.status || 'draft',
          publish_at: (unitData as any).publish_at ? (unitData as any).publish_at.slice(0, 16) : '',
          order_index: unitData.order_index || 0,
          course_id: (unitData as any).course_id || null,
          is_visible_to_students: (unitData as any).is_visible_to_students || false,
          meta_title: (unitData as any).meta_title || '',
          meta_description: (unitData as any).meta_description || ''
        });

        // Load videos, tasks, tests for this unit
        try {
          // Load videos using admin API service (to get all videos including drafts)
          try {
            const videosData = await videosApi.getAdminVideos({ unit_id: parseInt(id), limit: 100 });
            setVideos(videosData.map((v: any) => ({ 
              id: v.id, 
              title: v.title, 
              status: v.status, 
              order_index: v.order_index, 
              type: 'video' as const,
              is_visible_to_students: v.is_visible_to_students ?? true
            })));
            console.log('Loaded videos:', videosData.length);
          } catch (error) {
            console.error('Error loading videos:', error);
          }

          // Load tasks using API service
          try {
            const tasksData = await tasksApi.getAdminTasks({ unit_id: parseInt(id) });
            console.log('Loaded tasks for unit:', tasksData);
            const tasksList = Array.isArray(tasksData) ? tasksData : [];
            setTasks(tasksList.map((t: any) => ({ id: t.id, title: t.title, status: t.status, order_index: t.order_index, type: 'task' })));
            console.log('Set tasks state:', tasksList.length);
          } catch (error) {
            console.error('Error loading tasks:', error);
          }

          // Load tests using API service
          try {
            const testsData = await testsApi.getTests({ unit_id: parseInt(id) });
            console.log('Loaded tests for unit:', testsData);
            const testsList = testsData?.items || (Array.isArray(testsData) ? testsData : []);
            setTests(testsList.map((t: any) => ({ id: t.id, title: t.title, status: t.status, order_index: t.order_index, type: 'test' })));
            console.log('Set tests state:', testsList.length);
          } catch (error) {
            console.error('Error loading tests:', error);
          }
        } catch (contentError) {
          console.error('Error loading unit content:', contentError);
        }

      } catch (error: any) {
        console.error('Error loading unit:', error);
        toast.error(error.response?.data?.detail || 'Ошибка при загрузке юнита');
        navigate('/admin/units');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadUnitData();
    }
  }, [id]);

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

  const handleAddExistingContent = (type: 'video' | 'task' | 'test', contentId: number) => {
    const availableContent = type === 'video' ? availableVideos : type === 'task' ? availableTasks : availableTests;
    const content = availableContent.find(item => item.id === contentId);
    
    if (!content) return;
    
    const newItem: ContentItem = {
      id: content.id,
      title: content.title,
      status: content.status || 'draft',
      order_index: type === 'video' ? videos.length : type === 'task' ? tasks.length : tests.length,
      type,
      is_visible_to_students: type === 'video' ? (content.is_visible_to_students ?? true) : undefined
    };
    
    if (type === 'video') {
      setVideos(prev => [...prev, newItem]);
    } else if (type === 'task') {
      setTasks(prev => [...prev, newItem]);
    } else {
      setTests(prev => [...prev, newItem]);
    }
  };

  const handleRemoveContent = async (type: 'video' | 'task' | 'test', id: number) => {
    // Get the item to show confirmation
    const items = type === 'video' ? videos : type === 'task' ? tasks : tests;
    const item = items.find(i => i.id === id);
    
    if (!item) return;
    
    // Confirm deletion
    const confirmMessage = type === 'video' 
      ? `Вы уверены, что хотите удалить видео "${item.title}"? Это действие нельзя отменить.`
      : type === 'task'
      ? `Вы уверены, что хотите удалить задание "${item.title}"? Это действие нельзя отменить.`
      : `Вы уверены, что хотите удалить тест "${item.title}"? Это действие нельзя отменить.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      // Delete from backend
      if (type === 'video') {
        await videosApi.deleteVideo(id);
        setVideos(prev => prev.filter(item => item.id !== id));
        toast.success('Видео успешно удалено');
      } else if (type === 'task') {
        await tasksApi.deleteTask(id);
        setTasks(prev => prev.filter(item => item.id !== id));
        toast.success('Задание успешно удалено');
      } else {
        await testsApi.deleteTest(id);
        setTests(prev => prev.filter(item => item.id !== id));
        toast.success('Тест успешно удален');
      }
    } catch (error: any) {
      console.error(`Error deleting ${type}:`, error);
      toast.error(
        error.response?.data?.detail || 
        `Ошибка при удалении ${type === 'video' ? 'видео' : type === 'task' ? 'задания' : 'теста'}`
      );
    }
  };

  const handleSave = async (publish: boolean = false) => {
    if (!id) {
      toast.error('ID юнита не найден');
      return;
    }

    setSaving(true);
    
    try {
      console.log('=== STARTING SAVE ===');
      console.log('Unit ID:', id);
      console.log('Tasks to save:', tasks);
      console.log('Tests to save:', tests);
      console.log('Videos to save:', videos);
      
      // Smart defaults: status and visibility derived from publish action
      const status = publish ? 'published' : 'draft';
      const is_visible_to_students = publish; // Always true when published
      
      // Save unit data
      const unitData = {
        ...formData,
        status: status,
        is_visible_to_students: is_visible_to_students,
        publish_at: formData.publish_at || (publish ? new Date().toISOString() : null)
      } as any;
      
      console.log('Sending unit data:', JSON.stringify(unitData, null, 2));

      await unitsApi.updateUnit(parseInt(id), unitData);
      console.log('✅ Unit data saved');
      
      // Update tasks to associate with this unit
      let tasksUpdated = 0;
      for (const task of tasks) {
        try {
          console.log(`Updating task ${task.id} to unit ${id}...`);
          await tasksApi.updateTask(task.id, { unit_id: parseInt(id) } as any);
          tasksUpdated++;
          console.log(`✅ Task ${task.id} updated`);
        } catch (error) {
          console.error(`❌ Error updating task ${task.id}:`, error);
        }
      }
      
      // Update tests to associate with this unit
      let testsUpdated = 0;
      for (const test of tests) {
        try {
          console.log(`Updating test ${test.id} to unit ${id}...`);
          await testsApi.updateTest(test.id, { unit_id: parseInt(id) } as any);
          testsUpdated++;
          console.log(`✅ Test ${test.id} updated`);
        } catch (error) {
          console.error(`❌ Error updating test ${test.id}:`, error);
        }
      }
      
      // Update videos to associate with this unit
      let videosUpdated = 0;
      for (const video of videos) {
        try {
          console.log(`Updating video ${video.id} to unit ${id}...`);
          await videosApi.updateVideo(video.id, { unit_id: parseInt(id) } as any);
          videosUpdated++;
          console.log(`✅ Video ${video.id} updated`);
        } catch (error) {
          console.error(`❌ Error updating video ${video.id}:`, error);
        }
      }
      
      console.log(`=== SAVE COMPLETE: ${tasksUpdated} tasks, ${testsUpdated} tests, ${videosUpdated} videos updated ===`);
      toast.success(`Юнит сохранен! Обновлено: ${videosUpdated} видео, ${tasksUpdated} заданий, ${testsUpdated} тестов`);
      
      // Navigate back to units page
      setTimeout(() => {
        navigate('/admin/units');
      }, 500);
    } catch (error: any) {
      console.error('Error saving unit:', error);
      // Handle validation errors (422)
      if (error.response?.status === 422) {
        const detail = error.response?.data?.detail;
        if (Array.isArray(detail)) {
          const errorMessages = detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
          toast.error(`Ошибка валидации: ${errorMessages}`);
        } else if (typeof detail === 'string') {
          toast.error(detail);
        } else {
          toast.error('Ошибка валидации данных');
        }
      } else {
        const message = typeof error.response?.data?.detail === 'string' 
          ? error.response.data.detail 
          : 'Ошибка при сохранении юнита';
        toast.error(message);
      }
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

  const renderContentSection = (
    title: string,
    items: ContentItem[],
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
          {items.map((item, index) => {
            // Check if video is visible to students
            const isVideo = type === 'video';
            const isPublished = item.status === 'published';
            const isVisible = item.is_visible_to_students !== false;
            const willBeVisibleToStudents = isVideo ? (isPublished && isVisible) : true;
            
            return (
              <div key={item.id} className={`flex items-center justify-between bg-white p-3 rounded-md border ${!willBeVisibleToStudents ? 'border-yellow-300 bg-yellow-50' : ''}`}>
                <div className="flex items-center space-x-3 flex-1">
                  <span className="text-sm text-gray-500">#{index + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-gray-900">{item.title}</div>
                      {!willBeVisibleToStudents && (
                        <div className="flex items-center gap-1 text-yellow-700 text-xs" title="Это видео не будет видно студентам. Опубликуйте его и включите видимость для студентов.">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Не видно студентам</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      {getStatusBadge(item.status)}
                      {isVideo && !isVisible && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          Скрыто
                        </span>
                      )}
                      <span className="text-sm text-gray-500">Порядок: {item.order_index}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => {
                      if (type === 'video') {
                        navigate(`/admin/videos/${item.id}/edit`);
                      } else if (type === 'task') {
                        navigate(`/admin/tasks/${item.id}/edit`);
                      } else if (type === 'test') {
                        navigate(`/admin/tests/${item.id}/edit`);
                      }
                    }}
                    className="text-gray-400 hover:text-gray-600"
                    title="Редактировать"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleRemoveContent(type, item.id)}
                    className="text-red-400 hover:text-red-600"
                    title="Удалить из юнита"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
      {/* Sticky top bar – Udemy/Coursera style */}
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
                  Редактирование юнита
                </h1>
              </div>
              <p className="mt-1 text-xs md:text-sm text-gray-500 line-clamp-1">
                {formData.title || 'Название юнита еще не заполнено'}
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

      {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
          <div className="space-y-6">
              {/* Basic information */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Основная информация
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Название *
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="Введите название юнита"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Уровень *
                    </label>
                    <select
                      value={formData.level}
                      onChange={(e) => handleInputChange('level', e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="A1">A1 - Начальный</option>
                      <option value="A2">A2 - Элементарный</option>
                      <option value="B1">B1 - Средний</option>
                      <option value="B2">B2 - Выше среднего</option>
                      <option value="C1">C1 - Продвинутый</option>
                      <option value="C2">C2 - В совершенстве</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Описание
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={4}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Краткое описание юнита"
                  />
                </div>

                {/* Goals */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ключевые цели обучения
                  </label>
                  <textarea
                    value={formData.goals}
                    onChange={(e) => handleInputChange('goals', e.target.value)}
                    rows={3}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Что студенты должны изучить в этом юните"
                  />
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
                          placeholder="Добавить тег"
                        />
                        <button
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
                            onChange={(e) =>
                              handleInputChange('meta_description', e.target.value)
                            }
                            rows={3}
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            placeholder="SEO описание"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Content structure – use existing renderContentSection */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Контент юнита
                    </h2>
                    <p className="text-sm text-gray-500">
                      Управляйте видео, заданиями и тестами как структурой курса.
                    </p>
                  </div>
                </div>

                {renderContentSection(
                  'Видео',
                  videos,
                  'video',
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10">
                    <span className="text-xs font-semibold text-blue-600">V</span>
                  </div>
                )}

                {renderContentSection(
                  'Задания',
                  tasks,
                  'task',
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
                    <span className="text-xs font-semibold text-green-600">T</span>
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

              {/* Preview block */}
              {showPreview && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    Предпросмотр юнита (вид студента)
                  </h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Как этот юнит будет выглядеть в списке уроков.
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
