import React, { useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useAuth } from '../../hooks/useAuth';
import { 
  LayoutDashboard, 
  BookOpen, 
  Video, 
  FileText, 
  ClipboardList, 
  Database, 
  Users, 
  Mail, 
  BarChart3, 
  TrendingUp, 
  Settings, 
  FileText as AuditLog,
  Search,
  Bell,
  User,
  LogOut,
  Menu,
  X,
  Plus
} from 'lucide-react';

interface AdminLayoutProps {}

const navigation = [
  { name: 'dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'units', href: '/admin/units', icon: BookOpen },
  { name: 'videos', href: '/admin/videos', icon: Video },
  { name: 'tasks', href: '/admin/tasks', icon: FileText },
  { name: 'tests', href: '/admin/tests', icon: ClipboardList },
  { name: 'questionBank', href: '/admin/questions', icon: Database },
  { name: 'students', href: '/admin/students', icon: Users },
  { name: 'emailCampaigns', href: '/admin/email-campaigns', icon: Mail },
  { name: 'grades', href: '/admin/grades', icon: BarChart3 },
  { name: 'progress', href: '/admin/progress', icon: TrendingUp },
  { name: 'settings', href: '/admin/settings', icon: Settings },
  { name: 'auditLog', href: '/admin/audit-log', icon: AuditLog },
];

export default function AdminLayout({}: AdminLayoutProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleQuickSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      // Implement quick search functionality
      console.log('Quick search:', searchQuery);
    }
  };

  const handleNewItem = () => {
    // Implement new item creation based on current route
    const currentPath = location.pathname;
    if (currentPath.includes('/units')) {
      navigate('/admin/units/new');
    } else if (currentPath.includes('/tasks')) {
      navigate('/admin/tasks/new');
    } else if (currentPath.includes('/tests')) {
      navigate('/admin/tests/new');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
        </div>
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:inset-0 flex flex-col ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center">
            <BookOpen className="w-8 h-8 text-primary-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">Eazy Italian</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 mt-6 px-3 overflow-y-auto">
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.href !== '/admin' && location.pathname.startsWith(item.href));
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-3 py-3 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className={`mr-3 h-5 w-5 flex-shrink-0 ${
                    isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-500'
                  }`} />
                  <span className="truncate">{t(`admin.nav.${item.name}`)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            {/* Left side */}
            <div className="flex items-center flex-1">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 mr-2"
              >
                <Menu className="w-6 h-6" />
              </button>
              
              {/* Search */}
              <div className="flex-1 max-w-lg">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t('admin.search.placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleQuickSearch}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-4">
              {/* Quick actions */}
              <button
                onClick={handleNewItem}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                <Plus className="w-4 h-4 mr-1" />
                {t('admin.actions.new')}
              </button>

              {/* Notifications */}
              <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md">
                <Bell className="w-5 h-5" />
              </button>

              {/* Language Switcher */}
              <div className="relative">
                <button 
                  onClick={() => {
                    const currentLang = i18n.language;
                    const newLang = currentLang === 'ru' ? 'en' : 'ru';
                    i18n.changeLanguage(newLang);
                  }}
                  className="flex items-center space-x-2 p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                  title={i18n.language === 'ru' ? 'Switch to English' : 'Переключиться на русский'}
                >
                  <span className="text-sm font-medium">
                    {i18n.language === 'ru' ? '🇷🇺 RU' : '🇺🇸 EN'}
                  </span>
                </button>
              </div>

              {/* Profile dropdown */}
              <div className="relative">
                <button className="flex items-center space-x-2 p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md">
                  <User className="w-5 h-5" />
                  <span className="text-sm font-medium">{user?.first_name} {user?.last_name}</span>
                </button>
              </div>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
                title={t('nav.logout')}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
