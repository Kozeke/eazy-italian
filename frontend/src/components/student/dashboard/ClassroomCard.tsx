/**
 * ClassroomCard.tsx  (v2 — Design System)
 *
 * Premium edtech classroom card.
 *
 * What changed from v1:
 * ─────────────────────
 * • Visual identity layer: each card gets a unique gradient banner derived from the course
 *   level, giving instant visual differentiation across the grid.
 * • Progress ring (SVG) replaces the flat bar — students see completion at a glance.
 * • Badge cluster redesigned: Live / New Task / Test Due / Completed use distinct
 *   colors, icons, and the Live badge has an animated ping dot.
 * • "Enter Classroom" CTA adapts contextually:
 *   — Live session → pulsing red "Join Live Lesson" with Radio icon
 *   — Normal       → teal "Enter Classroom" with ArrowRight
 *   — Completed    → ghost "Review" with RotateCcw
 * • Teacher avatar initials displayed next to teacher name.
 * • "Next up" indicator shows what the student should do next.
 * • Hover state: subtle lift + teal ring on the card.
 * • Fully keyboard accessible with correct focus rings.
 * • All accent colours updated to teal (student identity).
 */

import React, { useMemo } from 'react';
import {
  ArrowRight,
  Radio,
  ClipboardCheck,
  AlertCircle,
  GraduationCap,
  CheckCircle2,
  RotateCcw,
  BookOpen,
  FlaskConical,
  FileText,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClassroomCardData {
  id: number;
  name: string;
  teacher_name?: string;
  course?: {
    id: number;
    title: string;
    level?: string;
    thumbnail_url?: string | null;
  };
  progress?: number;           // 0–100
  live_session_active?: boolean;
  has_new_task?: boolean;
  has_test_due?: boolean;
  completed?: boolean;         // all units done
  next_up?: 'slides' | 'task' | 'test' | null;
}

interface ClassroomCardProps {
  classroom: ClassroomCardData;
  onEnter: (classroom: ClassroomCardData) => void;
}

// ─── Level palette ────────────────────────────────────────────────────────────

const LEVEL_PALETTES: Record<string, { banner: string; badge: string; ring: string }> = {
  A1: { banner: 'from-sky-400 to-cyan-500',    badge: 'bg-sky-100 text-sky-700',    ring: 'ring-sky-200'    },
  A2: { banner: 'from-blue-400 to-blue-600',   badge: 'bg-blue-100 text-blue-700',  ring: 'ring-blue-200'   },
  B1: { banner: 'from-indigo-400 to-violet-500', badge: 'bg-indigo-100 text-indigo-700', ring: 'ring-indigo-200' },
  B2: { banner: 'from-violet-500 to-purple-600', badge: 'bg-violet-100 text-violet-700', ring: 'ring-violet-200' },
  C1: { banner: 'from-purple-500 to-fuchsia-600', badge: 'bg-purple-100 text-purple-700', ring: 'ring-purple-200' },
  C2: { banner: 'from-fuchsia-500 to-pink-600', badge: 'bg-fuchsia-100 text-fuchsia-700', ring: 'ring-fuchsia-200' },
};
const DEFAULT_PALETTE = {
  banner: 'from-teal-400 to-teal-600',
  badge:  'bg-teal-100 text-teal-700',
  ring:   'ring-teal-200',
};

// ─── Progress ring ────────────────────────────────────────────────────────────

function ProgressRing({ value, size = 44 }: { value: number; size?: number }) {
  const pct    = Math.min(100, Math.max(0, value));
  const radius = (size - 6) / 2;
  const circ   = 2 * Math.PI * radius;
  const dash   = (pct / 100) * circ;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#e2e8f0" strokeWidth={5} />
        {/* Fill */}
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="url(#teal-grad)" strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.7s ease' }} />
        <defs>
          <linearGradient id="teal-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-slate-700">
        {pct}%
      </span>
    </div>
  );
}

// ─── Next-up chip ─────────────────────────────────────────────────────────────

const NEXT_UP_META = {
  slides: { icon: BookOpen,      label: 'Watch slides', color: 'text-teal-600 bg-teal-50'    },
  task:   { icon: FileText,      label: 'Do task',      color: 'text-amber-600 bg-amber-50'  },
  test:   { icon: FlaskConical,  label: 'Take test',    color: 'text-emerald-600 bg-emerald-50' },
};

function NextUpChip({ type }: { type: 'slides' | 'task' | 'test' }) {
  const meta = NEXT_UP_META[type];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  );
}

// ─── Teacher initials avatar ──────────────────────────────────────────────────

function TeacherAvatar({ name }: { name: string }) {
  const parts    = name.trim().split(' ');
  const initials = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : name.slice(0, 2);
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[8px] font-bold uppercase text-slate-600"
      aria-hidden
    >
      {initials.toUpperCase()}
    </span>
  );
}

// ─── ClassroomCard ────────────────────────────────────────────────────────────

export default function ClassroomCard({ classroom, onEnter }: ClassroomCardProps) {
  const { course } = classroom;
  const level      = course?.level;
  const palette: typeof DEFAULT_PALETTE = (level ? LEVEL_PALETTES[level] : undefined) ?? DEFAULT_PALETTE;
  const pct        = classroom.progress ?? 0;
  const isLive     = !!classroom.live_session_active;
  const isDone     = !!classroom.completed || pct === 100;

  // Determine priority badge
  const priorityBadge = useMemo(() => {
    if (isLive)                      return 'live';
    if (classroom.has_test_due)      return 'test';
    if (classroom.has_new_task)      return 'task';
    if (isDone)                      return 'done';
    return null;
  }, [isLive, classroom.has_test_due, classroom.has_new_task, isDone]);

  return (
    <article
      className={[
        'group relative flex flex-col rounded-2xl bg-white ring-1 ring-slate-200/80',
        'shadow-[0_1px_4px_0_rgba(0,0,0,0.07)]',
        'transition-all duration-200',
        'hover:shadow-[0_6px_20px_0_rgba(0,0,0,0.10)] hover:-translate-y-0.5',
        isLive ? 'hover:ring-red-300' : `hover:${palette.ring}`,
      ].join(' ')}
      aria-label={classroom.name}
    >
      {/* ── Gradient banner ───────────────────────────────────────────────── */}
      <div
        className={`relative h-[72px] w-full overflow-hidden rounded-t-2xl bg-gradient-to-br ${palette.banner}`}
      >
        {/* Subtle texture overlay */}
        <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id={`dots-${classroom.id}`} x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#dots-${classroom.id})`} />
        </svg>

        {/* Course thumbnail if available */}
        {course?.thumbnail_url && (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-overlay"
          />
        )}

        {/* Level badge */}
        {level && (
          <span
            className={`absolute top-2.5 left-3 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-white/30 ${palette.badge} bg-white/90`}
          >
            {level}
          </span>
        )}

        {/* Priority status badge — top right */}
        <div className="absolute top-2.5 right-3 flex items-center gap-1">
          {priorityBadge === 'live' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              Live
            </span>
          )}
          {priorityBadge === 'test' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
              <AlertCircle className="h-2.5 w-2.5" />
              Test due
            </span>
          )}
          {priorityBadge === 'task' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
              <ClipboardCheck className="h-2.5 w-2.5" />
              New task
            </span>
          )}
          {priorityBadge === 'done' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Completed
            </span>
          )}
        </div>
      </div>

      {/* ── Card body ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-3 px-4 pt-3.5 pb-4">

        {/* Icon + classroom name */}
        <div className="flex items-start gap-2.5">
          {/* Icon — positioned to overlap the banner */}
          <div
            className={`-mt-7 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white ring-2 ring-white shadow-md`}
            aria-hidden
          >
            {course?.thumbnail_url ? (
              <img
                src={course.thumbnail_url}
                alt={course.title}
                className="h-full w-full rounded-xl object-cover"
              />
            ) : (
              <div className={`flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br ${palette.banner}`}>
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">
              {classroom.name}
            </h3>
          </div>
        </div>

        {/* Course info row */}
        {course && (
          <p className="text-[11px] leading-snug text-slate-400 line-clamp-1">
            {course.title}
          </p>
        )}

        {/* Teacher row */}
        {classroom.teacher_name && (
          <div className="flex items-center gap-1.5">
            <TeacherAvatar name={classroom.teacher_name} />
            <span className="text-xs text-slate-500 truncate">
              <span className="text-slate-400">with</span>{' '}
              <span className="font-medium text-slate-600">{classroom.teacher_name}</span>
            </span>
          </div>
        )}

        {/* Progress row */}
        {classroom.progress !== undefined && (
          <div className="flex items-center gap-3 pt-0.5">
            <ProgressRing value={pct} size={44} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Progress
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {classroom.next_up && !isDone && (
                <div className="mt-1.5">
                  <NextUpChip type={classroom.next_up} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── CTA footer ────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pb-4">
        <button
          onClick={() => onEnter(classroom)}
          className={[
            'flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold',
            'transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
            isLive
              ? 'bg-red-500 text-white shadow-sm shadow-red-100 hover:bg-red-600 focus-visible:ring-red-400'
              : isDone
              ? 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:ring-teal-300'
              : 'bg-teal-600 text-white shadow-sm shadow-teal-100 hover:bg-teal-700 focus-visible:ring-teal-400',
          ].join(' ')}
        >
          {isLive ? (
            <>
              <Radio className="h-4 w-4" />
              Join Live Lesson
            </>
          ) : isDone ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" />
              Review
            </>
          ) : (
            <>
              Enter Classroom
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </article>
  );
}
