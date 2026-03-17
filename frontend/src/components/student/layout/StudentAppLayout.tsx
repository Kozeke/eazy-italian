/**
 * StudentAppLayout.tsx  (v2 — Design System)
 *
 * App shell for the student-facing area OUTSIDE classroom mode.
 *
 * What changed from v1:
 * ─────────────────────
 * • Brand + topbar accent switched to teal (student identity)
 * • Mobile topbar: teal brand mark + teal focus rings
 * • Mobile topbar: added user name next to avatar (hidden below xs)
 * • Mobile overlay uses teal-tinted backdrop for student feel
 * • Page content area uses bg-slate-50 (same structural rhythm as teacher panel)
 * • Added `student-app-topbar` class for classroom-mode CSS hiding
 * • classroom-mode body class still hides sidebar + topbar via CSS rules
 *
 * Structure:
 *   <StudentAppLayout>
 *     <StudentSidebar />          ← fixed left rail (w-64 on desktop)
 *     <div.main-area>
 *       <header.student-app-topbar /> ← sticky topbar (mobile only)
 *       <main><Outlet /></main>   ← page content
 *     </div>
 *   </StudentAppLayout>
 */

import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, GraduationCap } from 'lucide-react';
import StudentSidebar from './StudentSidebar';
import { useAuth } from '../../../hooks/useAuth';

// ─── Page title map (used in mobile topbar breadcrumb) ────────────────────────

const PAGE_TITLES: Record<string, string> = {
  '/student/classes':  'My Classes',
  '/student/grades':   'Grades',
  '/student/settings': 'Settings',
};

function usePageTitle() {
  const location = useLocation();
  // Check exact match first, then prefix match
  const exact = PAGE_TITLES[location.pathname];
  if (exact) return exact;
  const prefix = Object.keys(PAGE_TITLES).find((k) =>
    location.pathname.startsWith(k + '/')
  );
  return prefix ? PAGE_TITLES[prefix] : 'Student Portal';
}

// ─── StudentAppLayout ─────────────────────────────────────────────────────────

export default function StudentAppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pageTitle = usePageTitle();

  const handleLogout = async () => {
    const loggedOut = await logout();
    if (loggedOut) {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      navigate('/login', { replace: true });
    }
  };

  const initials =
    (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* ── Mobile overlay ──────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        >
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
        </div>
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <StudentSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        onLogout={handleLogout}
      />

      {/* ── Main content area ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">

        {/* ── Sticky mobile topbar ──────────────────────────────────────── */}
        {/*    Hidden on desktop (sidebar handles branding there).          */}
        {/*    Hidden in classroom-mode via .student-app-topbar CSS rule.   */}
        <header
          className="student-app-topbar sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur shadow-sm lg:hidden"
          role="banner"
        >
          {/* Menu toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-teal-50 hover:text-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 text-white text-xs font-bold shadow-sm">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-slate-900 tracking-tight">EZ Italian</span>
          </div>

          {/* Page title (center, on sm+) */}
          <div className="hidden sm:flex flex-1 items-center justify-center">
            <span className="text-sm font-semibold text-slate-600">{pageTitle}</span>
          </div>

          {/* User avatar + name */}
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden xs:block text-xs font-medium text-slate-500">
              {user?.first_name}
            </span>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-xs font-bold text-white ring-2 ring-white shadow-sm"
              aria-label={`${user?.first_name} ${user?.last_name}`}
            >
              {initials}
            </div>
          </div>
        </header>

        {/* ── Page content ──────────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
