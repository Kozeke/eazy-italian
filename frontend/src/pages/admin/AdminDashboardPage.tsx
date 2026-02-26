import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import {
  BookOpen,
  Users,
  Award,
  Target,
  FileText,
  Video,
  ClipboardList,
  TrendingUp,
  BarChart3,
  PieChart
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { coursesApi } from '../../services/api';
import './AdminDashboardPage.css';

interface DashboardStats {
  courses_count: number;
  units_count: number;
  videos_count: number;
  tests_count: number;
  students_count: number;
  courses_this_month: number;
  students_this_month: number;
  course_progress: Array<{
    course_id: number;
    course_title: string;
    completion_rate: number;
    avg_test_score: number;
    total_enrolled: number;
    fully_completed: number;
    total_tasks: number;
    total_tests: number;
    total_units: number;
  }>;
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'courses' | 'performance'>('overview');
  const progressBarsAnimated = useRef(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await coursesApi.getDashboardStatistics();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch dashboard statistics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  // Animate progress bars after component mounts
  useEffect(() => {
    if (stats && !progressBarsAnimated.current) {
      const animateBars = () => {
        const progressBars = document.querySelectorAll<HTMLElement>('.progress-fill[data-target]');
        const barFills = document.querySelectorAll<HTMLElement>('.bar-fill[data-target]');
        
        progressBars.forEach((el) => {
          const target = el.getAttribute('data-target');
          if (target) {
            setTimeout(() => {
              el.style.width = `${target}%`;
            }, 300);
          }
        });

        barFills.forEach((el) => {
          const target = el.getAttribute('data-target');
          if (target) {
            setTimeout(() => {
              el.style.width = `${target}%`;
            }, 500);
          }
        });
      };

      setTimeout(animateBars, 100);
      progressBarsAnimated.current = true;
    }
  }, [stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f5f0e8]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1a7070]"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">{t('common.error')}</div>
      </div>
    );
  }

  // Calculate overall stats
  const overallCompletionRate = stats.course_progress.length > 0
    ? stats.course_progress.reduce((sum, c) => sum + c.completion_rate, 0) / stats.course_progress.length
    : 0;

  const avgTestScore = stats.course_progress.length > 0
    ? stats.course_progress
        .filter(c => c.avg_test_score > 0)
        .reduce((sum, c) => sum + c.avg_test_score, 0) / stats.course_progress.filter(c => c.avg_test_score > 0).length
    : 0;

  const totalEnrolled = stats.course_progress.reduce((sum, c) => sum + c.total_enrolled, 0);

  // Prepare chart data
  const courseEnrollmentData = stats.course_progress
    .filter(c => c.course_title) // Safety check
    .sort((a, b) => b.total_enrolled - a.total_enrolled)
    .slice(0, 6)
    .map(c => ({
      name: c.course_title && c.course_title.length > 15 ? c.course_title.substring(0, 15) + '...' : (c.course_title || 'N/A'),
      students: c.total_enrolled,
      fullName: c.course_title || 'N/A'
    }));

  const courseTestScoreData = stats.course_progress
    .filter(c => c.avg_test_score > 0 && c.course_title) // Safety check
    .sort((a, b) => b.avg_test_score - a.avg_test_score)
    .slice(0, 5)
    .map(c => ({
      name: c.course_title && c.course_title.length > 15 ? c.course_title.substring(0, 15) + '...' : (c.course_title || 'N/A'),
      score: Math.round(c.avg_test_score),
      fullName: c.course_title || 'N/A'
    }));

  const COLORS = ['#1a7070', '#2a9898', '#3db3b3', '#4dcdcd', '#5de5e5', '#6df5f5'];

  return (
    <div className="admin-dashboard-wrapper">
      <div className="page-content">
        {/* ── PAGE HEADER ── */}
        <div className="page-header">
          <div className="page-title-block">
            <h1 className="page-title">
              {t('admin.dashboard.title')} <em>{t('admin.role') || 'преподавателя'}</em>
            </h1>
            <p className="page-subtitle">
              {t('admin.dashboard.welcomeBack', { 
                name: user?.first_name || 'Maria',
                defaultValue: `Добро пожаловать обратно, ${user?.first_name || 'Maria'} — вот что происходит сегодня.`
              })}
            </p>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">{t('admin.nav.courses')}</span>
              <div className="stat-icon">
                <BookOpen className="w-5 h-5 text-[#1a7070]" />
              </div>
            </div>
            <div className="stat-value">{stats.courses_count}</div>
            {stats.courses_this_month > 0 ? (
              <div className="stat-delta">
                <TrendingUp className="w-3 h-3" />
                +{stats.courses_this_month} {t('admin.dashboard.thisMonth', { defaultValue: 'за последнее время' })}
              </div>
            ) : (
              <div className="stat-delta neutral">— {t('admin.dashboard.placeholder', { defaultValue: 'Placeholder' })}</div>
            )}
          </div>

          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">{t('admin.nav.students')}</span>
              <div className="stat-icon">
                <Users className="w-5 h-5 text-[#2a9898]" />
              </div>
            </div>
            <div className="stat-value">{stats.students_count}</div>
            {stats.students_this_month > 0 ? (
              <div className="stat-delta">
                <TrendingUp className="w-3 h-3" />
                +{stats.students_this_month} {t('admin.dashboard.thisMonth', { defaultValue: 'за последнее время' })}
              </div>
            ) : (
              <div className="stat-delta neutral">— {t('admin.dashboard.placeholder', { defaultValue: 'Placeholder' })}</div>
            )}
          </div>

          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">{t('admin.dashboard.avgScore', { defaultValue: 'Средний балл' })}</span>
              <div className="stat-icon">
                <Award className="w-5 h-5 text-[#3db3b3]" />
              </div>
            </div>
            <div className="stat-value">
              {Math.round(avgTestScore)}
              <span style={{ fontSize: '1.2rem', color: 'var(--muted)' }}>%</span>
            </div>
            <div className="stat-delta gold">{t('admin.dashboard.allTests', { defaultValue: 'По всем тестам' })}</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">{t('admin.dashboard.completion', { defaultValue: 'Завершение' })}</span>
              <div className="stat-icon">
                <Target className="w-5 h-5 text-[#4dcdcd]" />
              </div>
            </div>
            <div className="stat-value">
              {Math.round(overallCompletionRate)}
              <span style={{ fontSize: '1.2rem', color: 'var(--muted)' }}>%</span>
            </div>
            <div className="stat-delta neutral">{t('admin.dashboard.avgPercent', { defaultValue: 'Средний процент' })}</div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="card" style={{ marginBottom: '1.75rem' }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '0' }}>
            <nav style={{ display: 'flex', gap: '0', borderBottom: 'none' }}>
              <button
                onClick={() => setActiveTab('overview')}
                className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
              >
                <FileText className="w-4 h-4" />
                {t('admin.dashboard.tabs.overview', { defaultValue: 'Быстрые действия' })}
              </button>
              <button
                onClick={() => setActiveTab('courses')}
                className={`tab-button ${activeTab === 'courses' ? 'active' : ''}`}
              >
                <BookOpen className="w-4 h-4" />
                {t('admin.nav.courses')}
              </button>
              <button
                onClick={() => setActiveTab('performance')}
                className={`tab-button ${activeTab === 'performance' ? 'active' : ''}`}
              >
                <BarChart3 className="w-4 h-4" />
                {t('admin.dashboard.tabs.performance', { defaultValue: 'Статистика' })}
              </button>
            </nav>
          </div>
        </div>

        {/* ── TAB CONTENT ── */}
        {activeTab === 'overview' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">{t('admin.dashboard.quickActions.title', { defaultValue: 'Быстрые действия' })}</span>
            </div>
            <div className="card-body">
              <div className="quick-actions-grid">
                <button 
                  onClick={() => navigate('/admin/courses/new')}
                  className="qa-btn"
                >
                  <span className="qa-label">{t('admin.dashboard.quickActions.createCourse', { defaultValue: 'Создать курс' })}</span>
                </button>
                <button 
                  onClick={() => navigate('/admin/units/new')}
                  className="qa-btn"
                >
                  <span className="qa-label">{t('admin.dashboard.quickActions.createUnit', { defaultValue: 'Создать юнит' })}</span>
                </button>
                <button 
                  onClick={() => navigate('/admin/videos/new')}
                  className="qa-btn"
                >
                  <span className="qa-label">{t('admin.dashboard.quickActions.createVideo', { defaultValue: 'Создать видео' })}</span>
                </button>
                <button 
                  onClick={() => navigate('/admin/tests/new')}
                  className="qa-btn"
                >
                  <span className="qa-label">{t('admin.dashboard.quickActions.createTest', { defaultValue: 'Создать тест' })}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'courses' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">{t('admin.nav.courses')}</span>
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); navigate('/admin/courses'); }}
                className="card-link"
              >
                {t('admin.dashboard.manage', { defaultValue: 'Управлять' })} →
              </a>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="courses-table">
                <thead>
                  <tr>
                    <th>{t('admin.nav.courses')}</th>
                    <th>{t('admin.nav.students')}</th>
                    <th>{t('admin.dashboard.unitsTests', { defaultValue: 'Юнитов / Тестов' })}</th>
                    <th>{t('admin.dashboard.avgScore', { defaultValue: 'Средний балл' })}</th>
                    <th>{t('admin.dashboard.completion', { defaultValue: 'Завершение' })}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.course_progress.map((course) => (
                    <tr 
                      key={course.course_id}
                      onClick={() => navigate(`/admin/courses/${course.course_id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div className="course-name-cell">
                          <div className="course-flag">🇮🇹</div>
                          <div>
                            <div className="course-title">{course.course_title}</div>
                            <div className="course-id">#{course.course_id.toString().padStart(3, '0')}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="pill pill-teal">
                          {course.total_enrolled} {t('admin.dashboard.student', { defaultValue: 'студент' })}
                          {course.total_enrolled !== 1 ? (t('admin.dashboard.studentsPlural', { defaultValue: 'ов' })) : ''}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--muted)' }}>
                          {course.total_units} / {course.total_tests}
                        </span>
                      </td>
                      <td>
                        <div className="progress-wrap">
                          <div className="progress-bar">
                            <div 
                              className="progress-fill gold" 
                              data-target={Math.round(course.avg_test_score)}
                              style={{ width: '0%' }}
                            ></div>
                          </div>
                          <span className="progress-val">{Math.round(course.avg_test_score)}%</span>
                        </div>
                      </td>
                      <td>
                        <div className="progress-wrap">
                          <div className="progress-bar">
                            <div 
                              className="progress-fill rust" 
                              data-target={Math.round(course.completion_rate)}
                              style={{ width: '0%' }}
                            ></div>
                          </div>
                          <span className="progress-val">{Math.round(course.completion_rate)}%</span>
                        </div>
                      </td>
                      <td>
                        <a 
                          href="#" 
                          onClick={(e) => { e.preventDefault(); navigate(`/admin/courses/${course.course_id}`); }}
                          className="card-link"
                          style={{ fontSize: '0.65rem' }}
                        >
                          {t('admin.dashboard.open', { defaultValue: 'Открыть' })}
                        </a>
                      </td>
                    </tr>
                  ))}
                  {stats.course_progress.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                        <BookOpen className="mx-auto h-10 w-10 text-[#6b6456]" style={{ marginBottom: '0.5rem' }} />
                        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                          {t('admin.dashboard.noCourses', { defaultValue: 'Нет курсов' })}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="grid-2col">
            {/* Students per Course */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">{t('admin.dashboard.studentsByCourse', { defaultValue: 'Студенты по курсам' })}</span>
              </div>
              <div className="card-body">
                {courseEnrollmentData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={250}>
                      <RechartsPieChart>
                        <Pie
                          data={courseEnrollmentData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => entry.students}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="students"
                        >
                          {courseEnrollmentData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any, _name: any, props: any) => [`${value} студентов`, props.payload.fullName]} />
                        <Legend formatter={(_value: any, entry: any) => entry.payload.fullName} wrapperStyle={{ fontSize: '12px' }} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: '0.75rem', textAlign: 'center', color: 'var(--muted)', marginTop: '1rem' }}>
                      {t('admin.dashboard.total', { defaultValue: 'Всего' })}: {totalEnrolled} {t('admin.nav.students')}
                    </p>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '250px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {t('admin.dashboard.noData', { defaultValue: 'Нет данных' })}
                  </div>
                )}
              </div>
            </div>

            {/* Average Test Scores */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">{t('admin.dashboard.avgScoreByCourse', { defaultValue: 'Средний балл по курсам' })}</span>
              </div>
              <div className="card-body">
                {courseTestScoreData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={courseTestScoreData}>
                        <XAxis 
                          dataKey="name" 
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip 
                          formatter={(value: any, _name: any, props: any) => [`${value}%`, props.payload.fullName]}
                          contentStyle={{ fontSize: 11 }}
                        />
                        <Bar dataKey="score" fill="#1a7070" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: '0.75rem', textAlign: 'center', color: 'var(--muted)', marginTop: '1rem' }}>
                      {t('admin.dashboard.overallAvg', { defaultValue: 'Общий' })}: {Math.round(avgTestScore)}%
                    </p>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '250px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {t('admin.dashboard.noData', { defaultValue: 'Нет данных' })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
