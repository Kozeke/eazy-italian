/**
 * BuilderPlaceholders.tsx
 *
 * Temporary placeholder bodies rendered inside LessonEditorShell while
 * the real per-type editors are built in subsequent steps.
 *
 * Each placeholder:
 * • clearly shows which editor type is active
 * • signals "this lives inside the classroom lesson canvas"
 * • matches the teal/sky/amber/emerald accent system
 * • has a minimal skeleton layout suggesting the real editor structure
 *
 * These are intentionally un-finished — they will be replaced one by one
 * in the next implementation steps without touching the shell.
 */

import React from 'react';
import {
  Layers,
  Video,
  PenSquare,
  BadgeCheck,
  Construction,
} from 'lucide-react';
import type { ActiveBuilderType } from '../lessonMode.types';

// ─── Shared placeholder frame ─────────────────────────────────────────────────

interface PlaceholderConfig {
  Icon:       React.ElementType;
  label:      string;
  hint:       string;
  accentBg:   string;
  accentText: string;
  accentBorder: string;
  skeletonLines: number;
}

const CONFIGS: Record<NonNullable<ActiveBuilderType>, PlaceholderConfig> = {
  slides: {
    Icon:          Layers,
    label:         'Slide editor',
    hint:          'Add slides with titles, bullets, examples, exercises and images.',
    accentBg:      'bg-teal-50',
    accentText:    'text-teal-600',
    accentBorder:  'border-teal-200',
    skeletonLines: 4,
  },
  video: {
    Icon:          Video,
    label:         'Video lesson',
    hint:          'Paste a YouTube or Vimeo URL and add a title and description.',
    accentBg:      'bg-sky-50',
    accentText:    'text-sky-600',
    accentBorder:  'border-sky-200',
    skeletonLines: 2,
  },
  task: {
    Icon:          PenSquare,
    label:         'Task editor',
    hint:          'Write questions, add instructions, and configure the task type.',
    accentBg:      'bg-amber-50',
    accentText:    'text-amber-600',
    accentBorder:  'border-amber-200',
    skeletonLines: 5,
  },
  test: {
    Icon:          BadgeCheck,
    label:         'Test editor',
    hint:          'Create multiple-choice or open questions with a pass threshold.',
    accentBg:      'bg-emerald-50',
    accentText:    'text-emerald-600',
    accentBorder:  'border-emerald-200',
    skeletonLines: 5,
  },
};

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ width, short }: { width: string; short?: boolean }) {
  return (
    <div
      className={`h-3 rounded-full bg-slate-100 ${width} ${short ? 'mt-2' : 'mt-3'}`}
      aria-hidden
    />
  );
}

// ─── Placeholder ──────────────────────────────────────────────────────────────

function EditorPlaceholder({ config }: { config: PlaceholderConfig }) {
  const { Icon, label, hint, accentBg, accentText, accentBorder, skeletonLines } = config;

  const skeletonWidths = ['w-3/4', 'w-full', 'w-5/6', 'w-2/3', 'w-4/5'];

  return (
    <div className="flex flex-col gap-6 py-2">

      {/* Under-construction notice */}
      <div className={[
        'flex items-start gap-3 rounded-xl border px-4 py-3.5',
        accentBg,
        accentBorder,
      ].join(' ')}>
        <Construction className={`mt-0.5 h-4 w-4 shrink-0 ${accentText}`} />
        <div>
          <p className={`text-[13px] font-semibold ${accentText}`}>
            {label} — coming in the next step
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
            {hint}
          </p>
        </div>
      </div>

      {/* Skeleton preview — simulates editor form fields */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="h-4 w-1/3 rounded-full bg-slate-200 mb-5" aria-hidden />
        {skeletonWidths.slice(0, skeletonLines).map((w, i) => (
          <SkeletonRow key={i} width={w} short={i > 0} />
        ))}
        {/* Fake button */}
        <div className="mt-6 flex gap-2" aria-hidden>
          <div className="h-9 w-24 rounded-xl bg-slate-100" />
          <div className="h-9 w-16 rounded-xl bg-slate-50" />
        </div>
      </div>

      {/* Icon watermark */}
      <div className="flex justify-center mt-2 opacity-[0.06]" aria-hidden>
        <Icon className="h-24 w-24 text-slate-600" />
      </div>

    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export function BuilderEditorBody({ type }: { type: ActiveBuilderType }) {
  if (!type) return null;
  const config = CONFIGS[type];
  return <EditorPlaceholder config={config} />;
}