import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye, 
  Copy,
  Video,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// Mock data - replace with actual API calls
const mockVideos = [
  {
    id: 1,
    title: 'Основы итальянского произношения',
    description: 'Видеоурок по правильному произношению итальянских звуков',
    level: 'A1',
    status: 'published',
    duration: '15:30',
    thumbnail: '/api/thumbnails/video1.jpg',
    url: '/api/videos/video1.mp4',
    views: 1250,
    uploadDate: '2024-01-15T10:30:00Z',
    lastUpdated: '2024-01-10T10:30:00Z',
    orderIndex: 1
  },
  {
    id: 2,
    title: 'Грамматика: Артикли в итальянском',
    description: 'Подробное объяснение использования артиклей',
    level: 'A2',
    status: 'draft',
    duration: '22:15',
    thumbnail: '/api/thumbnails/video2.jpg',
    url: '/api/videos/video2.mp4',
    views: 0,
    uploadDate: null,
    lastUpdated: '2024-01-12T14:20:00Z',
    orderIndex: 2
  },
  {
    id: 3,
    title: 'Разговорная речь: В ресторане',
    description: 'Диалоги и фразы для заказа в итальянском ресторане',
    level: 'A2',
    status: 'scheduled',
    duration: '18:45',
    thumbnail: '/api/thumbnails/video3.jpg',
    url: '/api/videos/video3.mp4',
    views: 0,
    uploadDate: '2024-02-01T09:00:00Z',
    lastUpdated: '2024-01-08T09:15:00Z',
    orderIndex: 3
  }
];

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const statuses = ['draft', 'published', 'scheduled', 'archived'];

export default function AdminVideosPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [videos, setVideos] = useState(mockVideos);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const handleSelectVideo = (videoId: number) => {
    setSelectedVideos(prev => 
      prev.includes(videoId) 
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    );
  };

  const handleBulkAction = (action: string) => {
    console.log(`Bulk action: ${action} on videos:`, selectedVideos);
    // Implement bulk actions
    setSelectedVideos([]);
  };

  const handleDeleteVideo = (videoId: number) => {
    if (window.confirm('Вы уверены, что хотите удалить это видео?')) {
      setVideos(prev => prev.filter(video => video.id !== videoId));
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', label: 'Черновик' },
      published: { color: 'bg-green-100 text-green-800', label: 'Опубликовано' },
      scheduled: { color: 'bg-blue-100 text-blue-800', label: 'Запланировано' },
      archived: { color: 'bg-red-100 text-red-800', label: 'Архивировано' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getLevelBadge = (level: string) => {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
        {level}
      </span>
    );
  };

  const filteredVideos = videos.filter(video => {
    const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         video.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = !selectedLevel || video.level === selectedLevel;
    const matchesStatus = !selectedStatus || video.status === selectedStatus;
    
    return matchesSearch && matchesLevel && matchesStatus;
  });

  const sortedVideos = [...filteredVideos].sort((a, b) => {
    const aValue = a.orderIndex;
    const bValue = b.orderIndex;
    
    return aValue - bValue;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('admin.nav.videos')}
          </h1>
          <p className="text-gray-600">
            Управление видео материалами
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/videos/new')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          Добавить видео
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск по названию или описанию..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <Filter className="w-4 h-4 mr-2" />
              Фильтры
              {showFilters ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
            </button>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Level Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Уровень
                  </label>
                  <select
                    value={selectedLevel}
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Все уровни</option>
                    {levels.map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Статус
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Все статусы</option>
                    {statuses.map(status => (
                      <option key={status} value={status}>
                        {status === 'draft' ? 'Черновик' : 
                         status === 'published' ? 'Опубликовано' :
                         status === 'scheduled' ? 'Запланировано' : 'Архивировано'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedVideos.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-800">
              Выбрано {selectedVideos.length} видео
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => handleBulkAction('publish')}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200"
              >
                Опубликовать
              </button>
              <button
                onClick={() => handleBulkAction('archive')}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded text-red-700 bg-red-100 hover:bg-red-200"
              >
                Архивировать
              </button>
              <button
                onClick={() => setSelectedVideos([])}
                className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
              >
                Отменить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Videos Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedVideos.map((video) => (
          <div key={video.id} className="bg-white rounded-lg shadow overflow-hidden">
            {/* Thumbnail */}
            <div className="relative h-48 bg-gray-200">
              <div className="absolute inset-0 flex items-center justify-center">
                <Video className="w-12 h-12 text-gray-400" />
              </div>
              <div className="absolute top-2 right-2">
                <input
                  type="checkbox"
                  checked={selectedVideos.includes(video.id)}
                  onChange={() => handleSelectVideo(video.id)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                {video.duration}
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-medium text-gray-900 truncate">
                  {video.title}
                </h3>
              </div>
              
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {video.description}
              </p>

              <div className="flex items-center justify-between mb-3">
                <div className="flex space-x-2">
                  {getLevelBadge(video.level)}
                  {getStatusBadge(video.status)}
                </div>
                <div className="text-sm text-gray-500">
                  {video.views} просмотров
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                <span>Загружено: {video.uploadDate ? new Date(video.uploadDate).toLocaleDateString('ru-RU') : 'Не загружено'}</span>
                <span>Порядок: {video.orderIndex}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="flex space-x-2">
                  <button
                    onClick={() => navigate(`/admin/videos/${video.id}`)}
                    className="text-primary-600 hover:text-primary-900"
                    title="Просмотр"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/admin/videos/${video.id}/edit`)}
                    className="text-gray-600 hover:text-gray-900"
                    title="Редактировать"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleBulkAction('duplicate')}
                    className="text-gray-600 hover:text-gray-900"
                    title="Дублировать"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => handleDeleteVideo(video.id)}
                  className="text-red-600 hover:text-red-900"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {sortedVideos.length === 0 && (
        <div className="text-center py-12">
          <Video className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Нет видео</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery || selectedLevel || selectedStatus 
              ? 'Попробуйте изменить фильтры поиска.'
              : 'Начните с загрузки первого видео.'
            }
          </p>
          {!searchQuery && !selectedLevel && !selectedStatus && (
            <div className="mt-6">
              <button
                onClick={() => navigate('/admin/videos/new')}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Загрузить видео
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
