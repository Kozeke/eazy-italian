/**
 * LessonWorkspace.tsx
 *
 * Single-page, scrollable lesson flow for Classroom Mode.
 *
 * Renders a unit as one cohesive reading experience:
 *   Unit title + description + goals
 *   → LessonProgressIndicator      (slides / task / test)
 *   → SlidesSection                (if the unit has a presentation)
 *   → TaskSection                  (first published task, if any)
 *   → TestSection                  (first published test, if any)
 *
 * ── Data loading ────────────────────────────────────────────────────────────
 *
 * All data comes from two existing hooks — nothing new is invented:
 *
 *   useStudentUnit(unitId)
 *     → StudentUnitDetail { tasks[], tests[], videos[], … }
 *     Calls unitsApi.getAdminUnit — same endpoint AdminUnitDetailPage uses.
 *
 *   useUnitPresentation(unitId)
 *     → { presentation, slides: ReviewSlide[], loading, error }
 *     Calls GET /api/v1/admin/units/{unitId}/presentations then
 *     GET /api/v1/admin/presentations/{presId}/slides — same endpoints
 *     AdminGenerateSlidePage uses when saving a deck.
 *
 * Tasks and tests are pulled from unitDetail.tasks / unitDetail.tests,
 * already ordered by order_index from the API. First visible item is used.
 * TODO: If the backend adds a "primary_task" or "primary_test" flag, apply
 * it in selectPrimary() below instead of taking index 0.
 *
 * ── What is NOT done here ────────────────────────────────────────────────────
 *
 * - Task submission state: loaded by the task's own page/route.
 *   LessonWorkspace accepts taskSubmission as an opaque prop; ClassroomPage
 *   can pass null until a student submission hook is added.
 * - Test attempt state: same pattern — passed in as testAttempt prop.
 * - Video rendering: handled by StudentUnitWorkspace. This component is
 *   Slides → Task → Test only.
 */

import React, { useState, useCallback } from 'react';
import {
  BookOpen,
  ClipboardList,
  FileText,
  ChevronRight,
  AlertCircle,
  Clock,
  Percent,
} from 'lucide-react';

import SlidesSection            from './SlidesSection';
import LessonProgressIndicator  from './LessonProgressIndicator';
import type { SlideProgress }   from './SlidesSection';

import type { StudentUnitDetail, StudentTask, StudentTest } from '../../hooks/useStudentUnit';
import type { PresentationMeta }                            from '../../hooks/useUnitPresentation';
import type { ReviewSlide }                                 from '../../../pages/admin/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LessonWorkspaceProps = {
  /** Full unit detail from useStudentUnit (null while loading or no unit selected) */
  unit: StudentUnitDetail | null;
  /** Presentation metadata (from useUnitPresentation) */
  presentation?: PresentationMeta | null;
  /** Slides array (ReviewSlide[], from useUnitPresentation) */
  slides?: ReviewSlide[];
  /** Whether the presentation is still loading */
  slidesLoading?: boolean;
  slidesError?: string | null;
  /** Opaque — true if this student has a submission for the primary task */
  taskSubmission?: unknown;
  /** Opaque — true if this student has an attempt for the primary test */
  testAttempt?: unknown;
  loading?: boolean;
  error?: string | null;
  onOpenTask?:  (task: StudentTask) => void;
  onStartTest?: (test: StudentTest) => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  manual:    'Written task',
  auto_mcq:  'Multiple choice',
  gap_fill:  'Gap fill',
  essay:     'Essay',
  writing:   'Writing',
  listening: 'Listening',
  reading:   'Reading',
};

/**
 * Pick the first visible + published item from an ordered list.
 * Falls back to first item if none are published (graceful degradation).
 * TODO: Extend with a "primary" flag from the API when available.
 */
function selectPrimary<T extends { status: string; is_visible_to_students?: boolean }>(
  items: T[]
): T | null {
  if (!items.length) return null;
  const published = items.filter(
    (i) => i.status === 'published' && i.is_visible_to_students !== false
  );
  return published[0] ?? items[0];
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LessonSkeleton() {
  return (
    <div className="animate-pulse space-y-6 mx-auto max-w-2xl">
      <div className="space-y-2.5">
        <div className="h-7 w-2/3 rounded-lg bg-slate-200" />
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-4/5 rounded bg-slate-100" />
      </div>
      <div className="h-11 rounded-xl bg-slate-100" />
      <div className="h-64 rounded-2xl bg-slate-100" />
      <div className="flex gap-3">
        <div className="h-9 w-20 rounded-lg bg-slate-100" />
        <div className="h-9 flex-1 rounded-lg bg-slate-50" />
        <div className="h-9 w-20 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

// ─── Task section ─────────────────────────────────────────────────────────────

function TaskSection({
  task,
  hasSubmission,
  onOpen,
}: {
  task: StudentTask;
  hasSubmission: boolean;
  onOpen: (t: StudentTask) => void;
}) {
  const typeLabel = TASK_TYPE_LABELS[task.type] ?? task.type;

  return (
    <section aria-label="Task" className="pt-2">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <FileText className="h-4 w-4" />
        </span>
        <div className="flex flex-1 items-baseline gap-2">
          <h2 className="text-base font-semibold text-slate-900">Task</h2>
        </div>
        {hasSubmission && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            Submitted
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <span className="mb-2 inline-block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {typeLabel}
        </span>

        <h3 className="text-[17px] font-semibold leading-snug text-slate-900">
          {task.title}
        </h3>

        {task.description && (
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{task.description}</p>
        )}

        {task.instructions && (
          <div
            className="mt-4 text-sm leading-relaxed text-slate-700 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: task.instructions }}
          />
        )}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-400">
            {hasSubmission
              ? 'You have already submitted this task.'
              : 'Open the task to submit your work.'}
          </span>
          <button
            onClick={() => onOpen(task)}
            className={[
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
              hasSubmission
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-amber-500 text-white hover:bg-amber-600',
            ].join(' ')}
          >
            {hasSubmission ? 'View submission' : 'Open task'}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-10 border-t border-slate-100" aria-hidden />
    </section>
  );
}

// ─── Test section ─────────────────────────────────────────────────────────────

function TestSection({
  test,
  hasAttempt,
  onStart,
}: {
  test: StudentTest;
  hasAttempt: boolean;
  onStart: (t: StudentTest) => void;
}) {
  return (
    <section aria-label="Test" className="pt-2">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <ClipboardList className="h-4 w-4" />
        </span>
        <div className="flex flex-1 items-baseline gap-2">
          <h2 className="text-base font-semibold text-slate-900">Test</h2>
        </div>
        {hasAttempt && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            Attempted
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <h3 className="text-[17px] font-semibold leading-snug text-slate-900">
          {test.title}
        </h3>

        {test.description && (
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{test.description}</p>
        )}

        {/* Stats row — mirrors AdminTestDetailsPage */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
          {test.time_limit_minutes && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              {test.time_limit_minutes} min
            </span>
          )}
          {test.questions_count != null && (
            <span className="flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
              {test.questions_count} questions
            </span>
          )}
          {test.passing_score != null && (
            <span className="flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5 text-slate-400" />
              {test.passing_score}% to pass
            </span>
          )}
          {(test.settings?.max_attempts ?? 0) > 0 && (
            <span className="flex items-center gap-1.5 tabular-nums text-slate-400">
              ×{test.settings!.max_attempts} attempts
            </span>
          )}
        </div>

        {/* Instructions block — mirrors AdminTestDetailsPage blue callout */}
        {test.instructions && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3">
            <p className="mb-1 text-xs font-medium text-blue-700">Instructions</p>
            <p className="text-sm leading-relaxed text-blue-900">{test.instructions}</p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-400">
            {hasAttempt
              ? 'You have already attempted this test.'
              : 'Complete the lesson before taking the test.'}
          </span>
          <button
            onClick={() => onStart(test)}
            className={[
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
              hasAttempt
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700',
            ].join(' ')}
          >
            {hasAttempt ? 'Review attempt' : 'Begin test'}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function LessonWorkspace({
  unit,
  slides = [],
  slidesLoading = false,
  slidesError,
  taskSubmission,
  testAttempt,
  loading,
  error,
  onOpenTask,
  onStartTest,
}: LessonWorkspaceProps) {
  // Track slides completion so the progress indicator stays in sync
  const [slideProgress, setSlideProgress] = useState<SlideProgress>({
    currentSlide:   0,
    viewedSlideIds: [],
    completed:      false,
  });

  const handleSlidesProgress = useCallback((p: SlideProgress) => {
    setSlideProgress(p);
  }, []);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return <LessonSkeleton />;

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-red-300" />
        <p className="text-sm font-medium text-slate-700">Couldn't load this lesson</p>
        <p className="mt-1 text-sm text-slate-400">{error}</p>
      </div>
    );
  }

  // ── No unit ──────────────────────────────────────────────────────────────
  if (!unit) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-24 text-center text-slate-400">
        <BookOpen className="mb-4 h-14 w-14 opacity-15" />
        <p className="text-base font-medium text-slate-600">No unit selected</p>
        <p className="mt-1 text-sm">Choose a unit from the header to begin.</p>
      </div>
    );
  }

  // ── Resolve primary task / test from unit detail ──────────────────────────
  // Tasks and tests come from useStudentUnit → unitsApi.getAdminUnit,
  // already sorted by order_index. We pick the first published+visible item.
  const primaryTask = selectPrimary(unit.tasks ?? []);
  const primaryTest = selectPrimary(unit.tests ?? []);

  const hasSlides = slides.length > 0 || slidesLoading;
  const hasTask   = !!primaryTask;
  const hasTest   = !!primaryTest;

  // ── No content at all ────────────────────────────────────────────────────
  if (!hasSlides && !hasTask && !hasTest) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-24 text-center text-slate-400">
        <BookOpen className="mb-4 h-14 w-14 opacity-15" />
        <p className="text-base font-medium text-slate-600">No lesson content available yet</p>
        <p className="mt-1 text-sm">Your teacher hasn't added content to this unit.</p>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-8 pb-24">
      {/* ── Unit header ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold leading-snug text-slate-900">{unit.title}</h1>

        {unit.description && (
          <p className="text-base leading-relaxed text-slate-500">{unit.description}</p>
        )}

        {unit.goals && (
          <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-primary-600">
              What you'll learn
            </p>
            <p className="text-sm leading-relaxed text-primary-900">{unit.goals}</p>
          </div>
        )}
      </div>

      {/* ── Progress indicator ────────────────────────────────────────────── */}
      <LessonProgressIndicator
        hasSlides={slides.length > 0}
        slidesComplete={slideProgress.completed}
        hasTask={hasTask}
        taskComplete={!!taskSubmission}
        hasTest={hasTest}
        testComplete={!!testAttempt}
      />

      {/* ── Slides section ────────────────────────────────────────────────── */}
      {slidesLoading && (
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 rounded bg-slate-200" />
          <div className="h-64 rounded-2xl bg-slate-100" />
        </div>
      )}

      {slidesError && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Could not load slides: {slidesError}
        </div>
      )}

      {!slidesLoading && !slidesError && slides.length > 0 && (
        <SlidesSection
          slides={slides}
          onProgressChange={handleSlidesProgress}
        />
      )}

      {/* ── Task section ──────────────────────────────────────────────────── */}
      {hasTask && primaryTask && (
        <TaskSection
          task={primaryTask}
          hasSubmission={!!taskSubmission}
          onOpen={onOpenTask ?? (() => {})}
        />
      )}

      {/* ── Test section ──────────────────────────────────────────────────── */}
      {hasTest && primaryTest && (
        <TestSection
          test={primaryTest}
          hasAttempt={!!testAttempt}
          onStart={onStartTest ?? (() => {})}
        />
      )}
    </section>
  );
}
