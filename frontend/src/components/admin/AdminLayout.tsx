/**
 * Admin Layout Component
 * 
 * Instructor dashboard layout with sidebar navigation for admin/instructor pages.
 * Provides consistent navigation structure with teaching tools, search functionality,
 * and quick actions. Matches instructor dashboard style.
 */

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
  Plus,
  GraduationCap,
} from 'lucide-react';

interface AdminLayoutProps {}

// Navigation items for instructor/admin panel
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
  // Sidebar open/close state for mobile
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Search query state for quick search functionality
  const [searchQuery, setSearchQuery] = useState('');

  // Handle user logout and redirect to login
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Handle quick search on Enter key press
  const handleQuickSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      // Implement quick search functionality
      console.log('Quick search:', searchQuery);
    }
  };

  // Handle new item creation based on current route context
  const handleNewItem = () => {
    const currentPath = location.pathname;
    if (currentPath.includes('/units')) {
      navigate('/admin/units/new');
    } else if (currentPath.includes('/tasks')) {
      navigate('/admin/tasks/new');
    } else if (currentPath.includes('/tests')) {
      navigate('/admin/tests/new');
    }
  };

  // Check if navigation item is active based on current route
  const isActive = (href: string) =>
    location.pathname === href ||
    (href !== '/admin' && location.pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="fixed inset-0 bg-gray-900/40" />
        </div>
      )}

      {/* Sidebar – instructor panel style */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white/95 backdrop-blur shadow-lg ring-1 ring-slate-100 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:inset-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary-600 to-primary-400 text-white shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-slate-900">Eazy Italian</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-primary-500">
                Instructor
              </span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden rounded-md p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t('admin.nav.sectionMain') || 'Teaching tools'}
          </p>
          <div className="space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 ${
                    isActive(item.href)
                      ? 'text-primary-600'
                      : 'text-slate-400 group-hover:text-slate-500'
                  }`}
                />
                <span className="truncate">{t(`admin.nav.${item.name}`)}</span>
              </Link>
            ))}
          </div>
        </nav>

        {/* Sidebar bottom – small hint */}
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400">
          {t('admin.footer.hint') ||
            'Manage your content, students and analytics from this instructor panel.'}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar – like an instructor dashboard header */}
        <header className="sticky top-0 z-30 flex flex-shrink-0 items-center border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
          <div className="flex w-full items-center justify-between px-4 sm:px-6 lg:px-8 h-14 sm:h-16">
            {/* Left side */}
            <div className="flex flex-1 items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Quick search */}
              <div className="flex-1 max-w-lg">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder={t('admin.search.placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleQuickSearch}
                    className="w-full rounded-full border border-slate-200 bg-slate-50 px-9 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </div>
            </div>

            {/* Right side */}
            <div className="ml-4 flex items-center gap-3">
              {/* Quick actions */}
              <button
                onClick={handleNewItem}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1"
              >
                <Plus className="h-4 w-4" />
                {t('admin.actions.new')}
              </button>

              {/* Notifications */}
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                <Bell className="h-4 w-4" />
              </button>

              {/* Language Switcher */}
              <button
                onClick={() => {
                  const currentLang = i18n.language;
                  const newLang = currentLang === 'ru' ? 'en' : 'ru';
                  i18n.changeLanguage(newLang);
                }}
                className="hidden sm:inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title={
                  i18n.language === 'ru'
                    ? 'Switch to English'
                    : 'Переключиться на русский'
                }
              >
                <span>{i18n.language === 'ru' ? '🇷🇺 RU' : '🇺🇸 EN'}</span>
              </button>

              {/* Profile bubble */}
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                  {user?.first_name?.[0]}
                  {user?.last_name?.[0]}
                </div>
                <div className="hidden sm:flex flex-col leading-tight">
                  <span className="text-xs font-medium text-slate-900">
                    {user?.first_name} {user?.last_name}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {t('admin.role') || 'Instructor'}
                  </span>
                </div>
              </div>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                title={t('nav.logout')}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content – centered, like course management pages */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
