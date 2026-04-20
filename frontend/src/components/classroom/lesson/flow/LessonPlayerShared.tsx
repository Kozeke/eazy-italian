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
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, BookOpen } from 'lucide-react';

import type { LessonFlowItem, LessonFlowItemStatus } from './lessonFlow.types';

// ─── Accent maps (kept for PlayerFrame/Header consumers) ─────────────────────

export const ICON_BG: Record<string, string> = {
  slides: 'bg-teal-50 text-teal-600',
  task:   'bg-amber-50 text-amber-600',
  test:   'bg-emerald-50 text-emerald-700',
  video:  'bg-sky-50 text-sky-600',
  info:   'bg-indigo-50 text-indigo-600',
};

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

// ─── LessonProgressRail — UI disabled (header step strip) ────────────────────
// Previous JSX lived here; wiring was ClassroomPage ← LessonWorkspace `onRailStateChange`.
// Re-enable via git history + uncomment blocks in ClassroomPage, LessonWorkspace, ClassroomHeader.

export interface LessonProgressRailProps {
  items:       LessonFlowItem[];
  activeIndex: number;
  onNavigate:  (index: number) => void;
  compact?:    boolean;
}

// Stub keeps imports/types stable; props intentionally unused while rail is off.
export function LessonProgressRail(_props: LessonProgressRailProps): null {
  return null;
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
  // Provides localized labels for lesson flow error banners.
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 overflow-hidden lp-step-enter">
      <div className="h-[3px] w-full bg-gradient-to-r from-red-400 to-red-300" />
      <div className="px-5 py-5 sm:px-8">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div className="flex-1 space-y-0.5">
            <p className="text-[14px] font-semibold text-red-800">{t('classroom.lessonShared.somethingWentWrong')}</p>
            <p className="text-[13px] text-red-600">{message}</p>
          </div>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors focus:outline-none focus-visible:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('classroom.page.goBack')}
          </button>
        )}
      </div>
    </div>
  );
}