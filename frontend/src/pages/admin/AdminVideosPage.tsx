import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye, 
  Video,
  ChevronDown,
  ChevronUp,
  Youtube
} from 'lucide-react';
import { videosApi } from '../../services/api';
import toast from 'react-hot-toast';

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const statuses = ['draft', 'published', 'scheduled', 'archived'];

export default function AdminVideosPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Load videos on mount
  useEffect(() => {
    loadVideos();
  }, []);
  
  const loadVideos = async () => {
    try {
      setLoading(true);
      const videosData = await videosApi.getAdminVideos({ limit: 100 });
      setVideos(videosData || []);
      console.log('Loaded videos:', videosData?.length);
    } catch (error) {
      console.error('Error loading videos:', error);
      toast.error('Ошибка при загрузке видео');
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVideo = (videoId: number) => {
    setSelectedVideos(prev => 
      prev.includes(videoId) 
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    );
  };

  const handleBulkAction = (action: string) => {
    if (selectedVideos.length === 0) return;
    console.log(`Bulk action: ${action} on videos:`, selectedVideos);
    // TODO: implement real bulk actions via API
    toast.success(`Действие "${action}" применено к ${selectedVideos.length} видео`);
    setSelectedVideos([]);
  };

  const handleDeleteVideo = (videoId: number) => {
    if (window.confirm('Вы уверены, что хотите удалить это видео?')) {
      // TODO: call API for delete
      setVideos(prev => prev.filter(video => video.id !== videoId));
      toast.success('Видео удалено из списка');
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

  const filteredVideos = videos.filter(video => {
    const title = (video.title || '').toLowerCase();
    const description = (video.description || '').toLowerCase();
    const query = searchQuery.toLowerCase();

    const matchesSearch = !query || title.includes(query) || description.includes(query);
    const matchesLevel = !selectedLevel || video.level === selectedLevel;
    const matchesStatus = !selectedStatus || video.status === selectedStatus;
    
    return matchesSearch && matchesLevel && matchesStatus;
  });

  const sortedVideos = [...filteredVideos].sort((a, b) => {
    const aValue = a.order_index || a.orderIndex || 0;
    const bValue = b.order_index || b.orderIndex || 0;
    return aValue - bValue;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="text-sm text-gray-500">Загрузка видео...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky top bar – Coursera/Udemy style */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                {t('admin.nav.videos') || 'Видео-уроки'}
              </h1>
              {videos.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {videos.length} видео
                </span>
              )}
            </div>
            <p className="mt-1 text-xs md:text-sm text-gray-500">
              Управляйте видео-уроками и плейлистами — как лекциями в курсах на Udemy/Coursera.
            </p>
          </div>

          <button
            onClick={() => navigate('/admin/videos/new')}
            className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Добавить видео
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        {/* Search & filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск по названию или описанию"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 py-2 text-sm leading-5 placeholder-gray-500 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <Filter className="h-4 w-4 mr-2" />
              Фильтры
              {showFilters ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              )}
            </button>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Level */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Уровень
                  </label>
                  <select
                    value={selectedLevel}
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Все уровни</option>
                    {levels.map(level => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Статус
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Все статусы</option>
                    {statuses.map(status => (
                      <option key={status} value={status}>
                        {status === 'draft'
                          ? 'Черновик'
                          : status === 'published'
                          ? 'Опубликовано'
                          : status === 'scheduled'
                          ? 'Запланировано'
                          : 'Архивировано'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bulk actions bar */}
        {selectedVideos.length > 0 && (
          <div className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {selectedVideos.length}
              </span>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Выбрано видео: {selectedVideos.length}
              </p>
              <p className="text-xs text-gray-600">
                Примените массовое действие — как управление лекциями в курсе.
              </p>
            </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleBulkAction('publish')}
                className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium text-white bg-green-600 hover:bg-green-700"
              >
                Опубликовать
              </button>
              <button
                onClick={() => handleBulkAction('archive')}
                className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-700"
              >
                Архивировать
              </button>
              <button
                onClick={() => setSelectedVideos([])}
                className="inline-flex items-center px-3 py-1 rounded-md border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Снять выделение
              </button>
            </div>
          </div>
        )}

        {/* Videos grid / empty state */}
        {sortedVideos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedVideos.map((video) => (
              <div
                key={video.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                {/* Thumbnail */}
                <div className="relative h-44 bg-gray-200">
                  {video.source_type === 'url' && video.external_url ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600">
                      <Youtube className="w-14 h-14 text-white" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Video className="w-10 h-10 text-gray-400" />
                    </div>
                  )}

                  <div className="absolute top-2 left-2">
                    {video.level && (
                      <span className="inline-flex items-center rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
                        {video.level}
                      </span>
                    )}
                  </div>

                  <div className="absolute top-2 right-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedVideos.includes(video.id)}
                      onChange={() => handleSelectVideo(video.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 bg-white/90"
                    />
                  </div>

                  {video.duration_sec && (
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded">
                      {Math.floor(video.duration_sec / 60)}:
                      {(video.duration_sec % 60).toString().padStart(2, '0')}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">
                      {video.title}
                    </h3>
                  </div>

                  {video.description && (
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {video.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {video.unit_title && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-800">
                          {video.unit_title}
                        </span>
                      )}
                      {getStatusBadge(video.status)}
                    </div>
                    <span className="text-gray-500">
                      Порядок: {video.order_index || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>
                      Создано:{' '}
                      {video.created_at
                        ? new Date(video.created_at).toLocaleDateString('ru-RU')
                        : '-'}
                    </span>
                    {video.updated_at && (
                      <span>Обновлено: {new Date(video.updated_at).toLocaleDateString('ru-RU')}</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-2 flex items-center justify-between border-t border-gray-100">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => navigate(`/admin/videos/${video.id}`)}
                        className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        title="Просмотр"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Открыть
                      </button>
                      <button
                        onClick={() => navigate(`/admin/videos/${video.id}/edit`)}
                        className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        title="Редактировать"
                      >
                        <Edit className="w-3.5 h-3.5 mr-1" />
                        Править
                      </button>
                    </div>
                    <button
                      onClick={() => handleDeleteVideo(video.id)}
                      className="inline-flex items-center justify-center rounded-md text-xs font-medium text-red-600 hover:text-red-700"
                      title="Удалить"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-12 px-4 text-center">
            <Video className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-3 text-sm font-medium text-gray-900">
              {searchQuery || selectedLevel || selectedStatus
                ? 'Нет результатов'
                : 'Нет видео'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery || selectedLevel || selectedStatus
                ? 'Попробуйте изменить параметры поиска или фильтры.'
                : 'Начните с загрузки первого видео-урока.'}
            </p>
            {!searchQuery && !selectedLevel && !selectedStatus && (
              <div className="mt-6">
                <button
                  onClick={() => navigate('/admin/videos/new')}
                  className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Загрузить видео
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
