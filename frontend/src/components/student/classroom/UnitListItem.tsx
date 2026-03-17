/**
 * UnitListItem.tsx  (v2 — Focused Learning Mode / Design System)
 *
 * Premium unit row for the UnitSelectorModal.
 *
 * What changed from v1:
 * ─────────────────────
 * • Visual identity: each row has a floating number "medallion" that shows
 *   a teal fill for the active unit and a teal checkmark ring for completed.
 * • Content chips redesigned: Slides/Task/Test with distinct teal/amber/emerald
 *   colors rather than a generic grey slate.
 * • Locked state: full-row opacity + lock icon, subtle strikethrough feel.
 * • Current state: teal-50 background + left accent border (3 px teal-500).
 * • Completed state: subtle emerald-50 tint + checkmark medallion.
 * • Hover state: light teal tint (not just grey) for on-brand feel.
 * • Slide count / task / test use recognizable icons with per-type color.
 * • Keyboard accessible: focus-visible ring in teal.
 */

import React from 'react';
import {
  BookOpen,
  FileText,
  FlaskConical,
  CheckCircle2,
  Lock,
  PlayCircle,
  Presentation,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UnitListItemProps = {
  unit: {
    id: number;
    title: string;
    level?: string;
    order_index?: number;
    status?: string;
    is_visible_to_students?: boolean;
    content_count?: {
      videos?: number;
      tasks?: number;
      tests?: number;
      slides?: number;
      published_videos?: number;
      published_tasks?: number;
      published_tests?: number;
      published_slides?: number;
    };
  };
  isCurrent: boolean;
  isCompleted?: boolean;
  isLocked?: boolean;
  onClick: () => void;
};

// ─── Level colors ─────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-sky-100 text-sky-700',
  A2: 'bg-blue-100 text-blue-700',
  B1: 'bg-indigo-100 text-indigo-700',
  B2: 'bg-violet-100 text-violet-700',
  C1: 'bg-purple-100 text-purple-700',
  C2: 'bg-fuchsia-100 text-fuchsia-700',
};

// ─── Content type chip ────────────────────────────────────────────────────────

type ChipColor = 'teal' | 'amber' | 'emerald' | 'slate';

const CHIP_COLORS: Record<ChipColor, string> = {
  teal:    'bg-teal-50 text-teal-700',
  amber:   'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  slate:   'bg-slate-100 text-slate-500',
};

function ContentChip({
  icon: Icon,
  label,
  color = 'slate',
}: {
  icon: React.ElementType;
  label: string;
  color?: ChipColor;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${CHIP_COLORS[color]}`}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      {label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnitListItem({
  unit,
  isCurrent,
  isCompleted = false,
  isLocked = false,
  onClick,
}: UnitListItemProps) {
  const locked = isLocked || unit.is_visible_to_students === false;
  const cc      = unit.content_count;
  const levelCls = unit.level ? (LEVEL_COLORS[unit.level] ?? 'bg-slate-100 text-slate-600') : null;

  // Determine which content chips to show
  const hasSlides = (cc?.slides ?? cc?.videos ?? 0) > 0;
  const hasTask   = (cc?.tasks  ?? 0) > 0;
  const hasTest   = (cc?.tests  ?? 0) > 0;

  // Medallion appearance
  const medallion = locked
    ? { bg: 'bg-slate-100 text-slate-300', icon: null }
    : isCurrent
    ? { bg: 'bg-teal-600 text-white shadow-md shadow-teal-100', icon: null }
    : isCompleted
    ? { bg: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200', icon: 'check' }
    : { bg: 'bg-slate-100 text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-600', icon: null };

  return (
    <li>
      <button
        disabled={locked}
        onClick={onClick}
        role="option"
        aria-selected={isCurrent}
        aria-disabled={locked}
        className={[
          'group relative w-full px-4 py-3.5 text-left transition-all duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400',
          'disabled:cursor-not-allowed',
          isCurrent
            ? 'bg-teal-50/70 border-l-[3px] border-teal-500'
            : isCompleted && !locked
            ? 'hover:bg-emerald-50/40 border-l-[3px] border-transparent hover:border-emerald-300'
            : 'hover:bg-teal-50/50 border-l-[3px] border-transparent hover:border-teal-200',
          locked ? 'opacity-40' : '',
        ].join(' ')}
      >
        <div className="flex items-center gap-3.5">
          {/* ── Number medallion ──────────────────────────────────────── */}
          <div
            className={[
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-150',
              medallion.bg,
            ].join(' ')}
            aria-hidden
          >
            {medallion.icon === 'check' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              unit.order_index ?? '—'
            )}
          </div>

          {/* ── Main content ──────────────────────────────────────────── */}
          <div className="min-w-0 flex-1">
            {/* Title row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={[
                  'text-[13px] font-semibold leading-snug transition-colors',
                  isCurrent
                    ? 'text-teal-800'
                    : locked
                    ? 'text-slate-400'
                    : isCompleted
                    ? 'text-slate-600'
                    : 'text-slate-800 group-hover:text-teal-700',
                ].join(' ')}
              >
                {unit.title}
              </span>

              {levelCls && unit.level && (
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${levelCls}`}>
                  {unit.level}
                </span>
              )}

              {isCurrent && (
                <span className="shrink-0 rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                  Now studying
                </span>
              )}
            </div>

            {/* Content chips */}
            {(hasSlides || hasTask || hasTest) && (
              <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                {hasSlides && (
                  <ContentChip
                    icon={Presentation}
                    label={`${cc?.slides ?? cc?.videos ?? 0} slides`}
                    color="teal"
                  />
                )}
                {hasTask && (
                  <ContentChip
                    icon={FileText}
                    label={`${cc?.tasks ?? 0} task${(cc?.tasks ?? 0) !== 1 ? 's' : ''}`}
                    color="amber"
                  />
                )}
                {hasTest && (
                  <ContentChip
                    icon={FlaskConical}
                    label={`${cc?.tests ?? 0} test${(cc?.tests ?? 0) !== 1 ? 's' : ''}`}
                    color="emerald"
                  />
                )}
              </div>
            )}
          </div>

          {/* ── Status icon ───────────────────────────────────────────── */}
          <span className="shrink-0 ml-1" aria-hidden>
            {locked ? (
              <Lock className="h-4 w-4 text-slate-300" />
            ) : isCurrent ? (
              <PlayCircle className="h-4 w-4 text-teal-500" />
            ) : isCompleted ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <BookOpen className="h-4 w-4 text-slate-300 group-hover:text-teal-400 transition-colors" />
            )}
          </span>
        </div>
      </button>
    </li>
  );
}
