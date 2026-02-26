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
  Users,
  CheckCircle2,
  FileText,
  Mail,
  Calendar,
  Clock,
  MessageCircle,
  User,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import { progressApi, usersApi, gradesApi } from '../../services/api';
import './AdminStudentsPage.css';

type ProgressData = {
  id: number;
  passed_tests: number;
  progress_percent: number;
  total_tests: number;
};

type StudentRow = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  level: string;
  status: string;
  registrationDate: string;
  lastLogin: string | null;
  completedUnits: number;
  averageScore: number;
  totalPoints: string;
  subscriptionType: string;
  subscriptionExpiry: string | null;
  enrolledCoursesCount: number;
  enrolledCourses?: Array<{ id: number; title: string; level?: string }>;
};

export default function AdminStudentsPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedSubscription, setSelectedSubscription] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<'registrationDate' | 'name'>('registrationDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const [studentsData, progressData] = await Promise.all([
        usersApi.getStudents(),
        progressApi.getStudentsProgress()
      ]);

      const progressMap = new Map(
        progressData.map((p: ProgressData) => [p.id, p])
      );

      const normalized: StudentRow[] = studentsData.map((s: any) => {
        const progress = progressMap.get(s.id);
        return {
          id: s.id,
          firstName: s.first_name,
          lastName: s.last_name,
          email: s.email,
          phone: '—',
          level: '—',
          status: s.is_active ? 'active' : 'inactive',
          registrationDate: s.created_at,
          lastLogin: s.last_login ?? null,
          completedUnits: progress?.passed_tests || 0,
          averageScore: progress?.progress_percent || 0,
          totalPoints: progress 
            ? `${progress.passed_tests || 0}/${progress.total_tests || 0}`
            : '0/0',
          subscriptionType: s.subscription || 'free',
          subscriptionExpiry: s.subscription_ends_at ?? null,
          enrolledCoursesCount: s.enrolled_courses_count || 0,
        };
      });

      // Fetch enrollments for each student
      const studentsWithCourses = await Promise.all(
        normalized.map(async (student) => {
          try {
            const enrollments = await gradesApi.getStudentEnrollments(student.id);
            return {
              ...student,
              enrolledCourses: Array.isArray(enrollments) 
                ? enrollments.map((e: any) => ({
                    id: e.course_id || e.id,
                    title: e.course_title || e.title || '',
                    level: e.level || ''
                  }))
                : []
            };
          } catch (error) {
            console.error(`Error loading enrollments for student ${student.id}:`, error);
            return { ...student, enrolledCourses: [] };
          }
        })
      );

      setStudents(studentsWithCourses);
    } catch (error) {
      console.error('Error loading students:', error);
      toast.error('Ошибка загрузки студентов');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // Get unique courses for filter
  const uniqueCourses = useMemo(() => {
    const courses = new Set<string>();
    students.forEach(student => {
      student.enrolledCourses?.forEach(course => {
        if (course.title) {
          courses.add(course.title);
        }
      });
    });
    return Array.from(courses).sort();
  }, [students]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const total = students.length;
    const active = students.filter(s => s.status === 'active').length;
    const totalEnrollments = students.reduce((sum, s) => sum + s.enrolledCoursesCount, 0);
    const totalTests = students.reduce((sum, s) => {
      const [passed, total] = s.totalPoints.split('/').map(Number);
      return sum + (total || 0);
    }, 0);
    const completedTests = students.reduce((sum, s) => {
      const [passed] = s.totalPoints.split('/').map(Number);
      return sum + (passed || 0);
    }, 0);

    return { total, active, totalEnrollments, completedTests, totalTests };
  }, [students]);

  const handleDeleteStudent = async (studentId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Вы уверены, что хотите удалить этого студента?')) {
      return;
    }
    
    try {
      // TODO: Implement delete student API call
      setStudents(prev => prev.filter(s => s.id !== studentId));
      toast.success('Студент удален');
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error('Ошибка при удалении студента');
    }
  };

  // Filter and sort students
  const filteredAndSortedStudents = useMemo(() => {
    let filtered = students.filter(student => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const matchesSearch = !searchQuery || 
        fullName.includes(searchQuery.toLowerCase()) ||
        student.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCourse = !selectedCourse ||
        student.enrolledCourses?.some(c => c.title === selectedCourse);
      const matchesStatus = !selectedStatus || student.status === selectedStatus;
      const matchesSubscription = !selectedSubscription || student.subscriptionType === selectedSubscription;
      
      return matchesSearch && matchesCourse && matchesStatus && matchesSubscription;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortField === 'name') {
        const aName = `${a.lastName} ${a.firstName}`;
        const bName = `${b.lastName} ${b.firstName}`;
        return sortDirection === 'asc' 
          ? aName.localeCompare(bName)
          : bName.localeCompare(aName);
      } else { // registrationDate
        const aDate = new Date(a.registrationDate).getTime();
        const bDate = new Date(b.registrationDate).getTime();
        return sortDirection === 'desc' ? bDate - aDate : aDate - bDate;
      }
    });

    return filtered;
  }, [students, searchQuery, selectedCourse, selectedStatus, selectedSubscription, sortField, sortDirection]);

  const getInitials = (firstName: string, lastName: string): string => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const getAvatarColor = (id: number): string => {
    const colors = ['var(--teal)', 'var(--gold)', 'var(--rust)', '#3a6080', '#4a80a0'];
    return colors[id % colors.length];
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      const today = new Date();
      const diffTime = today.getTime() - date.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'сегодня';
      if (diffDays === 1) return 'вчера';
      if (diffDays < 7) return `${diffDays} дней назад`;
      
      return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const formatRegistrationDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  // Animate progress bars on mount
  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        const fills = document.querySelectorAll('.prog-fill[data-target]');
        fills.forEach((el) => {
          const target = (el as HTMLElement).getAttribute('data-target');
          if (target) {
            (el as HTMLElement).style.width = target + '%';
          }
        });
      }, 400);
    }
  }, [loading, filteredAndSortedStudents]);

  if (loading) {
    return (
      <div className="admin-students-wrapper min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a7070]"></div>
      </div>
    );
  }

  return (
    <div className="admin-students-wrapper">
      <div className="page-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">
              Студенты <em>/ {filteredAndSortedStudents.length} {filteredAndSortedStudents.length === 1 ? 'студент' : filteredAndSortedStudents.length < 5 ? 'студента' : 'студентов'}</em>
            </h1>
            <p className="page-meta">Управляйте студентами и отслеживайте их прогресс</p>
          </div>
        </div>

        {/* Summary chips */}
        <div className="summary-bar">
          <div className="summary-chip">
            <div className="summary-chip-icon">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="summary-chip-val">{summaryStats.total}</div>
              <div className="summary-chip-lbl">Студентов</div>
            </div>
          </div>
          <div className="summary-chip">
            <div className="summary-chip-icon" style={{background: 'rgba(201,150,42,0.1)'}}>
              <CheckCircle2 className="w-4 h-4" style={{stroke: 'var(--gold)'}} />
            </div>
            <div>
              <div className="summary-chip-val" style={{color: 'var(--gold)'}}>{summaryStats.active}</div>
              <div className="summary-chip-lbl">Активных</div>
            </div>
          </div>
          <div className="summary-chip">
            <div className="summary-chip-icon">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="summary-chip-val">{summaryStats.totalEnrollments}</div>
              <div className="summary-chip-lbl">Записей на курс</div>
            </div>
          </div>
          <div className="summary-chip">
            <div className="summary-chip-icon" style={{background: 'rgba(201,74,42,0.08)'}}>
              <FileText className="w-4 h-4" style={{stroke: 'var(--rust)'}} />
            </div>
            <div>
              <div className="summary-chip-val" style={{color: 'var(--rust)'}}>
                {summaryStats.completedTests}/{summaryStats.totalTests}
              </div>
              <div className="summary-chip-lbl">Тестов сдано</div>
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
              placeholder="Поиск по имени или email…"
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
              <option value="">Любой</option>
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Подписка</label>
            <select
              value={selectedSubscription}
              onChange={(e) => setSelectedSubscription(e.target.value)}
            >
              <option value="">Любая</option>
              <option value="free">Бесплатная</option>
              <option value="premium">Премиум</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Сортировка</label>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as typeof sortField)}
            >
              <option value="registrationDate">По дате регистрации</option>
              <option value="name">По имени</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table className="students-table">
            <thead>
              <tr>
                <th style={{width: '4%'}}>Курсы</th>
                <th 
                  style={{width: '20%'}}
                  onClick={() => {
                    if (sortField === 'name') {
                      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                    } else {
                      setSortField('name');
                      setSortDirection('asc');
                    }
                  }}
                >
                  Студент <span className={`sort-arrow ${sortField === 'name' ? 'sorted' : ''}`}>
                    {sortField === 'name' ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}
                  </span>
                </th>
                <th style={{width: '16%'}}>Контакты</th>
                <th style={{width: '6%'}}>Уровень</th>
                <th style={{width: '8%'}}>Статус</th>
                <th style={{width: '16%'}}>Прогресс</th>
                <th style={{width: '14%'}}>Подписка</th>
                <th 
                  style={{width: '10%'}}
                  onClick={() => {
                    if (sortField === 'registrationDate') {
                      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                    } else {
                      setSortField('registrationDate');
                      setSortDirection('desc');
                    }
                  }}
                >
                  Регистрация <span className={`sort-arrow ${sortField === 'registrationDate' ? 'sorted' : ''}`}>
                    {sortField === 'registrationDate' ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}
                  </span>
                </th>
                <th style={{width: '12%', textAlign: 'right'}}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedStudents.map((student) => {
                const [testsPassed, testsTotal] = student.totalPoints.split('/').map(Number);
                const testsPercent = testsTotal > 0 ? (testsPassed / testsTotal) * 100 : 0;
                const progressPercent = student.averageScore || 0;
                const initials = getInitials(student.firstName, student.lastName);
                const avatarColor = getAvatarColor(student.id);
                const isOnline = false; // TODO: Implement online status check
                
                return (
                  <tr key={student.id}>
                    <td className="course-count-col">
                      <div className="course-count-badge" style={{background: student.enrolledCoursesCount > 0 ? 'var(--teal)' : 'var(--ink)'}}>
                        <div className="course-count-num">{student.enrolledCoursesCount}</div>
                        <div className="course-count-lbl">
                          {student.enrolledCoursesCount === 1 ? 'курс' : 
                           student.enrolledCoursesCount < 5 ? 'курса' : 'курсов'}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="student-cell">
                        <div className="student-avatar" style={{background: avatarColor}}>
                          {initials}
                          {isOnline && <div className="online-dot"></div>}
                        </div>
                        <div>
                          <div className="student-name">
                            {student.firstName} {student.lastName}
                          </div>
                          <div className="student-id">ID: {student.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="contact-cell">
                        <div className="contact-email">
                          <Mail className="w-3 h-3" />
                          {student.email}
                        </div>
                        <div className="contact-phone">
                          {student.phone === '—' ? '— телефон не указан' : student.phone}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-none">—</span>
                    </td>
                    <td>
                      <span className={`badge ${student.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                        {student.status === 'active' ? (
                          <>
                            <svg viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" opacity="0.15"/>
                              <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>
                            </svg>
                            Активен
                          </>
                        ) : (
                          'Неактивен'
                        )}
                      </span>
                    </td>
                    <td>
                      <div className="progress-cell">
                        <div className="prog-row">
                          <div className="prog-label">Тесты</div>
                          <div className="prog-track">
                            <div 
                              className="prog-fill teal" 
                              data-target={testsPercent}
                              style={{width: '0%'}}
                            ></div>
                          </div>
                          <div className="prog-val" style={testsPercent > 0 ? {color: 'var(--teal)'} : {}}>
                            {testsPassed}/{testsTotal}
                          </div>
                        </div>
                        <div className="prog-row">
                          <div className="prog-label">Прогресс</div>
                          <div className="prog-track">
                            <div 
                              className="prog-fill gold" 
                              data-target={progressPercent}
                              style={{width: '0%'}}
                            ></div>
                          </div>
                          <div className="prog-val" style={progressPercent > 0 ? {color: 'var(--gold)'} : {opacity: 0.5}}>
                            {Math.round(progressPercent)}%
                          </div>
                        </div>
                        {student.enrolledCourses && student.enrolledCourses.length > 0 && (
                          <div style={{display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.55rem'}}>
                            {student.enrolledCourses.slice(0, 2).map((course) => (
                              <div key={course.id} className="courses-pill" title={course.title}>
                                <BookOpen className="w-3 h-3" />
                                {course.title} {course.level || ''}
                              </div>
                            ))}
                            {student.enrolledCourses.length > 2 && (
                              <div className="courses-pill" title={`+${student.enrolledCourses.length - 2} еще`}>
                                <BookOpen className="w-3 h-3" />
                                +{student.enrolledCourses.length - 2}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="sub-cell">
                        <select
                          value={student.subscriptionType}
                          onChange={(e) => {
                            usersApi.changeSubscription(student.id, e.target.value)
                              .then(() => {
                                setStudents(prev =>
                                  prev.map(s =>
                                    s.id === student.id
                                      ? { ...s, subscriptionType: e.target.value }
                                      : s
                                  )
                                );
                                toast.success('Подписка обновлена');
                              })
                              .catch((error) => {
                                console.error('Error changing subscription:', error);
                                toast.error('Ошибка при изменении подписки');
                              });
                          }}
                          className="sub-select"
                        >
                          <option value="free">Бесплатный</option>
                          <option value="premium">Премиум</option>
                          <option value="pro">Pro</option>
                        </select>
                        <div className="sub-expires">
                          До: {student.subscriptionExpiry 
                            ? formatRegistrationDate(student.subscriptionExpiry)
                            : '—'}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="dates-cell">
                        <div className="date-row">
                          <Calendar className="w-3 h-3" />
                          <span>
                            <span className="date-val">{formatRegistrationDate(student.registrationDate)}</span>
                          </span>
                        </div>
                        <div className="date-row">
                          <Clock className="w-3 h-3" />
                          <span>Вход: <span className="date-val">{formatDate(student.lastLogin)}</span></span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/students/${student.id}`);
                          }}
                          title="Профиль студента"
                        >
                          <User className="w-3 h-3" />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Open message dialog
                          }}
                          title="Написать сообщение"
                        >
                          <MessageCircle className="w-3 h-3" />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={(e) => handleDeleteStudent(student.id, e)}
                          title="Удалить студента"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <button
                          className="open-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/students/${student.id}`);
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
              Показано <span>{filteredAndSortedStudents.length}</span> из {filteredAndSortedStudents.length} студентов
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
