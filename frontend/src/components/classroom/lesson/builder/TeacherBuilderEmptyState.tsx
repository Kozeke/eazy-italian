/**
 * TeacherBuilderEmptyState.tsx
 *
 * Shown when a teacher opens a unit that has no content yet.
 * Replaces the generic student "no content" empty state for teacher mode.
 *
 * Props
 * ─────
 * onManual  — teacher chose to build manually (moves to 'manual-choice' stage)
 * onAI      — teacher chose AI-assisted generation (placeholder for next step)
 * unitTitle — displayed so the teacher knows which unit they're editing
 */

import React from 'react';
import { Sparkles, PenLine, BookOpen } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeacherBuilderEmptyStateProps {
  unitTitle?:  string;
  onManual:    () => void;
  onAI:        () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeacherBuilderEmptyState({
  unitTitle,
  onManual,
  onAI,
}: TeacherBuilderEmptyStateProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">

        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 ring-1 ring-teal-100">
          <BookOpen className="h-8 w-8 text-teal-500" />
        </div>

        {/* Heading */}
        <h2 className="text-[22px] font-bold tracking-tight text-slate-900">
          Create your lesson
        </h2>

        {/* Unit context */}
        {unitTitle && (
          <p className="mt-1 text-[13px] font-medium text-teal-600 truncate">
            {unitTitle}
          </p>
        )}

        {/* Sub-copy */}
        <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
          Start building this unit directly in the classroom view.
        </p>

        {/* Action buttons */}
        <div className="mt-8 flex flex-col gap-3">

          {/* Manually */}
          <button
            type="button"
            onClick={onManual}
            className={[
              'group flex w-full items-center gap-3.5 rounded-2xl border border-slate-200',
              'bg-white px-5 py-4 text-left shadow-sm transition-all duration-150',
              'hover:border-teal-300 hover:bg-teal-50/60 hover:shadow-md',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
            ].join(' ')}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-teal-100 group-hover:text-teal-600">
              <PenLine className="h-4 w-4" />
            </span>
            <span className="flex flex-col">
              <span className="text-[14px] font-semibold text-slate-800">Manually</span>
              <span className="text-[12px] text-slate-400">Add slides, tasks, tests, and videos</span>
            </span>
          </button>

          {/* Using AI */}
          <button
            type="button"
            onClick={onAI}
            className={[
              'group flex w-full items-center gap-3.5 rounded-2xl border border-slate-200',
              'bg-white px-5 py-4 text-left shadow-sm transition-all duration-150',
              'hover:border-violet-300 hover:bg-violet-50/60 hover:shadow-md',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
            ].join(' ')}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-violet-100 group-hover:text-violet-600">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="flex flex-col">
              <span className="text-[14px] font-semibold text-slate-800">Using AI</span>
              <span className="text-[12px] text-slate-400">Generate lesson content automatically</span>
            </span>
          </button>

        </div>
      </div>
    </div>
  );
}