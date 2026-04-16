/**
 * LessonPlayerShared.tsx
 *
 * Shared presentational components extracted from the legacy LessonFlowComponents.
 * These are consumed by LessonWorkspace (skeleton/error states, editor frame).
 *
 * The LessonFlow orchestrator and its internal sub-players (SlidesPlayer,
 * VideoPlayer, TaskPlayer, TestPlayer, PlayerNavFooter) have been removed —
 * all lesson rendering now goes through VerticalLessonPlayer.
 */

import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Presentation,
  FileText,
  ClipboardList,
  Circle,
  PlayCircle,
} from 'lucide-react';

import type {
  LessonFlowItem,
  LessonFlowItemStatus,
} from './lessonFlow.types';

// ─── Accent maps (kept for PlayerFrame/Header consumers) ─────────────────────

export const ICON_BG: Record<string, string> = {
  slides: 'bg-teal-50 text-teal-600',
  task:   'bg-amber-50 text-amber-600',
  test:   'bg-emerald-50 text-emerald-700',
  video:  'bg-sky-50 text-sky-600',
  info:   'bg-indigo-50 text-indigo-600',
};

const RAIL_ACTIVE_BAR: Record<string, string> = {
  slides: 'bg-teal-500',
  task:   'bg-amber-500',
  test:   'bg-emerald-600',
  video:  'bg-sky-500',
  info:   'bg-indigo-500',
};

const RAIL_ACTIVE_TEXT: Record<string, string> = {
  slides: 'text-teal-700',
  task:   'text-amber-700',
  test:   'text-emerald-700',
  video:  'text-sky-700',
  info:   'text-indigo-700',
};

// ─── ItemIcon ─────────────────────────────────────────────────────────────────

function ItemIcon({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  switch (type) {
    case 'slides': return <Presentation className={cls} />;
    case 'task':   return <FileText      className={cls} />;
    case 'test':   return <ClipboardList className={cls} />;
    case 'video':  return <PlayCircle    className={cls} />;
    default:       return <Circle        className={cls} />;
  }
}

// ─── PlayerFrame ──────────────────────────────────────────────────────────────

interface PlayerFrameProps {
  type:     string;
  children: React.ReactNode;
  status:   LessonFlowItemStatus;
  footer?:  React.ReactNode;
}

export function PlayerFrame({ children, footer }: PlayerFrameProps) {
  return (
    <div
      className="lp-player-frame lp-player-enter"
      style={{
        border: '1px solid #E8EAED',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      {children}

      {footer && (
        <div className="lp-player-footer px-6 py-2 sm:px-8">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── PlayerHeader ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  slides: 'Lesson Slides',
  task:   'Task',
  test:   'Test',
  video:  'Video',
  info:   'Reading',
};

interface PlayerHeaderProps {
  type:          string;
  label?:        string;
  subtitle?:     string;
  status:        LessonFlowItemStatus;
  stepNum:       number;
  total:         number;
  rightContent?: React.ReactNode;
}

export function PlayerHeader({
  type,
  label,
  subtitle,
  rightContent,
}: PlayerHeaderProps) {
  return (
    <div className="lp-player-header flex items-start gap-3 px-4 pt-3 pb-3 sm:px-6 border-b border-slate-100/80">
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[16px] font-bold text-slate-800 leading-tight">
            {label ?? TYPE_LABELS[type] ?? type}
          </span>
        </div>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-slate-400 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {rightContent && (
        <div className="shrink-0 pt-0.5">{rightContent}</div>
      )}
    </div>
  );
}

// ─── LessonProgressRail ───────────────────────────────────────────────────────
// Rendered in ClassroomHeader — kept as-is.

export interface LessonProgressRailProps {
  items:       LessonFlowItem[];
  activeIndex: number;
  onNavigate:  (index: number) => void;
  compact?:    boolean;
}

function buildRailLabel(item: LessonFlowItem, typeIdx: number, unique: boolean): string {
  switch (item.type) {
    case 'slides': return 'Slides';
    case 'video':  return unique ? 'Video'   : `Video ${typeIdx}`;
    case 'task':   return unique ? 'Task'    : `Task ${typeIdx}`;
    case 'test':   return unique ? 'Test'    : `Test ${typeIdx}`;
    default:       return 'Step';
  }
}

export function LessonProgressRail({
  items,
  activeIndex,
  onNavigate,
  compact = false,
}: LessonProgressRailProps) {
  const completable = items.filter((i) => i.type !== 'divider');

  const typeCounters: Record<string, number> = {};
  const typeTotals:   Record<string, number> = {};
  completable.forEach((i) => {
    typeTotals[i.type] = (typeTotals[i.type] ?? 0) + 1;
  });

  const labelledItems = completable.map((item) => {
    typeCounters[item.type] = (typeCounters[item.type] ?? 0) + 1;
    const typeIdx = typeCounters[item.type];
    const unique  = typeTotals[item.type] === 1;
    return { item, label: buildRailLabel(item, typeIdx, unique) };
  });

  return (
    <div className={compact ? 'mb-0' : 'mb-3'}>
      <div
        className={[
          'flex items-stretch gap-0 overflow-x-auto no-scrollbar',
          'bg-white border border-slate-100 rounded-2xl shadow-sm',
        ].join(' ')}
        role="tablist"
        aria-label="Lesson steps"
      >
        {labelledItems.map(({ item, label }, idx) => {
          const status    = (item as any).status as LessonFlowItemStatus;
          const isActive  = idx === activeIndex;
          const isDone    = status === 'completed';
          const isLocked  = status === 'locked';

          const activeBar  = RAIL_ACTIVE_BAR[item.type]  ?? 'bg-slate-700';
          const activeText = RAIL_ACTIVE_TEXT[item.type] ?? 'text-slate-700';

          const textCls = isActive
            ? `${activeText} font-semibold`
            : isDone
            ? 'text-slate-500 font-medium'
            : isLocked
            ? 'text-slate-300 font-medium'
            : 'text-slate-400 font-medium';

          const iconCls = isActive
            ? activeText
            : isDone
            ? 'text-emerald-500'
            : 'text-slate-300';

          return (
            <React.Fragment key={item.id}>
              {idx > 0 && (
                <div className="self-center w-px h-6 bg-slate-100 shrink-0" aria-hidden />
              )}

              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'step' : undefined}
                disabled={isLocked}
                onClick={() => !isLocked && onNavigate(idx)}
                className={[
                  'relative flex flex-col items-center justify-center gap-1',
                  compact ? 'px-4 py-2.5 min-w-[72px]' : 'px-5 py-3 min-w-[80px]',
                  'flex-1 shrink-0',
                  'transition-colors duration-150 focus:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300',
                  isLocked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50/80',
                  idx === 0 ? 'rounded-l-2xl' : '',
                  idx === labelledItems.length - 1 ? 'rounded-r-2xl' : '',
                ].join(' ')}
              >
                <span className={`transition-colors duration-200 ${iconCls}`}>
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <ItemIcon type={item.type} size="sm" />
                  )}
                </span>

                <span className={`text-[11px] leading-none whitespace-nowrap transition-colors duration-200 ${textCls}`}>
                  {label}
                </span>

                {isActive && (
                  <span
                    className={`absolute bottom-0 inset-x-3 h-[3px] rounded-full ${activeBar}`}
                    aria-hidden
                  />
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── LessonRailState ─────────────────────────────────────────────────────────

export interface LessonRailState {
  items:       LessonFlowItem[];
  activeIndex: number;
  onNavigate:  (index: number) => void;
}

// ─── LessonFlowSkeleton ───────────────────────────────────────────────────────

export function LessonFlowSkeleton() {
  return (
    <div className="lp-player-frame lp-skeleton-frame animate-pulse flex flex-col">
      <div className="lp-player-header flex items-center gap-4 px-6 pt-5 pb-4 sm:px-8 border-b border-slate-100">
        <div className="h-11 w-11 rounded-xl lp-shimmer" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-48 rounded lp-shimmer" />
          <div className="h-3 w-32 rounded lp-shimmer" />
        </div>
      </div>
      <div className="lp-player-body p-6 space-y-4">
        <div className="h-2.5 w-full rounded-full lp-shimmer" />
        <div className="h-48 rounded-xl lp-shimmer--neutral" />
        <div className="h-2 w-3/4 rounded lp-shimmer" />
        <div className="h-2 w-1/2 rounded lp-shimmer" />
      </div>
    </div>
  );
}

// ─── LessonFlowEmpty ──────────────────────────────────────────────────────────

export function LessonFlowEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center lp-fade-in">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100">
        <BookOpen className="h-7 w-7 text-slate-300" />
      </div>
      <div className="space-y-1.5">
        <p className="text-[15px] font-semibold text-slate-600">{title}</p>
        {description && (
          <p className="text-[13px] leading-relaxed text-slate-400">{description}</p>
        )}
      </div>
    </div>
  );
}

// ─── LessonFlowError ──────────────────────────────────────────────────────────

export function LessonFlowError({ message, onBack }: { message: string; onBack?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 overflow-hidden lp-step-enter">
      <div className="h-[3px] w-full bg-gradient-to-r from-red-400 to-red-300" />
      <div className="px-5 py-5 sm:px-8">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div className="flex-1 space-y-0.5">
            <p className="text-[14px] font-semibold text-red-800">Something went wrong</p>
            <p className="text-[13px] text-red-600">{message}</p>
          </div>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors focus:outline-none focus-visible:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Go back
          </button>
        )}
      </div>
    </div>
  );
}