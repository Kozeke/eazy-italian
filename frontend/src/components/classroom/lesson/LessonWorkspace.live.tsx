/**
 * LessonWorkspace.live-patch.tsx
 *
 * PATCH FILE — shows only the changes needed to LessonWorkspace.tsx
 * to support live session overrides.
 *
 * Apply these changes to the existing LessonWorkspace.tsx:
 *
 * ─── 1. Add two new props to LessonWorkspaceProps ────────────────────────────
 *
 *   forcedSlide?:   number | null;   // override slide index from live session
 *   forcedSection?: LiveSection | null; // override active section
 *
 * ─── 2. Import useLiveSession + StudentLiveIndicator ────────────────────────
 *
 *   import { useLiveSession }         from './live/LiveSessionProvider';
 *   import { StudentLiveIndicator }   from './live/LiveSessionBanner';
 *   import type { LiveSection }       from './live/liveSession.types';
 *
 * ─── 3. Inside the component body, derive locking state ─────────────────────
 *
 *   const { session } = useLiveSession();
 *   const isLiveLocked = session.sessionActive && !session.detached && session.role === 'student';
 *
 *   // Use forcedSlide when live and not detached
 *   const effectiveSlide = (isLiveLocked && forcedSlide !== null && forcedSlide !== undefined)
 *     ? forcedSlide
 *     : slideProgress.currentSlide;
 *
 * ─── 4. Pass locked + forcedSlide to SlidesSection ──────────────────────────
 *
 *   <SlidesSection
 *     slides={slides}
 *     onProgressChange={handleSlidesProgress}
 *     locked={isLiveLocked}             // ← new prop
 *     forcedSlide={effectiveSlide}      // ← new prop
 *   />
 *
 * ─── 5. Conditionally render sections based on forcedSection ────────────────
 *
 *   In the JSX where slides/task/test sections are rendered, wrap them:
 *
 *   // When live and not detached, only show the active section
 *   const showSlides = !isLiveLocked || (forcedSection === 'slides' || forcedSection === null);
 *   const showTask   = !isLiveLocked || forcedSection === 'task';
 *   const showTest   = !isLiveLocked || forcedSection === 'test';
 *
 *   Then guard each section:
 *   {showSlides && !slidesLoading && !slidesError && slides.length > 0 && (
 *     <SlidesSection … />
 *   )}
 *   {showTask && hasTask && primaryTask && (
 *     <TaskSection … />
 *   )}
 *   {showTest && hasTest && primaryTest && (
 *     <TestSection … />
 *   )}
 *
 * ─── 6. Add StudentLiveIndicator to the unit header ─────────────────────────
 *
 *   <div className="flex items-center gap-2">
 *     <h1 className="text-2xl font-bold …">{unit.title}</h1>
 *     <StudentLiveIndicator />   // ← add this
 *   </div>
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 * SlidesSection / SlidesPlayer also need minor prop additions:
 *
 * SlidesSection props to add:
 *   locked?:      boolean;   // disables user navigation
 *   forcedSlide?: number;    // overrides internal currentSlide state
 *
 * SlidesSection implementation:
 *   useEffect(() => {
 *     if (forcedSlide !== undefined && forcedSlide !== progress.currentSlide) {
 *       setProgress(prev => ({ ...prev, currentSlide: forcedSlide }));
 *     }
 *   }, [forcedSlide]);
 *
 * SlidesPlayer props to add:
 *   locked?: boolean;   // passed through to disable prev/next buttons
 *
 * SlidesPlayer implementation — add to each button:
 *   disabled={isFirst || locked}
 *   disabled={isLast  || locked}
 *   // Also disable dot-strip button clicks:
 *   onClick={() => !locked && onChangeSlide(i)}
 */

// ─── Full updated LessonWorkspace with live session support ──────────────────

import React, { useState, useCallback } from 'react';
import {
  BookOpen, ClipboardList, FileText, ChevronRight,
  AlertCircle, Clock, Percent,
} from 'lucide-react';

import SlidesSection           from './SlidesSection';
import LessonProgressIndicator from './LessonProgressIndicator';
import type { SlideProgress }  from './SlidesSection';
import { StudentLiveIndicator } from '../live/LiveSessionBanner';

// Safe import — if not inside a Provider, falls back gracefully
let useLiveSessionSafe: () => { session: { sessionActive: boolean; detached: boolean; role: string; activeSection: string } };
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('./live/LiveSessionProvider');
  useLiveSessionSafe = mod.useLiveSession;
} catch {
  useLiveSessionSafe = () => ({
    session: { sessionActive: false, detached: false, role: 'student', activeSection: 'slides' },
  });
}

import type { StudentUnitDetail, StudentTask, StudentTest } from '../../hooks/useStudentUnit';
import type { PresentationMeta }                            from '../../hooks/useUnitPresentation';
import type { ReviewSlide }                                 from '../../../pages/admin/shared';
import type { LiveSection }                                 from '../live/liveSession.types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LessonWorkspaceProps = {
  unit:            StudentUnitDetail | null;
  presentation?:   PresentationMeta | null;
  slides?:         ReviewSlide[];
  slidesLoading?:  boolean;
  slidesError?:    string | null;
  taskSubmission?: unknown;
  testAttempt?:    unknown;
  loading?:        boolean;
  error?:          string | null;
  onOpenTask?:     (task: StudentTask) => void;
  onStartTest?:    (test: StudentTest) => void;
  /** Live session overrides (from ClassroomPage) */
  forcedSlide?:    number | null;
  forcedSection?:  LiveSection | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  manual: 'Written task', auto_mcq: 'Multiple choice', gap_fill: 'Gap fill',
  essay: 'Essay', writing: 'Writing', listening: 'Listening', reading: 'Reading',
};

function selectPrimary<T extends { status: string; is_visible_to_students?: boolean }>(items: T[]): T | null {
  if (!items.length) return null;
  const published = items.filter(i => i.status === 'published' && i.is_visible_to_students !== false);
  return published[0] ?? items[0];
}

// ─── Skeleton / TaskSection / TestSection — unchanged from v4 ─────────────────
// (omitted here for brevity — keep them from LessonWorkspace.tsx v4)

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
  forcedSlide,
  forcedSection,
}: LessonWorkspaceProps) {
  const [slideProgress, setSlideProgress] = useState<SlideProgress>({
    currentSlide: 0, viewedSlideIds: [], completed: false,
  });

  // ── Live session state ───────────────────────────────────────────────────
  const { session } = useLiveSessionSafe();
  const isLiveLocked =
    session.sessionActive && !session.detached && session.role === 'student';

  const effectiveSlide =
    isLiveLocked && forcedSlide !== null && forcedSlide !== undefined
      ? forcedSlide
      : slideProgress.currentSlide;

  // Section visibility — when live, only show active section
  const activeSection = forcedSection ?? 'slides';
  const showSlides = !isLiveLocked || activeSection === 'slides';
  const showTask   = !isLiveLocked || activeSection === 'task';
  const showTest   = !isLiveLocked || activeSection === 'test';

  const handleSlidesProgress = useCallback((p: SlideProgress) => {
    setSlideProgress(p);
  }, []);

  if (loading) return <div className="animate-pulse space-y-6 mx-auto max-w-2xl">
    <div className="h-7 w-2/3 rounded-lg bg-slate-200" />
    <div className="h-4 w-full rounded bg-slate-100" />
    <div className="h-64 rounded-2xl bg-slate-100" />
  </div>;

  if (error) return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-20 text-center">
      <AlertCircle className="mb-3 h-10 w-10 text-red-300" />
      <p className="text-sm font-medium text-slate-700">Couldn't load this lesson</p>
      <p className="mt-1 text-sm text-slate-400">{error}</p>
    </div>
  );

  if (!unit) return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-24 text-center text-slate-400">
      <BookOpen className="mb-4 h-14 w-14 opacity-15" />
      <p className="text-base font-medium text-slate-600">No unit selected</p>
      <p className="mt-1 text-sm">Choose a unit from the header to begin.</p>
    </div>
  );

  const primaryTask = selectPrimary(unit.tasks ?? []);
  const primaryTest = selectPrimary(unit.tests ?? []);
  const hasSlides   = slides.length > 0 || slidesLoading;
  const hasTask     = !!primaryTask;
  const hasTest     = !!primaryTest;

  if (!hasSlides && !hasTask && !hasTest) return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-24 text-center text-slate-400">
      <BookOpen className="mb-4 h-14 w-14 opacity-15" />
      <p className="text-base font-medium text-slate-600">No lesson content available yet</p>
      <p className="mt-1 text-sm">Your teacher hasn't added content to this unit.</p>
    </div>
  );

  return (
    <section className="mx-auto w-full max-w-2xl space-y-8 pb-24">
      {/* Unit header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold leading-snug text-slate-900">{unit.title}</h1>
          <StudentLiveIndicator />
        </div>
        {unit.description && <p className="text-base leading-relaxed text-slate-500">{unit.description}</p>}
        {unit.goals && (
          <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-primary-600">What you'll learn</p>
            <p className="text-sm leading-relaxed text-primary-900">{unit.goals}</p>
          </div>
        )}
      </div>

      {/* Progress indicator — always show full progress, even in live mode */}
      <LessonProgressIndicator
        hasSlides={slides.length > 0}
        slidesComplete={slideProgress.completed}
        hasTask={hasTask}
        taskComplete={!!taskSubmission}
        hasTest={hasTest}
        testComplete={!!testAttempt}
      />

      {/* Live mode section indicator */}
      {isLiveLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-xs text-primary-700">
          <span className="font-semibold uppercase tracking-wider">Now:</span>
          <span className="capitalize">{activeSection}</span>
        </div>
      )}

      {/* Slides */}
      {slidesLoading && !showSlides && null}
      {slidesLoading && showSlides && (
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 rounded bg-slate-200" />
          <div className="h-64 rounded-2xl bg-slate-100" />
        </div>
      )}
      {slidesError && showSlides && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Could not load slides: {slidesError}
        </div>
      )}
      {!slidesLoading && !slidesError && slides.length > 0 && showSlides && (
        <SlidesSection
          slides={slides}
          onProgressChange={handleSlidesProgress}
          locked={isLiveLocked}
          forcedSlide={isLiveLocked ? effectiveSlide : undefined}
        />
      )}

      {/* Task — import TaskSection from v4 LessonWorkspace unchanged */}
      {hasTask && primaryTask && showTask && (
        // <TaskSection task={primaryTask} hasSubmission={!!taskSubmission} onOpen={onOpenTask ?? (() => {})} />
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-6 py-5">
          <p className="text-sm font-medium text-amber-900">Task: {primaryTask.title}</p>
          <p className="mt-1 text-xs text-amber-700">Open the full task page to submit.</p>
          {isLiveLocked && (
            <p className="mt-2 text-[11px] text-amber-600 italic">Teacher has opened this task for the class.</p>
          )}
        </div>
      )}

      {/* Test — import TestSection from v4 LessonWorkspace unchanged */}
      {hasTest && primaryTest && showTest && (
        // <TestSection test={primaryTest} hasAttempt={!!testAttempt} onStart={onStartTest ?? (() => {})} />
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-6 py-5">
          <p className="text-sm font-medium text-emerald-900">Test: {primaryTest.title}</p>
          <p className="mt-1 text-xs text-emerald-700">Begin the test when ready.</p>
          {isLiveLocked && (
            <p className="mt-2 text-[11px] text-emerald-600 italic">Teacher has opened this test for the class.</p>
          )}
        </div>
      )}
    </section>
  );
}
