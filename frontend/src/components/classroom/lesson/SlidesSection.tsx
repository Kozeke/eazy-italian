/**
 * SlidesSection.tsx  (v3 — delegates to SlideStep)
 *
 * What changed:
 *   • All rendering logic moved to SlideStep.tsx.
 *   • This file is now a thin adapter: it reads SlidesSectionProps (unchanged)
 *     and forwards them to SlideStep.
 *   • SlideProgress type is re-exported from SlideStep so every existing
 *     import of SlideProgress from './SlidesSection' still resolves correctly.
 *   • No behaviour changes for locked / forcedSlide / onProgressChange.
 */

export type { SlideProgress } from './SlideStep';

import React from 'react';
import SlideStep from './SlideStep';
import type { SlideProgress } from './SlideStep';
import type { ReviewSlide } from '../../../pages/admin/shared';

// ─── Types (unchanged public API) ─────────────────────────────────────────────

export type SlidesSectionProps = {
  title?: string;
  slides: ReviewSlide[];
  onProgressChange?: (progress: SlideProgress) => void;
  locked?: boolean;
  forcedSlide?: number;
  nextStepLabel?: string;
  onContinue?: () => void;
  hideContinueCta?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SlidesSection({
  slides,
  onProgressChange,
  locked,
  forcedSlide,
  nextStepLabel,
  onContinue,
  hideContinueCta,
}: SlidesSectionProps) {
  return (
    <SlideStep
      slides={slides}
      onProgressChange={onProgressChange}
      locked={locked}
      forcedSlide={forcedSlide}
      nextStepLabel={nextStepLabel}
      onContinue={onContinue}
      hideContinueCta={hideContinueCta}
    />
  );
}
