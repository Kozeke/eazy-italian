import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Pencil,
  Trash2,
  Search,
  Filter,
  Folder,
  Video,
  FileText,
  Users,
  ChevronRight,
  CheckSquare
} from 'lucide-react';
import { unitsApi } from '../../services/api';
import toast from 'react-hot-toast';
import './AdminUnitsPage.css';

interface Unit {
  id: number;
  title: string;
  level: string;
  status: string;
  publish_at: string | null;
  order_index: number;
  created_by: number;
  created_at: string;
  updated_at: string | null;
  course_id: number | null;
  course_title: string | null;
  content_count: {
    videos: number;
    tasks: number;
    tests: number;
    published_videos: number;
    published_tasks: number;
    published_tests: number;
  };
}

export default function AdminUnitsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<'order' | 'created_at'>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        setLoading(true);
        const fetchedUnits = await unitsApi.getAdminUnits();
        setUnits(fetchedUnits as any);
      } catch (error: any) {
        console.error('Error fetching units:', error);
        toast.error('Ошибка при загрузке юнитов');
        setUnits([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUnits();
  }, []);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalUnits = units.length;
    const totalVideos = units.reduce((sum, unit) => sum + (unit.content_count?.videos || 0), 0);
    const totalTests = units.reduce((sum, unit) => sum + (unit.content_count?.tests || 0), 0);
    const totalStudents = 2; // TODO: Get from API
    
    return { totalUnits, totalVideos, totalTests, totalStudents };
  }, [units]);

  // Get unique courses for filter
  const uniqueCourses = useMemo(() => {
    const courses = new Set<string>();
    units.forEach(unit => {
      if (unit.course_title) {
        courses.add(unit.course_title);
      }
    });
    return Array.from(courses).sort();
  }, [units]);

  // Group units by course
  const groupedUnits = useMemo(() => {
    const groups: Record<string, Unit[]> = {};
    units.forEach(unit => {
      const courseKey = unit.course_title || 'Без курса';
      if (!groups[courseKey]) {
        groups[courseKey] = [];
      }
      groups[courseKey].push(unit);
    });
    return groups;
  }, [units]);

  const getStatusBadge = (status: string) => {
    if (status === 'published') {
      return (
        <span className="badge badge-published">
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Опубл.
        </span>
      );
    } else if (status === 'draft') {
      return <span className="badge badge-draft">Черновик</span>;
    } else if (status === 'scheduled') {
      return <span className="badge badge-published">Запланировано</span>;
    }
    return <span className="badge badge-draft">{status}</span>;
  };

  const getLevelBadge = (level: string) => {
    if (level === 'A1') {
      return <span className="badge badge-a1">A1</span>;
    } else if (level === 'A2') {
      return <span className="badge badge-a2">A2</span>;
    }
    return <span className="badge badge-a1">{level}</span>;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const handleDeleteUnit = async (unitId: number, unitTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Вы уверены, что хотите удалить юнит "${unitTitle}"? Это действие нельзя отменить.`)) {
      return;
    }
    
    try {
      await unitsApi.deleteUnit(unitId);
      toast.success('Юнит успешно удален');
      const fetchedUnits = await unitsApi.getAdminUnits();
      setUnits(fetchedUnits as any);
    } catch (error: any) {
      console.error('Error deleting unit:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при удалении юнита');
    }
  };

  // Filter and sort units
  const filteredAndSortedUnits = useMemo(() => {
    let filtered = units.filter(unit => {
      const matchesSearch = !searchQuery || 
        unit.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (unit.course_title && unit.course_title.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesLevel = !selectedLevel || unit.level === selectedLevel;
      const matchesStatus = !selectedStatus || unit.status === selectedStatus;
      const matchesCourse = !selectedCourse || unit.course_title === selectedCourse;
      
      return matchesSearch && matchesLevel && matchesStatus && matchesCourse;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortField === 'order') {
        const diff = a.order_index - b.order_index;
        return sortDirection === 'asc' ? diff : -diff;
      } else if (sortField === 'created_at') {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        const diff = dateA - dateB;
        return sortDirection === 'asc' ? diff : -diff;
      }
      return 0;
    });

    return filtered;
  }, [units, searchQuery, selectedLevel, selectedStatus, selectedCourse, sortField, sortDirection]);

  // Group filtered units by course
  const filteredGroupedUnits = useMemo(() => {
    const groups: Record<string, Unit[]> = {};
    filteredAndSortedUnits.forEach(unit => {
      const courseKey = unit.course_title || 'Без курса';
      if (!groups[courseKey]) {
        groups[courseKey] = [];
      }
      groups[courseKey].push(unit);
    });
    return groups;
  }, [filteredAndSortedUnits]);

  if (loading) {
    return (
      <div className="admin-units-wrapper min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a7070]"></div>
      </div>
    );
  }

  return (
    <div className="admin-units-wrapper">
      <div className="page-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">
              {t('admin.nav.units')} <em>/ {filteredAndSortedUnits.length} {filteredAndSortedUnits.length === 1 ? 'юнит' : filteredAndSortedUnits.length < 5 ? 'юнита' : 'юнитов'}</em>
            </h1>
            <p className="page-meta">Управляйте учебными юнитами — как списком курсов на Udemy/Coursera</p>
          </div>
        </div>

        {/* Summary chips */}
        <div className="summary-bar">
          <div className="summary-chip">
            <div className="summary-chip-icon">
              <Folder className="w-3 h-3" />
            </div>
            <div>
              <div className="summary-chip-val">{summaryStats.totalUnits}</div>
              <div className="summary-chip-lbl">Юнитов</div>
            </div>
          </div>
          <div className="summary-chip">
            <div className="summary-chip-icon" style={{background: 'rgba(201,150,42,0.1)'}}>
              <Video className="w-3 h-3" style={{stroke: 'var(--gold)'}} />
            </div>
            <div>
              <div className="summary-chip-val" style={{color: 'var(--gold)'}}>{summaryStats.totalVideos}</div>
              <div className="summary-chip-lbl">Видео</div>
            </div>
          </div>
          <div className="summary-chip">
            <div className="summary-chip-icon" style={{background: 'rgba(201,74,42,0.08)'}}>
              <FileText className="w-3 h-3" style={{stroke: 'var(--rust)'}} />
            </div>
            <div>
              <div className="summary-chip-val" style={{color: 'var(--rust)'}}>{summaryStats.totalTests}</div>
              <div className="summary-chip-lbl">Тестов</div>
            </div>
          </div>
          <div className="summary-chip">
            <div className="summary-chip-icon">
              <Users className="w-3 h-3" />
            </div>
            <div>
              <div className="summary-chip-val">{summaryStats.totalStudents}</div>
              <div className="summary-chip-lbl">Студентов</div>
            </div>
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
            <Filter className="w-3 h-3" />
            Фильтры
          </button>
        </div>

        {/* Filter panel */}
        <div className={`filter-panel ${showFilters ? 'open' : ''}`}>
          <div className="filter-group">
            <label>Курс</label>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
            >
              <option value="">Все курсы</option>
              {uniqueCourses.map(course => (
                <option key={course} value={course}>{course}</option>
              ))}
            </select>
          </div>
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
            </select>
          </div>
          <div className="filter-group">
            <label>Сортировка</label>
            <select
              value={`${sortField}_${sortDirection}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split('_');
                setSortField(field as 'order' | 'created_at');
                setSortDirection(dir as 'asc' | 'desc');
              }}
            >
              <option value="created_at_desc">По дате создания</option>
              <option value="order_asc">По порядку</option>
              <option value="order_desc">По порядку (обратно)</option>
            </select>
          </div>
        </div>

        {/* Table */}
        {filteredAndSortedUnits.length > 0 ? (
          <div className="table-wrap">
            <table className="units-table">
              <thead>
                <tr>
                  <th style={{width: '34%'}}>
                    Название юнита{' '}
                    <span className="sort-arrow">↕</span>
                  </th>
                  <th style={{width: '8%'}}>Уровень</th>
                  <th style={{width: '10%'}}>Статус</th>
                  <th style={{width: '6%', textAlign: 'center'}}>Порядок</th>
                  <th style={{width: '18%'}}>Контент</th>
                  <th 
                    style={{width: '9%', cursor: 'pointer'}}
                    onClick={() => {
                      if (sortField === 'created_at') {
                        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('created_at');
                        setSortDirection('desc');
                      }
                    }}
                  >
                    Создано{' '}
                    <span className={`sort-arrow ${sortField === 'created_at' ? 'sorted' : ''}`}>
                      {sortField === 'created_at' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                  <th style={{width: '15%', textAlign: 'right'}}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(filteredGroupedUnits).map(([courseTitle, courseUnits]) => (
                  <>
                    {/* Group row */}
                    <tr key={`group-${courseTitle}`} className="group-row">
                      <td colSpan={7}>
                        <div className="group-label">
                          <div className="group-dot" style={{background: 'var(--teal)'}}></div>
                          <span className="group-name">{courseTitle}</span>
                          <span className="group-count">{courseUnits.length} юнитов</span>
                        </div>
                      </td>
                    </tr>
                    {/* Data rows */}
                    {courseUnits.map((unit) => (
                      <tr
                        key={unit.id}
                        className="data-row"
                        onClick={() => navigate(`/admin/units/${unit.id}/edit`)}
                      >
                        <td>
                          <div className="unit-name-cell">
                            <div className={`unit-order-badge ${unit.order_index === 1 ? 'first' : ''}`}>
                              {unit.order_index || 0}
                            </div>
                            <div className="unit-name-info">
                              <div className="unit-title">{unit.title}</div>
                              <div className="unit-course-ref">{unit.course_title || 'Без курса'}</div>
                            </div>
                          </div>
                        </td>
                        <td>{getLevelBadge(unit.level)}</td>
                        <td>{getStatusBadge(unit.status)}</td>
                        <td style={{textAlign: 'center'}}>
                          <span style={{fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', fontWeight: 700, color: unit.order_index === 1 ? 'var(--teal)' : 'var(--muted)'}}>
                            {unit.order_index || 0}
                          </span>
                        </td>
                        <td>
                          <div className="content-chips">
                            {unit.content_count?.videos > 0 && (
                              <span className="content-chip video">
                                <Video className="w-2.5 h-2.5" />
                                {unit.content_count.videos} {unit.content_count.videos === 1 ? 'видео' : 'видео'}
                              </span>
                            )}
                            {unit.content_count?.tasks > 0 && (
                              <span className="content-chip task">
                                <CheckSquare className="w-2.5 h-2.5" />
                                {unit.content_count.tasks} {unit.content_count.tasks === 1 ? 'задание' : unit.content_count.tasks < 5 ? 'задания' : 'заданий'}
                              </span>
                            )}
                            {unit.content_count?.tests > 0 && (
                              <span className="content-chip test">
                                <FileText className="w-2.5 h-2.5" />
                                {unit.content_count.tests} {unit.content_count.tests === 1 ? 'тест' : unit.content_count.tests < 5 ? 'теста' : 'тестов'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="date-cell">{formatDate(unit.created_at)}</div>
                        </td>
                        <td>
                          <div className="row-actions" style={{justifyContent: 'flex-end'}}>
                            <button
                              className="icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/units/${unit.id}/edit`);
                              }}
                              title="Редактировать"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              className="icon-btn danger"
                              onClick={(e) => handleDeleteUnit(unit.id, unit.title, e)}
                              title="Удалить"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <Link
                              to={`/admin/units/${unit.id}/edit`}
                              className="open-btn"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Открыть{' '}
                              <ChevronRight className="w-2.5 h-2.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>

            {/* Table footer */}
            <div className="table-footer">
              <div className="table-footer-count">
                Показано {filteredAndSortedUnits.length} из {units.length} юнитов
              </div>
              <div className="table-footer-nav">
                <button className="page-btn active">1</button>
                {/* TODO: Add pagination logic */}
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Folder className="w-7 h-7" />
            </div>
            <h3 style={{fontSize: '1.1rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem'}}>
              {searchQuery || selectedLevel || selectedStatus || selectedCourse
                ? 'Юниты не найдены'
                : 'Нет юнитов'}
            </h3>
            <p style={{fontSize: '0.88rem', color: 'var(--muted)', marginBottom: '1.5rem'}}>
              {searchQuery || selectedLevel || selectedStatus || selectedCourse
                ? 'Попробуйте изменить параметры поиска или фильтры'
                : 'Создайте первый юнит, чтобы начать организовывать учебные материалы'}
            </p>
            {!searchQuery && !selectedLevel && !selectedStatus && !selectedCourse && (
              <Link
                to="/admin/units/new"
                className="open-btn"
                style={{display: 'inline-flex'}}
              >
                <Plus className="w-3 h-3" />
                Создать юнит
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
