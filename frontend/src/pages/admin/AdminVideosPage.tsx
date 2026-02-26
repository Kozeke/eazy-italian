import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Pencil,
  Trash2,
  Video,
  Search,
  Filter,
  Grid3x3,
  List,
  Folder,
  Eye
} from 'lucide-react';
import { videosApi } from '../../services/api';
import toast from 'react-hot-toast';
import './AdminVideosPage.css';

interface VideoItem {
  id: number;
  title: string;
  description?: string;
  unit_id: number | null;
  unit_title: string | null;
  source_type: string;
  duration_sec?: number;
  status: string;
  publish_at: string | null;
  thumbnail_path?: string;
  is_visible_to_students: boolean;
  order_index: number;
  created_at: string;
  updated_at: string | null;
}

export default function AdminVideosPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedOrder, setSelectedOrder] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortOption, setSortOption] = useState<'updated_at' | 'created_at' | 'title' | 'order'>('updated_at');

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      setLoading(true);
      const videosData = await videosApi.getAdminVideos({ limit: 100 });
      setVideos(videosData || []);
    } catch (error) {
      console.error('Error loading videos:', error);
      toast.error('Ошибка при загрузке видео');
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  // Get unique units for filter
  const uniqueUnits = useMemo(() => {
    const units = new Set<string>();
    videos.forEach(video => {
      if (video.unit_title) {
        units.add(video.unit_title);
      }
    });
    return Array.from(units).sort();
  }, [videos]);

  const handleDeleteVideo = async (videoId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Вы уверены, что хотите удалить это видео? Это действие нельзя отменить.')) {
      return;
    }
    
    try {
      await videosApi.deleteVideo(videoId);
      setVideos(prev => prev.filter(v => v.id !== videoId));
      toast.success('Видео успешно удалено');
    } catch (error: any) {
      console.error('Error deleting video:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при удалении видео');
    }
  };

  // Filter and sort videos
  const filteredAndSortedVideos = useMemo(() => {
    let filtered = videos.filter(video => {
      const matchesSearch = !searchQuery || 
        video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (video.unit_title && video.unit_title.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesUnit = !selectedUnit || video.unit_title === selectedUnit;
      const matchesOrder = !selectedOrder || 
        (selectedOrder === '0' && video.order_index === 0) ||
        (selectedOrder === '1+' && video.order_index > 0);
      
      return matchesSearch && matchesUnit && matchesOrder;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortOption === 'order') {
        return (a.order_index || 0) - (b.order_index || 0);
      } else if (sortOption === 'title') {
        return a.title.localeCompare(b.title);
      } else if (sortOption === 'created_at') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else { // updated_at
        const aDate = new Date(a.updated_at || a.created_at).getTime();
        const bDate = new Date(b.updated_at || b.created_at).getTime();
        return bDate - aDate; // Descending for updated_at
      }
    });

    return filtered;
  }, [videos, searchQuery, selectedUnit, selectedOrder, sortOption]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getThumbnailUrl = (video: VideoItem) => {
    if (video.thumbnail_path) {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
      return `${apiBase}/static/${video.thumbnail_path}`;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="admin-videos-wrapper min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a7070]"></div>
      </div>
    );
  }

  return (
    <div className="admin-videos-wrapper">
      <div className="page-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">
              {t('admin.nav.videos')} <em>/ {filteredAndSortedVideos.length} {filteredAndSortedVideos.length === 1 ? 'видео' : filteredAndSortedVideos.length < 5 ? 'видео' : 'видео'}</em>
            </h1>
            <p className="page-meta">Управляйте видео-уроками и плейлистами — как лекциями в курсах на Udemy/Coursera</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-wrap">
            <Search className="w-4 h-4" />
            <input
              className="search-input"
              type="text"
              placeholder="Поиск по названию…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className="filter-btn"
            onClick={() => setShowFilters(!showFilters)}
            style={{
              background: showFilters ? 'var(--warm)' : '',
              borderColor: showFilters ? 'var(--ink)' : '',
              color: showFilters ? 'var(--ink)' : ''
            }}
          >
            <Filter className="w-3 h-3" />
            Фильтры
          </button>
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Сетка"
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Список"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter panel */}
        <div className={`filter-panel ${showFilters ? 'open' : ''}`}>
          <div className="filter-group">
            <label>Юнит</label>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
            >
              <option value="">Все юниты</option>
              {uniqueUnits.map(unit => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Порядок</label>
            <select
              value={selectedOrder}
              onChange={(e) => setSelectedOrder(e.target.value)}
            >
              <option value="">Любой</option>
              <option value="0">Без порядка (0)</option>
              <option value="1+">Назначен порядок</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Сортировка</label>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
            >
              <option value="updated_at">По дате обновления</option>
              <option value="created_at">По дате создания</option>
              <option value="title">По названию</option>
              <option value="order">По порядку</option>
            </select>
          </div>
        </div>

        {/* Count bar */}
        <div className="count-bar">
          <div className="count-label">
            Показано <span className="count-num">{filteredAndSortedVideos.length}</span> видео
          </div>
        </div>

        {/* Videos grid */}
        {filteredAndSortedVideos.length > 0 ? (
          <div className={`videos-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
            {filteredAndSortedVideos.map((video) => {
              const thumbnailUrl = getThumbnailUrl(video);
              
              return (
                <div
                  key={video.id}
                  className={`video-card ${viewMode === 'list' ? 'list' : ''}`}
                  onClick={() => navigate(`/admin/videos/${video.id}/edit`)}
                >
                  <div className="video-thumb">
                    <div 
                      className="video-thumb-bg"
                      style={thumbnailUrl ? {
                        backgroundImage: `url(${thumbnailUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      } : {}}
                    >
                      {!thumbnailUrl && (
                        <div className="video-thumb-title">{video.title}</div>
                      )}
                    </div>
                    <div className="thumb-order">ПОРЯДОК: {video.order_index || 0}</div>
                    <div className="play-btn" onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Open video preview
                    }}>
                      <svg viewBox="0 0 24 24">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    </div>
                  </div>
                  <div className="video-card-body">
                    <h3 className="video-title">{video.title}</h3>
                    {video.unit_title && (
                      <div className="video-unit-ref">
                        <Folder className="w-3 h-3" />
                        <span>{video.unit_title}</span>
                      </div>
                    )}
                    <div className="video-meta">
                      <div className="meta-item">
                        <div className="meta-label">Порядок</div>
                        <div className="meta-val order">{video.order_index || 0}</div>
                      </div>
                      <div className="meta-item">
                        <div className="meta-label">Создано</div>
                        <div className="meta-val">{formatDate(video.created_at)}</div>
                      </div>
                      <div className="meta-item" style={{gridColumn: '1/-1'}}>
                        <div className="meta-label">Обновлено</div>
                        <div className="meta-val" style={video.updated_at && video.updated_at !== video.created_at ? {color: 'var(--teal)'} : {}}>
                          {formatDate(video.updated_at || video.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="card-actions">
                    <div className="action-group">
                      <button
                        className="icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Open preview
                        }}
                        title="Предпросмотр"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={(e) => handleDeleteVideo(video.id, e)}
                        title="Удалить"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      className="edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/videos/${video.id}/edit`);
                      }}
                    >
                      <Pencil className="w-2.5 h-2.5" />
                      Править
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Video className="w-7 h-7" />
            </div>
            <h3 className="empty-title">
              {searchQuery || selectedUnit || selectedOrder
                ? 'Видео не найдены'
                : 'Нет видео'}
            </h3>
            <p className="empty-sub">
              {searchQuery || selectedUnit || selectedOrder
                ? 'Попробуйте изменить параметры поиска или фильтры'
                : 'Начните с загрузки первого видео-урока'}
            </p>
            {!searchQuery && !selectedUnit && !selectedOrder && (
              <button
                className="edit-btn"
                onClick={() => navigate('/admin/videos/new')}
                style={{marginTop: '1.5rem'}}
              >
                <Plus className="w-3 h-3" />
                Добавить видео
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
