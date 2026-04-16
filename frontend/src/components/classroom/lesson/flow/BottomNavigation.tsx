/**
 * BottomNavigation.tsx  (v3 — inline, no sticky)
 *
 * Renders inside each SectionBlock as normal flow content.
 * Previous / Next navigation only — no "Add Section" action.
 * Single-section: arrows are rendered but both disabled.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PlayerMode } from './VerticalLessonPlayer';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BottomNavigationProps {
  currentIndex: number;
  total: number;
  mode: PlayerMode;

  onPrev: () => void;
  onNext: () => void;

  completedSteps: number;
  totalSteps: number;
}

// ─── BottomNavigation ─────────────────────────────────────────────────────────

export default function BottomNavigation({
  currentIndex,
  total,
  mode,
  onPrev,
  onNext,
  completedSteps,
  totalSteps,
}: BottomNavigationProps) {
  const isTeacher = mode === 'teacher';

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < total - 1;

  const progressPct =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <nav className="vlp-bottom-nav" aria-label="Lesson navigation">
      {/* Progress bar — student mode only */}
      {!isTeacher && (
        <div
          className="vlp-progress-track"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progressPct}% complete`}
        >
          <div className="vlp-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <div className="vlp-bottom-nav-inner">
        <button
          type="button"
          className="vlp-nav-btn vlp-nav-btn--ghost"
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Previous section"
        >
          <ChevronLeft size={16} aria-hidden />
          <span>Previous</span>
        </button>

        {total > 1 && (
          <span className="vlp-nav-counter" aria-live="polite" aria-atomic>
            {Math.min(currentIndex + 1, Math.max(total, 1))}&thinsp;/&thinsp;{Math.max(total, 1)}
          </span>
        )}

        <button
          type="button"
          className="vlp-nav-btn vlp-nav-btn--primary"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next section"
        >
          <span>Next</span>
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </nav>
  );
}