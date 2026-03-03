import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { testsApi, gradesApi } from '../../services/api';
import {
  ArrowLeft, Edit, Trash2, Archive,
  Clock, Brain, Percent, BookOpen, Calendar,
  Users, TrendingUp, CheckCircle, ClipboardList,
  BarChart2,
} from 'lucide-react';

type TestStatus = 'draft' | 'published' | 'scheduled' | 'archived';

export default function AdminTestDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [test, setTest]       = useState<any>(null);
  const [stats, setStats]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadTest();
      loadStats();
    }
  }, [id]);

  const loadTest = async () => {
    try {
      setLoading(true);
      const data = await testsApi.getTest(parseInt(id!));
      setTest(data);
    } catch (error) {
      console.error('Error loading test:', error);
      toast.error('Ошибка загрузки теста');
      navigate('/admin/tests');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const allStats = await gradesApi.getTestsStatistics();
      const testId = parseInt(id!);
      if (allStats[testId]) setStats(allStats[testId]);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Вы уверены, что хотите удалить этот тест? Это действие нельзя отменить.')) return;
    try {
      await testsApi.deleteTest(parseInt(id!));
      toast.success('Тест удален');
      navigate('/admin/tests');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Ошибка при удалении теста');
    }
  };

  const handleArchive = () => {
    toast('Функция архивирования будет реализована', { icon: 'ℹ️' });
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Не указано';
    try {
      return new Date(dateString).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch { return 'Не указано'; }
  };

  const statusConfig: Record<TestStatus, { color: string; label: string }> = {
    draft:     { color: 'bg-gray-100 text-gray-700',   label: 'Черновик' },
    published: { color: 'bg-green-100 text-green-800', label: 'Опубликован' },
    scheduled: { color: 'bg-blue-100 text-blue-800',   label: 'Запланирован' },
    archived:  { color: 'bg-red-100 text-red-700',     label: 'Архив' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-sm text-gray-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!test) return null;

  const statusCfg = statusConfig[test.status as TestStatus] || statusConfig.draft;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin/tests')}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary-600" />
                <h1 className="text-lg font-semibold text-gray-900">Детали теста</h1>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">ID: {test.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleArchive}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Archive className="w-4 h-4 mr-1.5" />
              Архивировать
            </button>
            <button
              onClick={handleDelete}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Удалить
            </button>
            <button
              onClick={() => navigate(`/admin/tests/${id}/analytics`)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <BarChart2 className="w-4 h-4 mr-1.5" />
              Аналитика
            </button>
            <button
              onClick={() => navigate(`/admin/tests/${id}/edit`)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              <Edit className="w-4 h-4 mr-1.5" />
              Редактировать
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Title card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-gray-900">{test.title}</h2>
              {test.description && (
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{test.description}</p>
              )}
              {test.instructions && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs font-medium text-blue-700 mb-1">Инструкция для студентов</p>
                  <p className="text-sm text-blue-900">{test.instructions}</p>
                </div>
              )}
            </div>
            <span className={`flex-shrink-0 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>

          {/* Quick stats row */}
          <div className="mt-5 pt-5 border-t border-gray-100 flex flex-wrap gap-6 text-sm text-gray-600">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-gray-400" />
              {test.time_limit_minutes || 30} мин
            </span>
            <span className="flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-gray-400" />
              {test.questions_count || 0} вопросов
            </span>
            <span className="flex items-center gap-1.5">
              <Percent className="w-4 h-4 text-gray-400" />
              Проходной балл: {test.passing_score || test.settings?.passing_score || 70}%
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-gray-400" />
              Попыток: {test.settings?.max_attempts || 1}
            </span>
          </div>
        </div>

        {/* Stats cards (if available) */}
        {stats && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">Статистика прохождений</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  <p className="text-xs text-gray-500">Студенты</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.unique_students}</p>
                <p className="text-xs text-gray-400 mt-0.5">уникальных</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-gray-500">Попытки</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.total_attempts}</p>
                <p className="text-xs text-gray-400 mt-0.5">всего</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Percent className="w-4 h-4 text-purple-500" />
                  <p className="text-xs text-gray-500">Средний балл</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.average_score.toFixed(1)}%</p>
                <p className="text-xs text-gray-400 mt-0.5">из 100%</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-orange-500" />
                  <p className="text-xs text-gray-500">Прошли</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.pass_rate.toFixed(1)}%</p>
                <p className="text-xs text-gray-400 mt-0.5">{stats.passed_attempts} из {stats.total_attempts}</p>
              </div>
            </div>
          </div>
        )}

        {/* Meta info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Информация</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {test.unit && (
              <div>
                <dt className="text-xs font-medium text-gray-400 mb-1">Юнит</dt>
                <dd className="flex items-center gap-2 text-sm text-gray-900">
                  <BookOpen className="w-4 h-4 text-gray-400" />
                  {test.unit.title}
                  {test.unit.level && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      {test.unit.level}
                    </span>
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-gray-400 mb-1">Создан</dt>
              <dd className="flex items-center gap-2 text-sm text-gray-900">
                <Calendar className="w-4 h-4 text-gray-400" />
                {formatDate(test.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-400 mb-1">Обновлён</dt>
              <dd className="flex items-center gap-2 text-sm text-gray-900">
                <Calendar className="w-4 h-4 text-gray-400" />
                {formatDate(test.updated_at)}
              </dd>
            </div>
            {test.settings?.deadline && (
              <div>
                <dt className="text-xs font-medium text-gray-400 mb-1">Дедлайн</dt>
                <dd className="flex items-center gap-2 text-sm text-gray-900">
                  <Calendar className="w-4 h-4 text-red-400" />
                  {formatDate(test.settings.deadline)}
                </dd>
              </div>
            )}
            {(test.settings?.availability_from || test.settings?.availability_to) && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-gray-400 mb-1">Период доступности</dt>
                <dd className="text-sm text-gray-900">
                  {test.settings.availability_from ? formatDate(test.settings.availability_from) : '—'}
                  {' → '}
                  {test.settings.availability_to ? formatDate(test.settings.availability_to) : '—'}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Settings summary */}
        {test.settings && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Настройки теста</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Перемешивать вопросы',  value: test.settings.shuffle_questions },
                { label: 'Перемешивать варианты', value: test.settings.shuffle_options },
                { label: 'Результаты сразу',       value: test.settings.show_results_immediately },
                { label: 'Просмотр ответов',       value: test.settings.allow_review },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${value ? 'bg-green-400' : 'bg-gray-300'}`} />
                  <span className="text-sm text-gray-600">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}