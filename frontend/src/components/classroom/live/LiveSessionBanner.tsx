/**
 * LiveSessionBanner.tsx
 *
 * Student-facing banner shown when a live session is active.
 *
 * Two states:
 *   attached  → "Live lesson in progress · Following teacher"
 *   detached  → "You've left the live session · Rejoin?"
 *
 * Renders as a sticky strip just below ClassroomHeader (via ClassroomPage).
 * Doesn't block any content — just a slim notification bar.
 */

import React from 'react';
import { Radio, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useLiveSession } from './LiveSessionProvider';

// ─── LiveSessionBanner ────────────────────────────────────────────────────────

export function LiveSessionBanner() {
  const { session, actions } = useLiveSession();
  const { sessionActive, detached, role } = session;

  // Only show for students when a session is active
  if (role !== 'student' || !sessionActive) return null;

  if (detached) {
    return (
      <div className="sticky top-14 z-20 flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 md:px-6">
        <div className="flex items-center gap-2.5">
          <EyeOff className="h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800">
            <span className="font-medium">You've left the live session.</span>
            {' '}Browsing independently.
          </p>
        </div>
        <button
          onClick={actions.reattach}
          className={[
            'flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300',
            'bg-white px-3 py-1 text-xs font-semibold text-amber-700',
            'hover:bg-amber-50 transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
          ].join(' ')}
        >
          <RotateCcw className="h-3 w-3" />
          Rejoin lesson
        </button>
      </div>
    );
  }

  return (
    <div className="sticky top-14 z-20 flex items-center justify-between gap-3 border-b border-primary-100 bg-primary-50 px-4 py-2 md:px-6">
      <div className="flex items-center gap-2.5">
        {/* Pulse dot */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
        </span>
        <Radio className="h-4 w-4 shrink-0 text-primary-600" />
        <p className="text-sm text-primary-900">
          <span className="font-semibold">Live lesson in progress.</span>
          {' '}Following teacher.
        </p>
      </div>

      <button
        onClick={actions.detach}
        className={[
          'flex shrink-0 items-center gap-1.5 rounded-full border border-primary-200',
          'bg-white px-3 py-1 text-xs font-medium text-primary-700',
          'hover:bg-primary-50 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
        ].join(' ')}
        title="Stop following teacher and browse freely"
      >
        <Eye className="h-3 w-3" />
        Leave live session
      </button>
    </div>
  );
}

// ─── StudentLiveIndicator ─────────────────────────────────────────────────────
/**
 * Compact inline badge shown inside LessonWorkspace (e.g. beside the slide
 * counter) when the student is actively following the teacher.
 * Usage: place next to the SlidesSection header.
 */
export function StudentLiveIndicator() {
  const { session } = useLiveSession();
  const { sessionActive, detached, role } = session;

  if (role !== 'student' || !sessionActive || detached) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-700"
      title="Teacher is controlling this slide"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-500" />
      </span>
      LIVE
    </span>
  );
}
