import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { coursesApi } from '../services/api';
import {
  BookOpen,
  CheckCircle2,
  Percent,
  Clock,
  ArrowRight,
  PlayCircle,
  Calendar,
  ClipboardList,
  Sparkles
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardData {
  my_courses_count: number;
  completed_units: number;
  average_score: number;
  time_spent_hours: number;
  recent_activity: Array<{
    type: string;
    title: string;
    description: string;
    unit_title: string;
    date: string;
    status: string;
  }>;
  upcoming_deadlines: Array<{
    type: string;
    title: string;
    unit_title: string;
    course_title: string;
    due_at: string;
    days_until: number;
    deadline_text: string;
  }>;
  recommended_courses: Array<{
    id: number;
    title: string;
    description: string;
    level: string;
    thumbnail_url?: string;
    thumbnail_path?: string;
    units_count: number;
  }>;
  last_activity?: {
    type: string;
    title: string;
    description: string;
    date: string;
  };
  latest_video_watched?: {
    video_id: number;
    video_title: string;
    unit_id: number;
    unit_title: string;
    course_id: number;
    course_title: string;
    last_watched_at: string;
    watched_percentage: number;
    completed: boolean;
  };
  active_course_progress?: {
    course_id: number;
    course_title: string;
    unit_id: number;
    unit_title: string;
    progress_percent: number;
    completed_videos: number;
    total_videos: number;
    completed_tasks: number;
    total_tasks: number;
    passed_tests: number;
    total_tests: number;
  };
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const data = await coursesApi.getStudentDashboard();
        setDashboardData(data);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Не удалось загрузить данные дашборда');
        // Set default values on error
        setDashboardData({
          my_courses_count: 0,
          completed_units: 0,
          average_score: 0,
          time_spent_hours: 0,
          recent_activity: [],
          upcoming_deadlines: [],
          recommended_courses: []
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  const myCoursesCount = dashboardData?.my_courses_count || 0;
  const completedUnits = dashboardData?.completed_units || 0;
  const averageScore = dashboardData?.average_score || 0;
  const timeSpentHours = dashboardData?.time_spent_hours || 0;

  return (
    <div className="space-y-8">
      {/* Hero / welcome */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl px-6 py-6 md:px-8 md:py-7 text-white shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 text-xs font-medium mb-2">
            <Sparkles className="w-4 h-4 mr-1" />
            <span>{t('dashboard.welcome')}, {user?.first_name}!</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">
            Добро пожаловать в EZ Italian
          </h1>
          <p className="mt-2 text-sm md:text-base text-primary-100 max-w-xl">
            Продолжайте обучение там, где остановились, следите за прогрессом и
            управляйте своими заданиями и тестами в единой панели.
          </p>
        </div>
        <div className="bg-white/10 rounded-xl p-4 sm:p-5 flex flex-col justify-between min-w-[230px] max-w-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <PlayCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-primary-100">Последняя активность</p>
              {dashboardData?.latest_video_watched ? (
                <div>
                  <p className="text-sm font-semibold">
                    {dashboardData.latest_video_watched.course_title}
                  </p>
                  <p className="text-xs text-primary-200 mt-0.5">
                    {dashboardData.latest_video_watched.unit_title}
                  </p>
                </div>
              ) : (
                <p className="text-sm font-semibold">Нет активности</p>
              )}
            </div>
          </div>
          {dashboardData?.latest_video_watched ? (
            <Link
              to={`/units/${dashboardData.latest_video_watched.unit_id}`}
              className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white text-primary-700 text-sm font-semibold hover:bg-gray-100 transition-colors"
            >
              Продолжить обучение
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Link>
          ) : (
            <Link
              to="/my-courses"
              className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white text-primary-700 text-sm font-semibold hover:bg-gray-100 transition-colors"
            >
              Продолжить обучение
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {t('dashboard.myCourses')}
            </p>
            <p className="text-2xl font-bold text-gray-900">{myCoursesCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Активных курса сейчас
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {t('dashboard.completedUnits')}
            </p>
            <p className="text-2xl font-bold text-emerald-700">{completedUnits}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Юнитов успешно завершено
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
            <Percent className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {t('dashboard.averageScore')}
            </p>
            <p className="text-2xl font-bold text-blue-700">{averageScore}%</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Средний результат по тестам
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center">
            <Clock className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {t('dashboard.timeSpent')}
            </p>
            <p className="text-2xl font-bold text-violet-700">
              {timeSpentHours % 1 === 0 ? timeSpentHours : timeSpentHours.toFixed(1)}ч
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Всего времени в обучении
            </p>
          </div>
        </div>
      </div>

      {/* Main content: recent activity + deadlines + recommendations */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary-600" />
                <h3 className="text-sm font-semibold text-gray-900">
                  {t('dashboard.recentActivity')}
                </h3>
              </div>
              <span className="text-xs text-gray-500">
                Обновлено 5 минут назад
              </span>
            </div>
            <div className="px-5 py-4 space-y-4">
              {dashboardData?.recent_activity && dashboardData.recent_activity.length > 0 ? (
                dashboardData.recent_activity.slice(0, 5).map((activity, index) => {
                  const getActivityColor = (type: string) => {
                    if (type.includes('test')) return 'bg-yellow-500';
                    if (type.includes('task')) return 'bg-blue-500';
                    if (type.includes('video')) return 'bg-purple-500';
                    return 'bg-emerald-500';
                  };
                  
                  const formatDate = (dateString: string | null | undefined) => {
                    if (!dateString) return 'Недавно';
                    try {
                      const date = new Date(dateString);
                      if (isNaN(date.getTime())) return 'Недавно';
                      const now = new Date();
                      const diffTime = Math.abs(now.getTime() - date.getTime());
                      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                      
                      if (diffDays === 0) return 'Сегодня';
                      if (diffDays === 1) return 'Вчера';
                      if (diffDays < 7) return `${diffDays} дня назад`;
                      return date.toLocaleDateString('ru-RU');
                    } catch {
                      return 'Недавно';
                    }
                  };

                  return (
                    <div key={index} className="flex items-start gap-3">
                      <span className={`mt-1 w-2 h-2 rounded-full ${getActivityColor(activity.type)}`} />
                      <div>
                        <p className="text-sm text-gray-700">
                          {activity.description}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDate(activity.date)} · {activity.unit_title} · {activity.status}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500">Нет недавней активности</p>
              )}
            </div>
          </div>

          {/* Recommended courses */}
          {/* <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary-600" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Рекомендованные курсы
                </h3>
              </div>
              <Link
                to="/courses"
                className="text-xs font-medium text-primary-600 hover:text-primary-700 inline-flex items-center"
              >
                Открыть все
                <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </div>
            <div className="px-5 py-4 grid gap-4 md:grid-cols-2">
              {dashboardData?.recommended_courses && dashboardData.recommended_courses.length > 0 ? (
                dashboardData.recommended_courses.map((course) => (
                  <Link
                    key={course.id}
                    to={`/courses/${course.id}`}
                    className="rounded-xl border border-gray-100 hover:shadow transition overflow-hidden"
                  >
                    <div className="aspect-video bg-gray-100">
                      {course.thumbnail_url || course.thumbnail_path ? (
                        <img
                          src={course.thumbnail_url || course.thumbnail_path}
                          alt={course.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                          <BookOpen className="w-12 h-12 text-white opacity-50" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="text-xs font-semibold text-primary-600 mb-1">{course.level}</p>
                      <p className="font-semibold text-gray-900 mb-1">
                        {course.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {course.description || `Курс с ${course.units_count} юнитами`}
                      </p>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-gray-500 col-span-2">Нет рекомендованных курсов</p>
              )}
            </div>
          </div> */}
        </div>

        {/* Deadlines / schedule */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-semibold text-gray-900">
                  {t('dashboard.upcomingDeadlines')}
                </h3>
              </div>
              <span className="text-xs text-gray-500">Ближайшая неделя</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              {dashboardData?.upcoming_deadlines && dashboardData.upcoming_deadlines.length > 0 ? (
                dashboardData.upcoming_deadlines.slice(0, 3).map((deadline, index) => {
                  const getDeadlineColor = (days: number) => {
                    if (days <= 2) return 'text-red-600 bg-red-50';
                    if (days <= 5) return 'text-orange-600 bg-orange-50';
                    return 'text-yellow-700 bg-yellow-50';
                  };

                  return (
                    <div key={index} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-gray-800">
                          {deadline.type === 'task' ? 'Задание' : 'Тест'}{' '}
                          <span className="font-semibold">«{deadline.title}»</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {deadline.unit_title} • {deadline.course_title}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${getDeadlineColor(deadline.days_until)}`}>
                        {deadline.deadline_text}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500">Нет предстоящих дедлайнов</p>
              )}
            </div>
          </div>

          {/* Mini progress summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Прогресс по активному курсу
            </h3>
            {dashboardData?.active_course_progress ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">
                    {dashboardData.active_course_progress.unit_title}
                  </span>
                  <span className="font-semibold text-primary-700">
                    {dashboardData.active_course_progress.progress_percent}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-primary-500 rounded-full transition-all"
                    style={{ width: `${dashboardData.active_course_progress.progress_percent}%` }}
                  />
                </div>
                <div className="space-y-1.5 mt-2">
                  {dashboardData.active_course_progress.total_videos > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>Видео</span>
                      <span>
                        {dashboardData.active_course_progress.completed_videos} / {dashboardData.active_course_progress.total_videos}
                      </span>
                    </div>
                  )}
                  {dashboardData.active_course_progress.total_tasks > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>Задания</span>
                      <span>
                        {dashboardData.active_course_progress.completed_tasks} / {dashboardData.active_course_progress.total_tasks}
                      </span>
                    </div>
                  )}
                  {dashboardData.active_course_progress.total_tests > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>Тесты</span>
                      <span>
                        {dashboardData.active_course_progress.passed_tests} / {dashboardData.active_course_progress.total_tests}
                      </span>
                    </div>
                  )}
                </div>
                {dashboardData.active_course_progress.course_id && (
                  <Link
                    to={`/courses/${dashboardData.active_course_progress.course_id}`}
                    className="text-[11px] text-primary-600 hover:text-primary-700 font-medium inline-flex items-center mt-2"
                  >
                    Открыть курс
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">Нет активного курса</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Начните обучение, чтобы увидеть прогресс
                </p>
                <Link
                  to="/courses"
                  className="text-[11px] text-primary-600 hover:text-primary-700 font-medium inline-flex items-center"
                >
                  Выбрать курс
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
