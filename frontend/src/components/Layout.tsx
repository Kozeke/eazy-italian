/**
 * Layout Component
 * 
 * Student layout with sidebar navigation (similar to admin layout).
 * Provides consistent navigation structure with mobile-responsive sidebar.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  BookOpen,
  FileText,
  User,
  Menu,
  GraduationCap,
  LogOut,
  BookMarked,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  // Sidebar open/close state for mobile
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // Navigation items for student area
  const navigation = [
    { name: t('nav.dashboard'), href: '/dashboard', icon: Home },
    { name: t('nav.courses'), href: '/courses', icon: BookMarked },
    { name: t('nav.myCourses') || 'My Courses', href: '/my-courses', icon: BookOpen },
    // { name: t('nav.tasks'), href: '/tasks', icon: ClipboardList },
    { name: t('nav.tests'), href: '/tests', icon: FileText },
    { name: t('nav.profile'), href: '/profile', icon: User },
  ];

  // Check if navigation item is active based on current route
  const isActive = (href: string) => location.pathname === href;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay for sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar – student nav */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 shadow-sm
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static
        `}
      >
        {/* Brand / logo */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center gap-3">
          <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary-600 to-primary-400 text-white shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-slate-900">EZ Italian</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-primary-500">
                Student
              </span>
            </div>
          </Link>
        </div>

        {/* Nav items */}
        {user && (
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <item.icon
                  className={`h-5 w-5 ${
                    isActive(item.href)
                      ? 'text-primary-600'
                      : 'text-slate-400 group-hover:text-slate-500'
                  }`}
                />
                <span className="truncate">{item.name}</span>
              </Link>
            ))}
          </nav>
        )}

        {/* Sidebar footer – small hint or version */}
        <div className="border-t border-slate-200 px-4 py-3 text-[11px] text-slate-400">
          {t('layout.studentHint') ||
            'Follow your Italian course step by step: dashboard, units, tasks and tests.'}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar – compact */}
        <header className="sticky top-0 z-20 h-14 bg-white border-b border-slate-200 flex items-center">
          <div className="flex w-full items-center justify-between px-4 sm:px-6 lg:px-8">
            {/* Left: burger + page title placeholder */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              >
                <Menu className="h-5 w-5" />
              </button>
              <span className="text-sm font-semibold text-slate-800 hidden sm:inline">
                {t('layout.studentArea') || 'Student area'}
              </span>
            </div>

            {/* Right: language switcher + user + logout */}
            <div className="flex items-center gap-3">
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

              {user && (
                <>
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                      {user.first_name?.[0]}
                      {user.last_name?.[0]}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-xs font-medium text-slate-900">
                        {user.first_name} {user.last_name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {t('layout.roleStudent') || 'Student'}
                      </span>
                    </div>
                  </div>

                  {/* Mobile initials only */}
                  <div className="sm:hidden flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                    {user.first_name?.[0]}
                    {user.last_name?.[0]}
                  </div>

                  <button
                    onClick={logout}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title={t('nav.logout')}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
