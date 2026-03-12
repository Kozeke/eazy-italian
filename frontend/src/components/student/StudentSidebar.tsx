/**
 * StudentSidebar.tsx
 *
 * Left navigation rail for the student app shell.
 * Minimal nav: My Classes · Grades · Settings
 *
 * On desktop: always visible, fixed at left edge (w-64)
 * On mobile:  slides in as a drawer when `open` is true
 *
 * The sidebar is hidden automatically inside classroom mode
 * by body.classroom-mode CSS rules in classroom-mode.css.
 */

import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  BarChart3,
  Settings,
  GraduationCap,
  LogOut,
  X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentSidebarProps {
  open: boolean;
  onClose: () => void;
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
  onLogout: () => void;
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'My Classes', href: '/student/classes', icon: BookOpen },
  { label: 'Grades',     href: '/student/grades',  icon: BarChart3 },
  { label: 'Settings',   href: '/student/settings', icon: Settings },
];

// ─── StudentSidebar ───────────────────────────────────────────────────────────

export default function StudentSidebar({
  open,
  onClose,
  user,
  onLogout,
}: StudentSidebarProps) {
  const location = useLocation();

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  return (
    <aside
      className={[
        // Base styles
        'fixed inset-y-0 left-0 z-50 flex w-64 flex-col',
        'bg-white/98 backdrop-blur shadow-xl ring-1 ring-slate-100',
        // Desktop: always visible
        'lg:translate-x-0',
        // Mobile: slide in/out
        'transform transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}
    >
      {/* ── Brand header ─────────────────────────────────────────────────── */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-400 text-white shadow-md">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-slate-900">EZ Italian</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-500">
              Student
            </span>
          </div>
        </div>

        {/* Close button – mobile only */}
        <button
          onClick={onClose}
          className="lg:hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Navigation
        </p>

        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                className={[
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-100 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                ].join(' ')}
              >
                <item.icon
                  className={[
                    'h-4.5 w-4.5 shrink-0 transition-colors',
                    active
                      ? 'text-primary-600'
                      : 'text-slate-400 group-hover:text-slate-600',
                  ].join(' ')}
                  style={{ width: 18, height: 18 }}
                />
                {item.label}

                {/* Active indicator */}
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── User footer ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 px-4 py-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-200 text-sm font-bold text-primary-700 ring-2 ring-white shadow-sm">
            {user?.first_name?.[0]}
            {user?.last_name?.[0]}
          </div>

          {/* Name & email */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
