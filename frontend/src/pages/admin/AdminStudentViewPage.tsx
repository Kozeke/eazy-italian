import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mail, Calendar, ArrowLeft, User, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { progressApi, usersApi } from '../../services/api';

export default function AdminStudentViewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [studentProfile, setStudentProfile] = useState<any | null>(null);
  const [studentProgress, setStudentProgress] = useState<any | null>(null);

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
        const [students, progress] = await Promise.all([
          usersApi.getStudents(),
          progressApi.getStudentsProgress(),
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
        </div>
      </div>
    </div>
  );
}
