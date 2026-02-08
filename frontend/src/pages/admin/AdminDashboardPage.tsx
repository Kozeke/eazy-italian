import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  ClipboardList,
  BookOpen,
  Video,
  TrendingUp,
  Award,
  Target,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react';
import { coursesApi } from '../../services/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'courses' | 'performance'>('overview');

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Ошибка загрузки данных</div>
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
    .sort((a, b) => b.total_enrolled - a.total_enrolled)
    .slice(0, 6)
    .map(c => ({
      name: c.course_title.length > 15 ? c.course_title.substring(0, 15) + '...' : c.course_title,
      students: c.total_enrolled,
      fullName: c.course_title
    }));

  const courseTestScoreData = stats.course_progress
    .filter(c => c.avg_test_score > 0)
    .sort((a, b) => b.avg_test_score - a.avg_test_score)
    .slice(0, 5)
    .map(c => ({
      name: c.course_title.length > 15 ? c.course_title.substring(0, 15) + '...' : c.course_title,
      score: Math.round(c.avg_test_score),
      fullName: c.course_title
    }));

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Compact Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Панель преподавателя</h1>
            <button
              onClick={() => navigate('/admin/courses/new')}
              className="bg-white text-primary-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-100 transition"
            >
              + Новый курс
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
          {/* Main Statistics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Курсы</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.courses_count}</p>
                  {stats.courses_this_month > 0 && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      +{stats.courses_this_month}
                    </p>
                  )}
                </div>
                <BookOpen className="w-8 h-8 text-blue-600" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-indigo-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Студенты</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.students_count}</p>
                  {stats.students_this_month > 0 && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      +{stats.students_this_month}
                    </p>
                  )}
                </div>
                <Users className="w-8 h-8 text-indigo-600" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Средний балл</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{Math.round(avgTestScore)}%</p>
                  <p className="text-xs text-gray-500 mt-1">По всем тестам</p>
                </div>
                <Award className="w-8 h-8 text-green-600" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-orange-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Завершение</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{Math.round(overallCompletionRate)}%</p>
                  <p className="text-xs text-gray-500 mt-1">Средний процент</p>
                </div>
                <Target className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl shadow-sm">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'overview'
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Быстрые действия
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('courses')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'courses'
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Курсы
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('performance')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'performance'
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Статистика
                  </div>
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'overview' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <button
                    onClick={() => navigate('/admin/courses/new')}
                    className="flex flex-col items-center gap-3 p-4 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <BookOpen className="w-8 h-8 text-blue-600" />
                    <span className="text-sm font-medium text-gray-700">Создать курс</span>
                    <span className="text-xs text-gray-500">{stats.courses_count} курсов</span>
                  </button>

                  <button
                    onClick={() => navigate('/admin/units/new')}
                    className="flex flex-col items-center gap-3 p-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-colors"
                  >
                    <FileText className="w-8 h-8 text-indigo-600" />
                    <span className="text-sm font-medium text-gray-700">Создать юнит</span>
                    <span className="text-xs text-gray-500">{stats.units_count} юнитов</span>
                  </button>

                  <button
                    onClick={() => navigate('/admin/videos/new')}
                    className="flex flex-col items-center gap-3 p-4 rounded-xl bg-green-50 hover:bg-green-100 transition-colors"
                  >
                    <Video className="w-8 h-8 text-green-600" />
                    <span className="text-sm font-medium text-gray-700">Создать видео</span>
                    <span className="text-xs text-gray-500">{stats.videos_count} видео</span>
                  </button>

                  <button
                    onClick={() => navigate('/admin/tests/new')}
                    className="flex flex-col items-center gap-3 p-4 rounded-xl bg-orange-50 hover:bg-orange-100 transition-colors"
                  >
                    <ClipboardList className="w-8 h-8 text-orange-600" />
                    <span className="text-sm font-medium text-gray-700">Создать тест</span>
                    <span className="text-xs text-gray-500">{stats.tests_count} тестов</span>
                  </button>
                </div>
              )}

              {activeTab === 'courses' && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Курс</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Студентов</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Юнитов/Тестов</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Средний балл</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Завершение</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {stats.course_progress.map((course) => (
                        <tr 
                          key={course.course_id} 
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => navigate(`/admin/courses/${course.course_id}`)}
                        >
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{course.course_title}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{course.total_enrolled}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {course.total_units} / {course.total_tests}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              course.avg_test_score >= 70 
                                ? 'bg-green-100 text-green-800' 
                                : course.avg_test_score >= 50 
                                  ? 'bg-yellow-100 text-yellow-800' 
                                  : 'bg-red-100 text-red-800'
                            }`}>
                              {Math.round(course.avg_test_score)}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-primary-600 h-2 rounded-full" 
                                  style={{ width: `${Math.min(100, course.completion_rate)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-600 w-10">{Math.round(course.completion_rate)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {stats.course_progress.length === 0 && (
                    <div className="text-center py-8">
                      <BookOpen className="mx-auto h-10 w-10 text-gray-400" />
                      <p className="mt-2 text-sm text-gray-500">Нет курсов</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'performance' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Students per Course */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Студенты по курсам</h4>
                    {courseEnrollmentData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
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
                              {courseEnrollmentData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: any, name: any, props: any) => [`${value} студентов`, props.payload.fullName]} />
                            <Legend formatter={(value: any, entry: any) => entry.payload.fullName} wrapperStyle={{ fontSize: '12px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <p className="text-xs text-center text-gray-500 mt-2">
                          Всего: {totalEnrolled} студентов
                        </p>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
                        Нет данных
                      </div>
                    )}
                  </div>

                  {/* Average Test Scores */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Средний балл по курсам</h4>
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
                              formatter={(value: any, name: any, props: any) => [`${value}%`, props.payload.fullName]}
                              contentStyle={{ fontSize: 11 }}
                            />
                            <Bar dataKey="score" fill="#10b981" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                        <p className="text-xs text-center text-gray-500 mt-2">
                          Общий: {Math.round(avgTestScore)}%
                        </p>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
                        Нет данных
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Панель преподавателя</h1>
              <p className="mt-2 text-primary-100">
                Обзор платформы и статистика обучения
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/courses/new')}
              className="bg-white text-primary-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition shadow-lg"
            >
              + Новый курс
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
        {/* Main Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-md p-6 border-l-4 border-blue-500 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase">Курсы</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.courses_count}</p>
                {stats.courses_this_month > 0 && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    +{stats.courses_this_month} в этом месяце
                  </p>
                )}
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <BookOpen className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6 border-l-4 border-indigo-500 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase">Студенты</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.students_count}</p>
                {stats.students_this_month > 0 && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    +{stats.students_this_month} в этом месяце
                  </p>
                )}
              </div>
              <div className="p-3 bg-indigo-100 rounded-full">
                <Users className="w-8 h-8 text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6 border-l-4 border-green-500 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase">Средний балл</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{Math.round(avgTestScore)}%</p>
                <p className="text-xs text-gray-500 mt-2">По всем тестам</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <Award className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6 border-l-4 border-orange-500 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase">Завершение</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{Math.round(overallCompletionRate)}%</p>
                <p className="text-xs text-gray-500 mt-2">Средний процент</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <Target className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary-600" />
            Быстрые действия
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => navigate('/admin/courses/new')}
              className="flex flex-col items-center gap-3 p-4 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <BookOpen className="w-8 h-8 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Создать курс</span>
              <span className="text-xs text-gray-500">{stats.courses_count} курсов</span>
            </button>

            <button
              onClick={() => navigate('/admin/units/new')}
              className="flex flex-col items-center gap-3 p-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-colors"
            >
              <FileText className="w-8 h-8 text-indigo-600" />
              <span className="text-sm font-medium text-gray-700">Создать юнит</span>
              <span className="text-xs text-gray-500">{stats.units_count} юнитов</span>
            </button>

            <button
              onClick={() => navigate('/admin/videos/new')}
              className="flex flex-col items-center gap-3 p-4 rounded-xl bg-green-50 hover:bg-green-100 transition-colors"
            >
              <Video className="w-8 h-8 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Создать видео</span>
              <span className="text-xs text-gray-500">{stats.videos_count} видео</span>
            </button>

            <button
              onClick={() => navigate('/admin/tests/new')}
              className="flex flex-col items-center gap-3 p-4 rounded-xl bg-orange-50 hover:bg-orange-100 transition-colors"
            >
              <ClipboardList className="w-8 h-8 text-orange-600" />
              <span className="text-sm font-medium text-gray-700">Создать тест</span>
              <span className="text-xs text-gray-500">{stats.tests_count} тестов</span>
            </button>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Students per Course */}
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Студенты по курсам
            </h3>
            {courseEnrollmentData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={courseEnrollmentData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.students}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="students"
                    >
                      {courseEnrollmentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any, name: any, props: any) => [`${value} студентов`, props.payload.fullName]} />
                    <Legend formatter={(value: any, entry: any) => entry.payload.fullName} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 text-center">
                  <p className="text-sm text-gray-500">
                    Всего записано: <span className="font-semibold text-gray-900">{totalEnrolled}</span> студентов
                  </p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-80 text-gray-400">
                Нет данных о записях на курсы
              </div>
            )}
          </div>

          {/* Average Test Scores by Course */}
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Средний балл по курсам
            </h3>
            {courseTestScoreData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={courseTestScoreData}>
                    <XAxis 
                      dataKey="name" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip 
                      formatter={(value: any, name: any, props: any) => [`${value}%`, props.payload.fullName]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="score" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 text-center">
                  <p className="text-sm text-gray-500">
                    Общий средний балл: <span className="font-semibold text-gray-900">{Math.round(avgTestScore)}%</span>
                  </p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-80 text-gray-400">
                Нет данных о результатах тестов
              </div>
            )}
          </div>
        </div>

        {/* Course Details Table */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Детальная статистика по курсам</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Курс
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Студентов
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Юнитов
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Тестов
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Средний балл
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Завершение
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Завершили
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.course_progress.map((course) => (
                  <tr 
                    key={course.course_id} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/admin/courses/${course.course_id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{course.course_title}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{course.total_enrolled}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {course.total_units}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {course.total_tests}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        course.avg_test_score >= 70 
                          ? 'bg-green-100 text-green-800' 
                          : course.avg_test_score >= 50 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {Math.round(course.avg_test_score)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-primary-600 h-2 rounded-full" 
                            style={{ width: `${Math.min(100, course.completion_rate)}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-600">{Math.round(course.completion_rate)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {course.fully_completed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.course_progress.length === 0 && (
            <div className="text-center py-12">
              <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Нет курсов</h3>
              <p className="mt-1 text-sm text-gray-500">Создайте первый курс для начала</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
