/**
 * UnitListItem.tsx
 *
 * Individual row in the UnitSelectorModal list.
 * Shows unit title, order index, status icon, and available content type chips.
 */

import React from 'react';
import {
  BookOpen,
  Video,
  ClipboardList,
  FileText,
  CheckCircle2,
  Lock,
  PlayCircle,
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
      published_videos?: number;
      published_tasks?: number;
      published_tests?: number;
    };
  };
  isCurrent: boolean;
  isCompleted?: boolean;
  isLocked?: boolean;
  onClick: () => void;
};

// ─── Level color map ──────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-sky-100 text-sky-700',
  A2: 'bg-blue-100 text-blue-700',
  B1: 'bg-indigo-100 text-indigo-700',
  B2: 'bg-violet-100 text-violet-700',
  C1: 'bg-purple-100 text-purple-700',
  C2: 'bg-fuchsia-100 text-fuchsia-700',
};

// ─── Content chip ─────────────────────────────────────────────────────────────

function ContentChip({
  icon: Icon,
  count,
  published,
  label,
}: {
  icon: React.ElementType;
  count: number;
  published?: number;
  label: string;
}) {
  if (!count) return null;
  const shown = published != null ? published : count;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
      title={`${label}: ${shown}/${count}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {shown}/{count}
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
  const cc = unit.content_count;
  const levelCls = unit.level
    ? (LEVEL_COLORS[unit.level] ?? 'bg-slate-100 text-slate-600')
    : null;

  return (
    <li>
      <button
        disabled={locked}
        onClick={onClick}
        className={[
          'group w-full px-5 py-3.5 text-left transition-all duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
          'disabled:cursor-not-allowed disabled:opacity-40',
          isCurrent
            ? 'bg-primary-50 border-l-[3px] border-primary-500'
            : 'hover:bg-slate-50 border-l-[3px] border-transparent',
        ].join(' ')}
        aria-current={isCurrent ? 'true' : undefined}
        aria-disabled={locked}
      >
        <div className="flex items-center gap-3">
          {/* Order bubble */}
          <span
            className={[
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
              isCurrent
                ? 'bg-primary-600 text-white'
                : isCompleted
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200',
            ].join(' ')}
          >
            {unit.order_index ?? '—'}
          </span>

          {/* Main content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={[
                  'truncate text-sm font-medium',
                  isCurrent
                    ? 'text-primary-700'
                    : locked
                    ? 'text-slate-400'
                    : 'text-slate-800',
                ].join(' ')}
              >
                {unit.title}
              </span>

              {/* Level badge */}
              {levelCls && unit.level && (
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${levelCls}`}
                >
                  {unit.level}
                </span>
              )}

              {/* Current label chip */}
              {isCurrent && (
                <span className="shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
                  Current
                </span>
              )}
            </div>

            {/* Content chips row */}
            {cc && (cc.videos || cc.tasks || cc.tests) ? (
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                <ContentChip
                  icon={Video}
                  count={cc.videos ?? 0}
                  published={cc.published_videos}
                  label="Videos"
                />
                <ContentChip
                  icon={ClipboardList}
                  count={cc.tasks ?? 0}
                  published={cc.published_tasks}
                  label="Tasks"
                />
                <ContentChip
                  icon={FileText}
                  count={cc.tests ?? 0}
                  published={cc.published_tests}
                  label="Tests"
                />
              </div>
            ) : null}
          </div>

          {/* Status icon */}
          <span className="shrink-0 ml-1">
            {locked ? (
              <Lock className="h-4 w-4 text-slate-300" />
            ) : isCurrent ? (
              <PlayCircle className="h-4 w-4 text-primary-500" />
            ) : isCompleted ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <BookOpen className="h-4 w-4 text-slate-300 group-hover:text-slate-400 transition-colors" />
            )}
          </span>
        </div>
      </button>
    </li>
  );
}
