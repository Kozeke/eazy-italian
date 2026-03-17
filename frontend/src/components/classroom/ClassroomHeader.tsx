/**
 * ClassroomHeader.tsx  (v5 — adds has-rail modifier for CSS variable)
 *
 * Changes from v4:
 * ─────────────────
 * • The `<header>` element now adds the CSS class `classroom-header` plus
 *   `classroom-header--has-rail` when a lessonRail is active.
 *
 *   These classes drive the `--lp-header-h` CSS custom property used by
 *   `.lp-workspace` in lesson-workspace.css to size the player viewport.
 *
 *   Single bar  (no rail) → --lp-header-h: 60px   (set by .classroom-header)
 *   Double bar (with rail) → --lp-header-h: 108px  (set by .classroom-header--has-rail)
 *
 * • All other props, layout, modal logic, and visual language are unchanged
 *   from v4.
 */

import React, { useState } from 'react';
import { ArrowLeft, ChevronDown, GraduationCap } from 'lucide-react';
import UnitSelectorModal from './unit/UnitSelectorModal';
import './classroom-mode.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClassroomHeaderProps {
  classroom?: {
    id?: number;
    teacher_name?: string;
    [key: string]: unknown;
  } | null;
  course: {
    id: number;
    title: string;
    level?: string;
    thumbnail_url?: string | null;
  };
  currentUnit: {
    id: number;
    title: string;
    order_index?: number;
    level?: string;
  } | null;
  units?: any[];
  completedUnitIds?: Set<number | string>;
  progress?: number;
  onBack: () => void;
  onSelectUnit?: (unit: any) => void;
  /** @deprecated Pass onSelectUnit + units instead. */
  onOpenUnitSelector?: () => void;
  /**
   * Lesson progress rail node — rendered as a compact strip below the
   * main header bar when a unit is active.
   */
  lessonRail?: React.ReactNode;
  /** @deprecated Use lessonRail instead. */
  lessonSteps?: unknown;
}

// ─── Progress pill ────────────────────────────────────────────────────────────

function ProgressPill({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium tabular-nums text-slate-500">
        {pct}%
      </span>
    </div>
  );
}

// ─── Level badge ──────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-sky-100 text-sky-700',
  A2: 'bg-blue-100 text-blue-700',
  B1: 'bg-indigo-100 text-indigo-700',
  B2: 'bg-violet-100 text-violet-700',
  C1: 'bg-purple-100 text-purple-700',
  C2: 'bg-fuchsia-100 text-fuchsia-700',
};

function LevelBadge({ level }: { level?: string }) {
  if (!level) return null;
  const cls = LEVEL_COLORS[level] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {level}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClassroomHeader({
  classroom,
  course,
  currentUnit,
  units = [],
  completedUnitIds,
  progress,
  onBack,
  onSelectUnit,
  onOpenUnitSelector,
  lessonRail,
}: ClassroomHeaderProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const canUseModal = units.length > 0 && typeof onSelectUnit === 'function';

  const handleOpenChanger = () => {
    if (canUseModal) {
      setModalOpen(true);
    } else {
      onOpenUnitSelector?.();
    }
  };

  const handleSelectUnit = (unit: any) => {
    onSelectUnit?.(unit);
    setModalOpen(false);
  };

  const hasRail = !!lessonRail && !!currentUnit;

  return (
    <>
      {/*
        classroom-header          → sets --lp-header-h: 60px
        classroom-header--has-rail → sets --lp-header-h: 108px
        Both are consumed by .lp-workspace in lesson-workspace.css.
      */}
      <header
        className={[
          'sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm',
          'classroom-header',
          hasRail ? 'classroom-header--has-rail' : '',
        ].filter(Boolean).join(' ')}
      >

        {/* ── Main bar ──────────────────────────────────────────────────────── */}
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-3 px-4 md:px-6 lg:px-8">

          {/* LEFT: back + course name */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={onBack}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              aria-label="Back to My Classes"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">My Classes</span>
            </button>

            <span className="hidden text-slate-300 sm:block" aria-hidden>|</span>

            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              {course.thumbnail_url ? (
                <img
                  src={course.thumbnail_url}
                  alt={course.title}
                  className="h-7 w-7 rounded-lg object-cover ring-1 ring-slate-200 shrink-0"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 shadow-sm">
                  <GraduationCap className="h-4 w-4 text-white" />
                </div>
              )}
              <span className="truncate text-sm font-semibold text-slate-800">
                {course.title}
              </span>
              {course.level && <LevelBadge level={course.level} />}
            </div>
          </div>

          {/* CENTER: current unit title */}
          <div className="hidden flex-1 flex-col items-center md:flex">
            {currentUnit ? (
              <>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Now studying
                </p>
                <p className="max-w-xs truncate text-sm font-semibold text-slate-900">
                  {currentUnit.order_index != null
                    ? `${currentUnit.order_index}. `
                    : ''}
                  {currentUnit.title}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">Select a unit to begin</p>
            )}
          </div>

          {/* RIGHT: change unit + progress + optional teacher */}
          <div className="flex flex-1 items-center justify-end gap-3">
            {progress !== undefined && (
              <div className="hidden lg:block">
                <ProgressPill value={progress} />
              </div>
            )}

            {classroom?.teacher_name && (
              <div className="hidden items-center gap-1.5 lg:flex">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
                  {classroom.teacher_name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-slate-500">{classroom.teacher_name}</span>
              </div>
            )}

            <button
              onClick={handleOpenChanger}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <span>{currentUnit ? 'Change Unit' : 'Choose Unit'}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </div>
        </div>

        {/* ── Lesson progress rail sub-bar ──────────────────────────────────── */}
        {hasRail && (
          <div className="border-t border-slate-100 bg-white/95 px-4 pb-1.5 pt-1.5 md:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-5xl">
              {lessonRail}
            </div>
          </div>
        )}

        {/* ── Mobile unit strip — only shown when no rail ─────────────────── */}
        {currentUnit && !hasRail && (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-1.5 md:hidden">
            <p className="truncate text-xs font-medium text-slate-700">
              <span className="mr-1 text-slate-400">Unit:</span>
              {currentUnit.title}
            </p>
          </div>
        )}

      </header>

      {/* Unit selector modal */}
      {canUseModal && (
        <UnitSelectorModal
          open={modalOpen}
          units={units}
          currentUnitId={currentUnit?.id ?? null}
          courseTitle={course.title}
          completedUnitIds={completedUnitIds}
          onClose={() => setModalOpen(false)}
          onSelectUnit={handleSelectUnit}
        />
      )}
    </>
  );
}