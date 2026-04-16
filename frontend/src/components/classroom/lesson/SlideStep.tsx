/**
 * SlideStep.tsx  (v3 — fills shared PlayerFrame, internal scroll only)
 *
 * Changes from v2:
 * ────────────────
 * • Removed the inline `style={{ height: 'clamp(420px, 62vh, 640px)' }}` that
 *   was causing the page to jump and grow taller than the viewport.
 *
 * • SlideStep now expects to live inside the `.lp-player-body` zone of a
 *   PlayerFrame, which is `flex-1 min-h-0 overflow-y-auto`.  SlideStep itself
 *   is `flex flex-col flex-1 min-h-0` and uses the full height given.
 *
 * • The segmented track bar and nav controls are `flex-shrink-0` so they are
 *   always visible.  The content region between them uses `flex-1 min-h-0
 *   overflow-y-auto overscroll-contain` for internal-only scrolling.
 *
 * • All other behaviour (keyboard nav, forcedSlide, onProgressChange,
 *   locked overlay, ContinueCta, SlideCard layout) is preserved from v2.
 *
 * • The ContinueCta is rendered outside the scrollable content so it stays
 *   visible without requiring the student to scroll to the bottom.
 */

import React, {
  useState, useCallback, useEffect,
} from 'react';
import {
  ChevronLeft, ChevronRight, ImageOff,
  ArrowRight, CheckCircle2,
} from 'lucide-react';
import type { ReviewSlide } from '../../../pages/admin/shared';
import { useKeyboardNav, LazyImage } from '../../../pages/admin/shared';

// ─── SlideProgress (re-exported so consumers can import from here) ─────────────

export type SlideProgress = {
  currentSlide:   number;
  viewedSlideIds: string[];
  completed:      boolean;
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SlideStepProps {
  slides:            ReviewSlide[];
  onProgressChange?: (p: SlideProgress) => void;
  nextStepLabel?:    string;
  onContinue?:       () => void;
  locked?:           boolean;
  forcedSlide?:      number;
  hideContinueCta?:  boolean;
}

// ─── Content sub-components ───────────────────────────────────────────────────

function BulletList({ bullets }: { bullets: string[] }) {
  const items = bullets.filter(Boolean);
  if (!items.length) return null;
  return (
    <ul className="space-y-3">
      {items.map((b, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-[#6C6FEF]" />
          <span className="text-[15px] leading-[1.7] text-slate-700">{b}</span>
        </li>
      ))}
    </ul>
  );
}

function ExamplesList({ examples }: { examples: string[] }) {
  const items = examples.filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        Examples
      </p>
      <ul className="space-y-2">
        {items.map((ex, i) => (
          <li
            key={i}
            className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-[14px] italic leading-relaxed text-teal-900"
          >
            &ldquo;{ex}&rdquo;
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExerciseBlock({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="rounded-xl border border-amber-200/60 bg-amber-50 px-4 py-4">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-500">
        Exercise
      </p>
      <p className="text-[15px] leading-relaxed text-amber-900">{text}</p>
    </div>
  );
}

function SlideImage({ url }: { url: string }) {
  const [errored, setErrored] = React.useState(false);
  const [loaded,  setLoaded]  = React.useState(false);

  if (errored) {
    return (
      <div className="flex h-36 w-full items-center justify-center rounded-xl bg-slate-100 text-slate-300">
        <ImageOff className="h-7 w-7" />
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 transition-opacity duration-300"
      style={{ opacity: loaded ? 1 : 0.6 }}
    >
      <LazyImage
        src={url}
        alt="Slide illustration"
        className="max-h-[220px] w-full object-contain"
        style={{ display: 'block' }}
        onLoad={() => setLoaded(true)}
        onError={() => { setErrored(true); setLoaded(true); }}
      />
    </div>
  );
}

// ─── Segmented progress track ─────────────────────────────────────────────────

function SegmentedTrack({
  total,
  current,
  viewed,
  locked,
  onJump,
}: {
  total:   number;
  current: number;
  viewed:  Set<string>;
  locked:  boolean;
  onJump:  (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-[3px] w-full" role="tablist" aria-label="Slide progress">
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === current;
        const isViewed = viewed.has(String(i));
        const canJump  = !locked;

        return (
          <button
            key={i}
            role="tab"
            aria-label={`Slide ${i + 1}`}
            aria-selected={isActive}
            disabled={!canJump}
            onClick={() => canJump && onJump(i)}
            className={[
              'h-[2px] flex-1 rounded-full transition-all duration-200',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6C6FEF] focus-visible:ring-offset-1',
              isActive  ? 'bg-[#6C6FEF] scale-y-[1.8]' :
              isViewed  ? 'bg-[#C7C9EE]'                :
                          'bg-slate-200',
              canJump && !isActive ? 'cursor-pointer hover:bg-[#D4D6F5]' : '',
            ].filter(Boolean).join(' ')}
          />
        );
      })}
    </div>
  );
}

// ─── SlideCard — content rendered inside the scrollable body ──────────────────

function SlideCard({ slide, animKey }: { slide: ReviewSlide; animKey: number }) {
  const hasBullets  = (slide.bullets?.filter(Boolean).length  ?? 0) > 0;
  const hasExamples = (slide.examples?.filter(Boolean).length ?? 0) > 0;
  const hasExercise = !!(slide.exercise?.trim());
  const hasImage    = !!(slide.image_url);

  const useTwoCols = hasImage && (hasBullets || hasExamples || hasExercise || slide.title);

  return (
    <div key={animKey} className="lp-slide-fade">
      {useTwoCols ? (
        <div className="flex flex-col gap-5 sm:grid sm:grid-cols-[1fr_auto] sm:gap-8 sm:items-start">
          <div className="space-y-4 min-w-0">
            {slide.title && (
              <h3 className="text-[19px] font-bold leading-snug tracking-tight text-slate-900">
                {slide.title}
              </h3>
            )}
            {hasBullets  && <BulletList  bullets={slide.bullets!}   />}
            {hasExamples && <ExamplesList examples={slide.examples!} />}
            {hasExercise && <ExerciseBlock text={slide.exercise!}   />}
          </div>
          <div className="sm:w-[220px] shrink-0">
            <SlideImage url={slide.image_url!} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {slide.title && (
            <h3 className="text-[19px] font-bold leading-snug tracking-tight text-slate-900">
              {slide.title}
            </h3>
          )}
          {hasImage    && <SlideImage   url={slide.image_url!}    />}
          {hasBullets  && <BulletList   bullets={slide.bullets!}   />}
          {hasExamples && <ExamplesList examples={slide.examples!} />}
          {hasExercise && <ExerciseBlock text={slide.exercise!}   />}

          {!slide.title && !hasBullets && !hasExamples && !hasExercise && !hasImage && (
            <p className="text-sm italic text-slate-400">This slide has no content.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ContinueCta ──────────────────────────────────────────────────────────────

function ContinueCta({
  label,
  onClick,
}: {
  label?: string;
  onClick?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end border-t border-[#F0F1F8] bg-[#EEF0FE]/50 px-4 py-3 sm:px-5">
      {onClick ? (
        <button
          onClick={onClick}
          className="inline-flex items-center gap-2 rounded-xl bg-[#6C6FEF] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#4F52C2] hover:shadow-md active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C6FEF] focus-visible:ring-offset-2"
        >
          {label ?? 'Continue lesson'}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : (
        <p className="shrink-0 text-[12px] text-[#4F52C2]">
          {label ?? 'Continue to the next step below'}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SlideStep({
  slides,
  onProgressChange,
  nextStepLabel,
  onContinue,
  locked = false,
  forcedSlide,
  hideContinueCta = false,
}: SlideStepProps) {

  // ── Progress state ────────────────────────────────────────────────────────
  const [progress, setProgress] = useState<SlideProgress>(() => ({
    currentSlide:   0,
    viewedSlideIds: slides[0] ? [slides[0].id ?? '0'] : [],
    completed:      slides.length <= 1,
  }));

  // Reset when slide array identity changes (unit switched)
  useEffect(() => {
    const initial: SlideProgress = {
      currentSlide:   0,
      viewedSlideIds: slides[0] ? [slides[0].id ?? '0'] : [],
      completed:      slides.length <= 1,
    };
    setProgress(initial);
    onProgressChange?.(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides]);

  // Forced slide from live classroom mode
  useEffect(() => {
    if (forcedSlide === undefined || !slides.length) return;
    const nextIdx = Math.max(0, Math.min(forcedSlide, slides.length - 1));
    setProgress((prev) => {
      if (prev.currentSlide === nextIdx) return prev;
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
  }, [forcedSlide, slides, onProgressChange]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const idx     = Math.max(0, Math.min(progress.currentSlide, slides.length - 1));
  const isFirst = idx === 0;
  const isLast  = idx === slides.length - 1;
  const showCta = isLast && progress.completed && !hideContinueCta;

  const go = useCallback((nextIdx: number) => {
    if (locked) return;
    const slide     = slides[nextIdx];
    const newId     = slide?.id ?? String(nextIdx);
    const viewed    = progress.viewedSlideIds.includes(newId)
      ? progress.viewedSlideIds
      : [...progress.viewedSlideIds, newId];
    const completed = progress.completed || nextIdx === slides.length - 1;
    const next: SlideProgress = { currentSlide: nextIdx, viewedSlideIds: viewed, completed };
    setProgress(next);
    onProgressChange?.(next);
  }, [locked, slides, progress, onProgressChange]);

  const prev = useCallback(() => { if (!isFirst) go(idx - 1); }, [isFirst, go, idx]);
  const next = useCallback(() => { if (!isLast)  go(idx + 1); }, [isLast,  go, idx]);

  // Keyboard arrow support
  useKeyboardNav(prev, next);

  if (!slides.length) return null;

  const slide     = slides[idx];
  const viewedSet = new Set(progress.viewedSlideIds.map((id) => {
    const i = slides.findIndex((s) => s.id === id || String(slides.indexOf(s)) === id);
    return i >= 0 ? String(i) : id;
  }));

  return (
    /*
     * Root: flex column filling the PlayerFrame body.
     * The parent (.lp-player-body) is flex-1 min-h-0 overflow-y-auto.
     * We override that overflow by making this element also fill it with
     * flex, so the inner zones handle scroll instead of the parent.
     */
    <div className="flex flex-col h-full">

      {/* ── Segmented progress track (pinned, never scrolls) — purple rail like SectionSidePanel ─ */}
      <div className="flex-shrink-0 px-4 pt-2 pb-2 border-b border-[#F0F1F8] bg-[#FAFBFF]/60">
        <SegmentedTrack
          total={slides.length}
          current={idx}
          viewed={viewedSet}
          locked={locked}
          onJump={go}
        />
      </div>

      {/* ── Locked overlay ────────────────────────────────────────────── */}
      {/* {locked && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-2xl bg-white/70 backdrop-blur-[2px]">
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
            <Lock className="h-3 w-3" />
            Controlled by your teacher
          </div>
        </div>
      )} */}

      {/* ── Status bar: counter + viewed badge (purple — matches SectionSidePanel) ─ */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-1 bg-[#FAFBFF]/90 border-b border-[#F0F1F8]">
        {/* <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF0FE] border border-[#C7C9EE] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#64748b] shadow-sm">
          <span className="text-[#4F52C2]">{idx + 1}</span>
          <span className="text-[#C7C9EE] mx-[1px]">/</span>
          <span>{slides.length}</span>
        </span> */}

        {progress.completed && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF0FE] px-2.5 py-0.5 text-[11px] font-semibold text-[#4F52C2] ring-1 ring-[#C7C9EE]">
            <CheckCircle2 className="h-3 w-3 text-[#6C6FEF]" />
            All slides viewed
          </span>
        )}
      </div>

      {/*
        ── Scrollable content zone ────────────────────────────────────
        flex-1 min-h-0 → takes remaining height.
        overflow-y-auto → content scrolls here, NOT on the page.
      */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-3 sm:px-7">
        <SlideCard slide={slide} animKey={idx} />
      </div>

      {/* ── Navigation controls (pinned, never scrolls) ───────────── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-t border-[#F0F1F8]">
        {/* Prev */}
        <button
          disabled={isFirst || locked}
          onClick={prev}
          aria-label="Previous slide"
          className={[
            'flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C6FEF]',
            isFirst || locked
              ? 'cursor-not-allowed border-slate-100 text-slate-200'
              : 'border-slate-200 text-slate-500 hover:border-[#C7C9EE] hover:bg-[#FAFBFF] hover:text-slate-800 hover:shadow-sm active:scale-95',
          ].join(' ')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Centre counter */}
        <span className="text-[12px] tabular-nums text-slate-400 font-medium select-none">
          {idx + 1}&thinsp;of&thinsp;{slides.length}
        </span>

        {/* Next */}
        <button
          disabled={isLast || locked}
          onClick={next}
          aria-label="Next slide"
          className={[
            'flex h-9 items-center gap-1.5 rounded-xl border px-3.5 transition-all duration-150 text-sm font-semibold',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C6FEF]',
            isLast || locked
              ? 'cursor-not-allowed border-slate-100 text-slate-200'
              : 'border-[#C7C9EE] bg-[#EEF0FE] text-[#4F52C2] hover:border-[#6C6FEF] hover:bg-[#E0E2FC] hover:shadow-sm active:scale-[0.97]',
          ].join(' ')}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Final-slide CTA (pinned below nav, never scrolls) ─────── */}
      {showCta && (
        <ContinueCta
          label={nextStepLabel}
          onClick={onContinue}
        />
      )}
    </div>
  );
}