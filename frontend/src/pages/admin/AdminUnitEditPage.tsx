import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus,
  X,
  Eye,
  Pencil,
  Trash2,
  BarChart3,
  Clock,
  Users,
  ExternalLink
} from 'lucide-react';
import { unitsApi, tasksApi, testsApi, videosApi } from '../../services/api';
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

interface UnitSummary {
  total_enrolled: number;
  started_count: number;
  completed_count: number;
  average_score: number;
  average_time_minutes: number;
  completion_rate: number;
}

export default function AdminUnitEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState('main');
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
    is_visible_to_students: false,
    meta_title: '',
    meta_description: ''
  });

  // Mock content data
  const [videos, setVideos] = useState<ContentItem[]>([]);
  const [tasks, setTasks] = useState<ContentItem[]>([]);
  const [tests, setTests] = useState<ContentItem[]>([]);
  
  // Available content from API
  const [availableTasks, setAvailableTasks] = useState<any[]>([]);
  const [availableTests, setAvailableTests] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);
  
  const [summary, setSummary] = useState<UnitSummary>({
    total_enrolled: 0,
    started_count: 0,
    completed_count: 0,
    average_score: 0,
    average_time_minutes: 0,
    completion_rate: 0
  });

  // Load available content on mount
  useEffect(() => {
    const loadAvailableContent = async () => {
      try {
        setLoadingContent(true);
        
        // Load all available tasks
        const tasksData = await tasksApi.getAdminTasks({ limit: 100 });
        setAvailableTasks(tasksData || []);
        
        // Load all available tests  
        const testsData = await testsApi.getTests({ limit: 100 });
        const testsList = testsData?.items || (Array.isArray(testsData) ? testsData : []);
        setAvailableTests(testsList);
        
        console.log('Loaded available content:', { 
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
          is_visible_to_students: (unitData as any).is_visible_to_students || false,
          meta_title: (unitData as any).meta_title || '',
          meta_description: (unitData as any).meta_description || ''
        });

        // Load videos, tasks, tests for this unit
        try {
          // Load videos using API service
          try {
            const videosData = await videosApi.getVideos(parseInt(id));
            setVideos(videosData.map((v: any) => ({ id: v.id, title: v.title, status: v.status, order_index: v.order_index, type: 'video' })));
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

        setSummary({
          total_enrolled: 0,
          started_count: 0,
          completed_count: 0,
          average_score: 0,
          average_time_minutes: 0,
          completion_rate: 0
        });

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
    const availableContent = type === 'task' ? availableTasks : availableTests;
    const content = availableContent.find(item => item.id === contentId);
    
    if (!content) return;
    
    const newItem: ContentItem = {
      id: content.id,
      title: content.title,
      status: content.status || 'draft',
      order_index: type === 'video' ? videos.length : type === 'task' ? tasks.length : tests.length,
      type
    };
    
    if (type === 'video') {
      setVideos(prev => [...prev, newItem]);
    } else if (type === 'task') {
      setTasks(prev => [...prev, newItem]);
    } else {
      setTests(prev => [...prev, newItem]);
    }
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
      
      // Save unit data
      const unitData = {
        ...formData,
        status: publish ? 'published' : 'draft',
        publish_at: publish ? new Date().toISOString() : null
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
      
      console.log(`=== SAVE COMPLETE: ${tasksUpdated} tasks, ${testsUpdated} tests updated ===`);
      toast.success(`Юнит сохранен! Обновлено: ${tasksUpdated} заданий, ${testsUpdated} тестов`);
      
      // Reload the page to show saved content
      setTimeout(() => {
        console.log('Reloading page...');
        window.location.reload();
      }, 1500);
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
    const availableContent = type === 'task' ? availableTasks : type === 'test' ? availableTests : [];
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
            <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-md border">
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
          ))}
        </div>
      )}
    </div>
  );
  };

  const renderProgressTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
                              <Users className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Всего записались</p>
              <p className="text-2xl font-semibold text-gray-900">{summary.total_enrolled}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
                              <Clock className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Начали изучение</p>
              <p className="text-2xl font-semibold text-gray-900">{summary.started_count}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
                              <BarChart3 className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Завершили</p>
              <p className="text-2xl font-semibold text-gray-900">{summary.completed_count}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
                              <BarChart3 className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Средний балл</p>
              <p className="text-2xl font-semibold text-gray-900">{summary.average_score}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Детальная статистика</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm font-medium text-gray-500">Процент завершения</p>
            <p className="text-3xl font-bold text-gray-900">{summary.completion_rate}%</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Среднее время изучения</p>
            <p className="text-3xl font-bold text-gray-900">{summary.average_time_minutes} мин</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Активные студенты</p>
            <p className="text-3xl font-bold text-gray-900">{summary.started_count - summary.completed_count}</p>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/admin/units')}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Редактирование юнита
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {formData.title}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <Eye className="h-4 w-4 mr-2" />
            Предпросмотр
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Публикация...' : 'Опубликовать'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('main')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'main'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Основное
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'progress'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Прогресс
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'main' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Основная информация</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
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
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
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

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Описание
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={4}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Краткое описание юнита"
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ключевые цели обучения
                </label>
                <textarea
                  value={formData.goals}
                  onChange={(e) => handleInputChange('goals', e.target.value)}
                  rows={3}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Что студенты должны изучить в этом юните"
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Теги
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800"
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
                <div className="flex">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Добавить тег"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-3 py-2 bg-primary-600 text-white rounded-r-md hover:bg-primary-700"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Content Structure */}
            <div className="space-y-6">
              <h2 className="text-lg font-medium text-gray-900">Структура юнита</h2>
              
              {renderContentSection(
                'Видео',
                videos,
                'video',
                <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
                  <span className="text-white text-xs">V</span>
                </div>
              )}
              
              {renderContentSection(
                'Задания',
                tasks,
                'task',
                <div className="w-5 h-5 bg-green-500 rounded flex items-center justify-center">
                  <span className="text-white text-xs">T</span>
                </div>
              )}
              
              {renderContentSection(
                'Тесты',
                tests,
                'test',
                <div className="w-5 h-5 bg-purple-500 rounded flex items-center justify-center">
                  <span className="text-white text-xs">Q</span>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status and Settings */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Статус и настройки</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Статус
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="draft">Черновик</option>
                    <option value="scheduled">Запланировано</option>
                    <option value="published">Опубликовано</option>
                    <option value="archived">Архив</option>
                  </select>
                </div>

                {formData.status === 'scheduled' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Дата публикации
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.publish_at}
                      onChange={(e) => handleInputChange('publish_at', e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Порядок
                  </label>
                  <input
                    type="number"
                    value={formData.order_index}
                    onChange={(e) => handleInputChange('order_index', parseInt(e.target.value) || 0)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="visible_to_students"
                    checked={formData.is_visible_to_students}
                    onChange={(e) => handleInputChange('is_visible_to_students', e.target.checked)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="visible_to_students" className="ml-2 block text-sm text-gray-900">
                    Показывать студентам
                  </label>
                </div>
              </div>
            </div>

            {/* SEO Settings */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">SEO настройки</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meta заголовок
                  </label>
                  <input
                    type="text"
                    value={formData.meta_title}
                    onChange={(e) => handleInputChange('meta_title', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
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
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    placeholder="SEO описание"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'progress' && renderProgressTab()}
    </div>
  );
}
