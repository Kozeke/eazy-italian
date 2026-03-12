/**
 * StudentAppLayout.tsx
 *
 * App shell for the student-facing area OUTSIDE classroom mode.
 * Shows a persistent sidebar, top header, and page content.
 *
 * Classroom mode (ClassroomLayout) mounts separately and hides
 * this shell via body.classroom-mode CSS rules.
 *
 * Structure:
 *   <StudentAppLayout>
 *     <StudentSidebar />          ← fixed left rail
 *     <div.main-area>
 *       <StudentHeader />         ← sticky top bar
 *       <main><Outlet /></main>   ← page content
 *     </div>
 *   </StudentAppLayout>
 */

import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import StudentSidebar from './StudentSidebar.tsx';
import { useAuth } from '../../hooks/useAuth';

export default function StudentAppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const loggedOut = await logout();
    if (loggedOut) {
      // Clear any remaining state
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      // Navigate to login page
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
        </div>
      )}

      {/* Sidebar */}
      <StudentSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Sticky top bar (mobile only — desktop uses sidebar header) */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur shadow-sm lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Brand on mobile */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-primary-400 text-white text-xs font-bold shadow-sm">
              EZ
            </div>
            <span className="text-sm font-bold text-slate-900">EZ Italian</span>
          </div>

          {/* User avatar on mobile */}
          <div className="ml-auto">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 ring-2 ring-white shadow-sm">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
