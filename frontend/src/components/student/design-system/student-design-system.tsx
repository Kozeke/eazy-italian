/**
 * student-design-system.tsx
 *
 * Comprehensive student-facing design system.
 *
 * Philosophy
 * ──────────
 * Built on the same structural DNA as the teacher/admin panel
 * (spacing scale, radius system, shadow levels, border treatment)
 * but with a distinct student personality:
 *
 *   • Accent: teal-to-cyan (vs teacher's primary-blue)
 *   • Tone: warmer, softer — less corporate, more encouraging
 *   • Progress-first hierarchy: completion states are celebrated
 *   • Calm reading rhythm: generous line-height, restrained density
 *   • PWA feel: sticky patterns, smooth transitions, safe-area aware
 *
 * Layout model (v11 — viewport-fitted lesson workspace)
 * ─────────────────────────────────────────────────────
 * The classroom lesson workspace is now a viewport-fitted, non-scrolling
 * shell.  The layout hierarchy is:
 *
 *   ClassroomLayout       (full viewport, flex col)
 *     ClassroomHeader     (sticky, drives --lp-header-h CSS var)
 *     LessonWorkspace     (.lp-workspace — fills remaining dvh)
 *       .lp-canvas        (centred max-w, flex col, padded)
 *         .lp-player-frame (the card — flex col, fills canvas, never overflows page)
 *           .lp-player-header  (shrinks to content)
 *           .lp-player-body    (flex-1, min-h-0, overflow-y-auto — ONLY scroller)
 *           .lp-player-footer  (shrinks, always visible)
 *
 * Do NOT use LessonContainer inside the classroom workspace — it assumes
 * page-level scrolling and will break the fitted layout.  LessonContainer
 * is for non-classroom reading pages only.
 *
 * Exports (alphabetical)
 * ──────────────────────
 *   Badge              — status / type chip
 *   Card               — base content card
 *   CardSection        — titled section inside a card
 *   EmptyState         — zero-data placeholder
 *   ErrorBanner        — inline error with retry
 *   FeedbackCallout    — teacher feedback block
 *   GoalCallout        — highlighted learning objective block
 *   InfoChip           — small stat chip (icon + label)
 *   InstructionsCallout — sky-blue task/test instructions block
 *   LessonContainer    — reading-width wrapper (non-classroom pages only)
 *   LessonStep         — progress step atom (Slides / Task / Test)
 *   LessonStepStrip    — horizontal step strip
 *   LiveAlertBanner    — live session alert
 *   LevelBadge         — language level chip (A1–C2)
 *   PageContainer      — max-width content wrapper
 *   PageErrorState     — full-page error with back nav
 *   PageHeader         — H1-level page intro with optional action
 *   PageLoadingState   — centered spinner for full-page loading
 *   PlayerBody         — classroom: scrollable content zone inside the player frame
 *   PlayerFooter       — classroom: pinned bottom zone inside the player frame
 *   PlayerHeader       — classroom: pinned header zone inside the player frame
 *   ProgressBar        — horizontal fill bar
 *   ProgressRing       — circular SVG progress indicator
 *   SearchInput        — teal-focused search bar with clear button
 *   SectionDivider     — thin horizontal rule
 *   SectionHeader      — H2-level titled section row
 *   SegmentedControl   — tab / pill switcher
 *   SkeletonBlock      — animated loading placeholder
 *   SkeletonCard       — full-card loading placeholder
 *   SkeletonLesson     — viewport-fitted player skeleton (v11)
 *   SkeletonText       — animated text-line placeholder
 *   Spinner            — loading spinner
 *   StatItem / StatsStrip — stat counter row
 *   StatusBadge        — semantic status (submitted / graded / live / due)
 *   StickyPageHeader   — sticky top bar for sub-pages
 *   StudentButton      — primary / secondary / ghost variants
 *   StudentInput       — single-line text input
 *   StudentTextarea    — multi-line text input
 *   SuccessBanner      — task/test submission confirmation
 *
 * Design tokens are defined via Tailwind utilities (the app already has
 * a configured Tailwind setup). No extra CSS file is needed beyond
 * lesson-workspace.css (which provides the .lp-* classroom layout classes).
 */

import React, { Fragment } from 'react';
import {
  CheckCircle2, Clock, Circle, AlertCircle, Search,
  Loader2, RefreshCw, ChevronRight, Sparkles,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Design Tokens (Tailwind class constants)
// Use these in consuming components for consistency.
// ─────────────────────────────────────────────────────────────────────────────

export const tokens = {
  // Student accent palette  (teal/cyan — distinct from teacher primary-blue)
  accent: {
    50:  'bg-teal-50',
    100: 'bg-teal-100',
    200: 'border-teal-200',
    500: 'bg-teal-500',
    600: 'bg-teal-600',
    700: 'bg-teal-700',
    text50:  'text-teal-50',
    text500: 'text-teal-500',
    text600: 'text-teal-600',
    text700: 'text-teal-700',
    ring:    'ring-teal-400',
    focus:   'focus-visible:ring-teal-400',
  },

  // Semantic colors
  semantic: {
    success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-500' },
    warning: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   icon: 'text-amber-500'  },
    danger:  { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     icon: 'text-red-500'    },
    info:    { bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-700',     icon: 'text-sky-500'    },
    neutral: { bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-600',   icon: 'text-slate-400'  },
  },

  // Radius
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
    full: 'rounded-full',
  },

  // Shadow
  shadow: {
    sm: 'shadow-sm',
    md: 'shadow-md',
    card: 'shadow-sm hover:shadow-md',
  },

  // Typography
  type: {
    pageTitle:   'text-2xl font-bold leading-snug text-slate-900 sm:text-3xl',
    sectionTitle:'text-lg font-semibold text-slate-900',
    cardTitle:   'text-base font-semibold text-slate-900',
    body:        'text-sm leading-relaxed text-slate-600',
    caption:     'text-xs text-slate-500',
    overline:    'text-[11px] font-semibold uppercase tracking-widest text-slate-400',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Layout Primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PageContainer
 * Wraps page content with consistent horizontal padding and max-width.
 * Use inside any student page that isn't classroom mode.
 */
export function PageContainer({
  children,
  className = '',
  narrow = false,
}: {
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return (
    <div
      className={[
        'mx-auto w-full px-4 py-8 md:px-8 lg:px-10',
        narrow ? 'max-w-3xl' : 'max-w-7xl',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

/**
 * LessonContainer
 * Narrower, reading-optimised wrapper for lesson content.
 *
 * ⚠️  NOT for use inside ClassroomLayout / LessonWorkspace.
 * The classroom workspace is viewport-fitted (overflow: hidden on .lp-workspace)
 * and any page-scroll assumptions will break the layout.
 *
 * Use LessonContainer only for:
 *   • Static reading pages outside the classroom shell
 *   • Admin review / preview pages where scroll is fine
 *
 * Inside the classroom workspace, content lives in .lp-player-body (the
 * PlayerBody component), which handles internal scrolling.
 */
export function LessonContainer({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        'mx-auto w-full max-w-2xl space-y-8',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  );
}

/**
 * PageHeader (sticky)
 * Used for in-page section headers with optional action slot.
 * Different from ClassroomHeader — this is an H1-level page intro.
 *
 * Usage:
 *   <PageHeader
 *     eyebrow="Student Portal"
 *     title={`Hello, ${firstName} 👋`}
 *     subtitle="Here are your enrolled classes."
 *     action={<StudentButton variant="primary">Refresh</StudentButton>}
 *   />
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className = '',
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={['mb-8 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between', className].join(' ')}>
      <div>
        {eyebrow && (
          <p className="text-sm font-semibold text-teal-600">{eyebrow}</p>
        )}
        <h1 className="mt-0.5 text-2xl font-bold text-slate-900 sm:text-3xl leading-snug">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="mt-4 sm:mt-0 shrink-0">{action}</div>
      )}
    </div>
  );
}

/**
 * StickyPageHeader
 * A sticky top bar for sub-pages (e.g. a task page inside a student flow).
 * Mirrors ClassroomHeader's z-30 / backdrop pattern but simpler.
 */
export function StickyPageHeader({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={[
        'sticky top-0 z-30 border-b border-slate-200',
        'bg-white/95 backdrop-blur-sm shadow-sm',
        className,
      ].join(' ')}
    >
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 md:px-6 lg:px-8">
        {children}
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Card System
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Card
 * Base card shell. White bg, rounded-2xl, subtle border + shadow.
 * Optionally interactive (hover lift + cursor pointer).
 *
 * Variants:
 *   default   — static content display
 *   interactive — hover lift effect for clickable cards
 *   lesson    — slightly warmer bg (slate-50) for lesson content sections
 */
export type CardVariant = 'default' | 'interactive' | 'lesson';

export function Card({
  children,
  variant = 'default',
  accent,
  className = '',
  onClick,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  variant?: CardVariant;
  /** Optional left-border accent color class, e.g. 'border-l-teal-400' */
  accent?: string;
  className?: string;
  onClick?: () => void;
  as?: React.ElementType;
}) {
  const base = 'relative rounded-2xl border border-slate-200 bg-white';
  const shadow = variant === 'interactive' ? 'shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5' : 'shadow-sm';
  const cursor = onClick || variant === 'interactive' ? 'cursor-pointer' : '';
  const accentBorder = accent ? `border-l-4 ${accent}` : '';

  return (
    <Tag
      className={[base, shadow, cursor, accentBorder, className].join(' ')}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}

/**
 * CardBody
 * Standard padding inside a Card.
 */
export function CardBody({
  children,
  className = '',
  compact = false,
}: {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={[compact ? 'p-4' : 'px-6 py-5', className].join(' ')}>
      {children}
    </div>
  );
}

/**
 * CardFooter
 * Bordered footer strip at the bottom of a Card (e.g. CTA area).
 */
export function CardFooter({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={['border-t border-slate-100 px-5 py-3.5', className].join(' ')}>
      {children}
    </div>
  );
}

/**
 * CardSection
 * A titled sub-section inside a card, with an optional icon.
 * Separated by a top border from the section above it.
 *
 * Usage:
 *   <CardSection title="Your score" icon={<Star />}>
 *     <p>90/100</p>
 *   </CardSection>
 */
export function CardSection({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={['border-t border-slate-100 px-6 py-4', className].join(' ')}>
      <div className="mb-2 flex items-center gap-2">
        {icon && <span className="text-teal-500">{icon}</span>}
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Section Header
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SectionHeader
 * Used to introduce a content section (Slides / Task / Test, etc.)
 * Icon slot + title + optional badge + optional trailing content.
 *
 * Matches the existing pattern in SlidesSection / TaskSection but
 * extracts it as a reusable primitive.
 */
export function SectionHeader({
  icon,
  iconBg = 'bg-teal-50',
  iconColor = 'text-teal-600',
  title,
  badge,
  trailing,
  className = '',
}: {
  icon: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  title: string;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={['mb-4 flex items-center gap-3', className].join(' ')}>
      <span
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          iconBg, iconColor,
        ].join(' ')}
      >
        {icon}
      </span>

      <div className="flex flex-1 items-baseline gap-2 min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {badge}
      </div>

      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Badge / Chip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Badge
 * Flexible pill badge. Covers most chip use-cases.
 *
 * Usage:
 *   <Badge color="emerald">Complete</Badge>
 *   <Badge color="amber" size="sm">Due today</Badge>
 */
export type BadgeColor =
  | 'teal' | 'emerald' | 'amber' | 'red' | 'sky' | 'indigo' | 'violet'
  | 'slate' | 'primary';

const BADGE_COLOR_MAP: Record<BadgeColor, string> = {
  teal:    'bg-teal-50    text-teal-700    border-teal-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50   text-amber-700   border-amber-200',
  red:     'bg-red-50     text-red-700     border-red-200',
  sky:     'bg-sky-50     text-sky-700     border-sky-200',
  indigo:  'bg-indigo-50  text-indigo-700  border-indigo-200',
  violet:  'bg-violet-50  text-violet-700  border-violet-200',
  slate:   'bg-slate-100  text-slate-600   border-slate-200',
  primary: 'bg-primary-50 text-primary-700 border-primary-200',
};

export function Badge({
  children,
  color = 'teal',
  size = 'md',
  icon,
  dot = false,
  className = '',
}: {
  children: React.ReactNode;
  color?: BadgeColor;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  const colorCls = BADGE_COLOR_MAP[color];
  const sizeCls = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border font-medium',
        colorCls, sizeCls, className,
      ].join(' ')}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70 shrink-0" />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}

/**
 * StatusBadge
 * Semantic status chips used across the student UI.
 * Covers the most common states so consuming components don't need to
 * hand-roll color logic every time.
 */
export type StatusType =
  | 'submitted' | 'graded' | 'pending' | 'live' | 'due' | 'complete'
  | 'locked' | 'new' | 'in_progress' | 'missed';

const STATUS_CONFIG: Record<StatusType, { label: string; color: BadgeColor; dot?: boolean }> = {
  submitted:   { label: 'Submitted',   color: 'emerald', dot: true  },
  graded:      { label: 'Graded',      color: 'teal',    dot: true  },
  pending:     { label: 'Pending',     color: 'amber',   dot: true  },
  live:        { label: 'Live',        color: 'red',     dot: true  },
  due:         { label: 'Due',         color: 'amber',   dot: false },
  complete:    { label: 'Complete',    color: 'emerald', dot: false },
  locked:      { label: 'Locked',      color: 'slate',   dot: false },
  new:         { label: 'New',         color: 'sky',     dot: false },
  in_progress: { label: 'In progress', color: 'teal',    dot: true  },
  missed:      { label: 'Missed',       color: 'red',     dot: false },
};

export function StatusBadge({
  status,
  label: labelOverride,
  size = 'md',
}: {
  status: StatusType;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const { label, color, dot } = STATUS_CONFIG[status];
  return (
    <Badge color={color} size={size} dot={dot}>
      {labelOverride ?? label}
    </Badge>
  );
}

/**
 * InfoChip
 * Small stat chip: icon + text. Used in test/task metadata rows.
 */
export function InfoChip({
  icon,
  label,
  className = '',
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 text-xs text-slate-500',
        className,
      ].join(' ')}
    >
      <span className="text-slate-400">{icon}</span>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Progress
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ProgressBar
 * Horizontal fill bar. Supports size variants and color overrides.
 *
 * Usage:
 *   <ProgressBar value={72} />
 *   <ProgressBar value={100} size="lg" color="emerald" showLabel />
 */
export function ProgressBar({
  value,
  size = 'md',
  color = 'teal',
  showLabel = false,
  labelPosition = 'right',
  className = '',
}: {
  value: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  color?: 'teal' | 'emerald' | 'primary' | 'amber';
  showLabel?: boolean;
  labelPosition?: 'right' | 'above';
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));

  const heights: Record<string, string> = {
    xs: 'h-1',
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  const fillColors: Record<string, string> = {
    teal:    'from-teal-400 to-teal-500',
    emerald: 'from-emerald-400 to-emerald-500',
    primary: 'from-primary-400 to-primary-500',
    amber:   'from-amber-400 to-amber-500',
  };

  const bar = (
    <div className="relative w-full overflow-hidden rounded-full bg-slate-100" style={{ height: size === 'xs' ? '4px' : undefined }}>
      <div className={[heights[size], 'w-full overflow-hidden rounded-full bg-slate-100'].join(' ')}>
        <div
          className={[
            'h-full rounded-full bg-gradient-to-r transition-all duration-700',
            fillColors[color],
          ].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );

  if (!showLabel) return <div className={className}>{bar}</div>;

  if (labelPosition === 'above') {
    return (
      <div className={['space-y-1.5', className].join(' ')}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Progress</span>
          <span className="text-xs font-semibold tabular-nums text-slate-700">{pct}%</span>
        </div>
        {bar}
      </div>
    );
  }

  return (
    <div className={['flex items-center gap-2.5', className].join(' ')}>
      <div className="flex-1">{bar}</div>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-600">{pct}%</span>
    </div>
  );
}

/**
 * ProgressRing
 * Circular SVG progress indicator. Good for card-level progress summary.
 *
 * Usage:
 *   <ProgressRing value={75} size={48} strokeWidth={4} />
 */
export function ProgressRing({
  value,
  size = 48,
  strokeWidth = 4,
  color = 'teal',
  children,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: 'teal' | 'emerald' | 'primary';
  children?: React.ReactNode;
}) {
  const pct = Math.min(100, Math.max(0, value));
  const r   = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  const strokeColors = {
    teal:    '#14b8a6',
    emerald: '#10b981',
    primary: '#6366f1',
  };

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={strokeColors[color]}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Lesson Progress Strip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LessonStep + LessonStepStrip
 * Replaces LessonProgressIndicator with a shared primitive.
 * Same logic, extracted and reusable.
 */
type StepState = 'complete' | 'active' | 'pending' | 'hidden';

function stepState(exists: boolean, complete: boolean, unlocked: boolean): StepState {
  if (!exists) return 'hidden';
  if (complete) return 'complete';
  if (unlocked) return 'active';
  return 'pending';
}

export function LessonStep({
  label,
  state,
  showConnector,
}: {
  label: string;
  state: StepState;
  showConnector: boolean;
}) {
  if (state === 'hidden') return null;

  const iconColor =
    state === 'complete' ? 'text-emerald-500'
    : state === 'active' ? 'text-teal-500'
    : 'text-slate-300';

  const textColor =
    state === 'complete' ? 'text-emerald-700 font-semibold'
    : state === 'active' ? 'text-slate-700 font-medium'
    : 'text-slate-400';

  const connectorColor =
    state === 'complete' ? 'bg-emerald-200' : 'bg-slate-100';

  return (
    <>
      <li className="flex items-center gap-1.5 shrink-0">
        <span className={`transition-colors duration-300 ${iconColor}`}>
          {state === 'complete' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : state === 'active' ? (
            <Clock className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </span>
        <span className={`text-xs transition-colors duration-300 ${textColor}`}>
          {label}
        </span>
      </li>

      {showConnector && (
        <li aria-hidden className={`h-px w-8 shrink-0 mx-0.5 transition-colors duration-500 ${connectorColor}`} />
      )}
    </>
  );
}

export function LessonStepStrip({
  hasSlides = true,
  slidesComplete,
  hasTask = false,
  taskComplete,
  hasTest = false,
  testComplete,
}: {
  hasSlides?: boolean;
  slidesComplete: boolean;
  hasTask?: boolean;
  taskComplete: boolean;
  hasTest?: boolean;
  testComplete: boolean;
}) {
  const sState = stepState(hasSlides, slidesComplete, true);
  const tState = stepState(hasTask, taskComplete, !hasSlides || slidesComplete);
  const xState = stepState(hasTest, testComplete, (!hasSlides || slidesComplete) && (!hasTask || taskComplete));

  const visible = [sState, tState, xState].filter(s => s !== 'hidden');
  if (visible.length === 0) return null;

  const allDone =
    (!hasSlides || slidesComplete) &&
    (!hasTask || taskComplete) &&
    (!hasTest || testComplete);

  return (
    <div
      className={[
        'rounded-xl border px-4 py-3 transition-all duration-500',
        allDone ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-white',
      ].join(' ')}
    >
      {allDone && (
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-emerald-600">
          Lesson complete 🎉
        </p>
      )}
      <ol className="flex items-center flex-wrap gap-y-1">
        <LessonStep label="Slides" state={sState} showConnector={tState !== 'hidden' || xState !== 'hidden'} />
        <LessonStep label="Task"   state={tState} showConnector={xState !== 'hidden'} />
        <LessonStep label="Test"   state={xState} showConnector={false} />
      </ol>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Segmented Control / Tabs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SegmentedControl
 * Pill-style tab switcher. Student-side uses a softer teal active state.
 *
 * Usage:
 *   const [tab, setTab] = useState('slides');
 *   <SegmentedControl
 *     value={tab}
 *     onChange={setTab}
 *     options={[
 *       { value: 'slides', label: 'Slides' },
 *       { value: 'task',   label: 'Task', badge: 1 },
 *       { value: 'test',   label: 'Test' },
 *     ]}
 *   />
 */
export type SegmentOption = {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
  disabled?: boolean;
};

export function SegmentedControl({
  value,
  onChange,
  options,
  size = 'md',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SegmentOption[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  const containerPad = size === 'sm' ? 'p-0.5' : 'p-1';
  const btnPad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm';

  return (
    <div
      className={[
        'inline-flex items-center rounded-full bg-slate-100',
        containerPad, className,
      ].join(' ')}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            className={[
              'flex items-center gap-1.5 rounded-full font-medium transition-all duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
              btnPad,
              active
                ? 'bg-white text-teal-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            {opt.label}
            {opt.badge != null && opt.badge > 0 && (
              <span className={[
                'rounded-full font-bold tabular-nums',
                size === 'sm' ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-0.5 text-[10px]',
                active ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500',
              ].join(' ')}>
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * UnderlineTabs
 * Bottom-border tab bar. Useful inside a card or workspace header.
 */
export function UnderlineTabs({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SegmentOption[];
  className?: string;
}) {
  return (
    <div
      className={['flex gap-0 border-b border-slate-200', className].join(' ')}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            className={[
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400',
              active
                ? 'border-teal-500 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            {opt.label}
            {opt.badge != null && opt.badge > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 tabular-nums">
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Buttons
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StudentButton
 * The primary button primitive for the student side.
 * Uses teal accent (not teacher-blue) to maintain side distinction.
 *
 * Variants:
 *   primary   — solid teal (CTAs, start/submit)
 *   secondary — outlined teal (secondary actions)
 *   ghost     — borderless muted (tertiary / cancel)
 *   danger    — solid red (destructive)
 *   success   — solid emerald (completion / confirm)
 *
 * Sizes: sm | md | lg
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'amber';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:   'bg-teal-600 text-white hover:bg-teal-700 shadow-sm shadow-teal-100 focus-visible:ring-teal-400',
  secondary: 'border border-teal-300 bg-white text-teal-700 hover:bg-teal-50 focus-visible:ring-teal-400',
  ghost:     'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-300',
  danger:    'bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-100 focus-visible:ring-red-400',
  success:   'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-100 focus-visible:ring-emerald-400',
  amber:     'bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-100 focus-visible:ring-amber-400',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-xl gap-2',
  lg: 'px-5 py-2.5 text-base rounded-xl gap-2',
};

export function StudentButton({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  className = '',
  onClick,
  type = 'button',
  ...rest
}: {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  [key: string]: unknown;
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={[
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'cursor-not-allowed opacity-50' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
      {!loading && iconRight && (
        <span className="shrink-0">{iconRight}</span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Form Inputs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StudentInput
 * Text input matching the student palette.
 * Teal focus ring (not primary-blue).
 */
export function StudentInput({
  label,
  hint,
  error,
  icon,
  className = '',
  ...inputProps
}: {
  label?: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={['space-y-1.5', className].join(' ')}>
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </span>
        )}
        <input
          className={[
            'w-full rounded-xl border bg-slate-50 py-2.5 text-sm text-slate-800',
            'placeholder:text-slate-400 transition-all',
            'focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/30',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            error ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-200' : 'border-slate-200',
            icon ? 'pl-9 pr-3.5' : 'px-3.5',
          ].join(' ')}
          {...inputProps}
        />
      </div>
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * StudentTextarea
 * Multi-line textarea for essay / writing tasks.
 */
export function StudentTextarea({
  label,
  hint,
  error,
  className = '',
  ...textareaProps
}: {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={['space-y-1.5', className].join(' ')}>
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </label>
      )}
      <textarea
        className={[
          'w-full resize-y rounded-xl border bg-slate-50 px-4 py-3',
          'text-sm leading-relaxed text-slate-800 placeholder:text-slate-400',
          'transition-all',
          'focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/30',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          error ? 'border-red-300' : 'border-slate-200',
          className,
        ].join(' ')}
        {...textareaProps}
      />
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Classroom Player Zone Primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PlayerHeader
 * The pinned top zone inside a `.lp-player-frame`.
 * Always visible — never pushed off-screen by tall content.
 *
 * Renders the step icon, title, subtitle, status badge, and step counter.
 * The border-b visually separates it from the scrollable body below.
 *
 * Usage (inside a PlayerFrame / lp-player-frame):
 *   <PlayerHeader type="task" label="Write a paragraph" subtitle="Writing" stepNum={2} total={3} />
 */
export function PlayerHeader({
  icon,
  iconBg = 'bg-teal-50',
  iconColor = 'text-teal-600',
  label,
  subtitle,
  isComplete = false,
  stepNum,
  total,
  className = '',
}: {
  icon: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  label: string;
  subtitle?: string;
  isComplete?: boolean;
  stepNum?: number;
  total?: number;
  className?: string;
}) {
  return (
    <div
      className={[
        'lp-player-header flex items-start gap-4 px-6 pt-5 pb-4 sm:px-8',
        'border-b border-slate-100/80 flex-shrink-0',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
          iconBg, iconColor,
        ].join(' ')}
      >
        {icon}
      </span>

      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[16px] font-bold text-slate-800 leading-tight">
            {label}
          </span>
          {isComplete && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 ring-1 ring-teal-100 shrink-0">
              <CheckCircle2 className="h-3 w-3" />
              Complete
            </span>
          )}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-slate-400 leading-relaxed">{subtitle}</p>
        )}
      </div>

      {stepNum != null && total != null && (
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-300 bg-slate-50 rounded-full px-2.5 py-1 border border-slate-100 mt-0.5">
          {stepNum}&thinsp;/&thinsp;{total}
        </span>
      )}
    </div>
  );
}

/**
 * PlayerBody
 * The scrollable content zone inside a `.lp-player-frame`.
 *
 * This is the ONLY element in the classroom workspace that scrolls.
 * All lesson step content (slides, task form, test questions) must live here.
 * Uses `flex-1 min-h-0 overflow-y-auto` to fill available frame height
 * without ever pushing the page taller.
 *
 * Usage:
 *   <PlayerBody>
 *     <TaskStep … />
 *   </PlayerBody>
 */
export function PlayerBody({
  children,
  className = '',
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Whether to apply default horizontal + vertical padding. Default true. */
  padded?: boolean;
}) {
  return (
    <div
      className={[
        'lp-player-body',
        padded ? 'px-6 py-5 sm:px-8' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

/**
 * PlayerFooter
 * The pinned bottom zone inside a `.lp-player-frame`.
 * Always visible at the base of the frame — never pushed down by long content.
 *
 * Use for: nav back/next buttons, submit bar, slide navigation controls.
 *
 * Usage:
 *   <PlayerFooter>
 *     <PlayerNavFooter … />
 *   </PlayerFooter>
 */
export function PlayerFooter({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        'lp-player-footer flex-shrink-0',
        'px-6 py-3 sm:px-8',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Loading States
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spinner — inline loader icon
 */
export function Spinner({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
  return (
    <Loader2 className={['animate-spin text-teal-500', sizes[size], className].join(' ')} />
  );
}

/**
 * SkeletonText — animated text-line placeholder
 */
export function SkeletonText({
  lines = 1,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ['w-full', 'w-5/6', 'w-4/5', 'w-3/4', 'w-2/3'];
  return (
    <div className={['animate-pulse space-y-2', className].join(' ')}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={['h-3.5 rounded bg-slate-100', widths[i % widths.length]].join(' ')}
        />
      ))}
    </div>
  );
}

/**
 * SkeletonBlock — animated rectangular placeholder
 */
export function SkeletonBlock({
  height = 'h-24',
  rounded = 'rounded-2xl',
  className = '',
}: {
  height?: string;
  rounded?: string;
  className?: string;
}) {
  return (
    <div className={['animate-pulse bg-slate-100', height, rounded, className].join(' ')} />
  );
}

/**
 * SkeletonCard — full card placeholder
 * Matches the shape of ClassroomCard.
 */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={[
        'animate-pulse rounded-2xl border border-slate-200 bg-white p-5',
        'shadow-sm border-l-4 border-l-slate-200',
        className,
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-slate-100 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-slate-100" />
          <div className="h-3 w-1/2 rounded bg-slate-100" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-1/3 rounded bg-slate-100" />
        <div className="h-1.5 w-full rounded-full bg-slate-100" />
      </div>
      <div className="mt-5 h-10 w-full rounded-xl bg-slate-100" />
    </div>
  );
}

/**
 * SkeletonLesson
 * Loading placeholder for the viewport-fitted lesson player (v11).
 *
 * Matches the .lp-player-frame shape: header zone + body zone.
 * The frame fills the available canvas height just like the real player does,
 * so there is no layout shift when content loads.
 *
 * Use inside LessonWorkspace / LessonCanvas where the parent is already a
 * flex column with .lp-workspace / .lp-canvas.
 */
export function SkeletonLesson() {
  return (
    <div className="lp-player-frame lp-skeleton-frame animate-pulse flex flex-col">
      {/* Header zone skeleton */}
      <div className="flex-shrink-0 flex items-center gap-4 px-6 py-5 sm:px-8 border-b border-slate-100">
        <div className="h-11 w-11 rounded-xl bg-slate-100 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 rounded bg-slate-100" />
          <div className="h-3 w-32 rounded bg-slate-100" />
        </div>
        <div className="h-6 w-12 rounded-full bg-slate-100 shrink-0" />
      </div>
      {/* Body zone skeleton */}
      <div className="flex-1 min-h-0 overflow-hidden p-6 space-y-5">
        <div className="h-2.5 w-full rounded-full bg-slate-100" />
        <div className="h-52 rounded-xl bg-slate-100" />
        <div className="space-y-2.5">
          <div className="h-3 w-5/6 rounded bg-slate-100" />
          <div className="h-3 w-4/5 rounded bg-slate-100" />
          <div className="h-3 w-3/4 rounded bg-slate-100" />
        </div>
      </div>
      {/* Footer zone skeleton */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 sm:px-8 border-t border-slate-100">
        <div className="h-8 w-20 rounded-xl bg-slate-100" />
        <div className="h-8 w-20 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Empty / Error States
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EmptyState
 * Friendly zero-data placeholder. Used in class lists, grade tables, etc.
 *
 * Usage:
 *   <EmptyState
 *     icon={<BookOpen />}
 *     title="No classes yet"
 *     description="Ask your teacher to enrol you."
 *   />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-4 py-16 text-center',
        className,
      ].join(' ')}
    >
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          {icon}
        </div>
      )}
      <div className="space-y-1.5 max-w-sm">
        <p className="text-base font-semibold text-slate-700">{title}</p>
        {description && (
          <p className="text-sm text-slate-400">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * SearchEmptyState — convenience wrapper for search-filtered zero results
 */
export function SearchEmptyState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <EmptyState
      icon={<Search className="h-7 w-7" />}
      title="No results found"
      description={`Nothing matched "${query}". Try a different keyword.`}
      action={
        <StudentButton variant="ghost" size="sm" onClick={onClear}>
          Clear search
        </StudentButton>
      }
    />
  );
}

/**
 * ErrorBanner
 * Inline error display with optional retry button.
 */
export function ErrorBanner({
  title = "Something went wrong",
  message,
  onRetry,
  className = '',
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={[
        'rounded-2xl border border-red-100 bg-red-50 p-6 text-center',
        className,
      ].join(' ')}
    >
      <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-300" />
      <p className="text-sm font-semibold text-red-700">{title}</p>
      {message && <p className="mt-1 text-xs text-red-400">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Callout Blocks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GoalCallout
 * The "What you'll learn" tinted block inside LessonWorkspace.
 * Now a reusable component.
 */
export function GoalCallout({
  title = "What you'll learn",
  children,
  icon,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        'rounded-xl border border-teal-100 bg-teal-50 px-4 py-3.5',
        className,
      ].join(' ')}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon ?? <Sparkles className="h-3.5 w-3.5 text-teal-500" />}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-600">
          {title}
        </p>
      </div>
      <div className="text-sm leading-relaxed text-teal-900">{children}</div>
    </div>
  );
}

/**
 * InstructionsCallout
 * Blue callout for task/test instructions. Mirrors AdminTestDetailsPage style.
 */
export function InstructionsCallout({
  title = "Instructions",
  children,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        'rounded-lg border border-sky-100 bg-sky-50 px-3.5 py-3',
        className,
      ].join(' ')}
    >
      <p className="mb-1 text-xs font-semibold text-sky-700">{title}</p>
      <div className="text-sm leading-relaxed text-sky-900">{children}</div>
    </div>
  );
}

/**
 * FeedbackCallout
 * Teacher feedback block shown after grading.
 */
export function FeedbackCallout({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={['rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3', className].join(' ')}>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-600">
        Teacher feedback
      </p>
      <div className="text-sm leading-relaxed text-indigo-900">{children}</div>
    </div>
  );
}

/**
 * SuccessBanner
 * Full-width success confirmation (submitted task, completed test, etc.)
 */
export function SuccessBanner({
  title,
  subtitle,
  score,
  maxScore,
  action,
  className = '',
}: {
  title: string;
  subtitle?: string;
  score?: number | null;
  maxScore?: number | null;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3',
        className,
      ].join(' ')}
    >
      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-emerald-800">{title}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-emerald-600">{subtitle}</p>
        )}
      </div>
      {score != null && (
        <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
          {score}{maxScore != null ? `/${maxScore}` : ''}
        </span>
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Divider
// ─────────────────────────────────────────────────────────────────────────────

/** SectionDivider — the thin `border-t border-slate-100 mt-10` pattern */
export function SectionDivider({ className = '' }: { className?: string }) {
  return (
    <div className={['mt-10 border-t border-slate-100', className].join(' ')} aria-hidden />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Stats Strip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StatsStrip
 * Horizontal stat counters (classes count, avg progress, live count).
 * Used in MyClassesPage page header.
 */
export type StatItem = {
  value: React.ReactNode;
  label: string;
  color?: string;
};

export function StatsStrip({
  stats,
  className = '',
}: {
  stats: StatItem[];
  className?: string;
}) {
  return (
    <div className={['flex items-center gap-4', className].join(' ')}>
      {stats.map((stat, i) => (
        <Fragment key={i}>
          {i > 0 && <div className="h-8 w-px bg-slate-200" />}
          <div className="text-right">
            <p className={['text-2xl font-bold tabular-nums', stat.color ?? 'text-slate-900'].join(' ')}>
              {stat.value}
            </p>
            <p className="text-xs font-medium text-slate-400">{stat.label}</p>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Live Alert Banner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LiveAlertBanner
 * Full-width alert shown on MyClassesPage when live sessions are active.
 */
export function LiveAlertBanner({
  count,
  className = '',
}: {
  count: number;
  className?: string;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3',
        className,
      ].join(' ')}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <p className="text-sm font-medium text-red-800">
        {count === 1
          ? '1 live lesson is happening right now!'
          : `${count} live lessons are happening right now!`}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Level Badge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LevelBadge
 * Language level indicator (A1–C2). Shared across all student views.
 */
const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-sky-100 text-sky-700',
  A2: 'bg-blue-100 text-blue-700',
  B1: 'bg-indigo-100 text-indigo-700',
  B2: 'bg-violet-100 text-violet-700',
  C1: 'bg-purple-100 text-purple-700',
  C2: 'bg-fuchsia-100 text-fuchsia-700',
};

export function LevelBadge({
  level,
  size = 'md',
  className = '',
}: {
  level?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (!level) return null;
  const colorCls = LEVEL_COLORS[level] ?? 'bg-slate-100 text-slate-600';
  const sizeCls = size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={['inline-flex items-center rounded-full font-bold', colorCls, sizeCls, className].join(' ')}>
      {level}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Search Input
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SearchInput
 * Pill-style search bar with clear button.
 * Student version uses teal focus state.
 */
export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Search…',
  resultCount,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  resultCount?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 transition-all"
        />
        {value && onClear && (
          <button
            onClick={onClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>
      {value && resultCount !== undefined && (
        <p className="mt-2 text-xs text-slate-500">
          {resultCount === 0
            ? 'No results'
            : `${resultCount} result${resultCount === 1 ? '' : 's'} for "${value}"`}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Page-level Loading / Error Wrappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PageLoadingState
 * Centered spinner + label.
 *
 * `context="page"` (default) — uses `min-h-[60vh]`, suitable for full-page loading
 *   outside the classroom shell.
 *
 * `context="player"` — uses `flex-1` so it fills the PlayerBody without forcing
 *   the frame to grow.  Use this inside a classroom LessonCanvas.
 */
export function PageLoadingState({
  label = 'Loading…',
  context = 'page',
}: {
  label?: string;
  context?: 'page' | 'player';
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3',
        context === 'player' ? 'flex-1 min-h-0' : 'min-h-[60vh]',
      ].join(' ')}
    >
      <Spinner size="lg" />
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}

/**
 * PageErrorState
 * Centered error with back navigation.
 *
 * `context="page"` (default) — uses `min-h-[60vh]` for full-page error display.
 * `context="player"` — uses `flex-1` to fit inside the classroom player body.
 */
export function PageErrorState({
  message,
  onBack,
  backLabel = 'Go back',
  context = 'page',
}: {
  message: string;
  onBack: () => void;
  backLabel?: string;
  context?: 'page' | 'player';
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-4 px-4 text-center',
        context === 'player' ? 'flex-1 min-h-0' : 'min-h-[60vh]',
      ].join(' ')}
    >
      <AlertCircle className="h-12 w-12 text-red-300" />
      <div className="space-y-1">
        <p className="text-base font-semibold text-slate-700">Something went wrong</p>
        <p className="max-w-sm text-sm text-slate-400">{message}</p>
      </div>
      <StudentButton variant="primary" size="md" onClick={onBack} iconRight={<ChevronRight className="h-4 w-4" />}>
        {backLabel}
      </StudentButton>
    </div>
  );
}