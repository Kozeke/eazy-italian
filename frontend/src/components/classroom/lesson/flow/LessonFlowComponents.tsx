/**
 * LessonFlowComponents.tsx  (v11 — viewport-fitted stable player frame)
 *
 * Changes from v10:
 * ─────────────────
 * • PlayerFrame now uses the `.lp-player-frame` CSS class (from
 *   lesson-workspace.css) instead of `min-h-[420px]`.
 *   The frame is `flex flex-col` with `flex-1 min-h-0` so it fills whatever
 *   height the parent canvas gives it — identical for every step type.
 *
 * • The inner player content area is split into three explicit zones:
 *     - .lp-player-header  (shrinks to content, never scrolls)
 *     - .lp-player-body    (flex-1 min-h-0 overflow-y-auto — only scroller)
 *     - .lp-player-footer  (shrinks, always visible at bottom)
 *
 * • SlidesPlayer, VideoPlayer, TaskPlayer, TestPlayer all render their
 *   scrollable content inside `.lp-player-body` so overflow is internal.
 *
 * • The `footer` prop of PlayerFrame is placed in `.lp-player-footer`,
 *   which is always pinned at the bottom of the frame.
 *
 * • LessonFlow renders a stable wrapper (`flex flex-col flex-1 min-h-0`)
 *   so the single active player card inherits the full canvas height.
 *
 * • All other exports, props, logic and visual language are unchanged from v10.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Presentation, FileText, ClipboardList,
  CheckCircle2, Circle, Loader2,
  AlertCircle, BookOpen, ArrowLeft,
  ChevronRight, ChevronLeft, Lock, PlayCircle,
} from 'lucide-react';

import type {
  LessonFlow          as LessonFlowModel,
  LessonFlowItem,
  LessonFlowItemStatus,
  LessonFlowSlidesItem,
  LessonFlowTaskItem,
  LessonFlowTestItem,
  LessonFlowVideoItem,
  VideoProgress,
} from './lessonFlow.types';

import SlidesSection        from '../SlidesSection';
import type { SlideProgress } from '../SlidesSection';
import TaskStep             from '../TaskStep';
import type { StudentTask as TaskStepStudentTask } from '../TaskStep';
import TestStep             from '../TestStep';
import type { StudentTest as TestStepStudentTest } from '../TestStep';
import VideoStep            from '../VideoStep';
import LessonCompletionBanner from '../LessonCompletionBanner';

// ─── Accent maps ──────────────────────────────────────────────────────────────

const ACCENT_BORDER: Record<string, string> = {
  slides: 'border-teal-200',
  task:   'border-amber-200',
  test:   'border-emerald-300',
  video:  'border-sky-200',
  info:   'border-indigo-200',
};

const ACCENT_RING: Record<string, string> = {
  slides: 'ring-teal-100',
  task:   'ring-amber-100',
  test:   'ring-emerald-100',
  video:  'ring-sky-100',
  info:   'ring-indigo-100',
};

const ICON_BG: Record<string, string> = {
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

const TASK_TYPE_SUBTITLE: Record<string, string> = {
  writing:  'Writing',
  reading:  'Reading',
  practice: 'Practice',
  essay:    'Essay',
  manual:   'Written task',
  auto_mcq: 'Multiple choice',
  gap_fill: 'Fill in the blanks',
};

// ─── Compact rail labels ──────────────────────────────────────────────────────

function buildRailLabel(
  item:    LessonFlowItem,
  typeIdx: number,
  unique:  boolean,
): string {
  switch (item.type) {
    case 'slides': return 'Slides';
    case 'video':  return unique ? 'Video'   : `Video ${typeIdx}`;
    case 'task':   return unique ? 'Task'    : `Task ${typeIdx}`;
    case 'test':   return unique ? 'Test'    : `Test ${typeIdx}`;
    default:       return 'Step';
  }
}

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

// ─── LessonProgressRail ───────────────────────────────────────────────────────
// Named export — rendered in ClassroomHeader.

export interface LessonProgressRailProps {
  items:       LessonFlowItem[];
  activeIndex: number;
  onNavigate:  (index: number) => void;
  compact?:    boolean;
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

  const completedCount = completable.filter((i) => (i as any).status === 'completed').length;
  const progressPct    = completable.length > 0
    ? Math.round((completedCount / completable.length) * 100)
    : 0;

  return (
    <div className={compact ? '' : 'mb-3'}>
      <div
        className={[
          'flex items-stretch gap-0 overflow-x-auto no-scrollbar',
          'bg-white border border-slate-100 rounded-2xl shadow-sm',
        ].join(' ')}
        role="tablist"
        aria-label="Lesson steps"
      >
        {labelledItems.map(({ item, label }, idx) => {
          const status   = (item as any).status as LessonFlowItemStatus;
          const isActive = idx === activeIndex;
          const isDone   = status === 'completed';
          const isLocked = status === 'locked';

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
                  isLocked
                    ? 'cursor-not-allowed'
                    : isDone || isActive
                    ? 'cursor-pointer'
                    : 'cursor-pointer hover:bg-slate-50/80',
                  idx === 0 ? 'rounded-l-2xl' : '',
                  idx === labelledItems.length - 1 ? 'rounded-r-2xl' : '',
                ].join(' ')}
              >
                <span className={`transition-colors duration-200 ${iconCls}`}>
                  {isDone
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : isLocked
                    ? <Lock className="h-3.5 w-3.5" />
                    : <ItemIcon type={item.type} size="sm" />
                  }
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

      {/* Thin overall progress bar below the rail */}
      <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden" aria-hidden>
        <div
          className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-300 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}

// ─── PlayerFrame ──────────────────────────────────────────────────────────────
//
// v11: Uses .lp-player-frame CSS class for stable viewport-height behaviour.
// The frame is a flex column; children declare themselves as header/body/footer.
//
// The `footer` prop renders in .lp-player-footer — always pinned at the bottom,
// never pushed off-screen by tall content.

interface PlayerFrameProps {
  type:     string;
  children: React.ReactNode;
  status:   LessonFlowItemStatus;
  footer?:  React.ReactNode;
}

function PlayerFrame({ type, children, footer }: PlayerFrameProps) {
  const borderCls = ACCENT_BORDER[type] ?? 'border-slate-200';
  const ringCls   = ACCENT_RING[type]   ?? 'ring-slate-100';

  return (
    <div
      className={[
        'lp-player-frame lp-player-enter',
        borderCls,
        `ring-1 ${ringCls}`,
      ].join(' ')}
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

interface PlayerHeaderProps {
  type:      string;
  label?:    string;
  subtitle?: string;
  status:    LessonFlowItemStatus;
  stepNum:   number;
  total:     number;
}

const TYPE_LABELS: Record<string, string> = {
  slides: 'Lesson Slides',
  task:   'Task',
  test:   'Test',
  video:  'Video',
  info:   'Reading',
};

function PlayerHeader({ type, label, subtitle, status, stepNum, total }: PlayerHeaderProps) {
  const iconBg = ICON_BG[type] ?? 'bg-slate-100 text-slate-500';

  return (
    <div className="lp-player-header flex items-start gap-3 px-4 pt-3 pb-3 sm:px-6 border-b border-slate-100/80">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <ItemIcon type={type} size="lg" />
      </span>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[16px] font-bold text-slate-800 leading-tight">
            {label ?? TYPE_LABELS[type] ?? type}
          </span>
          {status === 'completed' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 ring-1 ring-teal-100 shrink-0">
              <CheckCircle2 className="h-3 w-3" />
              Complete
            </span>
          )}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-slate-400 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-300 bg-slate-50 rounded-full px-2.5 py-1 border border-slate-100 mt-0.5">
        {stepNum}&thinsp;/&thinsp;{total}
      </span>
    </div>
  );
}

// ─── PlayerNavFooter ──────────────────────────────────────────────────────────

interface PlayerNavFooterProps {
  activeIndex: number;
  total:       number;
  onPrev:      () => void;
  onNext:      () => void;
  nextLocked:  boolean;
}

function PlayerNavFooter({ activeIndex, total, onPrev, onNext, nextLocked }: PlayerNavFooterProps) {
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < total - 1;

  if (!hasPrev && !hasNext) return null;

  return (
    <div className="flex items-center justify-between">
      {hasPrev ? (
        <button
          type="button"
          onClick={onPrev}
          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12px] font-medium text-slate-500 hover:text-slate-700 hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
      ) : (
        <div />
      )}

      {hasNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextLocked}
          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12px] font-medium text-slate-500 hover:text-slate-700 hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Skip
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── SlidesPlayer ─────────────────────────────────────────────────────────────

interface SlidesPlayerProps {
  item:        LessonFlowSlidesItem;
  stepNum:     number;
  total:       number;
  onComplete:  () => void;
  onProgress?: (id: string, p: SlideProgress) => void;
  navFooter?:  React.ReactNode;
}

function SlidesPlayer({ item, stepNum, total, onComplete, onProgress, navFooter }: SlidesPlayerProps) {
  const handleProgress = useCallback((p: SlideProgress) => {
    onProgress?.(item.id, p);
    if (p.completed) onComplete();
  }, [item.id, onProgress, onComplete]);

  const subtitle = item.slides.length > 0
    ? `${item.slides.length} slide${item.slides.length !== 1 ? 's' : ''} · read through at your own pace`
    : undefined;

  return (
    <PlayerFrame type="slides" status={item.status} footer={navFooter}>
      <PlayerHeader
        type="slides"
        label={item.label ?? 'Lesson Slides'}
        subtitle={subtitle}
        status={item.status}
        stepNum={stepNum}
        total={total}
      />
      {/*
        The player body fills the remaining frame height.
        SlideStep itself uses flex-col with an internal scrollable zone,
        so we do NOT add overflow-y-auto here — SlideStep owns its scroll.
      */}
      <div className="lp-player-body flex flex-col">
        <div className="px-5 py-2 sm:px-7 flex flex-col flex-1 min-h-0">
          <SlidesSection
            slides={item.slides}
            onProgressChange={handleProgress}
            locked={item.locked}
            forcedSlide={item.forcedSlide}
            hideContinueCta={true}
          />
        </div>
      </div>
    </PlayerFrame>
  );
}

// ─── VideoPlayer ──────────────────────────────────────────────────────────────

interface VideoPlayerProps {
  item:        LessonFlowVideoItem;
  stepNum:     number;
  total:       number;
  onComplete:  () => void;
  onProgress?: (id: string, p: VideoProgress) => void;
  navFooter?:  React.ReactNode;
}

function VideoPlayer({ item, stepNum, total, onComplete, onProgress, navFooter }: VideoPlayerProps) {
  const handleProgress = useCallback((p: VideoProgress) => {
    onProgress?.(item.id, p);
    if (p.completed) onComplete();
  }, [item.id, onProgress, onComplete]);

  const subtitle = (() => {
    if (!item.video) return 'Video · coming soon';
    const parts: string[] = [];
    if (item.video.duration_seconds) {
      parts.push(`${Math.ceil(item.video.duration_seconds / 60)} min`);
    }
    parts.push('watch to continue');
    return parts.join(' · ');
  })();

  return (
    <PlayerFrame type="video" status={item.status} footer={navFooter}>
      <PlayerHeader
        type="video"
        label={item.label ?? item.video?.title ?? 'Video'}
        subtitle={subtitle}
        status={item.status}
        stepNum={stepNum}
        total={total}
      />
      <div className="lp-player-body">
        <div className="px-5 py-4 sm:px-7">
          {item.video ? (
            <VideoStep
              video={item.video}
              onProgressChange={handleProgress}
              locked={item.locked}
            />
          ) : (
            <div className="flex items-center justify-center h-40 rounded-xl bg-slate-50 text-slate-300 text-sm">
              Video not available
            </div>
          )}
        </div>
      </div>
    </PlayerFrame>
  );
}

// ─── TaskPlayer ───────────────────────────────────────────────────────────────

interface TaskPlayerProps {
  item:          LessonFlowTaskItem;
  stepNum:       number;
  total:         number;
  onComplete:    () => void;
  onSubmitTask:  (p: { task_id: number; answers: Record<string, unknown> }) => Promise<unknown>;
  onLoadTask?:   (taskId: number) => Promise<any>;
  onOpenTask?:   (task: any) => void;
  loading?:      boolean;
  navFooter?:    React.ReactNode;
}

function TaskPlayer({
  item, stepNum, total, onComplete, onSubmitTask, onLoadTask, onOpenTask, loading, navFooter,
}: TaskPlayerProps) {
  const subtitle = (() => {
    const t = item.task as any;
    if (!t) return undefined;
    const type = t.task_type ?? t.type;
    return TASK_TYPE_SUBTITLE[type] ?? undefined;
  })();

  const handleSubmit = useCallback(
    async (payload: { task_id: number; answers: Record<string, unknown> }) => {
      await onSubmitTask(payload);
      onComplete();
    },
    [onSubmitTask, onComplete],
  );

  return (
    <PlayerFrame type="task" status={item.status} footer={navFooter}>
      <PlayerHeader
        type="task"
        label={item.task?.title ?? item.label ?? 'Task'}
        subtitle={subtitle}
        status={item.status}
        stepNum={stepNum}
        total={total}
      />
      <div className="lp-player-body">
        <div className="px-6 py-5 sm:px-8">
          <TaskStep
            task={item.task as TaskStepStudentTask}
            submission={item.submission as any}
            onSubmitTask={handleSubmit}
            onLoadTask={onLoadTask}
            onOpenFull={onOpenTask}
            loading={loading}
          />
        </div>
      </div>
    </PlayerFrame>
  );
}

// ─── TestPlayer ───────────────────────────────────────────────────────────────

interface TestPlayerProps {
  item:          LessonFlowTestItem;
  stepNum:       number;
  total:         number;
  onComplete:    () => void;
  onStartTest:   (testId: number) => Promise<any>;
  onSubmitTest:  (p: { test_id: number; answers: Record<string, string> }) => Promise<unknown>;
  onOpenTest?:   (test: any) => void;
  loading?:      boolean;
  navFooter?:    React.ReactNode;
}

function TestPlayer({
  item, stepNum, total, onComplete, onStartTest, onSubmitTest, onOpenTest, loading, navFooter,
}: TestPlayerProps) {
  const handleSubmit = useCallback(
    async (payload: { test_id: number; answers: Record<string, string> }) => {
      await onSubmitTest(payload);
      onComplete();
    },
    [onSubmitTest, onComplete],
  );

  return (
    <PlayerFrame type="test" status={item.status} footer={navFooter}>
      <PlayerHeader
        type="test"
        label={item.test?.title ?? item.label ?? 'Test'}
        subtitle={item.attempt ? 'Already attempted' : 'Complete all questions to submit'}
        status={item.status}
        stepNum={stepNum}
        total={total}
      />
      <div className="lp-player-body">
        <div className="px-6 py-5 sm:px-8">
          <TestStep
            test={item.test as TestStepStudentTest}
            attempt={item.attempt as any}
            onStartTest={onStartTest}
            onSubmitTest={handleSubmit}
            onOpenFull={onOpenTest}
            loading={loading}
          />
        </div>
      </div>
    </PlayerFrame>
  );
}

// ─── LessonFlowSkeleton ───────────────────────────────────────────────────────

export function LessonFlowSkeleton() {
  return (
    <div className="lp-player-frame lp-skeleton-frame animate-pulse flex flex-col">
      {/* Skeleton header zone */}
      <div className="lp-player-header flex items-center gap-4 px-6 pt-5 pb-4 sm:px-8 border-b border-slate-100">
        <div className="h-11 w-11 rounded-xl lp-shimmer" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-48 rounded lp-shimmer" />
          <div className="h-3 w-32 rounded lp-shimmer" />
        </div>
      </div>
      {/* Skeleton body zone */}
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

// ─── LessonRailState ─────────────────────────────────────────────────────────

export interface LessonRailState {
  items:       LessonFlowItem[];
  activeIndex: number;
  onNavigate:  (index: number) => void;
}

// ─── LessonFlow (main orchestrator) ──────────────────────────────────────────

export interface LessonFlowProps {
  flow:         LessonFlowModel;

  onSubmitTask: (payload: { task_id: number; answers: Record<string, unknown> }) => Promise<unknown>;
  onSubmitTest: (payload: { test_id: number; answers: Record<string, string> }) => Promise<unknown>;

  onStartTest:  (testId: number) => Promise<any>;
  onLoadTask?:  (taskId: number) => Promise<any>;

  onOpenTask?:  (task: any) => void;
  onOpenTest?:  (test: any) => void;

  onItemCompleted?:     (id: string, type: string) => void;
  loading?:             boolean;
  onFinish?:            () => void;
  finishLabel?:         string;

  onActiveIndexChange?: (state: LessonRailState) => void;
}

export function LessonFlow({
  flow,
  onSubmitTask,
  onSubmitTest,
  onStartTest,
  onLoadTask,
  onOpenTask,
  onOpenTest,
  onItemCompleted,
  loading,
  onFinish,
  finishLabel,
  onActiveIndexChange,
}: LessonFlowProps) {
  const items = flow.items.filter((i) => i.type !== 'divider');
  const total = items.length;
  const railSignature = useMemo(
    () => items.map((item) => `${item.id}:${item.type}:${(item as any).status ?? ''}`).join('|'),
    [items],
  );

  const firstIncomplete = items.findIndex(
    (i) => (i as any).status !== 'completed',
  );
  const [activeIndex, setActiveIndex] = useState<number>(
    firstIncomplete === -1 ? Math.max(0, total - 1) : firstIncomplete,
  );

  const allDone = flow.completedSteps > 0 && flow.completedSteps >= flow.totalSteps;

  // ── Navigation ────────────────────────────────────────────────────────────
  const goTo   = useCallback((idx: number) => setActiveIndex(Math.max(0, Math.min(idx, total - 1))), [total]);
  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  // ── Lift rail state to parent ─────────────────────────────────────────────
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const stableNavigate = useCallback((idx: number) => goToRef.current(idx), []);

  useEffect(() => {
    if (!onActiveIndexChange) return;
    onActiveIndexChange({ items, activeIndex, onNavigate: stableNavigate });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, railSignature, stableNavigate]);

  // ── Item completion ────────────────────────────────────────────────────────
  const handleComplete = useCallback((item: LessonFlowItem) => {
    onItemCompleted?.(item.id, item.type);
    if (activeIndex < total - 1) goNext();
  }, [activeIndex, total, goNext, onItemCompleted]);

  // ── Progress callbacks ────────────────────────────────────────────────────
  const handleSlidesProgress = useCallback(
    (id: string, p: SlideProgress) => {
      if (p.completed) onItemCompleted?.(id, 'slides');
    },
    [onItemCompleted],
  );

  const handleVideoProgress = useCallback(
    (id: string, p: VideoProgress) => {
      if (p.completed) onItemCompleted?.(id, 'video');
    },
    [onItemCompleted],
  );

  // ── Test score ─────────────────────────────────────────────────────────────
  const testScore = (() => {
    const testItem = flow.items.find((i) => i.type === 'test') as LessonFlowTestItem | undefined;
    const attempt  = testItem?.attempt as any;
    return attempt?.score ?? null;
  })();

  if (total === 0) {
    return (
      <LessonFlowEmpty
        title="No lesson content available yet"
        description="Your teacher hasn't added content to this unit."
      />
    );
  }

  if (allDone) {
    return (
      <LessonCompletionBanner
        flow={flow}
        testScore={testScore}
        onReview={() => goTo(0)}
        onFinish={onFinish}
        finishLabel={finishLabel}
      />
    );
  }

  const currentItem = items[activeIndex];
  if (!currentItem) return null;

  const nextItem   = items[activeIndex + 1];
  const nextLocked = nextItem ? (nextItem as any).status === 'locked' : false;

  const navFooter = (
    <PlayerNavFooter
      activeIndex={activeIndex}
      total={total}
      onPrev={goPrev}
      onNext={goNext}
      nextLocked={nextLocked}
    />
  );

  // ── Render single active player
  // flex-1 min-h-0 so the player frame inherits the full canvas height
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div key={currentItem.id} className="flex flex-col flex-1 min-h-0 lp-step-enter">
        {currentItem.type === 'slides' && (
          <SlidesPlayer
            item={currentItem as LessonFlowSlidesItem}
            stepNum={activeIndex + 1}
            total={total}
            onComplete={() => handleComplete(currentItem)}
            onProgress={handleSlidesProgress}
            navFooter={navFooter}
          />
        )}

        {currentItem.type === 'video' && (
          <VideoPlayer
            item={currentItem as LessonFlowVideoItem}
            stepNum={activeIndex + 1}
            total={total}
            onComplete={() => handleComplete(currentItem)}
            onProgress={handleVideoProgress}
            navFooter={navFooter}
          />
        )}

        {currentItem.type === 'task' && (
          <TaskPlayer
            item={currentItem as LessonFlowTaskItem}
            stepNum={activeIndex + 1}
            total={total}
            onComplete={() => handleComplete(currentItem)}
            onSubmitTask={onSubmitTask}
            onLoadTask={onLoadTask}
            onOpenTask={onOpenTask}
            loading={loading}
            navFooter={navFooter}
          />
        )}

        {currentItem.type === 'test' && (
          <TestPlayer
            item={currentItem as LessonFlowTestItem}
            stepNum={activeIndex + 1}
            total={total}
            onComplete={() => handleComplete(currentItem)}
            onStartTest={onStartTest}
            onSubmitTest={onSubmitTest}
            onOpenTest={onOpenTest}
            loading={loading}
            navFooter={navFooter}
          />
        )}
      </div>
    </div>
  );
}

export default LessonFlow;