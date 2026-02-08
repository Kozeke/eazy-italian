import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Video,
  ChevronLeft,
  ChevronRight,
  Youtube
} from 'lucide-react';
import { videosApi } from '../../services/api';
import toast from 'react-hot-toast';
import AdminSearchFilters from '../../components/admin/AdminSearchFilters';

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export default function AdminVideosPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOption, setSortOption] = useState<'order_asc' | 'order_desc' | 'date_desc' | 'date_asc'>('order_asc');
  const pageSize = 9;
  
  // Load videos on mount
  useEffect(() => {
    loadVideos();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedLevel, sortOption]);
  
  const loadVideos = async () => {
    try {
      setLoading(true);
      const videosData = await videosApi.getAdminVideos({ limit: 100 });
      setVideos(videosData || []);
      console.log('Loaded videos:', videosData?.length);
      // Debug: Log thumbnail paths
      videosData?.forEach((video: any) => {
        if (video.thumbnail_path) {
          const thumbnailUrl = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'}/static/${video.thumbnail_path}`;
          console.log(`Video ${video.id} thumbnail:`, {
            path: video.thumbnail_path,
            fullUrl: thumbnailUrl
          });
        }
      });
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

  const handleDeleteVideo = async (videoId: number) => {
    if (!window.confirm('Вы уверены, что хотите удалить это видео? Это действие нельзя отменить.')) {
      return;
    }
    
    try {
      await videosApi.deleteVideo(videoId);
      // Remove from local state
      setVideos(prev => prev.filter(video => video.id !== videoId));
      toast.success('Видео успешно удалено');
    } catch (error: any) {
      console.error('Error deleting video:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при удалении видео');
    }
  };

  const filteredVideos = videos.filter(video => {
    const title = (video.title || '').toLowerCase();
    const description = (video.description || '').toLowerCase();
    const query = searchQuery.toLowerCase();

    const matchesSearch = !query || title.includes(query) || description.includes(query);
    const matchesLevel = !selectedLevel || video.level === selectedLevel;
    
    return matchesSearch && matchesLevel;
  });

  const sortedVideos = [...filteredVideos].sort((a, b) => {
    if (sortOption === 'order_asc' || sortOption === 'order_desc') {
      const aValue = a.order_index || a.orderIndex || 0;
      const bValue = b.order_index || b.orderIndex || 0;
      const diff = aValue - bValue;
      return sortOption === 'order_asc' ? diff : -diff;
    }

    const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
    const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
    const diff = aDate - bDate;
    return sortOption === 'date_asc' ? diff : -diff;
  });

  // Calculate pagination
  const totalPages = Math.ceil(sortedVideos.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedVideos = sortedVideos.slice(startIndex, endIndex);
  const showPagination = sortedVideos.length > pageSize;

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
              <Video className="h-6 w-6 text-primary-600" />
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
        <AdminSearchFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Поиск по названию или описанию"
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          filters={
            <>
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

              {/* Sorting */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Сортировка
                </label>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="order_asc">Порядок ↑</option>
                  <option value="order_desc">Порядок ↓</option>
                  <option value="date_desc">Дата обновления ↓</option>
                  <option value="date_asc">Дата обновления ↑</option>
                </select>
              </div>
            </>
          }
        />

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
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedVideos.map((video) => (
              <div
                key={video.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                {/* Thumbnail */}
                <div className="relative h-48 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden group">
                  {video.thumbnail_path ? (
                    <img
                      src={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'}/static/${video.thumbnail_path}?t=${Date.now()}`}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        console.error('Failed to load thumbnail:', {
                          videoId: video.id,
                          thumbnailPath: video.thumbnail_path,
                          triedUrl: (e.target as HTMLImageElement).src
                        });
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                      onLoad={() => {
                        console.log('Thumbnail loaded successfully:', video.id, video.thumbnail_path);
                      }}
                    />
                  ) : video.source_type === 'url' && video.external_url ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600">
                      <Youtube className="w-14 h-14 text-white" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-400 to-blue-600">
                      <Video className="w-12 h-12 text-white/80" />
                    </div>
                  )}

                  {/* Overlay gradient for better text visibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                  {/* Level badge */}
                  <div className="absolute top-3 left-3 z-10">
                    {video.level && (
                      <span className="inline-flex items-center rounded-lg bg-black/80 backdrop-blur-sm px-2.5 py-1 text-xs font-bold text-white shadow-lg">
                        {video.level}
                      </span>
                    )}
                  </div>

                  {/* Checkbox */}
                  <div className="absolute top-3 right-3 z-10">
                    <input
                      type="checkbox"
                      checked={selectedVideos.includes(video.id)}
                      onChange={() => handleSelectVideo(video.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 bg-white/95 shadow-md h-4 w-4"
                    />
                  </div>

                  {/* Duration badge */}
                  {video.duration_sec && (
                    <div className="absolute bottom-3 right-3 z-10 bg-black/90 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-lg shadow-lg">
                      {Math.floor(video.duration_sec / 60)}:
                      {(video.duration_sec % 60).toString().padStart(2, '0')}
                    </div>
                  )}

                  {/* Play icon overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <div className="bg-white/20 backdrop-blur-sm rounded-full p-4">
                      <Video className="w-8 h-8 text-white" />
                    </div>
                  </div>
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
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800">
                        Порядок: {video.order_index ?? 0}
                      </span>
                    </div>
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

          {/* Pagination */}
          {showPagination && (
            <div className="flex items-center justify-between px-4 py-4 bg-white rounded-2xl border border-gray-200">
              <span className="text-sm text-gray-600">
                Показано {startIndex + 1}–{Math.min(endIndex, sortedVideos.length)} из {sortedVideos.length}
              </span>

              <div className="flex items-center space-x-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Назад
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Show first page, last page, current page, and pages around current
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            currentPage === page
                              ? 'bg-primary-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (
                      page === currentPage - 2 ||
                      page === currentPage + 2
                    ) {
                      return (
                        <span key={page} className="px-2 text-gray-500">
                          ...
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Вперед
                  <ChevronRight className="h-4 w-4 ml-1" />
                </button>
              </div>
            </div>
          )}
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-12 px-4 text-center">
            <Video className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-3 text-sm font-medium text-gray-900">
              {searchQuery || selectedLevel
                ? 'Нет результатов'
                : 'Нет видео'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery || selectedLevel
                ? 'Попробуйте изменить параметры поиска или фильтры.'
                : 'Начните с загрузки первого видео-урока.'}
            </p>
            {!searchQuery && !selectedLevel && (
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
