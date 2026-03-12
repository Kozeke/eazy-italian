/**
 * SlidesPlayer.tsx
 *
 * Renders one slide at a time. Uses the ReviewSlide type from shared.ts —
 * the canonical slide shape already used by ReviewSlidesPage, SlideEditorPage,
 * and the shared deckReducer. No new slide types are introduced.
 *
 * ReviewSlide fields rendered:
 *   title         → large heading
 *   bullets       → primary content list (from shared.ts "bullets", API "bullet_points")
 *   examples      → italic example cards
 *   exercise      → tinted call-out block
 *   image_url     → lazy image with broken-image fallback (reuses LazyImage from shared.ts)
 *   teacher_notes → intentionally NOT shown to students
 *
 * Navigation:
 *   Prev / Next buttons + dot-strip indicators + keyboard Arrow support
 *   via the shared useKeyboardNav hook (same hook used in ReviewSlidesPage).
 *
 * onChangeSlide is called by both button clicks and keyboard events so
 * the parent (SlidesSection) can track viewed slide IDs.
 */

import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import type { ReviewSlide } from '../../../pages/admin/shared';
import { useKeyboardNav, LazyImage } from '../../../pages/admin/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlidesPlayerProps = {
  slides: ReviewSlide[];
  currentSlide: number;              // 0-based index
  onChangeSlide: (index: number) => void;
};

// ─── Slide content sub-components ────────────────────────────────────────────

function BulletList({ bullets }: { bullets: string[] }) {
  const items = bullets.filter(Boolean);
  if (!items.length) return null;
  return (
    <ul className="space-y-2.5">
      {items.map((b, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
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
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Examples
      </p>
      <ul className="space-y-2">
        {items.map((ex, i) => (
          <li
            key={i}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm italic text-slate-600 leading-relaxed"
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
    <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-4">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary-500">
        Exercise
      </p>
      <p className="text-[15px] leading-relaxed text-primary-900">{text}</p>
    </div>
  );
}

function SlideImage({ url }: { url: string }) {
  const [errored, setErrored] = React.useState(false);

  if (errored) {
    return (
      <div className="flex h-44 w-full items-center justify-center rounded-xl bg-slate-100 text-slate-300">
        <ImageOff className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
      <LazyImage
        src={url}
        alt="Slide illustration"
        className="max-h-64 w-full object-contain"
        style={{ display: 'block' }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SlidesPlayer({
  slides,
  currentSlide,
  onChangeSlide,
}: SlidesPlayerProps) {
  const topRef = useRef<HTMLDivElement>(null);

  // Clamp index to valid range
  const idx   = Math.max(0, Math.min(currentSlide, slides.length - 1));
  const slide = slides[idx];

  const isFirst = idx === 0;
  const isLast  = idx === slides.length - 1;

  const prev = () => { if (!isFirst) onChangeSlide(idx - 1); };
  const next = () => { if (!isLast)  onChangeSlide(idx + 1); };

  // Keyboard nav — reuses shared hook, same pattern as ReviewSlidesPage
  useKeyboardNav(prev, next);

  // Scroll player into view when slide changes (not on initial mount)
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [idx]);

  if (!slide) return null;

  const hasBullets  = (slide.bullets?.filter(Boolean).length ?? 0) > 0;
  const hasExamples = (slide.examples?.filter(Boolean).length ?? 0) > 0;
  const hasExercise = !!(slide.exercise?.trim());
  const hasImage    = !!(slide.image_url);

  return (
    <div ref={topRef}>
      {/* ── Slide card ──────────────────────────────────────────────────── */}
      <div
        // key forces re-mount animation when slide changes
        key={idx}
        className="min-h-[16rem] rounded-2xl border border-slate-200 bg-white px-7 py-7 shadow-sm"
      >
        {/* Counter badge */}
        <div className="mb-5 flex items-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
            <span className="text-slate-800">{idx + 1}</span>
            <span className="text-slate-300">/</span>
            <span>{slides.length}</span>
          </span>
        </div>

        {/* Title */}
        {slide.title && (
          <h3 className="mb-5 text-xl font-bold leading-snug text-slate-900">
            {slide.title}
          </h3>
        )}

        {/* Content */}
        <div className="space-y-5">
          {hasImage    && <SlideImage url={slide.image_url!} />}
          {hasBullets  && <BulletList bullets={slide.bullets} />}
          {hasExamples && <ExamplesList examples={slide.examples!} />}
          {hasExercise && <ExerciseBlock text={slide.exercise!} />}

          {/* Empty slide fallback */}
          {!slide.title && !hasBullets && !hasExamples && !hasExercise && !hasImage && (
            <p className="text-sm italic text-slate-400">This slide has no content.</p>
          )}
        </div>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <div className="mt-4 flex items-center gap-3">
        {/* Prev */}
        <button
          disabled={isFirst}
          onClick={prev}
          aria-label="Previous slide"
          className={[
            'flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
            isFirst
              ? 'cursor-not-allowed border-slate-100 text-slate-300'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900',
          ].join(' ')}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        {/* Dot strip — up to 20 dots, then condensed counter */}
        <div className="flex flex-1 items-center justify-center">
          {slides.length <= 20 ? (
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => onChangeSlide(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={[
                    'rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                    i === idx
                      ? 'h-2 w-5 bg-primary-500'
                      : 'h-2 w-2 bg-slate-200 hover:bg-slate-300',
                  ].join(' ')}
                />
              ))}
            </div>
          ) : (
            <span className="text-xs tabular-nums text-slate-400">
              {idx + 1} / {slides.length}
            </span>
          )}
        </div>

        {/* Next */}
        <button
          disabled={isLast}
          onClick={next}
          aria-label="Next slide"
          className={[
            'flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
            isLast
              ? 'cursor-not-allowed border-slate-100 text-slate-300'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900',
          ].join(' ')}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
