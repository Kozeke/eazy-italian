/**
 * UnitListItem.tsx  (v5 — reliable hover action cluster)
 *
 * Root-cause fixes from v4/v3:
 * ─────────────────────────────
 * • NEW `showActions?: boolean` prop — controls whether the hover cluster
 *   renders at all. Previously `hasActions` was derived from callback presence,
 *   but callers (UnitSelectorModal) spread an empty object when isTeacher=false,
 *   making the cluster silently invisible forever.
 *   Callers now pass `showActions={isTeacher}` explicitly.
 *
 * • Removed the `hidden group-hover:flex` anti-pattern. Tailwind JIT purges
 *   `group-hover:flex` when it only appears in a ternary — replaced with a
 *   pure opacity + pointer-events approach so the cluster is always in the DOM
 *   (when showActions=true), just invisible until hover.
 *
 * • Status icon uses `group-hover:opacity-0` transition instead of
 *   `group-hover:hidden` — both icon and cluster coexist in layout, no reflow.
 *
 * • `onOpen` and `onShare` props added (were absent from v3 project file).
 *
 * • Dropdown closes on Escape key.
 *
 * • Locked units: `actionsOn` is false regardless of `showActions`.
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  BookOpen,
  FileText,
  FlaskConical,
  CheckCircle2,
  Lock,
  PlayCircle,
  Presentation,
  AlignJustify,
  Share2,
  MoreHorizontal,
  EyeOff,
  Copy,
  Pen,
  Trash2,
  Sparkles,
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
  /**
   * Set true (e.g. when isTeacher) to enable the hover action cluster.
   * Defaults to false so existing call sites without this prop are unaffected.
   */
  showActions?: boolean;
  // Action callbacks — all optional
  onOpen?:     (unit: any) => void;
  onShare?:    (unit: any) => void;
  onGenerate?: (unit: any) => void;
  onHide?:     (unit: any) => void;
  onCopy?:     (unit: any) => void;
  onEdit?:     (unit: any) => void;
  onDelete?:   (unit: any) => void;
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

// ─── Unit action dropdown ─────────────────────────────────────────────────────

function UnitActionDropdown({
  unit,
  onClose,
  onGenerate,
  onHide,
  onCopy,
  onEdit,
  onDelete,
}: {
  unit: any;
  onClose: () => void;
  onGenerate?: (u: any) => void;
  onHide?:     (u: any) => void;
  onCopy?:     (u: any) => void;
  onEdit?:     (u: any) => void;
  onDelete?:   (u: any) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const menuItem = (
    icon: React.ReactNode,
    label: string,
    cb: () => void,
    destructive = false,
  ) => (
    <button
      onClick={(e) => { e.stopPropagation(); cb(); onClose(); }}
      className={[
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
        destructive
          ? 'text-red-500 hover:bg-red-50'
          : 'text-slate-700 hover:bg-slate-50',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl bg-white shadow-lg ring-1 ring-slate-200 py-1 overflow-hidden"
    >
      {onGenerate && menuItem(<Sparkles className="h-4 w-4 shrink-0" />, 'Сгенерировать AI', () => onGenerate(unit))}
      {menuItem(<EyeOff className="h-4 w-4 shrink-0" />, 'Скрыть урок',   () => onHide?.(unit))}
      {menuItem(<Copy   className="h-4 w-4 shrink-0" />, 'Копировать',    () => onCopy?.(unit))}
      {menuItem(<Pen    className="h-4 w-4 shrink-0" />, 'Редактировать', () => onEdit?.(unit))}
      <div className="border-t border-slate-100" />
      {menuItem(<Trash2 className="h-4 w-4 shrink-0" />, 'Удалить',       () => onDelete?.(unit), true)}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnitListItem({
  unit,
  isCurrent,
  isCompleted = false,
  isLocked = false,
  onClick,
  showActions = false,
  onOpen,
  onShare,
  onGenerate,
  onHide,
  onCopy,
  onEdit,
  onDelete,
}: UnitListItemProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const locked    = isLocked || unit.is_visible_to_students === false;
  // Cluster is active only when explicitly requested AND the unit isn't locked
  const actionsOn = showActions && !locked;

  const cc       = unit.content_count;
  const levelCls = unit.level ? (LEVEL_COLORS[unit.level] ?? 'bg-slate-100 text-slate-600') : null;

  const hasSlides = (cc?.slides ?? cc?.videos ?? 0) > 0;
  const hasTask   = (cc?.tasks  ?? 0) > 0;
  const hasTest   = (cc?.tests  ?? 0) > 0;

  const medallion = locked
    ? { bg: 'bg-slate-100 text-slate-300', icon: null }
    : isCurrent
    ? { bg: 'bg-teal-600 text-white shadow-md shadow-teal-100', icon: null }
    : isCompleted
    ? { bg: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200', icon: 'check' }
    : { bg: 'bg-slate-100 text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-600', icon: null };

  const iconBtn = 'rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors';

  return (
    <li className="group relative">
      <div
        className={[
          'relative w-full px-4 py-3.5 transition-all duration-150',
          isCurrent
            ? 'bg-teal-50/70 border-l-[3px] border-teal-500'
            : isCompleted && !locked
            ? 'hover:bg-emerald-50/40 border-l-[3px] border-transparent hover:border-emerald-300'
            : 'hover:bg-teal-50/50 border-l-[3px] border-transparent hover:border-teal-200',
          locked ? 'opacity-40' : '',
        ].join(' ')}
      >
        <div className="flex items-center gap-3.5">

          {/* ── Clickable title area ────────────────────────────────────────── */}
          <button
            disabled={locked}
            onClick={onClick}
            role="option"
            aria-selected={isCurrent}
            aria-disabled={locked}
            className="flex flex-1 min-w-0 items-center gap-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400 disabled:cursor-not-allowed"
          >
            {/* Number medallion */}
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

            {/* Main text + chips */}
            <div className="min-w-0 flex-1">
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

            {/*
             * Status icon — always rendered to hold layout width.
             * Fades out on hover when the action cluster is active.
             */}
            <span
              className={[
                'shrink-0 ml-1 transition-opacity duration-150',
                actionsOn ? 'group-hover:opacity-0' : '',
              ].join(' ')}
              aria-hidden
            >
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
          </button>

          {/*
           * ── Hover action cluster ─────────────────────────────────────────────
           *
           * Key design: always in the DOM when actionsOn=true. Uses opacity +
           * pointer-events toggled by group-hover rather than display:none/flex.
           * This is the only pattern guaranteed to work with Tailwind's JIT purge.
           *
           *   Resting:  opacity-0, pointer-events-none  (invisible, not clickable)
           *   Hovered:  opacity-100, pointer-events-auto (visible, clickable)
           */}
          {actionsOn && (
            <div
              className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle — visual affordance only */}
              <button
                className={iconBtn}
                aria-label="Reorder"
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
              >
                <AlignJustify className="h-4 w-4" />
              </button>

              {/* Share */}
              <button
                className={iconBtn}
                aria-label="Share unit"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); onShare?.(unit); }}
              >
                <Share2 className="h-4 w-4" />
              </button>

              {/* Three-dot menu */}
              <div className="relative">
                <button
                  className={iconBtn}
                  aria-label="More options"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); setDropdownOpen((v) => !v); }}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {dropdownOpen && (
                  <UnitActionDropdown
                    unit={unit}
                    onClose={() => setDropdownOpen(false)}
                    onGenerate={onGenerate}
                    onHide={onHide}
                    onCopy={onCopy}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                )}
              </div>

              {/* "Открыть урок" pill */}
              <button
                className="ml-1 rounded-full bg-[#4DD8E0] px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-400 transition-colors whitespace-nowrap"
                onClick={(e) => { e.stopPropagation(); onOpen ? onOpen(unit) : onClick(); }}
              >
                Открыть урок
              </button>
            </div>
          )}

        </div>
      </div>
    </li>
  );
}