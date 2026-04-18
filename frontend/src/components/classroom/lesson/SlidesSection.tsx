/**
 * SlidesSection.tsx  (v3 — delegates to SlideStep)
 *
 * lesson/flow wiring: VerticalLessonPlayer → SectionBlock → FlowItemRenderer
 * → exerciseRegistrations ("slides" → blocks/SlideBlock) → SlidesSection → SlideStep.
 * Not dead code — still the slide deck for legacy "slides" flow items.
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
import SlideStep from './SlideStep';
import type { ReviewSlide } from '../../../pages/admin/shared';
import type { SlideProgress } from './SlideStep';

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
