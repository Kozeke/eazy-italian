import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  Plus, 
  Pencil,
  Trash2,
  Eye, 
  Search,
  Filter,
  Folder,
  BookOpen,
  Headphones,
  CheckCircle2,
  ArrowRight,
  List
} from 'lucide-react';
import { Task } from '../../types';
import { tasksApi } from '../../services/api';
import './AdminTasksPage.css';

type ReviewStatus = 'all' | 'graded' | 'ungraded' | 'nosub';

export default function AdminTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedCheck, setSelectedCheck] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewStatus>('all');
  const [sortField, setSortField] = useState<'deadline' | 'title'>('deadline');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Load tasks
  useEffect(() => {
    const loadTasks = async () => {
      setIsLoading(true);
      try {
        const params: any = {
          search: searchQuery || undefined,
          unit_id: selectedUnit || undefined,
          type: selectedType || undefined,
          status: selectedStatus || undefined,
          skip: 0,
          limit: 100
        };
        
        const tasksData = await tasksApi.getAdminTasks(params);
        setTasks(tasksData);
      } catch (error) {
        console.error('Failed to load tasks:', error);
        toast.error('Ошибка при загрузке заданий');
      } finally {
        setIsLoading(false);
      }
    };

    loadTasks();
  }, [searchQuery, selectedUnit, selectedType, selectedStatus]);

  // Get unique units for filter
  const uniqueUnits = useMemo(() => {
    const units = new Set<string>();
    tasks.forEach(task => {
      if (task.unit_title) {
        units.add(task.unit_title);
      }
    });
    return Array.from(units).sort();
  }, [tasks]);

  const handleDeleteTask = async (taskId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Вы уверены, что хотите удалить это задание?')) {
      return;
    }
    
    try {
      await tasksApi.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      toast.success('Задание удалено');
    } catch (error) {
      console.error('Failed to delete task:', error);
      toast.error('Ошибка при удалении задания');
    }
  };

  // Determine review status for a task
  const getReviewStatus = (task: Task): 'all-graded' | 'needs-grade' | 'no-sub' => {
    if (!task.submission_stats) return 'no-sub';
    const submitted = task.submission_stats.submitted || 0;
    const graded = task.submission_stats.graded || 0;
    
    if (submitted === 0) return 'no-sub';
    if (submitted === graded) return 'all-graded';
    return 'needs-grade';
  };

  // Filter and sort tasks
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      const matchesSearch = !searchQuery || 
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.unit_title && task.unit_title.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesUnit = !selectedUnit || task.unit_title === selectedUnit;
      const matchesType = !selectedType || task.type === selectedType;
      const matchesCheck = !selectedCheck || 
        (selectedCheck === 'manual' && (task.type === 'writing' || (task.auto_check_config?.grading_type || 'manual') === 'manual')) ||
        (selectedCheck === 'auto' && (task.auto_check_config?.grading_type || 'manual') === 'automatic');
      const matchesStatus = !selectedStatus || task.status === selectedStatus;
      
      // Review filter
      const reviewStatus = getReviewStatus(task);
      const matchesReview = reviewFilter === 'all' ||
        (reviewFilter === 'graded' && reviewStatus === 'all-graded') ||
        (reviewFilter === 'ungraded' && reviewStatus === 'needs-grade') ||
        (reviewFilter === 'nosub' && reviewStatus === 'no-sub');
      
      return matchesSearch && matchesUnit && matchesType && matchesCheck && matchesStatus && matchesReview;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortField === 'deadline') {
        const aDate = a.due_at ? new Date(a.due_at).getTime() : 0;
        const bDate = b.due_at ? new Date(b.due_at).getTime() : 0;
        return sortDirection === 'desc' ? bDate - aDate : aDate - bDate;
      } else { // title
        return sortDirection === 'desc' 
          ? b.title.localeCompare(a.title)
          : a.title.localeCompare(b.title);
      }
    });

    return filtered;
  }, [tasks, searchQuery, selectedUnit, selectedType, selectedCheck, selectedStatus, reviewFilter, sortField, sortDirection]);

  const getTypeBadgeClass = (type: string): string => {
    if (type === 'reading') return 'type-badge type-reading';
    if (type === 'listening') return 'type-badge type-audio';
    return 'type-badge type-reading'; // Default to reading style
  };

  const getTypeIcon = (type: string) => {
    if (type === 'reading') return <BookOpen className="w-3 h-3" />;
    if (type === 'listening') return <Headphones className="w-3 h-3" />;
    return <BookOpen className="w-3 h-3" />;
  };

  const getTypeLabel = (type: string): string => {
    if (type === 'reading') return 'Чтение';
    if (type === 'listening') return 'Аудирование';
    if (type === 'writing') return 'Чтение'; // Using reading style for writing
    return type;
  };

  const getGradingTypeBadge = (task: Task) => {
    if (task.type === 'writing') {
      return <span className="type-badge type-manual">Ручная</span>;
    }
    
    const autoCheckConfig = task.auto_check_config || {};
    const gradingType = autoCheckConfig.grading_type || 
      (task.questions && task.questions.length > 0 ? 'automatic' : 'manual');
    
    if (gradingType === 'automatic') {
      return <span className="type-badge type-auto">Авто</span>;
    } else {
      return <span className="type-badge type-manual">Ручная</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'published') {
      return (
        <span className="status-badge status-pub">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Опубл.
        </span>
      );
    } else {
      return (
        <span className="status-badge status-draft">
          Черновик
        </span>
      );
    }
  };

  const getScoreClass = (score: number | undefined): string => {
    if (!score) return 'score-none';
    if (score >= 80) return 'score-good';
    if (score >= 50) return 'score-mid';
    return 'score-bad';
  };

  const formatDeadline = (dueAt: string | undefined): { text: string; class: string } => {
    if (!dueAt) {
      return { text: 'Не установлен', class: 'deadline-cell none' };
    }
    
    const dueDate = new Date(dueAt);
    const now = new Date();
    const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { text: dueDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }), class: 'deadline-cell past' };
    } else if (diffDays <= 3) {
      return { text: dueDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }), class: 'deadline-cell soon' };
    } else {
      return { text: dueDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }), class: 'deadline-cell normal' };
    }
  };

  if (isLoading) {
    return (
      <div className="admin-tasks-wrapper min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a7070]"></div>
      </div>
    );
  }

  return (
    <div className="admin-tasks-wrapper">
      <div className="page-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">
              Задания <em>/ {filteredAndSortedTasks.length} {filteredAndSortedTasks.length === 1 ? 'задание' : filteredAndSortedTasks.length < 5 ? 'задания' : 'заданий'}</em>
            </h1>
            <p className="page-meta">Управление заданиями — отслеживайте сдачи, оценки и дедлайны</p>
          </div>
        </div>

        {/* Status legend */}
        <div className="status-legend">
          <div 
            className={`legend-chip ${reviewFilter === 'all' ? 'active-filter' : ''}`}
            onClick={() => setReviewFilter('all')}
          >
            <List className="w-3 h-3" />
            Все задания
          </div>
          <div 
            className={`legend-chip ${reviewFilter === 'graded' ? 'active-filter' : ''}`}
            onClick={() => setReviewFilter('graded')}
          >
            <div className="chip-dot" style={{background: 'var(--teal)'}}></div>
            Все сдачи оценены
          </div>
          <div 
            className={`legend-chip ${reviewFilter === 'ungraded' ? 'active-filter' : ''}`}
            onClick={() => setReviewFilter('ungraded')}
          >
            <div className="chip-dot" style={{background: 'var(--rust)'}}></div>
            Есть неоценённые
          </div>
          <div 
            className={`legend-chip ${reviewFilter === 'nosub' ? 'active-filter' : ''}`}
            onClick={() => setReviewFilter('nosub')}
          >
            <div className="chip-dot" style={{background: 'var(--muted)', opacity: 0.4}}></div>
            Нет сдач
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
            className={`filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-3 h-3" />
            Фильтры
          </button>
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
            <label>Тип задания</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="">Любой тип</option>
              <option value="reading">Чтение</option>
              <option value="listening">Аудирование</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Проверка</label>
            <select
              value={selectedCheck}
              onChange={(e) => setSelectedCheck(e.target.value)}
            >
              <option value="">Любая</option>
              <option value="manual">Ручная</option>
              <option value="auto">Автоматическая</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Статус</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">Все</option>
              <option value="published">Опубликован</option>
              <option value="draft">Черновик</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table className="tasks-table">
            <thead>
              <tr>
                <th style={{width: '3px', padding: 0}}></th>
                <th style={{width: '22%'}}>
                  Название <span className="sort-arrow">↕</span>
                </th>
                <th style={{width: '18%'}}>Юнит</th>
                <th style={{width: '14%'}}>Тип задания</th>
                <th style={{width: '13%'}}>Проверка</th>
                <th style={{width: '5%', textAlign: 'center'}}>Порядок</th>
                <th style={{width: '8%'}}>Статус</th>
                <th style={{width: '14%'}}>Статистика</th>
                <th 
                  style={{width: '10%'}}
                  onClick={() => {
                    if (sortField === 'deadline') {
                      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                    } else {
                      setSortField('deadline');
                      setSortDirection('desc');
                    }
                  }}
                >
                  Дедлайн <span className={`sort-arrow ${sortField === 'deadline' ? 'sorted' : ''}`}>
                    {sortField === 'deadline' ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}
                  </span>
                </th>
                <th style={{width: '13%', textAlign: 'right'}}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedTasks.map((task) => {
                const reviewStatus = getReviewStatus(task);
                const stats = task.submission_stats || { submitted: 0, graded: 0 };
                const avgScore = task.average_score;
                const deadline = formatDeadline(task.due_at);
                
                return (
                  <tr key={task.id}>
                    <td className="review-indicator">
                      <span className={`review-bar ${reviewStatus}`}></span>
                    </td>
                    <td>
                      <div className="task-name-cell">
                        <div className="task-title">{task.title}</div>
                        <div className="task-sub">
                          <span>Порядок: {task.order_index || 0}</span>
                          <span>{task.max_score || 100} баллов</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="unit-cell">
                        <Folder className="w-3 h-3" />
                        <span className="unit-name">{task.unit_title || 'Без юнита'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="type-wrap">
                        <span className={getTypeBadgeClass(task.type)}>
                          {getTypeIcon(task.type)}
                          {getTypeLabel(task.type)}
                        </span>
                      </div>
                    </td>
                    <td>
                      {getGradingTypeBadge(task)}
                    </td>
                    <td className={`order-cell ${task.order_index && task.order_index > 0 ? 'has-order' : 'no-order'}`}>
                      {task.order_index || 0}
                    </td>
                    <td>
                      {getStatusBadge(task.status)}
                    </td>
                    <td className="stats-cell">
                      {stats.submitted > 0 ? (
                        <>
                          <div className="stat-line">
                            <div className={`stat-dot ${stats.submitted > 0 ? 'amber' : 'grey'}`}></div>
                            <div className="stat-text">
                              <strong>{stats.submitted}</strong> {stats.submitted === 1 ? 'сдача' : stats.submitted < 5 ? 'сдачи' : 'сдач'}
                            </div>
                          </div>
                          <div className="stat-line">
                            <div className={`stat-dot ${stats.graded === stats.submitted ? 'green' : 'warn'}`}></div>
                            <div className="stat-text" style={stats.graded < stats.submitted ? {color: 'var(--rust)'} : {}}>
                              <strong>{stats.graded}</strong> оценено
                            </div>
                          </div>
                          {avgScore !== undefined ? (
                            <div className="stat-avg">
                              <div className={`stat-avg-val ${getScoreClass(avgScore)}`}>
                                {Math.round(avgScore)}%
                              </div>
                              <div className="stat-avg-lbl">Средний балл</div>
                              <div className="mini-bar">
                                <div 
                                  className="mini-bar-fill" 
                                  style={{
                                    width: `${Math.round(avgScore)}%`,
                                    background: avgScore >= 80 ? 'var(--teal)' : avgScore >= 50 ? 'var(--gold)' : 'var(--rust)'
                                  }}
                                ></div>
                              </div>
                            </div>
                          ) : (
                            <div className="stat-avg">
                              <div className="stat-avg-val score-none">—</div>
                              <div className="stat-avg-lbl">Нет данных</div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="stat-line">
                            <div className="stat-dot grey"></div>
                            <div className="stat-text">0 сдач</div>
                          </div>
                          <div className="stat-line">
                            <div className="stat-dot grey"></div>
                            <div className="stat-text">0 оценено</div>
                          </div>
                        </>
                      )}
                    </td>
                    <td>
                      <div className={deadline.class}>{deadline.text}</div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/tasks/${task.id}`);
                          }}
                          title="Просмотр сдач"
                          style={reviewStatus === 'needs-grade' ? {borderColor: 'var(--rust)', color: 'var(--rust)'} : {}}
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/tasks/${task.id}/edit`);
                          }}
                          title="Редактировать"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={(e) => handleDeleteTask(task.id, e)}
                          title="Удалить"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <button
                          className="open-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/tasks/${task.id}`);
                          }}
                        >
                          Открыть <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="table-footer">
            <div className="table-footer-count">
              Показано <span>{filteredAndSortedTasks.length}</span> из {filteredAndSortedTasks.length} заданий
            </div>
            <div className="page-btns">
              <button className="page-btn active">1</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
