import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  ClipboardList,
  BookOpen,
  Video,
  TrendingUp
} from 'lucide-react';
import { coursesApi } from '../../services/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface DashboardStats {
  courses_count: number;
  units_count: number;
  videos_count: number;
  tests_count: number;
  students_count: number;
  courses_this_month: number;
  units_this_month: number;
  videos_this_month: number;
  tests_this_month: number;
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
  students_progress: Array<{
    student_id: number;
    student_name: string;
    courses_enrolled: number;
    overall_progress: number;
    avg_score: number;
    course_details: Array<{
      course_id: number;
      course_title: string;
      completed_tasks: number;
      total_tasks: number;
      progress: number;
    }>;
  }>;
  at_risk_students: Array<{
    student_id: number;
    student_name: string;
    completion_rate: number;
    avg_test_score: number;
    risk_reason: string;
  }>;
  drop_off_points: Array<{
    course_id: number;
    course_title: string;
    unit_id: number;
    unit_title: string;
    unit_order: number;
    completion_rate: number;
    started: number;
    completed: number;
  }>;
  recent_activity: any[];
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Ошибка загрузки данных</div>
      </div>
    );
  }

  // Prepare data for charts - Course-level
  const courseCompletionData = stats.course_progress.map((c) => ({
    course: c.course_title,
    completion: c.completion_rate,
    avg_score: c.avg_test_score,
  }));

  // Calculate overall completion rate from courses
  const overallCompletionRate = stats.course_progress.length > 0
    ? stats.course_progress.reduce((sum, c) => sum + c.completion_rate, 0) / stats.course_progress.length
    : 0;

  // Calculate average test score across all courses
  const avgTestScore = stats.course_progress.length > 0
    ? stats.course_progress
        .filter(c => c.avg_test_score > 0)
        .reduce((sum, c) => sum + c.avg_test_score, 0) / stats.course_progress.filter(c => c.avg_test_score > 0).length
    : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-10">
      {/* Hero header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Панель преподавателя</h1>
          <p className="text-sm text-primary-100">
            Обзор платформы и состояние обучения
          </p>
        </div>

        <button
          onClick={() => navigate('/admin/courses/new')}
          className="bg-white text-primary-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-100 transition"
        >
          + Новый курс
        </button>
      </div>

      {/* Statistics Cards - 4 KPIs Only */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 hover:shadow-lg transition-all duration-200">
          <div className="w-10 h-10 bg-blue-50 flex items-center justify-center rounded-full">
            <BookOpen className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Курсы
            </p>
            <p className="text-2xl font-bold text-gray-900">{stats.courses_count}</p>
            {stats.courses_this_month > 0 && (
              <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                +{stats.courses_this_month} в этом месяце
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 hover:shadow-lg transition-all duration-200">
          <div className="w-10 h-10 bg-indigo-50 flex items-center justify-center rounded-full">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Студенты
            </p>
            <p className="text-2xl font-bold text-gray-900">{stats.students_count}</p>
            {stats.students_this_month > 0 && (
              <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                +{stats.students_this_month} в этом месяце
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 hover:shadow-lg transition-all duration-200">
          <div className="w-10 h-10 bg-emerald-50 flex items-center justify-center rounded-full">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Средний % завершения
            </p>
            <p className="text-2xl font-bold text-gray-900">{Math.round(overallCompletionRate)}%</p>
            <p className="text-[11px] text-gray-400 mt-1">
              По всем курсам
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 hover:shadow-lg transition-all duration-200">
          <div className="w-10 h-10 bg-orange-50 flex items-center justify-center rounded-full">
            <ClipboardList className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Средний балл %
            </p>
            <p className="text-2xl font-bold text-gray-900">{Math.round(avgTestScore)}%</p>
            <p className="text-[11px] text-gray-400 mt-1">
              Средний по тестам
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions - Icon Row */}
      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/admin/courses/new')}
          className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl shadow-sm hover:shadow-md hover:bg-primary-50 transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Создать курс</span>
          <span className="text-xs text-gray-500">{stats.courses_count}</span>
        </button>

        <button
          onClick={() => navigate('/admin/units/new')}
          className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl shadow-sm hover:shadow-md hover:bg-primary-50 transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Создать юнит</span>
          <span className="text-xs text-gray-500">{stats.units_count}</span>
        </button>

        <button
          onClick={() => navigate('/admin/videos/new')}
          className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl shadow-sm hover:shadow-md hover:bg-primary-50 transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
            <Video className="w-5 h-5 text-primary-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Создать видео</span>
          <span className="text-xs text-gray-500">{stats.videos_count}</span>
        </button>

        <button
          onClick={() => navigate('/admin/tests/new')}
          className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl shadow-sm hover:shadow-md hover:bg-primary-50 transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-primary-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Создать тест</span>
          <span className="text-xs text-gray-500">{stats.tests_count}</span>
        </button>
      </div>

      {/* Insight Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Course Health */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Завершение курсов
          </h3>

          {courseCompletionData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={courseCompletionData.slice(0, 5)}>
                  <XAxis dataKey="course" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="completion" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>

              <p className="text-xs text-gray-500 mt-2">
                Топ 5 активных курсов
              </p>
            </>
          ) : (
            <div className="flex items-center justify-center h-44 text-gray-400 text-sm">
              Нет данных о курсах
            </div>
          )}
        </div>

        {/* Student Health */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Вовлеченность студентов
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {Math.round(overallCompletionRate)}%
              </p>
              <p className="text-xs text-gray-500">
                Средний процент завершения
              </p>
            </div>

            <div className="text-right">
              <p className="text-sm text-emerald-600 font-medium">
                Здорово
              </p>
              <p className="text-xs text-gray-500">
                Нет критических отсевов
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
