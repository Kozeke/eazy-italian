import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { gradesApi } from '../../services/api';
import { 
  Eye, 
  Search,
  Filter,
  BarChart3,
  XCircle,
  CheckCircle2,
  Heart,
  Users,
  FileText,
  ClipboardList,
  ArrowRight,
  RotateCcw,
  Pencil,
  ChevronRight
} from 'lucide-react';
import './AdminGradesPage.css';

type GradeRow = {
  attempt_id: number;
  task_id?: number;
  student_id?: number;
  student: string;
  student_first_name?: string;
  student_last_name?: string;
  course: string;
  unit: string;
  test: string;
  score: number;
  passing_score: number;
  max_score?: number;
  passed: boolean;
  status: string;
  submitted_at: string;
  type?: 'test' | 'task';
  questions_count?: number;
  grading_type?: 'auto' | 'manual';
};

export default function AdminGradesPage() {
  const navigate = useNavigate();
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [allGrades, setAllGrades] = useState<GradeRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [resultFilter, setResultFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'test' | 'task'>('all');

  useEffect(() => {
    gradesApi.getGrades({
      page: 1,
      page_size: 1000,
      sort_by: 'submitted_at',
      sort_dir: sortDir,
    }).then((res) => {
      const mapped = res.items.map((item: any) => ({
        ...item,
        student: item.student || `${item.student_first_name || ''} ${item.student_last_name || ''}`.trim(),
        type: item.task_id ? 'task' : 'test',
      }));
      setAllGrades(mapped);
      setTotal(res.total);
    }).catch(console.error);
  }, [sortDir]);

  // Get unique values for filters
  const uniqueStudents = useMemo(() => {
    const students = new Set<string>();
    allGrades.forEach(g => {
      if (g.student) students.add(g.student);
    });
    return Array.from(students).sort();
  }, [allGrades]);

  const uniqueUnits = useMemo(() => {
    const units = new Set<string>();
    allGrades.forEach(g => {
      if (g.unit) units.add(g.unit);
    });
    return Array.from(units).sort();
  }, [allGrades]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const total = allGrades.length;
    const failed = allGrades.filter(g => !g.passed).length;
    const passed = allGrades.filter(g => g.passed).length;
    const avgScore = total > 0 
      ? allGrades.reduce((sum, g) => {
          const max = g.max_score || g.passing_score || 100;
          const score = g.score ?? 0;
          const percent = max > 0 ? (score / max) * 100 : 0;
          return sum + percent;
        }, 0) / total
      : 0;
    const uniqueStudents = new Set(allGrades.map(g => g.student_id || g.student)).size;

    return { total, failed, passed, avgScore, uniqueStudents };
  }, [allGrades]);

  // Filter and paginate grades
  const filteredAndPaginatedGrades = useMemo(() => {
    let filtered = allGrades.filter(g => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        g.student.toLowerCase().includes(searchLower) ||
        g.course.toLowerCase().includes(searchLower) ||
        g.unit.toLowerCase().includes(searchLower) ||
        g.test.toLowerCase().includes(searchLower);
      const matchesStudent = !selectedStudent || g.student === selectedStudent;
      const matchesType = (!selectedType || g.type === selectedType) &&
                          (typeFilter === 'all' || g.type === typeFilter);
      const matchesUnit = !selectedUnit || g.unit === selectedUnit;
      const matchesResult = resultFilter === 'all' || 
        (resultFilter === 'passed' && g.passed) ||
        (resultFilter === 'failed' && !g.passed);
      
      return matchesSearch && matchesStudent && matchesType && matchesUnit && matchesResult;
    });

    setTotal(filtered.length);
    const startIndex = (page - 1) * pageSize;
    return filtered.slice(startIndex, startIndex + pageSize);
  }, [allGrades, searchQuery, selectedStudent, selectedType, selectedUnit, resultFilter, typeFilter, page]);

  useEffect(() => {
    setGrades(filteredAndPaginatedGrades);
  }, [filteredAndPaginatedGrades]);

  const getInitials = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (id: number | string | undefined): string => {
    const colors = ['var(--teal)', 'var(--gold)', 'var(--rust)', '#3a6080', '#4a80a0'];
    const numId = typeof id === 'number' ? id : (id ? id.toString().charCodeAt(0) : 0);
    return colors[numId % colors.length];
  };

  const getScoreClass = (score: number, max: number, passing: number): 'passed' | 'failed' | 'near' | 'zero' => {
    if (score === 0) return 'zero';
    const percent = (score / max) * 100;
    if (percent >= passing) return 'passed';
    if (percent >= passing - 5) return 'near';
    return 'failed';
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  // Animate score bars on mount
  useEffect(() => {
    if (grades.length > 0) {
      setTimeout(() => {
        const fills = document.querySelectorAll('.score-fill[data-target]');
        fills.forEach((el) => {
          const target = (el as HTMLElement).getAttribute('data-target');
          if (target) {
            (el as HTMLElement).style.width = target + '%';
          }
        });
      }, 400);
    }
  }, [grades]);

  return (
    <div className="admin-grades-wrapper">
      <div className="page-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">
              Оценки <em>/ {total} {total === 1 ? 'запись' : total < 5 ? 'записи' : 'записей'}</em>
            </h1>
            <p className="page-meta">Просматривайте результаты тестов и заданий, оценки студентов</p>
          </div>
        </div>

        {/* Summary chips */}
        <div className="summary-bar">
          <div className="summary-chip">
            <div className="summary-chip-icon" style={{background: 'var(--teal-dim)'}}>
              <BarChart3 className="w-4 h-4" style={{stroke: 'var(--teal)'}} />
            </div>
            <div>
              <div className="summary-chip-val">{summaryStats.total}</div>
              <div className="summary-chip-lbl">Оценок всего</div>
            </div>
          </div>
          <div className="summary-chip">
            <div className="summary-chip-icon" style={{background: 'rgba(201,74,42,0.08)'}}>
              <XCircle className="w-4 h-4" style={{stroke: 'var(--rust)'}} />
            </div>
            <div>
              <div className="summary-chip-val" style={{color: 'var(--rust)'}}>{summaryStats.failed}</div>
              <div className="summary-chip-lbl">Failed</div>
            </div>
          </div>
          <div className="summary-chip">
            <div className="summary-chip-icon" style={{background: 'var(--teal-dim)'}}>
              <CheckCircle2 className="w-4 h-4" style={{stroke: 'var(--teal)'}} />
            </div>
            <div>
              <div className="summary-chip-val" style={{color: 'var(--teal)'}}>{summaryStats.passed}</div>
              <div className="summary-chip-lbl">Passed</div>
            </div>
          </div>
          <div className="summary-chip">
            <div className="summary-chip-icon" style={{background: 'rgba(201,150,42,0.1)'}}>
              <Heart className="w-4 h-4" style={{stroke: 'var(--gold)'}} />
            </div>
            <div>
              <div className="summary-chip-val" style={{color: 'var(--gold)'}}>
                {Math.round(summaryStats.avgScore)}%
              </div>
              <div className="summary-chip-lbl">Ср. балл</div>
            </div>
          </div>
          <div className="summary-chip">
            <div className="summary-chip-icon" style={{background: 'rgba(201,150,42,0.1)'}}>
              <Users className="w-4 h-4" style={{stroke: 'var(--gold)'}} />
            </div>
            <div>
              <div className="summary-chip-val">{summaryStats.uniqueStudents}</div>
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
              placeholder="Поиск по студенту или тесту…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button
            className={`filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-3 h-3" />
            Фильтры
          </button>
          <div className="result-filters">
            <div
              className={`result-chip ${resultFilter === 'all' ? 'active' : ''}`}
              onClick={() => {
                setResultFilter('all');
                setPage(1);
              }}
            >
              <FileText className="w-3 h-3" />
              Все
            </div>
            <div
              className={`result-chip passed ${resultFilter === 'passed' ? 'active' : ''}`}
              onClick={() => {
                setResultFilter('passed');
                setPage(1);
              }}
            >
              <div className="dot" style={{background: 'var(--teal)'}}></div>
              Passed
            </div>
            <div
              className={`result-chip failed ${resultFilter === 'failed' ? 'active' : ''}`}
              onClick={() => {
                setResultFilter('failed');
                setPage(1);
              }}
            >
              <div className="dot" style={{background: 'var(--rust)'}}></div>
              Failed
            </div>
          </div>
          <div className="result-filters">
            <div
              className={`result-chip ${typeFilter === 'all' ? 'active' : ''}`}
              onClick={() => {
                setTypeFilter('all');
                setPage(1);
              }}
            >
              <FileText className="w-3 h-3" />
              Все типы
            </div>
            <div
              className={`result-chip ${typeFilter === 'test' ? 'active' : ''}`}
              onClick={() => {
                setTypeFilter('test');
                setPage(1);
              }}
            >
              <ClipboardList className="w-3 h-3" />
              Тест
            </div>
            <div
              className={`result-chip ${typeFilter === 'task' ? 'active' : ''}`}
              onClick={() => {
                setTypeFilter('task');
                setPage(1);
              }}
            >
              <FileText className="w-3 h-3" />
              Задание
            </div>
          </div>
        </div>

        {/* Filter panel */}
        <div className={`filter-panel ${showFilters ? 'open' : ''}`}>
          <div className="filter-group">
            <label>Студент</label>
            <select
              value={selectedStudent}
              onChange={(e) => {
                setSelectedStudent(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все студенты</option>
              {uniqueStudents.map(student => (
                <option key={student} value={student}>{student}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Тип</label>
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Любой</option>
              <option value="test">Тест</option>
              <option value="task">Задание</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Юнит</label>
            <select
              value={selectedUnit}
              onChange={(e) => {
                setSelectedUnit(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все юниты</option>
              {uniqueUnits.map(unit => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Сортировка</label>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
            >
              <option value="desc">По дате (новые)</option>
              <option value="asc">По дате (старые)</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table className="grades-table">
            <thead>
              <tr>
                <th style={{width: '4px', padding: 0}}></th>
                <th style={{width: '14%'}}>
                  Студент <span className={`sort-arrow ${false ? 'sorted' : ''}`}>↕</span>
                </th>
                <th style={{width: '20%'}}>Курс → Юнит</th>
                <th style={{width: '7%'}}>Тип</th>
                <th style={{width: '14%'}}>Test / Задание</th>
                <th style={{width: '18%'}}>Оценка / Результат</th>
                <th style={{width: '9%'}}>Итог</th>
                <th 
                  style={{width: '8%'}}
                  onClick={() => setSortDir(prev => prev === 'desc' ? 'asc' : 'desc')}
                >
                  Дата <span className={`sort-arrow ${true ? 'sorted' : ''}`}>
                    {sortDir === 'desc' ? '↓' : '↑'}
                  </span>
                </th>
                <th style={{width: '13%', textAlign: 'right'}}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((grade) => {
                const maxScore = grade.max_score || grade.passing_score || 100;
                const score = grade.score ?? 0;
                const scorePercent = maxScore > 0 ? (score / maxScore) * 100 : 0;
                const scoreClass = getScoreClass(score, maxScore, grade.passing_score || 70);
                const initials = getInitials(grade.student);
                const avatarColor = getAvatarColor(grade.student_id || grade.attempt_id);
                const thresholdPercent = maxScore > 0 ? ((grade.passing_score || 70) / maxScore) * 100 : 70;
                const isTask = grade.type === 'task';
                const needsGrading = isTask && grade.status !== 'graded';

                return (
                  <tr key={`${grade.type || 'test'}-${grade.attempt_id}-${grade.task_id || ''}`}>
                    <td className="result-strip">
                      <span className={`rstrip ${grade.passed ? 'passed' : 'failed'}`}></span>
                    </td>
                    <td>
                      <div className="student-cell">
                        <div className="s-avatar" style={{background: avatarColor}}>
                          {initials}
                        </div>
                        <div>
                          <div className="s-name">{grade.student}</div>
                          {grade.student_id && (
                            <div className="s-id">ID: {grade.student_id}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="hier-cell">
                        <div className="hier-course">{grade.course || '—'}</div>
                        <div className="hier-unit">
                          <ArrowRight className="w-3 h-3" />
                          <span>{grade.unit || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`type-badge ${isTask ? 'type-task' : 'type-test'}`}>
                        {isTask ? (
                          <>
                            <FileText className="w-3 h-3" />
                            Задание
                          </>
                        ) : (
                          <>
                            <ClipboardList className="w-3 h-3" />
                            Тест
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      <div className="assess-cell">
                        <div className="assess-name">{grade.test || '—'}</div>
                        <div className="assess-sub">
                          {isTask 
                            ? `${grade.grading_type === 'auto' ? 'Авто' : 'Ручная'} · ${maxScore} баллов`
                            : `Порог: ${grade.passing_score}% · ${grade.questions_count || 0} вопр.`}
                        </div>
                      </div>
                    </td>
                    <td className="score-cell">
                      <div className="score-main">
                        <span className={`score-earned ${scoreClass}`}>
                          {score.toFixed(2)}
                        </span>
                        <span className="score-max">/ {maxScore.toFixed(2)}</span>
                        <span className="score-pct" style={{
                          color: scoreClass === 'passed' ? 'var(--teal)' : 
                                 scoreClass === 'failed' ? 'var(--rust)' : 
                                 scoreClass === 'near' ? 'var(--gold)' : 'var(--muted)'
                        }}>
                          {Math.round(scorePercent)}%
                        </span>
                      </div>
                      <div 
                        className="score-track" 
                        style={{'--threshold': `${thresholdPercent}%`} as React.CSSProperties}
                      >
                        <div 
                          className="score-fill" 
                          data-target={scorePercent}
                          style={{
                            width: '0%',
                            background: scoreClass === 'passed' ? 'var(--teal)' :
                                       scoreClass === 'failed' ? 'var(--rust)' :
                                       scoreClass === 'near' ? 'var(--gold)' : 'var(--muted)'
                          }}
                        ></div>
                      </div>
                    </td>
                    <td>
                      <span className={`result-badge ${grade.passed ? 'result-passed' : 'result-failed'}`}>
                        {grade.passed ? (
                          <>
                            <svg viewBox="0 0 24 24">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Passed
                          </>
                        ) : (
                          <>
                            <svg viewBox="0 0 24 24">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Failed
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      <div className="date-cell">{formatDate(grade.submitted_at)}</div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isTask && grade.task_id) {
                              navigate(`/admin/tasks/${grade.task_id}/submissions/${grade.attempt_id}`);
                            } else {
                              navigate(`/admin/grades/${grade.attempt_id}`);
                            }
                          }}
                          title="Просмотр"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        {!isTask && (
                          <button
                            className="icon-btn warn"
                            onClick={(e) => {
                              e.stopPropagation();
                              // TODO: Implement regrade
                            }}
                            title="Пересмотреть"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                        {isTask && needsGrading && (
                          <button
                            className="grade-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (grade.task_id) {
                                navigate(`/admin/tasks/${grade.task_id}/submissions/${grade.attempt_id}`);
                              }
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                            Оценить
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="table-footer">
            <div className="table-footer-count">
              Показано <span>{grades.length}</span> из {total} оценок
            </div>
            {totalPages > 1 && (
              <div className="page-btns">
                {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={`page-btn ${page === p ? 'active' : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                {totalPages > 3 && (
                  <button
                    className="page-btn"
                    style={{width: 'auto', padding: '0 0.6rem', fontSize: '0.6rem'}}
                    onClick={() => setPage(Math.min(page + 1, totalPages))}
                    disabled={page >= totalPages}
                  >
                    →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
