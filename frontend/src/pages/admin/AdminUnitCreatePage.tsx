import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus,
  X,
  Eye,
  Pencil,
  Trash2
} from 'lucide-react';
import { unitsApi, videosApi } from '../../services/api';
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
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [tasks, setTasks] = useState<ContentItem[]>([]);
  const [tests, setTests] = useState<ContentItem[]>([]);

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

  const handleAddContent = (type: 'video' | 'task' | 'test') => {
    if (type === 'video') {
      const newVideo: VideoItem = {
        id: Date.now(),
        title: 'Новое видео',
        status: 'draft',
        order_index: videos.length,
        type: 'video',
        source_type: 'url',
        external_url: '',
        description: ''
      };
      setVideos(prev => [...prev, newVideo]);
    } else {
    const newItem: ContentItem = {
      id: Date.now(),
        title: `Новое ${type === 'task' ? 'задание' : 'тест'}`,
      status: 'draft',
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
      // Prepare unit data for API
      const unitData = {
        title: formData.title,
        level: formData.level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
        description: formData.description,
        goals: formData.goals,
        tags: formData.tags,
        status: (publish ? 'published' : formData.status) as 'draft' | 'published' | 'archived',
        publish_at: formData.publish_at || undefined,
        order_index: formData.order_index,
        is_visible_to_students: formData.is_visible_to_students,
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
      
      toast.success(publish ? 'Юнит опубликован!' : 'Юнит сохранен как черновик!');
      
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

  const renderContentSection = (
    title: string,
    items: ContentItem[] | VideoItem[],
    type: 'video' | 'task' | 'test',
    icon: React.ReactNode
  ) => (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          {icon}
          <span className="ml-2">{title}</span>
          <span className="ml-2 text-sm text-gray-500">({items.length})</span>
        </h3>
        <button
          onClick={() => handleAddContent(type)}
          className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200"
        >
                          <Plus className="h-4 w-4 mr-1" />
          Добавить
        </button>
      </div>
      
      {items.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>Нет {type === 'video' ? 'видео' : type === 'task' ? 'заданий' : 'тестов'}</p>
          <button
            onClick={() => handleAddContent(type)}
            className="mt-2 text-primary-600 hover:text-primary-700"
          >
            Добавить первое {type === 'video' ? 'видео' : type === 'task' ? 'задание' : 'тест'}
          </button>
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
              Создать новый юнит
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Создание нового учебного юнита
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
            {saving ? 'Сохранение...' : 'Сохранить черновик'}
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
    </div>
  );
}
