/**
 * LessonCompletionBanner.tsx  (v1)
 *
 * Replaces the minimal LessonCompleteBanner inside LessonFlowComponents.tsx
 * with a fully polished, animated, motivating completion experience.
 *
 * Features
 * ────────
 * • Animated entrance — card springs up, icon pops in, sparkles orbit
 * • Lesson summary strip — completed steps, score (if any), time indicator
 * • Pass/fail score badge if a test was taken
 * • Two optional CTAs: "Review this lesson" + custom onFinish action
 * • Confetti-style particle effect (CSS-only, no library needed)
 * • Accessible: single focus on mount, aria-live announces completion
 *
 * Props
 * ─────
 * • flow           — the LessonFlow model (for summary stats)
 * • testScore      — optional score 0–100 from the test attempt
 * • passingScore   — optional passing threshold (default 60)
 * • onReview       — optional "review lesson" handler (scrolls to top)
 * • onFinish       — optional CTA (e.g. "Back to class") with a label
 * • finishLabel    — label for the onFinish CTA
 */

import React, { useEffect, useRef } from 'react';
import {
  CheckCircle2, Sparkles, ArrowLeft, RotateCcw,
  Award, BookOpen, Star,
} from 'lucide-react';
import type { LessonFlow } from './flow/lessonFlow.types';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LessonCompletionBannerProps {
  flow:          LessonFlow;
  testScore?:    number | null;
  passingScore?: number | null;
  onReview?:     () => void;
  onFinish?:     () => void;
  finishLabel?:  string;
}

// ─── Confetti particle (CSS-only, performance-safe) ──────────────────────────

const PARTICLES = [
  { x: 12,  y: -18, delay: 0,    dur: 2.4, color: '#2dd4bf', size: 6, shape: 'circle' },
  { x: -20, y: -14, delay: 0.15, dur: 2.8, color: '#fbbf24', size: 5, shape: 'square' },
  { x: 28,  y: -8,  delay: 0.3,  dur: 2.2, color: '#818cf8', size: 4, shape: 'circle' },
  { x: -14, y: -22, delay: 0.45, dur: 3.0, color: '#34d399', size: 6, shape: 'circle' },
  { x: 20,  y: -26, delay: 0.6,  dur: 2.6, color: '#f472b6', size: 4, shape: 'square' },
  { x: -28, y: -10, delay: 0.1,  dur: 2.9, color: '#38bdf8', size: 5, shape: 'circle' },
  { x: 8,   y: -30, delay: 0.5,  dur: 2.3, color: '#a78bfa', size: 4, shape: 'square' },
  { x: -8,  y: -20, delay: 0.25, dur: 2.7, color: '#fb923c', size: 5, shape: 'circle' },
];

function ConfettiParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute top-1/3 left-1/2"
          style={{
            width:  p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '2px',
            animation: `lp-particle-float ${p.dur}s ease-out ${p.delay}s 1 both`,
            transform: `translate(${p.x}px, ${p.y}px)`,
            opacity: 0,
          }}
        />
      ))}
      <style>{`
        @keyframes lp-particle-float {
          0%   { opacity: 0;   transform: translate(0, 0) scale(0); }
          20%  { opacity: 1; }
          100% { opacity: 0;   transform: translate(var(--dx, 30px), var(--dy, -60px)) scale(0.5) rotate(120deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score, passing }: { score: number; passing: number }) {
  const passed = score >= passing;
  return (
    <div
      className={[
        'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-bold lp-result-row',
        passed
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
          : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
      ].join(' ')}
    >
      <Award className="h-3.5 w-3.5" />
      {passed ? 'Passed' : 'Keep practising'}
      <span className={`tabular-nums ${passed ? 'text-emerald-500' : 'text-amber-500'}`}>
        {Math.round(score)}%
      </span>
    </div>
  );
}

// ─── Summary stat chip ────────────────────────────────────────────────────────

function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[12px] font-semibold text-teal-700 ring-1 ring-teal-100 lp-result-row">
      {icon}
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LessonCompletionBanner({
  flow,
  testScore,
  passingScore,
  onReview,
  onFinish,
  finishLabel = 'Back to class',
}: LessonCompletionBannerProps) {
  // Focus the banner on mount so screen readers announce the completion
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      bannerRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const hasScore   = testScore != null;
  const passing    = passingScore ?? 60;
  const totalSteps = flow.totalSteps;
  const typeCount  = {
    slides: flow.items.filter((i) => i.type === 'slides').length,
    video:  flow.items.filter((i) => i.type === 'video').length,
    task:   flow.items.filter((i) => i.type === 'task').length,
    test:   flow.items.filter((i) => i.type === 'test').length,
  };

  return (
    <div
      ref={bannerRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      aria-label="Lesson complete"
      className="relative overflow-hidden rounded-2xl focus:outline-none lp-complete-enter"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-teal-50 via-teal-50/80 to-emerald-50/60" />

      {/* Subtle radial highlight */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 30% 40%, rgba(20,184,166,0.15), transparent)',
        }}
      />

      {/* Top gradient border */}
      <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-teal-400 via-teal-300 to-emerald-400" />

      {/* Confetti particles */}
      <ConfettiParticles />

      <div className="relative z-10 px-6 py-7 sm:px-8">

        {/* ── Icon + headline ─────────────────────────────────────────── */}
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0">
            {/* Outer glow ring */}
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-200/60 lp-icon-pop">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
          </div>

          <div className="flex-1 pt-1">
            <p className="text-[19px] font-extrabold tracking-tight text-teal-900 leading-tight">
              Lesson complete!
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-teal-700">
              You've finished every part of this lesson — excellent work.
            </p>
          </div>

          <CheckCircle2 className="h-6 w-6 shrink-0 text-teal-400 mt-0.5 lp-fade-in" aria-hidden />
        </div>

        {/* ── Summary chips ───────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-5">
          <StatChip
            icon={<CheckCircle2 className="h-3 w-3" />}
            label={`${totalSteps} step${totalSteps !== 1 ? 's' : ''} completed`}
          />
          {typeCount.slides > 0 && (
            <StatChip
              icon={<BookOpen className="h-3 w-3" />}
              label="Slides read"
            />
          )}
          {typeCount.video > 0 && (
            <StatChip
              icon={<Star className="h-3 w-3" />}
              label={typeCount.video === 1 ? 'Video watched' : `${typeCount.video} videos watched`}
            />
          )}
        </div>

        {/* ── Score badge ─────────────────────────────────────────────── */}
        {hasScore && (
          <div className="mb-5">
            <ScoreBadge score={testScore!} passing={passing} />
          </div>
        )}

        {/* ── CTAs ─────────────────────────────────────────────────────── */}
        {(onReview || onFinish) && (
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {onReview && (
              <button
                onClick={onReview}
                className={[
                  'flex items-center gap-2 rounded-xl border border-teal-200 bg-white/80',
                  'px-4 py-2 text-[13px] font-semibold text-teal-700',
                  'transition-all duration-150 hover:bg-white hover:border-teal-300 hover:shadow-sm',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1',
                  'active:scale-[0.97] lp-cta-btn',
                ].join(' ')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Review lesson
              </button>
            )}

            {onFinish && (
              <button
                onClick={onFinish}
                className={[
                  'flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2',
                  'text-[13px] font-bold text-white',
                  'shadow-md shadow-teal-200/60',
                  'transition-all duration-150 hover:bg-teal-700 hover:shadow-lg hover:shadow-teal-200/70',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2',
                  'active:scale-[0.97] lp-cta-btn',
                ].join(' ')}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {finishLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
