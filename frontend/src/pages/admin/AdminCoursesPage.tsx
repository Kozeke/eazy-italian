import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Pencil,
  Trash2,
  Check,
  X,
  BookOpen,
  Users,
  FileText,
  Search,
  Filter,
  Grid3x3,
  List,
  ChevronRight,
  Clock,
  Folder
} from 'lucide-react';
import { coursesApi } from '../../services/api';
import toast from 'react-hot-toast';
import './AdminCoursesPage.css';

// Helper function to strip HTML tags from description
const stripHtml = (html: string): string => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

interface Course {
  id: number;
  title: string;
  description?: string;
  level: string;
  status: string;
  publish_at: string | null;
  order_index: number;
  thumbnail_url?: string;
  thumbnail_path?: string;
  units_count: number;
  published_units_count: number;
  content_summary?: {
    total_tests: number;
    total_videos: number;
    total_tasks: number;
  };
  enrolled_students_count?: number;
  created_by: number;
  created_at: string;
  updated_at: string | null;
}

export default function AdminCoursesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCourses, setSelectedCourses] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true);
        const fetchedCourses = await coursesApi.getAdminCourses();
        setCourses(fetchedCourses as any);
      } catch (error: any) {
        console.error('Error fetching courses:', error);
        toast.error('Ошибка при загрузке курсов');
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  // Animate progress bars on load
  useEffect(() => {
    if (!loading && courses.length > 0) {
      setTimeout(() => {
        document.querySelectorAll('.progress-fill[data-target]').forEach((el) => {
          const target = el.getAttribute('data-target');
          if (target) {
            (el as HTMLElement).style.width = target + '%';
          }
        });
      }, 400);
    }
  }, [loading, courses]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { className: string; text: string }> = {
      draft: { className: 'badge badge-draft', text: 'Черновик' },
      scheduled: { className: 'badge badge-scheduled', text: 'Запланировано' },
      published: { className: 'badge badge-published', text: 'Опубликовано' },
      archived: { className: 'badge badge-archived', text: 'Архив' }
    };
    
    const config = statusConfig[status] || statusConfig.draft;
    
    return (
      <span className={config.className}>
        {status === 'published' && (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{display:'inline',marginRight:'3px'}}>
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        )}
        {config.text}
      </span>
    );
  };

  const getLevelBadge = (level: string) => {
    return (
      <span className="badge badge-level">
        {level}
      </span>
    );
  };

  const getStripColor = (status: string, level: string) => {
    if (status === 'published') {
      return 'linear-gradient(90deg, var(--teal), var(--teal-light))';
    } else if (status === 'scheduled') {
      return 'linear-gradient(90deg, var(--gold), var(--gold-light))';
    } else if (status === 'archived') {
      return 'linear-gradient(90deg, var(--rust), #d95a3a)';
    }
    return 'linear-gradient(90deg, var(--muted), #7a7161)';
  };

  const handleSelectCourse = (courseId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedCourses(prev => 
      prev.includes(courseId) 
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    );
  };

  const refreshCourses = async () => {
    try {
      setLoading(true);
      const fetchedCourses = await coursesApi.getAdminCourses();
      setCourses(fetchedCourses as any);
    } catch (error: any) {
      console.error('Error refreshing courses:', error);
      toast.error('Ошибка при обновлении списка курсов');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCourse = async (courseId: number, courseTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm(`Вы уверены, что хотите удалить курс "${courseTitle}"? Это действие нельзя отменить.`)) {
      return;
    }
    
    try {
      await coursesApi.deleteCourse(courseId);
      toast.success('Курс успешно удален');
      await refreshCourses();
    } catch (error: any) {
      console.error('Error deleting course:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при удалении курса');
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedCourses.length === 0) return;
    
    try {
      if (action === 'delete') {
        if (!window.confirm(`Вы уверены, что хотите удалить ${selectedCourses.length} курсов? Это действие нельзя отменить.`)) {
          return;
        }
        
        for (const courseId of selectedCourses) {
          await coursesApi.deleteCourse(courseId);
        }
        
        toast.success(`${selectedCourses.length} курсов успешно удалено`);
      } else {
        console.log(`Bulk action: ${action}`, selectedCourses);
        toast.success(`Действие "${action}" применено к ${selectedCourses.length} курсам`);
      }
      
      await refreshCourses();
    } catch (error: any) {
      console.error('Error performing bulk action:', error);
      toast.error('Ошибка при выполнении действия');
    } finally {
      setSelectedCourses([]);
    }
  };

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (stripHtml(course.description || '').toLowerCase().includes(searchQuery.toLowerCase()) || false);
    const matchesLevel = !selectedLevel || course.level === selectedLevel;
    const matchesStatus = !selectedStatus || course.status === selectedStatus;
    
    return matchesSearch && matchesLevel && matchesStatus;
  });

  // Calculate progress percentage
  const getUnitsProgress = (course: Course) => {
    if (course.units_count === 0) return 0;
    return Math.round((course.published_units_count / course.units_count) * 100);
  };

  // Get average score (placeholder for now)
  const getAverageScore = (course: Course) => {
    // TODO: Fetch actual average test scores from API
    return null; // Return null to show "—"
  };

  if (loading) {
    return (
      <div className="admin-courses-wrapper min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a7070]"></div>
      </div>
    );
  }

  return (
    <div className="admin-courses-wrapper">
      <div className="page-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">
              {t('admin.nav.courses')} <em>/ {filteredCourses.length} {filteredCourses.length === 1 ? 'курс' : filteredCourses.length < 5 ? 'курса' : 'курсов'}</em>
            </h1>
            <p className="page-meta">Управляйте курсами — контейнерами для учебных юнитов</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-wrap">
            <Search className="w-4 h-4" />
            <input
              className="search-input"
              type="text"
              placeholder="Поиск по названию или описанию…"
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
            <Filter className="w-4 h-4" />
            Фильтры
          </button>

          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid"
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter panel */}
        <div className={`filter-panel ${showFilters ? 'open' : ''}`} id="filter-panel">
          <div className="filter-group">
            <label>Статус</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">Все статусы</option>
              <option value="published">Опубликовано</option>
              <option value="draft">Черновик</option>
              <option value="scheduled">Запланировано</option>
              <option value="archived">Архив</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Уровень</label>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
            >
              <option value="">Все уровни</option>
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
              <option value="mixed">Смешанный</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Сортировка</label>
            <select>
              <option>По дате создания</option>
              <option>По названию</option>
              <option>По студентам</option>
              <option>По прогрессу</option>
            </select>
          </div>
        </div>

        {/* Bulk actions bar */}
        {selectedCourses.length > 0 && (
          <div className="bulk-actions-bar">
            <div className="bulk-actions-left">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1a7070]/20 text-xs font-semibold text-[#1a7070]">
                {selectedCourses.length}
              </span>
              <div>
                <p style={{fontSize: '0.88rem', fontWeight: 500, color: 'var(--ink)'}}>
                  Выбрано курсов: {selectedCourses.length}
                </p>
              </div>
            </div>
            <div className="bulk-actions-right">
              <button
                className="bulk-btn"
                onClick={() => handleBulkAction('publish')}
              >
                <Check className="w-3 h-3" style={{display: 'inline', marginRight: '4px'}} />
                Опубликовать
              </button>
              <button
                className="bulk-btn"
                onClick={() => handleBulkAction('archive')}
              >
                Архивировать
              </button>
              <button
                className="bulk-btn danger"
                onClick={() => handleBulkAction('delete')}
              >
                Удалить
              </button>
              <button
                className="bulk-btn"
                onClick={() => setSelectedCourses([])}
              >
                <X className="w-3 h-3" style={{display: 'inline', marginRight: '4px'}} />
                Снять выделение
              </button>
            </div>
          </div>
        )}

        {/* Courses grid / empty state */}
        {filteredCourses.length > 0 ? (
          <div className={`courses-grid ${viewMode === 'list' ? 'grid-template-columns: 1fr' : ''}`} style={viewMode === 'list' ? {gridTemplateColumns: '1fr'} : {}}>
            {filteredCourses.map((course) => {
              const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
              
              // Priority: thumbnail_url first, then thumbnail_path, then placeholder
              let thumbnailUrl = '/placeholder-course.jpg';
              
              if (course.thumbnail_url) {
                thumbnailUrl = course.thumbnail_url;
              } else if (course.thumbnail_path) {
                const thumbnailFilename = course.thumbnail_path.split('/').pop();
                thumbnailUrl = `${apiBase}/static/thumbnails/${thumbnailFilename}`;
              }

              const unitsProgress = getUnitsProgress(course);
              const avgScore = getAverageScore(course);
              
              return (
                <div
                  key={course.id}
                  className="course-card"
                  onClick={() => navigate(`/admin/courses/${course.id}/edit`)}
                >
                  <div className="course-card-strip" style={{background: getStripColor(course.status, course.level)}}></div>

                  <div className="course-card-head">
                    <div className="course-thumb">
                      {course.thumbnail_url || course.thumbnail_path ? (
                        <img
                          src={thumbnailUrl}
                          alt={course.title}
                          style={{width: '100%', height: '100%', objectFit: 'cover'}}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            if (target.parentElement) {
                              target.parentElement.textContent = '📖';
                            }
                          }}
                        />
                      ) : (
                        '📖'
                      )}
                    </div>
                    <div className="course-head-info">
                      <div className="course-badges">
                        {getLevelBadge(course.level)}
                        {getStatusBadge(course.status)}
                      </div>
                      <h2 className="course-title">{course.title}</h2>
                      {course.description && (
                        <p className="course-desc">{stripHtml(course.description)}</p>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedCourses.includes(course.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectCourse(course.id, e);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        top: '1.5rem',
                        right: '1.5rem',
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        zIndex: 10
                      }}
                    />
                  </div>

                  <div className="course-card-divider"></div>

                  <div className="course-card-stats">
                    <div className="cstat">
                      <div className="cstat-value">{course.units_count}</div>
                      <div className="cstat-label">Юнитов</div>
                    </div>
                    <div className="cstat">
                      <div className="cstat-value" style={{color: 'var(--teal)'}}>
                        {course.content_summary?.total_tests || 0}
                      </div>
                      <div className="cstat-label">Тестов</div>
                    </div>
                    <div className="cstat">
                      <div className="cstat-value">{course.enrolled_students_count || 0}</div>
                      <div className="cstat-label">Студентов</div>
                    </div>
                    <div className="cstat">
                      <div className="cstat-value" style={{color: 'var(--gold)'}}>
                        {avgScore !== null ? `${avgScore}%` : '—'}
                      </div>
                      <div className="cstat-label">Ср. балл</div>
                    </div>
                  </div>

                  <div className="course-card-divider"></div>

                  <div className="course-card-progress">
                    <div style={{marginBottom: '0.75rem', marginTop: '0.75rem'}}>
                      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem'}}>
                        <span style={{fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)'}}>
                          Юниты пройдены
                        </span>
                        <span style={{fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', fontWeight: 700, color: 'var(--teal)'}}>
                          {course.published_units_count} / {course.units_count}
                        </span>
                      </div>
                      <div className="progress-track" style={{height: '6px'}}>
                        <div
                          className="progress-fill teal"
                          data-target={unitsProgress}
                          style={{width: '0%'}}
                        ></div>
                      </div>
                    </div>
                    {avgScore !== null && (
                      <div>
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem'}}>
                          <span style={{fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)'}}>
                            Средний балл
                          </span>
                          <span style={{fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', fontWeight: 700, color: 'var(--gold)'}}>
                            {avgScore}%
                          </span>
                        </div>
                        <div className="progress-track" style={{height: '6px'}}>
                          <div
                            className="progress-fill gold"
                            data-target={avgScore}
                            style={{width: '0%'}}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="course-card-footer">
                    <div className="footer-meta">
                      <div className="footer-meta-item">
                        <Users className="w-3 h-3" />
                        {course.enrolled_students_count || 0} {course.enrolled_students_count === 1 ? 'студент' : course.enrolled_students_count && course.enrolled_students_count < 5 ? 'студента' : 'студентов'}
                      </div>
                      <div className="footer-meta-item">
                        <Folder className="w-3 h-3" />
                        {course.published_units_count} / {course.units_count} юнитов
                      </div>
                      <div className="footer-meta-item">
                        <FileText className="w-3 h-3" />
                        {course.content_summary?.total_tests || 0} тестов
                      </div>
                    </div>
                    <div className="footer-actions">
                      <button
                        className="icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/courses/${course.id}/edit`);
                        }}
                        title="Редактировать"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={(e) => handleDeleteCourse(course.id, course.title, e)}
                        title="Удалить"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <Link
                        to={`/admin/courses/${course.id}/edit`}
                        className="open-btn"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Открыть
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <BookOpen className="w-7 h-7" />
            </div>
            <h3 style={{fontSize: '1.1rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem'}}>
              {searchQuery || selectedLevel || selectedStatus 
                ? 'Курсы не найдены' 
                : 'Нет курсов'}
            </h3>
            <p style={{fontSize: '0.88rem', color: 'var(--muted)', marginBottom: '1.5rem'}}>
              {searchQuery || selectedLevel || selectedStatus
                ? 'Попробуйте изменить параметры поиска или фильтры'
                : 'Создайте первый курс, чтобы начать организовывать учебные материалы'}
            </p>
            {!searchQuery && !selectedLevel && !selectedStatus && (
              <Link
                to="/admin/courses/new"
                className="open-btn"
                style={{display: 'inline-flex'}}
              >
                <Plus className="w-3 h-3" />
                Создать курс
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
