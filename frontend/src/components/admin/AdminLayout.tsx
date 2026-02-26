/**
 * Admin Layout Component
 * 
 * Instructor dashboard layout with sidebar navigation for admin/instructor pages.
 * Provides consistent navigation structure with teaching tools, search functionality,
 * and quick actions. Matches instructor dashboard style.
 */

import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useAuth } from '../../hooks/useAuth';
import NotificationCenter from './NotificationCenter';
import { coursesApi, tasksApi, gradesApi } from '../../services/api';
import {
  LayoutDashboard,
  BookOpen,
  Video,
  ClipboardList,
  Users,
  BarChart3,
  LogOut,
  Menu,
  X,
  Plus,
  GraduationCap,
  BookMarked,
  FileText,
  Folder,
  CheckSquare,
  File,
  Settings,
} from 'lucide-react';
import './AdminLayout.css';

interface AdminLayoutProps {}

interface DashboardStats {
  courses_count: number;
  units_count: number;
  videos_count: number;
  tests_count: number;
  students_count: number;
  tasks_count: number;
  grades_count: number;
}

export default function AdminLayout({}: AdminLayoutProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Sidebar open/close state for mobile
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Fetch dashboard statistics for sidebar counts
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [dashboardData, tasksData, gradesData] = await Promise.all([
          coursesApi.getDashboardStatistics(),
          tasksApi.getTasks().catch(() => []), // Fallback to empty array if fails
          gradesApi.getGrades({ page: 1, page_size: 1 }).catch(() => ({ total: 0, items: [] })), // Just get total count
        ]);

        setStats({
          courses_count: dashboardData.courses_count,
          units_count: dashboardData.units_count,
          videos_count: dashboardData.videos_count,
          tests_count: dashboardData.tests_count,
          students_count: dashboardData.students_count,
          tasks_count: Array.isArray(tasksData) ? tasksData.length : 0,
          grades_count: (gradesData as { total?: number; items?: any[] })?.total || 0,
        });
      } catch (error) {
        console.error('Failed to fetch dashboard statistics:', error);
      }
    };

    fetchStats();
  }, []);

  // Navigation items with dynamic badges based on stats
  const teachingTools = [
    { name: 'dashboard', href: '/admin', icon: LayoutDashboard, getBadge: () => null },
    { name: 'courses', href: '/admin/courses', icon: BookOpen, getBadge: () => stats?.courses_count },
    { name: 'units', href: '/admin/units', icon: Folder, getBadge: () => stats?.units_count },
    { name: 'videos', href: '/admin/videos', icon: Video, getBadge: () => stats?.videos_count },
    { name: 'tasks', href: '/admin/tasks', icon: CheckSquare, getBadge: () => stats?.tasks_count },
    { name: 'tests', href: '/admin/tests', icon: File, getBadge: () => stats?.tests_count },
  ];

  const people = [
    { name: 'students', href: '/admin/students', icon: Users, getBadge: () => stats?.students_count },
    { name: 'grades', href: '/admin/grades', icon: BarChart3, getBadge: () => stats?.grades_count },
  ];

  // Handle user logout and redirect to login
  const handleLogout = () => {
    const loggedOut = logout();
    // Only navigate if logout was actually performed (not blocked by active test)
    if (loggedOut) {
      navigate('/login');
    }
  };

  // Get breadcrumb label based on current path
  const getBreadcrumbLabel = (pathname: string, t: any): string => {
    if (pathname === '/admin') {
      return t('admin.nav.dashboard') || 'Dashboard';
    } else if (pathname.includes('/courses')) {
      return t('admin.nav.courses') || 'Courses';
    } else if (pathname.includes('/units')) {
      return t('admin.nav.units') || 'Units';
    } else if (pathname.includes('/videos')) {
      return t('admin.nav.videos') || 'Videos';
    } else if (pathname.includes('/tasks')) {
      return t('admin.nav.tasks') || 'Tasks';
    } else if (pathname.includes('/tests')) {
      return t('admin.nav.tests') || 'Tests';
    } else if (pathname.includes('/students')) {
      return t('admin.nav.students') || 'Students';
    } else if (pathname.includes('/grades')) {
      return t('admin.nav.grades') || 'Grades';
    }
    return 'Admin';
  };

  // Handle new item creation based on current route context
  const handleNewItem = () => {
    const currentPath = location.pathname;
    if (currentPath.includes('/courses')) {
      navigate('/admin/courses/new');
    } else if (currentPath.includes('/units')) {
      navigate('/admin/units/new');
    } else if (currentPath.includes('/videos')) {
      navigate('/admin/videos/new');
    } else if (currentPath.includes('/tasks')) {
      navigate('/admin/tasks/new');
    } else if (currentPath.includes('/tests')) {
      navigate('/admin/tests/new');
    } else if (currentPath.includes('/students')) {
      navigate('/admin/students/new');
    } else {
      // Default to courses if on dashboard or unknown route
      navigate('/admin/courses/new');
    }
  };

  // Check if navigation item is active based on current route
  const isActive = (href: string) =>
    location.pathname === href ||
    (href !== '/admin' && location.pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="fixed inset-0 bg-gray-900/40" />
        </div>
      )}

      {/* Sidebar – new dark design */}
      <aside
        className={`admin-sidebar ${
          sidebarOpen ? 'open' : ''
        }`}
      >
        <div className="admin-sidebar-inner">
          {/* Logo */}
          <Link to="/admin" className="admin-sidebar-logo">
            <div className="admin-sidebar-logo-mark">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <span className="admin-sidebar-logo-text">
              Teach<span>Flow</span>
            </span>
          </Link>

          {/* User */}
          <div className="admin-sidebar-user">
            <div className="admin-user-avatar">
              {user?.first_name?.[0] || 'U'}
            </div>
            <div className="admin-user-info">
              <span className="admin-user-name">
                {user?.first_name} {user?.last_name || ''}
              </span>
              <span className="admin-user-role">
                {t('admin.role') || 'Instructor'}
              </span>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1 }}>
            {/* Teaching Tools */}
            <div className="admin-nav-section">
              <div className="admin-nav-section-label">
                {t('admin.nav.sectionMain') || 'Teaching Tools'}
              </div>
              {teachingTools.map((item) => {
                const badge = item.getBadge();
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`admin-nav-item ${isActive(item.href) ? 'active' : ''}`}
                  >
                    <span className="admin-nav-icon">
                      <item.icon />
                    </span>
                    {t(`admin.nav.${item.name}`)}
                    {badge !== null && badge !== undefined && (
                      <span className="admin-nav-badge">{badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* People */}
            <div className="admin-nav-section">
              <div className="admin-nav-section-label">
                {t('admin.nav.sectionPeople') || 'People'}
              </div>
              {people.map((item) => {
                const badge = item.getBadge();
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`admin-nav-item ${isActive(item.href) ? 'active' : ''}`}
                  >
                    <span className="admin-nav-icon">
                      <item.icon />
                    </span>
                    {t(`admin.nav.${item.name}`)}
                    {badge !== null && badge !== undefined && (
                      <span className="admin-nav-badge">{badge}</span>
                    )}
                    {item.hasNotification && (
                      <div className="admin-notif-dot"></div>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Bottom */}
          <div className="admin-sidebar-bottom">
            <Link to="/admin/settings" className="admin-nav-item">
              <span className="admin-nav-icon">
                <Settings />
              </span>
              {t('admin.nav.settings') || 'Settings'}
            </Link>
            <button onClick={handleLogout} className="admin-nav-item">
              <span className="admin-nav-icon">
                <LogOut />
              </span>
              {t('nav.logout') || 'Sign Out'}
            </button>
          </div>
        </div>
        
        {/* Mobile close button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden absolute top-4 right-4 text-white/60 hover:text-white z-10"
        >
          <X className="h-6 w-6" />
        </button>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col admin-layout-main" style={{ marginLeft: '260px' }}>
        {/* Top bar – like an instructor dashboard header */}
        <header className="sticky top-0 z-30 flex flex-shrink-0 items-center border-b border-[rgba(14,14,14,0.12)] bg-[#f5f0e8]/95 backdrop-blur shadow-sm">
          <div className="flex w-full items-center justify-between px-4 sm:px-6 lg:px-8 h-14 sm:h-16">
            {/* Left side */}
            <div className="flex flex-1 items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden rounded-md p-2 text-[#6b6456] hover:bg-[#f0e9d8] hover:text-[#0e0e0e]"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Breadcrumb */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#6b6456] uppercase tracking-wide" style={{ fontFamily: "'Space Mono', monospace" }}>
                  TeachFlow
                </span>
                <span className="text-[#6b6456] opacity-35">›</span>
                <span className="text-xs font-medium text-[#0e0e0e]" style={{ fontFamily: "'Space Mono', monospace" }}>
                  {getBreadcrumbLabel(location.pathname, t)}
                </span>
              </div>
            </div>

            {/* Right side */}
            <div className="ml-4 flex items-center gap-3">
              {/* Quick actions */}
              <button
                onClick={handleNewItem}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#1a7070] px-3 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-[#2a9898] focus:outline-none focus:ring-2 focus:ring-[#1a7070]/40 focus:ring-offset-1" style={{ fontFamily: "'Space Mono', monospace" }}
              >
                <Plus className="h-4 w-4" />
                {t('admin.actions.new')}
              </button>

              {/* Notifications */}
              <NotificationCenter />

              {/* Language Switcher */}
              <button
                onClick={() => {
                  const currentLang = i18n.language;
                  const newLang = currentLang === 'ru' ? 'en' : 'ru';
                  i18n.changeLanguage(newLang);
                }}
                className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[rgba(14,14,14,0.12)] bg-[#f0e9d8] px-3 py-1.5 text-xs font-medium text-[#0e0e0e] hover:bg-[#f5f0e8]" style={{ fontFamily: "'Space Mono', monospace" }}
                title={
                  i18n.language === 'ru'
                    ? 'Switch to English'
                    : 'Переключиться на русский'
                }
              >
                <span>{i18n.language === 'ru' ? '🇷🇺 RU' : '🇺🇸 EN'}</span>
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
