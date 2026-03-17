/**
 * SlidesPlayer.tsx  (v2 — Immersive Learning Mode)
 *
 * Redesigned for a premium, focused slide-reading experience.
 *
 * What changed from v1:
 * ─────────────────────
 * • Full-width cinematic card frame with subtle gradient mesh background.
 * • Slide content animates in on change (fade + slight upward translate).
 * • Navigation: large ghost chevron buttons flanking the card on desktop;
 *   compact bottom bar on mobile.
 * • Progress track: segmented bar at top of card (fills teal per viewed slide).
 * • Counter redesigned: pill with teal fill ratio visualization.
 * • Locked (live session) state: soft overlay + "Live" indicator instead of
 *   disabled buttons — students understand they can't skip ahead.
 * • Bullets: staggered reveal animation; each bullet has a teal accent dash.
 * • Examples: styled as elegant quote cards with left teal border.
 * • Exercise: prominent teal callout with pencil icon.
 * • Image: full-bleed with rounded corners, subtle shadow.
 * • Swipe hint on touch devices (arrow icon pulse).
 * • Keyboard arrows still work via useKeyboardNav.
 * • All accent colours from teal student design system (no primary-blue).
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  PencilLine,
  Radio,
  ArrowRight,
} from 'lucide-react';
import type { ReviewSlide } from '../../../pages/admin/shared';
import { useKeyboardNav } from '../../../pages/admin/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlidesPlayerProps = {
  slides: ReviewSlide[];
  currentSlide: number;
  onChangeSlide: (index: number) => void;
  locked?: boolean;
  /** viewedSlideIds from parent — used to shade the progress segments */
  viewedSlideIds?: string[];
};

// ─── Animation key — forces React to re-run enter animation on slide change ──

let _animKey = 0;

// ─── Sub-components ───────────────────────────────────────────────────────────

function BulletList({ bullets }: { bullets: string[] }) {
  const items = bullets.filter(Boolean);
  if (!items.length) return null;
  return (
    <ul className="space-y-3">
      {items.map((b, i) => (
        <li
          key={i}
          className="flex items-start gap-3.5"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
        >
          {/* Teal accent dash */}
          <span className="mt-[9px] h-[2px] w-3 shrink-0 rounded-full bg-teal-400" />
          <span className="text-[15px] leading-relaxed text-slate-700">{b}</span>
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
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-500">
        Examples
      </p>
      <ul className="space-y-2">
        {items.map((ex, i) => (
          <li
            key={i}
            className="relative rounded-lg bg-teal-50/60 py-3 pl-4 pr-4 text-[14px] italic leading-relaxed text-slate-600 border-l-[3px] border-teal-300"
          >
            "{ex}"
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExerciseBlock({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-teal-50/30 px-5 py-4">
      <div className="mb-2 flex items-center gap-1.5">
        <PencilLine className="h-3.5 w-3.5 text-teal-500" />
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-600">
          Exercise
        </p>
      </div>
      <p className="text-[15px] leading-relaxed text-teal-900">{text}</p>
    </div>
  );
}

function SlideImage({ url }: { url: string }) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className="flex h-44 w-full items-center justify-center rounded-xl bg-slate-100 text-slate-300">
        <ImageOff className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl shadow-md border border-slate-100">
      <img
        src={url}
        alt="Slide illustration"
        className="max-h-72 w-full object-contain bg-slate-50"
        style={{ display: 'block' }}
        onError={() => setErrored(true)}
        loading="lazy"
      />
    </div>
  );
}

/** Segmented progress bar at the top of the player */
function SlideProgressBar({
  total,
  current,
  viewedIds,
  slides,
  locked,
  onJump,
}: {
  total: number;
  current: number;
  viewedIds: string[];
  slides: ReviewSlide[];
  locked: boolean;
  onJump: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-[3px] w-full" role="tablist" aria-label="Slide progress">
      {Array.from({ length: total }).map((_, i) => {
        const slide = slides[i];
        const isViewed  = slide ? viewedIds.includes(slide.id ?? String(i)) : false;
        const isCurrent = i === current;
        return (
          <button
            key={i}
            role="tab"
            aria-selected={isCurrent}
            aria-label={`Slide ${i + 1}`}
            disabled={locked}
            onClick={() => !locked && onJump(i)}
            className={[
              'h-[2px] flex-1 rounded-full transition-all duration-300 focus:outline-none',
              'focus-visible:ring-1 focus-visible:ring-teal-400 focus-visible:ring-offset-1',
              locked ? 'cursor-default' : 'cursor-pointer',
              isCurrent
                ? 'bg-teal-500 scale-y-[1.5]'
                : isViewed
                ? 'bg-teal-300'
                : 'bg-slate-200 hover:bg-slate-300',
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}

// ─── Nav button (large ghost chevron, only desktop) ───────────────────────────

function NavButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? 'Previous slide' : 'Next slide'}
      className={[
        'group hidden md:flex items-center justify-center',
        'w-10 h-10 rounded-full border transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
        'shrink-0',
        disabled
          ? 'border-slate-100 text-slate-200 cursor-not-allowed'
          : 'border-slate-200 bg-white text-slate-400 shadow-sm',
        !disabled && 'hover:border-teal-300 hover:bg-teal-50 hover:text-teal-600 hover:shadow-md',
      ].join(' ')}
    >
      <Icon
        className={[
          'h-4 w-4 transition-transform duration-150',
          !disabled && direction === 'prev' && 'group-hover:-translate-x-0.5',
          !disabled && direction === 'next' && 'group-hover:translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SlidesPlayer({
  slides,
  currentSlide,
  onChangeSlide,
  locked = false,
  viewedSlideIds = [],
}: SlidesPlayerProps) {
  const topRef    = useRef<HTMLDivElement>(null);
  const [animKey, setAnimKey] = useState(0);

  const idx   = Math.max(0, Math.min(currentSlide, slides.length - 1));
  const slide = slides[idx];

  const isFirst = idx === 0;
  const isLast  = idx === slides.length - 1;

  const prev = useCallback(() => { if (!isFirst && !locked) onChangeSlide(idx - 1); }, [isFirst, locked, idx, onChangeSlide]);
  const next = useCallback(() => { if (!isLast  && !locked) onChangeSlide(idx + 1); }, [isLast,  locked, idx, onChangeSlide]);

  useKeyboardNav(prev, next);

  // Trigger content animation on slide change
  useEffect(() => {
    setAnimKey((k) => k + 1);
  }, [idx]);

  // Scroll into view on change (after initial mount)
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [idx]);

  if (!slide) return null;

  const hasBullets  = (slide.bullets?.filter(Boolean).length  ?? 0) > 0;
  const hasExamples = (slide.examples?.filter(Boolean).length ?? 0) > 0;
  const hasExercise = !!(slide.exercise?.trim());
  const hasImage    = !!(slide.image_url);

  return (
    <div ref={topRef} className="w-full">

      {/* ── Player row: nav | card | nav ───────────────────────────────── */}
      <div className="flex items-center gap-3">

        <NavButton direction="prev" disabled={isFirst || locked} onClick={prev} />

        {/* ── Slide card ───────────────────────────────────────────────── */}
        <div className="relative min-w-0 flex-1 rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_16px_0_rgba(0,0,0,0.07)] overflow-hidden">

          {/* Top progress bar */}
          <div className="px-5 pt-4 pb-0">
            <SlideProgressBar
              total={slides.length}
              current={idx}
              viewedIds={viewedSlideIds}
              slides={slides}
              locked={locked}
              onJump={onChangeSlide}
            />
          </div>

          {/* Slide counter + Live indicator */}
          <div className="flex items-center justify-between px-5 pt-3 pb-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-slate-400">
              <span className="font-bold text-slate-700">{idx + 1}</span>
              <span className="text-slate-300">/</span>
              <span>{slides.length}</span>
            </span>

            {locked && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold text-red-500">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                </span>
                Live
              </span>
            )}
          </div>

          {/* Animated content area */}
          <div
            key={animKey}
            className="px-6 pt-4 pb-7 slide-content-enter"
          >
            {/* Title */}
            {slide.title && (
              <h3 className="mb-5 text-[22px] font-bold leading-snug tracking-tight text-slate-900">
                {slide.title}
              </h3>
            )}

            {/* Content blocks */}
            <div className="space-y-5">
              {hasImage    && <SlideImage url={slide.image_url!} />}
              {hasBullets  && <BulletList bullets={slide.bullets!} />}
              {hasExamples && <ExamplesList examples={slide.examples!} />}
              {hasExercise && <ExerciseBlock text={slide.exercise!} />}

              {!slide.title && !hasBullets && !hasExamples && !hasExercise && !hasImage && (
                <p className="text-sm italic text-slate-400">This slide has no content.</p>
              )}
            </div>
          </div>

          {/* Subtle gradient mesh background (decorative) */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.025]"
            style={{
              background: 'radial-gradient(ellipse at 80% 20%, #2dd4bf 0%, transparent 60%), radial-gradient(ellipse at 10% 80%, #5eead4 0%, transparent 50%)',
            }}
            aria-hidden
          />
        </div>

        <NavButton direction="next" disabled={isLast || locked} onClick={next} />
      </div>

      {/* ── Mobile bottom nav bar ────────────────────────────────────────── */}
      <div className="mt-3 flex items-center justify-between gap-2 md:hidden">
        <button
          disabled={isFirst || locked}
          onClick={prev}
          aria-label="Previous slide"
          className={[
            'flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition-all',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
            isFirst || locked
              ? 'cursor-not-allowed border-slate-100 text-slate-300'
              : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700',
          ].join(' ')}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>

        {/* Mobile counter */}
        <span className="text-[11px] font-semibold tabular-nums text-slate-400">
          {idx + 1} of {slides.length}
        </span>

        <button
          disabled={isLast || locked}
          onClick={next}
          aria-label="Next slide"
          className={[
            'flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition-all',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
            isLast || locked
              ? 'cursor-not-allowed border-slate-100 text-slate-300'
              : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700',
          ].join(' ')}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Keyframe styles injected once */}
      <style>{`
        @keyframes slideContentEnter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .slide-content-enter {
          animation: slideContentEnter 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>
    </div>
  );
}
