/**
 * SlidesSection.tsx
 *
 * Section shell that wraps SlidesPlayer inside the lesson flow.
 *
 * Owns the "viewed slides" tracking and "slides complete" logic:
 *   - A slide is marked viewed when the student navigates to it.
 *   - Slides are marked complete once the student reaches the last slide.
 *   - Both facts are reported upward via onProgressChange so LessonWorkspace
 *     can reflect them in the LessonProgressIndicator.
 *
 * Design:
 *   - Subtle section header (icon + title + viewed count + completion badge)
 *   - SlidesPlayer is the visual focus — no heavy card chrome around it
 *   - Closes with a thin border-t divider to separate from task/test below
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Layers, CheckCircle2 } from 'lucide-react';
import SlidesPlayer from './SlidesPlayer';
import type { ReviewSlide } from '../../../pages/admin/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlideProgress = {
  currentSlide: number;
  viewedSlideIds: string[];
  completed: boolean;
};

export type SlidesSectionProps = {
  /** Section heading override (defaults to "Slides") */
  title?: string;
  slides: ReviewSlide[];
  /** Called whenever progress changes so parent can lift state */
  onProgressChange?: (progress: SlideProgress) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SlidesSection({
  title = 'Slides',
  slides,
  onProgressChange,
}: SlidesSectionProps) {
  const [progress, setProgress] = useState<SlideProgress>(() => ({
    currentSlide:  0,
    viewedSlideIds: slides[0] ? [slides[0].id] : [],
    completed:     slides.length <= 1,
  }));

  // When slide array identity changes (unit switched), reset progress
  useEffect(() => {
    const initial: SlideProgress = {
      currentSlide:  0,
      viewedSlideIds: slides[0] ? [slides[0].id] : [],
      completed:     slides.length <= 1,
    };
    setProgress(initial);
    onProgressChange?.(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides]);

  const handleChangeSlide = useCallback(
    (nextIdx: number) => {
      setProgress((prev) => {
        const slide     = slides[nextIdx];
        const newId     = slide?.id ?? String(nextIdx);
        const viewed    = prev.viewedSlideIds.includes(newId)
          ? prev.viewedSlideIds
          : [...prev.viewedSlideIds, newId];
        const completed = prev.completed || nextIdx === slides.length - 1;
        const next: SlideProgress = { currentSlide: nextIdx, viewedSlideIds: viewed, completed };
        onProgressChange?.(next);
        return next;
      });
    },
    [slides, onProgressChange]
  );

  if (!slides.length) return null;

  const viewedCount = progress.viewedSlideIds.length;

  return (
    <section aria-label={title}>
      {/* Section header */}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <Layers className="h-4 w-4" />
        </span>

        <div className="flex flex-1 items-baseline gap-2 min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <span className="text-xs tabular-nums text-slate-400 shrink-0">
            {viewedCount}&thinsp;/&thinsp;{slides.length} viewed
          </span>
        </div>

        {progress.completed && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete
          </span>
        )}
      </div>

      {/* Player */}
      <SlidesPlayer
        slides={slides}
        currentSlide={progress.currentSlide}
        onChangeSlide={handleChangeSlide}
      />

      {/* Section divider */}
      <div className="mt-10 border-t border-slate-100" aria-hidden />
    </section>
  );
}
