/**
 * ClassroomHeader.tsx  (v4 — Focused Learning Mode / Design System)
 *
 * Sticky, minimal classroom header for focused learning mode.
 *
 * Three-zone layout (desktop):
 *   LEFT   — back button + course identity (icon · title · level badge)
 *   CENTER — current unit number + title (truncated elegantly)
 *   RIGHT  — progress pill + teacher avatar + "Units" switcher button
 *
 * Mobile collapses to:
 *   Row 1: back | course name (truncated) | units button
 *   Row 2 (strip): unit number + title + step progress dots
 *
 * What changed from v3:
 * ─────────────────────
 * • Full teal accent (student design system) — no more primary-blue leakage.
 * • "Change Unit" redesigned as a premium pill button with unit count badge.
 * • Unit title in center: larger weight, gradient teal number prefix.
 * • Progress pill uses teal gradient bar + ring.
 * • Teacher avatar uses teal ring.
 * • Keyboard-accessible focus rings throughout (ring-teal-400).
 * • Mobile sub-strip shows numbered unit + step indicators.
 * • Accepts `lessonSteps` prop to show Slides / Task / Test completion dots
 *   directly in the header without opening any panel.
 */

import React, { useState } from 'react';
import { ArrowLeft, ChevronDown, GraduationCap, Layers } from 'lucide-react';
import UnitSelectorModal from './UnitSelectorModal';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LessonStepStatus {
  hasSlides:      boolean;
  slidesComplete: boolean;
  hasTask:        boolean;
  taskComplete:   boolean;
  hasTest:        boolean;
  testComplete:   boolean;
}

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
  /** 0–100 overall course progress */
  progress?: number;
  /** Step completion state for the current lesson */
  lessonSteps?: LessonStepStatus;
  onBack: () => void;
  onSelectUnit?: (unit: any) => void;
  /** @deprecated – kept for backward compat */
  onOpenUnitSelector?: () => void;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Teal progress pill with bar + label */
function ProgressPill({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2.5" aria-label={`${pct}% course complete`}>
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-slate-500 w-7">
        {pct}%
      </span>
    </div>
  );
}

/** Level badge with color per CEFR level */
const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-sky-100 text-sky-700 ring-sky-200',
  A2: 'bg-blue-100 text-blue-700 ring-blue-200',
  B1: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
  B2: 'bg-violet-100 text-violet-700 ring-violet-200',
  C1: 'bg-purple-100 text-purple-700 ring-purple-200',
  C2: 'bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200',
};

function LevelBadge({ level }: { level?: string }) {
  if (!level) return null;
  const cls = LEVEL_COLORS[level] ?? 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${cls}`}>
      {level}
    </span>
  );
}

/** 3-dot step indicator for Slides / Task / Test */
function StepDots({ steps }: { steps: LessonStepStatus }) {
  const dots: { active: boolean; done: boolean; label: string }[] = [];
  if (steps.hasSlides) dots.push({ active: !steps.slidesComplete, done: steps.slidesComplete, label: 'Slides' });
  if (steps.hasTask)   dots.push({ active: !steps.taskComplete,   done: steps.taskComplete,   label: 'Task' });
  if (steps.hasTest)   dots.push({ active: !steps.testComplete,   done: steps.testComplete,   label: 'Test' });
  if (!dots.length) return null;

  return (
    <div className="flex items-center gap-1.5" aria-label="Lesson steps">
      {dots.map((d, i) => (
        <span
          key={i}
          title={d.label}
          className={[
            'h-1.5 w-5 rounded-full transition-all duration-300',
            d.done
              ? 'bg-teal-500'
              : d.active
              ? 'bg-teal-200'
              : 'bg-slate-200',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

/** Teacher initials avatar */
function TeacherAvatar({ name }: { name: string }) {
  const parts    = name.trim().split(' ');
  const initials = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : name.slice(0, 2);
  return (
    <div className="flex items-center gap-1.5" title={`Teacher: ${name}`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-[10px] font-bold text-white ring-2 ring-white shadow-sm">
        {initials.toUpperCase()}
      </div>
      <span className="hidden xl:block text-xs font-medium text-slate-500 truncate max-w-[100px]">
        {name}
      </span>
    </div>
  );
}

// ─── ClassroomHeader ──────────────────────────────────────────────────────────

export default function ClassroomHeader({
  classroom,
  course,
  currentUnit,
  units = [],
  completedUnitIds,
  progress,
  lessonSteps,
  onBack,
  onSelectUnit,
  onOpenUnitSelector,
}: ClassroomHeaderProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const canUseModal = units.length > 0 && typeof onSelectUnit === 'function';

  const handleOpenChanger = () => {
    if (canUseModal) setModalOpen(true);
    else onOpenUnitSelector?.();
  };

  const handleSelectUnit = (unit: any) => {
    onSelectUnit?.(unit);
    setModalOpen(false);
  };

  const unitNumber = currentUnit?.order_index;
  const completedCount = completedUnitIds?.size ?? 0;

  return (
    <>
      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <header className="classroom-header sticky top-0 z-30 bg-white/98 backdrop-blur-md border-b border-slate-200/80 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
        {/* Main bar */}
        <div className="mx-auto flex h-[56px] w-full max-w-screen-xl items-center gap-2 px-3 sm:px-5 lg:px-8">

          {/* ── LEFT: back + course identity ─────────────────────────────── */}
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {/* Back button */}
            <button
              onClick={onBack}
              className="group flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 transition-all hover:bg-teal-50 hover:text-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              aria-label="Back to My Classes"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <span className="hidden sm:inline text-[13px]">My Classes</span>
            </button>

            {/* Divider */}
            <span className="hidden text-slate-200 sm:block text-lg font-thin select-none" aria-hidden>|</span>

            {/* Course icon + title */}
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
              <span className="truncate text-[13px] font-semibold text-slate-800 max-w-[150px] lg:max-w-[220px]">
                {course.title}
              </span>
              {course.level && <LevelBadge level={course.level} />}
            </div>
          </div>

          {/* ── CENTER: unit title ───────────────────────────────────────── */}
          <div className="hidden flex-1 flex-col items-center md:flex">
            {currentUnit ? (
              <div className="flex flex-col items-center gap-0.5 max-w-[280px] lg:max-w-[360px]">
                <div className="flex items-center gap-2">
                  {unitNumber != null && (
                    <span className="text-[11px] font-bold text-teal-600 bg-teal-50 rounded-full px-2 py-0.5 shrink-0">
                      Unit {unitNumber}
                    </span>
                  )}
                  <p className="truncate text-[13px] font-semibold text-slate-900">
                    {currentUnit.title}
                  </p>
                </div>
                {lessonSteps && (
                  <StepDots steps={lessonSteps} />
                )}
              </div>
            ) : (
              <p className="text-[13px] text-slate-400 italic">Select a unit to begin</p>
            )}
          </div>

          {/* ── RIGHT: progress + teacher + switcher ────────────────────── */}
          <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
            {/* Progress pill — lg+ only */}
            {progress !== undefined && (
              <div className="hidden lg:block">
                <ProgressPill value={progress} />
              </div>
            )}

            {/* Teacher avatar */}
            {classroom?.teacher_name && (
              <div className="hidden lg:block">
                <TeacherAvatar name={String(classroom.teacher_name)} />
              </div>
            )}

            {/* Unit switcher button */}
            <button
              onClick={handleOpenChanger}
              className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition-all hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              <Layers className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
              <span className="hidden xs:inline">{currentUnit ? 'Units' : 'Choose Unit'}</span>
              {units.length > 0 && (
                <span className="hidden sm:flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500 group-hover:bg-teal-100 group-hover:text-teal-700 transition-colors">
                  {units.length}
                </span>
              )}
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50 transition-transform group-hover:rotate-180 duration-200" />
            </button>
          </div>
        </div>

        {/* ── Mobile sub-strip: unit title + step dots ──────────────────── */}
        {currentUnit && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-3 py-1.5 sm:px-5 md:hidden">
            <div className="flex items-center gap-2 min-w-0">
              {unitNumber != null && (
                <span className="shrink-0 text-[10px] font-bold text-teal-600 bg-teal-100/70 rounded-full px-1.5 py-0.5">
                  {unitNumber}
                </span>
              )}
              <p className="truncate text-[11px] font-semibold text-slate-700">
                {currentUnit.title}
              </p>
            </div>
            {lessonSteps && <StepDots steps={lessonSteps} />}
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
          completedCount={completedCount}
          onClose={() => setModalOpen(false)}
          onSelectUnit={handleSelectUnit}
        />
      )}
    </>
  );
}
