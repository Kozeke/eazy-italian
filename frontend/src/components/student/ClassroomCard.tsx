/**
 * ClassroomCard.tsx
 *
 * Card shown in MyClassesPage grid.
 * Displays classroom info + progress + optional status badges.
 * "Enter Classroom" navigates to /classroom/:classroomId.
 *
 * Props:
 *   classroom     — data from the student's enrolled classrooms endpoint
 *   onEnter       — called when the Enter button or card is clicked
 */

import React from 'react';
import { ArrowRight, Radio, ClipboardCheck, AlertCircle, GraduationCap } from 'lucide-react';

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
  progress?: number;            // 0–100
  /** Set by your live-session hook / polling */
  live_session_active?: boolean;
  has_new_task?: boolean;
  has_test_due?: boolean;
}

interface ClassroomCardProps {
  classroom: ClassroomCardData;
  onEnter: (classroom: ClassroomCardData) => void;
}

// ─── Level badge colors ───────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-sky-100 text-sky-700',
  A2: 'bg-blue-100 text-blue-700',
  B1: 'bg-indigo-100 text-indigo-700',
  B2: 'bg-violet-100 text-violet-700',
  C1: 'bg-purple-100 text-purple-700',
  C2: 'bg-fuchsia-100 text-fuchsia-700',
};

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">Progress</span>
        <span className="text-xs font-semibold tabular-nums text-slate-700">{pct}%</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── ClassroomCard ────────────────────────────────────────────────────────────

export default function ClassroomCard({ classroom, onEnter }: ClassroomCardProps) {
  const { course } = classroom;
  const level = course?.level;
  const levelCls = level ? (LEVEL_COLORS[level] ?? 'bg-slate-100 text-slate-600') : null;

  // Card accent color based on level (subtle left border)
  const accentMap: Record<string, string> = {
    A1: 'border-l-sky-400',
    A2: 'border-l-blue-400',
    B1: 'border-l-indigo-400',
    B2: 'border-l-violet-400',
    C1: 'border-l-purple-400',
    C2: 'border-l-fuchsia-400',
  };
  const accentCls = level ? (accentMap[level] ?? 'border-l-primary-400') : 'border-l-primary-400';

  return (
    <div
      className={[
        'group relative flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm',
        'border-l-4', accentCls,
        'transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
      ].join(' ')}
    >
      {/* ── Status badges (top-right corner) ──────────────────────────── */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        {classroom.live_session_active && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            Live
          </span>
        )}
        {classroom.has_test_due && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
            title="Test due"
          >
            <AlertCircle className="h-2.5 w-2.5" />
            Test due
          </span>
        )}
        {classroom.has_new_task && !classroom.has_test_due && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
            title="New task available"
          >
            <ClipboardCheck className="h-2.5 w-2.5" />
            New task
          </span>
        )}
      </div>

      {/* ── Card body ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-4 p-5 pt-4">
        {/* Icon + classroom name */}
        <div className="flex items-start gap-3 pr-16">
          {/* Course thumbnail or placeholder */}
          {course?.thumbnail_url ? (
            <img
              src={course.thumbnail_url}
              alt={course.title}
              className="h-11 w-11 shrink-0 rounded-xl object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-500 shadow-sm ring-1 ring-primary-100">
              <GraduationCap className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-slate-900 leading-snug">
              {classroom.name}
            </h3>
            {classroom.teacher_name && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                Teacher: <span className="font-medium text-slate-700">{classroom.teacher_name}</span>
              </p>
            )}
          </div>
        </div>

        {/* Course name + level */}
        {course && (
          <div className="flex items-center gap-2">
            <span className="truncate text-xs text-slate-500">{course.title}</span>
            {levelCls && (
              <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${levelCls}`}>
                {level}
              </span>
            )}
          </div>
        )}

        {/* Progress bar */}
        {classroom.progress !== undefined && (
          <ProgressBar value={classroom.progress} />
        )}
      </div>

      {/* ── CTA footer ────────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 px-5 py-3.5">
        <button
          onClick={() => onEnter(classroom)}
          className={[
            'flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold',
            'transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
            classroom.live_session_active
              ? 'bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-100'
              : 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm shadow-primary-100',
          ].join(' ')}
        >
          {classroom.live_session_active ? (
            <>
              <Radio className="h-4 w-4" />
              Join Live Lesson
            </>
          ) : (
            <>
              Enter Classroom
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
