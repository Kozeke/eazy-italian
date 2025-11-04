import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
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

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // TODO: replace these with real data from API later
  const myCoursesCount = 3;
  const completedUnits = 12;
  const averageScore = 85;
  const timeSpentHours = 24;

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
            Добро пожаловать в Eazy Italian
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
              <p className="text-sm font-semibold">Unit 2 · Приветствия</p>
            </div>
          </div>
          <Link
            to="/units"
            className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white text-primary-700 text-sm font-semibold hover:bg-gray-100 transition-colors"
          >
            Продолжить обучение
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Link>
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
            <p className="text-2xl font-bold text-violet-700">{timeSpentHours}ч</p>
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
              <div className="flex items-start gap-3">
                <span className="mt-1 w-2 h-2 rounded-full bg-emerald-500" />
                <div>
                  <p className="text-sm text-gray-700">
                    Завершен урок <span className="font-semibold">«Приветствие и знакомство»</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Сегодня · Unit 1</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 w-2 h-2 rounded-full bg-blue-500" />
                <div>
                  <p className="text-sm text-gray-700">
                    Отправлено задание <span className="font-semibold">«Практика приветствий»</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Вчера · оценивание ожидается</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 w-2 h-2 rounded-full bg-yellow-500" />
                <div>
                  <p className="text-sm text-gray-700">
                    Пройден тест <span className="font-semibold">«Тест по приветствиям»</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">2 дня назад · результат 92%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recommended courses / units */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary-600" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Рекомендованные юниты
                </h3>
              </div>
              <Link
                to="/units"
                className="text-xs font-medium text-primary-600 hover:text-primary-700 inline-flex items-center"
              >
                Открыть все
                <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </div>
            <div className="px-5 py-4 grid gap-4 md:grid-cols-2">
              <div className="border border-gray-100 rounded-lg p-4 hover:border-primary-200 hover:bg-primary-50/40 transition-colors">
                <p className="text-xs font-semibold text-primary-600 mb-1">A1 • Beginner</p>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  Unit 2: Числа и возраст
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Научитесь считать и говорить о возрасте на итальянском.
                </p>
                <button className="inline-flex items-center text-xs font-semibold text-primary-600 hover:text-primary-700">
                  Продолжить
                  <ArrowRight className="w-3 h-3 ml-1" />
                </button>
              </div>
              <div className="border border-gray-100 rounded-lg p-4 hover:border-primary-200 hover:bg-primary-50/40 transition-colors">
                <p className="text-xs font-semibold text-primary-600 mb-1">A1 • Beginner</p>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  Unit 3: Семья и друзья
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Словарь и фразы для описания семьи и отношений.
                </p>
                <button className="inline-flex items-center text-xs font-semibold text-primary-600 hover:text-primary-700">
                  Начать юнит
                  <ArrowRight className="w-3 h-3 ml-1" />
                </button>
              </div>
            </div>
          </div>
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
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-800">
                    Задание <span className="font-semibold">«Перевод чисел»</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Unit 2 • A1</p>
                </div>
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                  Через 2 дня
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-800">
                    Задание <span className="font-semibold">«Описание семьи»</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Unit 3 • A1</p>
                </div>
                <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
                  Через 5 дней
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-800">
                    Тест <span className="font-semibold">«Тема: Приветствия»</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Итоговый тест Unit 1</p>
                </div>
                <span className="text-xs font-semibold text-yellow-700 bg-yellow-50 px-2 py-1 rounded-full">
                  Через 7 дней
                </span>
              </div>
            </div>
          </div>

          {/* Mini progress summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Прогресс по активному курсу
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Unit 1: Приветствия</span>
                <span className="font-semibold text-primary-700">80%</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-primary-500 rounded-full"
                  style={{ width: '80%' }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Позже сюда можно вывести реальные данные с бэкенда (завершенные видео,
                задания и тесты).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
