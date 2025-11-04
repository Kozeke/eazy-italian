import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  ClipboardList,
  Mail,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  BookOpen,
  Activity,
  Sparkles,
  ArrowRight
} from 'lucide-react';

// Mock data - replace with real API later
const mockKPIData = {
  activeStudents: { today: 45, thisWeek: 128, change: 12 },
  pendingSubmissions: { count: 23, urgent: 5 },
  testsInProgress: { active: 8, dueSoon: 3 },
  emailCampaigns: { scheduled: 4, sent: 156, deliveryRate: 98.2 },
};

const mockRecentActivity = [
  {
    id: 1,
    type: 'submission',
    message: 'Анна Петрова отправила задание "Грамматика A1"',
    time: '2 минуты назад',
    status: 'pending',
  },
  {
    id: 2,
    type: 'grade',
    message: 'Иван Сидоров получил 85% за тест "Лексика A1"',
    time: '15 минут назад',
    status: 'completed',
  },
  {
    id: 3,
    type: 'publish',
    message: 'Опубликован новый урок "Разговорная речь A2"',
    time: '1 час назад',
    status: 'published',
  },
  {
    id: 4,
    type: 'email',
    message: 'Отправлено напоминание о дедлайне для 15 студентов',
    time: '2 часа назад',
    status: 'sent',
  },
];

const mockAlerts = [
  {
    id: 1,
    type: 'warning',
    message: '5 заданий ожидают проверки более 24 часов',
    action: 'Проверить',
  },
  {
    id: 2,
    type: 'error',
    message: 'Ошибка отправки email для кампании "Напоминание о тесте"',
    action: 'Исправить',
  },
  {
    id: 3,
    type: 'info',
    message: 'Использовано 85% дискового пространства',
    action: 'Просмотреть',
  },
];

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'createUnit':
        navigate('/admin/units/new');
        break;
      case 'createTask':
        navigate('/admin/tasks/new');
        break;
      case 'createTest':
        navigate('/admin/tests/new');
        break;
      case 'newEmailCampaign':
        navigate('/admin/email-campaigns/new');
        break;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'submission':
        return <FileText className="w-4 h-4 text-blue-500" />;
      case 'grade':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'publish':
        return <BookOpen className="w-4 h-4 text-purple-500" />;
      case 'email':
        return <Mail className="w-4 h-4 text-orange-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'info':
        return <Clock className="w-4 h-4 text-blue-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl text-white px-6 py-6 md:px-8 md:py-8 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center bg-white/15 px-3 py-1 rounded-full text-xs font-medium mb-2">
            <Sparkles className="w-4 h-4 mr-1" />
            Панель преподавателя
          </div>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">
            {t('admin.dashboard.title') || 'Админ-панель Eazy Italian'}
          </h1>
          <p className="mt-2 text-sm md:text-base text-primary-100 max-w-xl">
            Управляйте уроками, заданиями, тестами и отслеживайте активность студентов в реальном времени.
          </p>
        </div>
        <div className="text-sm text-primary-100">
          {new Date().toLocaleDateString('ru-RU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-10 h-10 bg-blue-50 flex items-center justify-center rounded-full">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Активные студенты
            </p>
            <p className="text-2xl font-bold text-gray-900">{mockKPIData.activeStudents.today}</p>
            <div className="flex items-center mt-1 text-sm text-green-600">
              <TrendingUp className="w-4 h-4 mr-1" />+{mockKPIData.activeStudents.change}% за неделю
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-10 h-10 bg-yellow-50 flex items-center justify-center rounded-full">
            <FileText className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Ожидают проверки
            </p>
            <p className="text-2xl font-bold text-gray-900">{mockKPIData.pendingSubmissions.count}</p>
            <p className="text-xs text-red-600 font-medium mt-1">
              {mockKPIData.pendingSubmissions.urgent} срочных
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-10 h-10 bg-purple-50 flex items-center justify-center rounded-full">
            <ClipboardList className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Активные тесты
            </p>
            <p className="text-2xl font-bold text-gray-900">{mockKPIData.testsInProgress.active}</p>
            <p className="text-xs text-orange-600 font-medium mt-1">
              {mockKPIData.testsInProgress.dueSoon} скоро истекают
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-10 h-10 bg-emerald-50 flex items-center justify-center rounded-full">
            <Mail className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Email кампании
            </p>
            <p className="text-2xl font-bold text-gray-900">{mockKPIData.emailCampaigns.sent}</p>
            <p className="text-xs text-green-600 font-medium mt-1">
              {mockKPIData.emailCampaigns.deliveryRate}% доставлено
            </p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Быстрые действия</h2>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: <BookOpen className="w-6 h-6 text-primary-600" />, label: 'Создать урок', action: 'createUnit' },
            { icon: <FileText className="w-6 h-6 text-primary-600" />, label: 'Создать задание', action: 'createTask' },
            { icon: <ClipboardList className="w-6 h-6 text-primary-600" />, label: 'Создать тест', action: 'createTest' },
            { icon: <Mail className="w-6 h-6 text-primary-600" />, label: 'Email рассылка', action: 'newEmailCampaign' },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={() => handleQuickAction(btn.action)}
              className="flex items-center justify-start p-4 border border-gray-100 rounded-lg hover:bg-primary-50 hover:border-primary-200 transition-all"
            >
              <div className="mr-3">{btn.icon}</div>
              <div className="text-left">
                <p className="font-semibold text-gray-900 text-sm">{btn.label}</p>
                <p className="text-xs text-gray-500">1 клик для создания</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Activity and Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Последняя активность</h3>
            <button className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center">
              Все <ArrowRight className="w-3 h-3 ml-1" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            {mockRecentActivity.map((a) => (
              <div key={a.id} className="flex items-start gap-3">
                <div>{getActivityIcon(a.type)}</div>
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{a.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Уведомления</h3>
          </div>
          <div className="p-6 space-y-4">
            {mockAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-lg p-3 hover:bg-gray-100 transition-all"
              >
                <div>{getAlertIcon(alert.type)}</div>
                <div className="flex-1">
                  <p className="text-sm text-gray-800">{alert.message}</p>
                  <button className="mt-1 text-xs font-medium text-primary-600 hover:text-primary-700">
                    {alert.action}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
