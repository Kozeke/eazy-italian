/**
 * LessonWorkspace.tsx  (v5 — full inline lesson flow)
 *
 * Single-page, scrollable lesson:
 *   Unit header
 *   → LessonProgressIndicator
 *   → SlidesSection      (if the unit has a presentation)
 *   → TaskSection        (first published task, inline submission)
 *   → TestSection        (first published test, inline player)
 *
 * Live session support (from ClassroomPage v5):
 *   forcedSlide   — override slide index when teacher is broadcasting
 *   forcedSection — limit visible section to 'slides' | 'task' | 'test'
 *   When active + not detached, student navigation is locked.
 *
 * Progress computation:
 *   const available = [hasSlides, hasTask, hasTest].filter(Boolean).length
 *   const completed = [slidesComplete, taskComplete, testComplete].filter(Boolean).length
 *   const pct       = available ? Math.round(completed / available * 100) : 0
 *
 * The aggregate pct is exposed via onProgressChange so ClassroomHeader
 * can show a ProgressPill without any additional state lifting.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  BookOpen, AlertCircle,
} from 'lucide-react';

import SlidesSection           from '../../components/classroom/lesson/SlidesSection';
import LessonProgressIndicator from '../../components/classroom/lesson/LessonProgressIndicator';
import TaskSection             from '../../components/classroom/lesson/TaskSection';
import TestSection             from '../../components/classroom/lesson/TestSection';
import type { SlideProgress }  from '../../components/classroom/lesson/SlidesSection';

import type { StudentUnitDetail, StudentTask, StudentTest } from '../../hooks/useStudentUnit';
import type { ReviewSlide }                                 from '../admin/shared';

// Live session — safe import (falls back when no Provider)
type LiveSection = 'slides' | 'task' | 'test';

let useLiveSessionSafe: () => {
  session: {
    sessionActive: boolean;
    detached: boolean;
    role: string;
    activeSection: LiveSection;
  };
};

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../../components/classroom/live/LiveSessionProvider');
  useLiveSessionSafe = mod.useLiveSession;
} catch {
  useLiveSessionSafe = () => ({
    session: { sessionActive: false, detached: false, role: 'student', activeSection: 'slides' },
  });
}

let StudentLiveIndicator: React.FC = () => null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  StudentLiveIndicator = require('../../components/classroom/live/LiveSessionBanner').StudentLiveIndicator;
} catch { /* no-op */ }

// ─── Types ────────────────────────────────────────────────────────────────────

export type LessonWorkspaceProps = {
  unit:            StudentUnitDetail | null;
  slides?:         ReviewSlide[];
  slidesLoading?:  boolean;
  slidesError?:    string | null;
  /** Existing task submission for the primary task (null = none yet) */
  taskSubmission?: unknown;
  /** Existing test attempt for the primary test (null = none yet) */
  testAttempt?:    unknown;
  loading?:        boolean;
  error?:          string | null;
  /** Navigate to standalone task page (escape hatch / full view) */
  onOpenTask?:     (task: StudentTask) => void;
  /** Navigate to standalone test page (escape hatch) */
  onStartTest?:    (test: StudentTest) => void;
  /**
   * Called by inline TaskSection on submit.
   * If not provided, TaskSection will use onOpenTask as the only CTA.
   */
  onSubmitTask?:   (payload: { task_id: number; answers: Record<string, unknown> }) => Promise<void>;
  /**
   * Called by inline TestSection on submit.
   * If not provided, TestSection will use onStartTest as the only CTA.
   */
  onSubmitTest?:   (payload: { test_id: number; answers: Record<string, string> }) => Promise<unknown>;
  /** Emits aggregate progress 0-100 whenever any section completes */
  onProgressChange?: (pct: number) => void;
  /** Live session overrides (from ClassroomPage) */
  forcedSlide?:    number | null;
  forcedSection?:  LiveSection | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  onSubmitTask,
  onSubmitTest,
  onProgressChange,
  forcedSlide,
  forcedSection,
}: LessonWorkspaceProps) {
  // ── Section progress ───────────────────────────────────────────────────────
  const [slideProgress, setSlideProgress] = useState<SlideProgress>({
    currentSlide: 0, viewedSlideIds: [], completed: false,
  });
  const [taskComplete, setTaskComplete]   = useState<boolean>(!!taskSubmission);
  const [testComplete, setTestComplete]   = useState<boolean>(!!testAttempt);

  // Sync prop changes (e.g. parent refetches)
  useEffect(() => { setTaskComplete(!!taskSubmission); }, [taskSubmission]);
  useEffect(() => { setTestComplete(!!testAttempt);   }, [testAttempt]);

  // ── Live session ───────────────────────────────────────────────────────────
  const { session } = useLiveSessionSafe();
  const isLiveLocked =
    session.sessionActive && !session.detached && session.role === 'student';

  const effectiveSlide =
    isLiveLocked && forcedSlide !== null && forcedSlide !== undefined
      ? forcedSlide
      : slideProgress.currentSlide;

  const activeSection  = forcedSection ?? session.activeSection ?? 'slides';
  const showSlides     = !isLiveLocked || activeSection === 'slides';
  const showTask       = !isLiveLocked || activeSection === 'task';
  const showTest       = !isLiveLocked || activeSection === 'test';

  // ── Aggregate progress ──────────────────────────────────────────────────────
  const handleSlidesProgress = useCallback((p: SlideProgress) => {
    setSlideProgress(p);
  }, []);

  // Derive primary task/test (needs unit to be resolved)
  const primaryTask = unit ? selectPrimary(unit.tasks ?? []) : null;
  const primaryTest = unit ? selectPrimary(unit.tests ?? []) : null;

  const hasSlides  = slides.length > 0 || slidesLoading;
  const hasTask    = !!primaryTask;
  const hasTest    = !!primaryTest;

  // Emit aggregate progress whenever any section changes
  useEffect(() => {
    const available  = [hasSlides, hasTask, hasTest].filter(Boolean).length;
    const completed  = [
      hasSlides && slideProgress.completed,
      hasTask   && taskComplete,
      hasTest   && testComplete,
    ].filter(Boolean).length;
    const pct = available ? Math.round((completed / available) * 100) : 0;
    onProgressChange?.(pct);
  }, [hasSlides, hasTask, hasTest, slideProgress.completed, taskComplete, testComplete, onProgressChange]);

  // ── Task submit wrapper ────────────────────────────────────────────────────
  const handleSubmitTask = useCallback(
    async (payload: { task_id: number; answers: Record<string, unknown> }) => {
      await onSubmitTask?.(payload);
      setTaskComplete(true);
    },
    [onSubmitTask]
  );

  // ── Test submit wrapper ───────────────────────────────────────────────────
  const handleSubmitTest = useCallback(
    async (payload: { test_id: number; answers: Record<string, string> }) => {
      const result = await onSubmitTest?.(payload);
      setTestComplete(true);
      return result ?? {};
    },
    [onSubmitTest]
  );

  // ── States ─────────────────────────────────────────────────────────────────

  if (loading) return <LessonSkeleton />;

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

  if (!hasSlides && !hasTask && !hasTest) return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-24 text-center text-slate-400">
      <BookOpen className="mb-4 h-14 w-14 opacity-15" />
      <p className="text-base font-medium text-slate-600">No lesson content available yet</p>
      <p className="mt-1 text-sm">Your teacher hasn't added content to this unit.</p>
    </div>
  );

  return (
    <section className="mx-auto w-full max-w-2xl space-y-8 pb-24">
      {/* ── Unit header ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold leading-snug text-slate-900">{unit.title}</h1>
          <StudentLiveIndicator />
        </div>

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
        taskComplete={taskComplete}
        hasTest={hasTest}
        testComplete={testComplete}
      />

      {/* ── Live mode active section banner ──────────────────────────────── */}
      {isLiveLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-xs text-primary-700">
          <span className="font-semibold uppercase tracking-wider">Now:</span>
          <span className="capitalize">{activeSection}</span>
        </div>
      )}

      {/* ── Slides ───────────────────────────────────────────────────────── */}
      {showSlides && slidesLoading && (
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 rounded bg-slate-200" />
          <div className="h-64 rounded-2xl bg-slate-100" />
        </div>
      )}

      {showSlides && slidesError && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Could not load slides: {slidesError}
        </div>
      )}

      {showSlides && !slidesLoading && !slidesError && slides.length > 0 && (
        <SlidesSection
          slides={slides}
          onProgressChange={handleSlidesProgress}
          locked={isLiveLocked}
          forcedSlide={isLiveLocked ? effectiveSlide : undefined}
        />
      )}

      {/* ── Task ─────────────────────────────────────────────────────────── */}
      {showTask && hasTask && primaryTask && (
        onSubmitTask ? (
          <TaskSection
            task={primaryTask as any}
            submission={(taskSubmission as any) ?? null}
            onSubmitTask={handleSubmitTask}
            onOpenFull={onOpenTask as any}
          />
        ) : (
          /* Fallback: no inline submit wired — show summary + open button */
          <TaskSection
            task={primaryTask as any}
            submission={(taskSubmission as any) ?? null}
            onSubmitTask={async () => {
              // No-op; user must use the external flow
              onOpenTask?.(primaryTask);
            }}
            onOpenFull={onOpenTask as any}
          />
        )
      )}

      {/* ── Test ─────────────────────────────────────────────────────────── */}
      {showTest && hasTest && primaryTest && (
        onSubmitTest ? (
          <TestSection
            test={primaryTest as any}
            attempt={(testAttempt as any) ?? null}
            onSubmitTest={handleSubmitTest}
            onOpenFull={onStartTest as any}
          />
        ) : (
          /* Fallback: no inline submit — show intro + open button */
          <TestSection
            test={primaryTest as any}
            attempt={(testAttempt as any) ?? null}
            onSubmitTest={async () => {
              onStartTest?.(primaryTest);
              return {};
            }}
            onOpenFull={onStartTest as any}
          />
        )
      )}
    </section>
  );
}
