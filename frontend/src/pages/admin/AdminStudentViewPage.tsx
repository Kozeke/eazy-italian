import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mail, Calendar, ArrowLeft, User, CheckCircle, XCircle, TrendingUp, Eye, Award, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { progressApi, usersApi, gradesApi } from '../../services/api';

export default function AdminStudentViewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [studentProfile, setStudentProfile] = useState<any | null>(null);
  const [studentProgress, setStudentProgress] = useState<any | null>(null);
  const [studentStats, setStudentStats] = useState<any | null>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);

  useEffect(() => {
    const loadStudent = async () => {
      if (!id) {
        toast.error('ID студента не найден');
        navigate('/admin/students');
        return;
      }

      setLoading(true);
      try {
        const studentId = parseInt(id, 10);
        const [students, progress, stats, courses] = await Promise.all([
          usersApi.getStudents(),
          progressApi.getStudentsProgress(),
          gradesApi.getStudentStats(studentId),
          gradesApi.getStudentEnrollments(studentId),
        ]);

        const profile = (students || []).find((s: any) => s.id === studentId);
        const progressRow = (progress || []).find((s: any) => s.id === studentId);

        if (!profile && !progressRow) {
          toast.error('Студент не найден');
          navigate('/admin/students');
          return;
        }

        setStudentProfile(profile || null);
        setStudentProgress(progressRow || null);
        setStudentStats(stats || null);
        setEnrollments(courses || []);
      } catch (error) {
        console.error('Error loading student:', error);
        toast.error('Ошибка загрузки данных студента');
      } finally {
        setLoading(false);
      }
    };

    loadStudent();
  }, [id, navigate]);

  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('ru-RU');
    } catch {
      return '—';
    }
  };

  const fullName = [
    studentProfile?.first_name || studentProgress?.first_name,
    studentProfile?.last_name || studentProgress?.last_name,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const initials = `${studentProfile?.first_name?.[0] || studentProgress?.first_name?.[0] || '?'}${studentProfile?.last_name?.[0] || studentProgress?.last_name?.[0] || '?'}`;

  const isActive = studentProfile?.is_active ?? studentProgress?.is_active ?? false;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/students')}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад к студентам
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                {fullName || 'Профиль студента'}
              </h1>
              <p className="mt-1 text-xs md:text-sm text-gray-500">
                ID: {id}
              </p>
            </div>
          </div>
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
            isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
          }`}>
            {isActive ? (
              <>
                <CheckCircle className="w-3 h-3 mr-1" />
                Активен
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3 mr-1" />
                Неактивен
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-gray-200 flex items-center justify-center text-lg font-semibold text-gray-700">
                {initials}
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">{fullName || '—'}</p>
                <p className="text-sm text-gray-500">{studentProfile?.role || 'student'}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <div className="flex items-center">
                <Mail className="w-4 h-4 mr-2 text-gray-400" />
                {studentProfile?.email || studentProgress?.email || '—'}
              </div>
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                Регистрация: {formatDate(studentProfile?.created_at || studentProgress?.created_at)}
              </div>
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                Последний вход: {formatDate(studentProfile?.last_login || studentProgress?.last_login)}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-primary-600" />
              <h2 className="text-base font-semibold text-gray-900">Подписка</h2>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <div>
                <span className="text-gray-500">Тип:</span>{' '}
                <span className="font-medium">
                  {studentProgress?.subscription || '—'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Действует до:</span>{' '}
                <span className="font-medium">
                  {formatDate(studentProgress?.subscription_ends_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-primary-600" />
              <h2 className="text-base font-semibold text-gray-900">Прогресс</h2>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <div>
                <span className="text-gray-500">Тесты:</span>{' '}
                <span className="font-medium">
                  {(studentProgress?.passed_tests ?? 0)} / {(studentProgress?.total_tests ?? 0)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Процент:</span>{' '}
                <span className="font-medium">
                  {studentProgress?.progress_percent ?? 0}%
                </span>
              </div>
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full"
                    style={{ width: `${Math.min(100, studentProgress?.progress_percent ?? 0)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-5 h-5 text-primary-600" />
              <h2 className="text-base font-semibold text-gray-900">Средний балл</h2>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <div>
                <span className="text-gray-500">Всего попыток:</span>{' '}
                <span className="font-medium">
                  {studentStats?.total_attempts ?? 0}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Средний балл:</span>{' '}
                <span className="font-medium text-2xl block mt-2">
                  {studentStats?.average_score ?? 0}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Registered Courses */}
        {enrollments && enrollments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-gray-900">Зарегистрированные курсы</h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">Курсы, на которые записан студент</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
              {enrollments.map((enrollment: any) => (
                <div
                  key={enrollment.course_id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => navigate(`/admin/courses/${enrollment.course_id}`)}
                >
                  <div className="flex items-start gap-3">
                    {enrollment.thumbnail_path ? (
                      <img
                        src={enrollment.thumbnail_path.startsWith('http') 
                          ? enrollment.thumbnail_path 
                          : `http://localhost:8000${enrollment.thumbnail_path}`}
                        alt={enrollment.title}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center">
                        <BookOpen className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {enrollment.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          {enrollment.level}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        <div>Юнитов: {enrollment.total_units}</div>
                        <div>Записан: {formatDate(enrollment.enrolled_at)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test Attempts History */}
        {studentStats && studentStats.attempts && studentStats.attempts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">История попыток</h2>
              <p className="text-sm text-gray-500 mt-1">Все попытки прохождения тестов</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Курс / Юнит
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Тест
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Балл
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Результат
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Время
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Дата
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {studentStats.attempts.map((attempt: any) => (
                    <tr key={attempt.attempt_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{attempt.course_title}</div>
                        <div className="text-sm text-gray-500">{attempt.unit_title}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {attempt.test_title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {attempt.score.toFixed(2)} / {attempt.passing_score.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {attempt.passed ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Пройдено
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Не пройдено
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {attempt.time_taken_seconds != null
                          ? `${Math.floor(attempt.time_taken_seconds / 60)}:${String(attempt.time_taken_seconds % 60).padStart(2, '0')}`
                          : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(attempt.submitted_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => navigate(`/admin/grades/${attempt.attempt_id}`)}
                          className="text-primary-600 hover:text-primary-900"
                          title="Просмотреть детали"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
