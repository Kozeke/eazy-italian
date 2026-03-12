/**
 * LessonProgressIndicator.tsx
 *
 * Compact lesson-level completion strip.
 * Shows only sections that actually exist in the lesson.
 *
 * States per step:
 *   complete  → emerald check          (done)
 *   active    → primary clock          (current step, not yet done)
 *   pending   → grey circle            (locked until previous done)
 *   hidden    → renders nothing        (section absent from unit)
 *
 * Sequential unlock: Task becomes active once Slides are complete;
 * Test becomes active once both Slides and Task are complete (or absent).
 */

import React from 'react';
import { CheckCircle2, Clock, Circle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LessonProgressIndicatorProps = {
  hasSlides?: boolean;
  slidesComplete: boolean;
  hasTask?: boolean;
  taskComplete: boolean;
  hasTest?: boolean;
  testComplete: boolean;
};

type StepState = 'complete' | 'active' | 'pending' | 'hidden';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stepState(
  exists: boolean,
  complete: boolean,
  unlocked: boolean
): StepState {
  if (!exists)  return 'hidden';
  if (complete) return 'complete';
  if (unlocked) return 'active';
  return 'pending';
}

// ─── Step atom ────────────────────────────────────────────────────────────────

function Step({
  label,
  state,
  showConnector,
}: {
  label: string;
  state: StepState;
  showConnector: boolean;
}) {
  if (state === 'hidden') return null;

  const iconColor =
    state === 'complete' ? 'text-emerald-500'
    : state === 'active' ? 'text-primary-500'
    : 'text-slate-300';

  const textColor =
    state === 'complete' ? 'text-emerald-700 font-semibold'
    : state === 'active' ? 'text-slate-700 font-medium'
    : 'text-slate-400';

  const connectorColor =
    state === 'complete' ? 'bg-emerald-200' : 'bg-slate-100';

  return (
    <>
      <li className="flex items-center gap-1.5 shrink-0">
        <span className={`transition-colors duration-300 ${iconColor}`}>
          {state === 'complete' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : state === 'active' ? (
            <Clock className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </span>
        <span className={`text-xs transition-colors duration-300 ${textColor}`}>
          {label}
        </span>
      </li>

      {showConnector && (
        <li
          aria-hidden
          className={`h-px w-8 shrink-0 mx-0.5 transition-colors duration-500 ${connectorColor}`}
        />
      )}
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LessonProgressIndicator({
  hasSlides = true,
  slidesComplete,
  hasTask = true,
  taskComplete,
  hasTest = true,
  testComplete,
}: LessonProgressIndicatorProps) {
  const sState = stepState(hasSlides, slidesComplete, true);
  const tState = stepState(hasTask,   taskComplete,   !hasSlides || slidesComplete);
  const xState = stepState(hasTest,   testComplete,   (!hasSlides || slidesComplete) && (!hasTask || taskComplete));

  const visible = [sState, tState, xState].filter(s => s !== 'hidden');
  if (visible.length === 0) return null;

  const allDone =
    (!hasSlides || slidesComplete) &&
    (!hasTask   || taskComplete)   &&
    (!hasTest   || testComplete);

  return (
    <div
      className={[
        'rounded-xl border px-4 py-3 transition-all duration-500',
        allDone ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-white',
      ].join(' ')}
    >
      {allDone && (
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-emerald-600">
          Lesson complete 🎉
        </p>
      )}
      <ol className="flex items-center flex-wrap gap-y-1">
        <Step label="Slides" state={sState} showConnector={tState !== 'hidden' || xState !== 'hidden'} />
        <Step label="Task"   state={tState} showConnector={xState !== 'hidden'} />
        <Step label="Test"   state={xState} showConnector={false} />
      </ol>
    </div>
  );
}
