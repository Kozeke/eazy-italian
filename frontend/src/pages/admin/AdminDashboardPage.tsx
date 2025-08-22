
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
  Activity
} from 'lucide-react';

// Mock data - replace with actual API calls
const mockKPIData = {
  activeStudents: { today: 45, thisWeek: 128, change: 12 },
  pendingSubmissions: { count: 23, urgent: 5 },
  testsInProgress: { active: 8, dueSoon: 3 },
  emailCampaigns: { scheduled: 4, sent: 156, deliveryRate: 98.2 }
};

const mockRecentActivity = [
  {
    id: 1,
    type: 'submission',
    message: 'Анна Петрова отправила задание "Грамматика A1"',
    time: '2 минуты назад',
    status: 'pending'
  },
  {
    id: 2,
    type: 'grade',
    message: 'Иван Сидоров получил 85% за тест "Лексика A1"',
    time: '15 минут назад',
    status: 'completed'
  },
  {
    id: 3,
    type: 'publish',
    message: 'Опубликован новый урок "Разговорная речь A2"',
    time: '1 час назад',
    status: 'published'
  },
  {
    id: 4,
    type: 'email',
    message: 'Отправлено напоминание о дедлайне для 15 студентов',
    time: '2 часа назад',
    status: 'sent'
  }
];

const mockAlerts = [
  {
    id: 1,
    type: 'warning',
    message: '5 заданий ожидают проверки более 24 часов',
    action: 'Проверить'
  },
  {
    id: 2,
    type: 'error',
    message: 'Ошибка отправки email для кампании "Напоминание о тесте"',
    action: 'Исправить'
  },
  {
    id: 3,
    type: 'info',
    message: 'Использовано 85% дискового пространства',
    action: 'Просмотреть'
  }
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
    <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('admin.dashboard.title')}
            </h1>
            <p className="text-gray-600">
              Панель управления для преподавателей
            </p>
          </div>
          <div className="text-sm text-gray-500">
            {new Date().toLocaleDateString('ru-RU', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
        </div>

        {/* KPI Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Active Students */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  {t('admin.dashboard.kpi.activeStudents')}
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {mockKPIData.activeStudents.today}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-600">+{mockKPIData.activeStudents.change}%</span>
              <span className="text-gray-500 ml-1">за неделю</span>
            </div>
          </div>

          {/* Pending Submissions */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <FileText className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  {t('admin.dashboard.kpi.pendingSubmissions')}
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {mockKPIData.pendingSubmissions.count}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center text-sm">
                <span className="text-red-600 font-medium">
                  {mockKPIData.pendingSubmissions.urgent} срочных
                </span>
              </div>
            </div>
          </div>

          {/* Tests in Progress */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ClipboardList className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  {t('admin.dashboard.kpi.testsInProgress')}
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {mockKPIData.testsInProgress.active}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center text-sm">
                <Clock className="w-4 h-4 text-orange-500 mr-1" />
                <span className="text-orange-600">
                  {mockKPIData.testsInProgress.dueSoon} скоро истекают
                </span>
              </div>
            </div>
          </div>

          {/* Email Campaigns */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Mail className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  {t('admin.dashboard.kpi.emailCampaigns')}
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {mockKPIData.emailCampaigns.sent}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center text-sm">
                <span className="text-green-600 font-medium">
                  {mockKPIData.emailCampaigns.deliveryRate}% доставлено
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Быстрые действия</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => handleQuickAction('createUnit')}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
              >
                <BookOpen className="w-6 h-6 text-primary-600 mr-3" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">
                    {t('admin.dashboard.quickActions.createUnit')}
                  </p>
                  <p className="text-sm text-gray-500">Создать новый урок</p>
                </div>
              </button>

              <button
                onClick={() => handleQuickAction('createTask')}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
              >
                <FileText className="w-6 h-6 text-primary-600 mr-3" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">
                    {t('admin.dashboard.quickActions.createTask')}
                  </p>
                  <p className="text-sm text-gray-500">Создать задание</p>
                </div>
              </button>

              <button
                onClick={() => handleQuickAction('createTest')}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
              >
                <ClipboardList className="w-6 h-6 text-primary-600 mr-3" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">
                    {t('admin.dashboard.quickActions.createTest')}
                  </p>
                  <p className="text-sm text-gray-500">Создать тест</p>
                </div>
              </button>

              <button
                onClick={() => handleQuickAction('newEmailCampaign')}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
              >
                <Mail className="w-6 h-6 text-primary-600 mr-3" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">
                    {t('admin.dashboard.quickActions.newEmailCampaign')}
                  </p>
                  <p className="text-sm text-gray-500">Отправить email</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Recent Activity & Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">
                {t('admin.dashboard.recentActivity')}
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {mockRecentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    {getActivityIcon(activity.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{activity.message}</p>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  Просмотреть все
                </button>
              </div>
            </div>
          </div>

          {/* Alerts */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">
                {t('admin.dashboard.alerts')}
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {mockAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                    {getAlertIcon(alert.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{alert.message}</p>
                      <button className="text-xs text-primary-600 hover:text-primary-700 font-medium mt-1">
                        {alert.action}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  Просмотреть все уведомления
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
