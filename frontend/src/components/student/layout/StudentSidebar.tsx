/**
 * StudentSidebar.tsx  (v2 — Design System)
 *
 * Left navigation rail for the student app shell.
 * Nav items: My Classes · Grades · Settings
 *
 * Desktop: always visible, fixed at left edge (w-64)
 * Mobile:  slides in as a drawer when `open` is true
 *
 * What changed from v1:
 * ─────────────────────
 * • Accent color switched to teal (student identity, distinct from teacher primary-blue)
 * • Brand mark uses teal gradient with GraduationCap icon
 * • Active nav item uses teal-50 bg + teal-700 text + teal-100 ring
 * • Avatar uses teal gradient
 * • Subtle teal tint on the brand area background
 * • Nav section heading uses teal overline style
 * • Added keyboard-accessible focus rings (teal)
 * • Added aria-current="page" for active links
 * • Improved visual separation: brand / nav / footer layers
 * • classroom-mode CSS still hides this via body.classroom-mode
 */

import React from 'react';
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
  { label: 'My Classes', href: '/student/classes',  icon: BookOpen  },
  { label: 'Grades',     href: '/student/grades',   icon: BarChart3 },
  { label: 'Settings',   href: '/student/settings', icon: Settings  },
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

  const initials =
    (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');

  return (
    <aside
      className={[
        // Base
        'student-sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col',
        'bg-white shadow-xl ring-1 ring-slate-100/80',
        // Desktop always visible
        'lg:translate-x-0',
        // Mobile slide
        'transform transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}
      aria-label="Student navigation"
    >
      {/* ── Brand header ─────────────────────────────────────────────────── */}
      <div className="relative flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-br from-teal-50 to-white px-5">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-md shadow-teal-100">
            <GraduationCap className="h-5 w-5" />
          </div>

          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-slate-900 tracking-tight">EZ Italian</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-teal-600">
              Student
            </span>
          </div>
        </div>

        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="lg:hidden rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Primary">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-teal-600/60">
          Navigation
        </p>

        <ul className="space-y-0.5" role="list">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                    'transition-all duration-150',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                    active
                      ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-100 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  ].join(' ')}
                >
                  {/* Icon container */}
                  <span
                    className={[
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                      active
                        ? 'bg-teal-100 text-teal-600'
                        : 'bg-slate-100 text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-500',
                    ].join(' ')}
                  >
                    <item.icon className="h-4 w-4" />
                  </span>

                  {item.label}

                  {/* Active dot */}
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── User footer ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-sm font-bold text-white shadow-sm ring-2 ring-white"
            aria-hidden
          >
            {initials}
          </div>

          {/* Name + email */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 leading-tight">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            title="Sign out"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
