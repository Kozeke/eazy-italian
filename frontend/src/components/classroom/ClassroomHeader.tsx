/**
 * ClassroomHeader.tsx  (v13 — Change Unit in viewport-pinned strip)
 *
 * On the lesson tab the teacher opens StudentAnswersPanel from the left rail in
 * LessonWorkspace. On the homework tab (no lesson workspace) the same toggle
 * is rendered here in the far-right cluster.
 *
 * The Change Unit control lives in `ch-far-right-panel` so its right inset matches
 * `SectionSidePanel` (shared `--classroom-align-gutter` on `.classroom-layout`).
 *
 * Layout: `<header>` = (1) main bar row `ch-main-row`, (2) optional `lessonRail`
 * slot (disabled — see commented block in this file), (3) mobile unit strip. The
 * page body (`<main id="main-content">`) is a sibling rendered by ClassroomPage
 * inside ClassroomLayout, not inside this header.
 */

import React, { useState, useRef, useEffect, type RefObject } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  GraduationCap,
  BookOpen,
  ClipboardList,
  UserPlus,
  LogOut,
  LayoutGrid,
} from 'lucide-react';
import UnitSelectorModal from './unit/UnitSelectorModal';
import { type OnlineUser, getAvatarColor } from '../../hooks/useOnlinePresence';
import './classroom-mode.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClassroomTab = 'lesson' | 'homework';

export interface ClassroomHeaderProps {
  classroom?: {
    id?: number;
    teacher_name?: string;
    [key: string]: unknown;
  } | null;
  course: {
    id: number;
    title: string;
    level?: string;
    thumbnail_url?: string | null;
  };
  currentUnit: {
    id: number;
    title: string;
    order_index?: number;
    level?: string;
  } | null;
  units?: any[];
  completedUnitIds?: Set<number | string>;
  progress?: number;
  onBack: () => void;
  onSelectUnit?: (unit: any) => void;
  /** @deprecated Pass onSelectUnit + units instead. */
  onOpenUnitSelector?: () => void;

  // ── Teacher / generate wiring ──────────────────────────────────────────
  isTeacher?: boolean;
  generateUnitId?: number | null;
  generateUnitTitle?: string;
  onGenerateSuccess?: (result: { segments_created: number; exercises_created: number; segments: any[] }) => void;

  lessonRail?: React.ReactNode;
  /** @deprecated Use lessonRail instead. */
  lessonSteps?: unknown;

  // ── Tab system ──────────────────────────────────────────────────────────
  activeTab?: ClassroomTab;
  onTabChange?: (tab: ClassroomTab) => void;
  homeworkCount?: number;

  // ── Online presence (teacher-only display) ──────────────────────────────
  /**
   * List of students currently online in this classroom.
   * Supplied by useOnlinePresence() in the parent.
   * Only rendered when isTeacher=true.
   */
  onlineUsers?: OnlineUser[];

  /**
   * Called when the teacher clicks the "Add Student" icon (UserPlus).
   * Rendered only when isTeacher=true.
   */
  onAddStudent?: () => void;

  /**
   * Optional: homework-tab-only toggle for StudentAnswersPanel (lesson tab uses
   * LessonWorkspace left rail instead).
   */
  onToggleAnswersPanel?: () => void;
  /** Whether StudentAnswersPanel is open — paired with onToggleAnswersPanel. */
  answersPanelOpen?: boolean;
  /** Set on the header answers control so StudentAnswersPanel can pop over beside it (homework / narrow lesson). */
  answersPanelHeaderButtonRef?: RefObject<HTMLButtonElement>;
}

// ─── Level badge ──────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-sky-100 text-sky-700',
  A2: 'bg-blue-100 text-blue-700',
  B1: 'bg-indigo-100 text-indigo-700',
  B2: 'bg-violet-100 text-violet-700',
  C1: 'bg-purple-100 text-purple-700',
  C2: 'bg-fuchsia-100 text-fuchsia-700',
};

function LevelBadge({ level }: { level?: string }) {
  if (!level) return null;
  const cls = LEVEL_COLORS[level] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {level}
    </span>
  );
}

// ─── Inline tab switcher ───────────────────────────────────────────────────────

interface InlineTabSwitcherProps {
  activeTab: ClassroomTab;
  onTabChange: (tab: ClassroomTab) => void;
  homeworkCount?: number;
}

const TAB_DEFS: { id: ClassroomTab; label: string; icon: React.ReactNode }[] = [
  { id: 'lesson',   label: 'Lesson',   icon: <BookOpen     size={13} strokeWidth={2.2} /> },
  { id: 'homework', label: 'Homework', icon: <ClipboardList size={13} strokeWidth={2.2} /> },
];

function InlineTabSwitcher({ activeTab, onTabChange, homeworkCount }: InlineTabSwitcherProps) {
  return (
    <div className="ch-inline-tabs" role="tablist" aria-label="Classroom sections">
      {TAB_DEFS.map((tab) => {
        const isActive   = activeTab === tab.id;
        const showBadge  = tab.id === 'homework' && !!homeworkCount && homeworkCount > 0;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            type="button"
            className={['ch-inline-tab', isActive ? 'ch-inline-tab--active' : ''].filter(Boolean).join(' ')}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="ch-inline-tab__icon">{tab.icon}</span>
            <span className="ch-inline-tab__label">{tab.label}</span>
            {showBadge && (
              <span className="ch-inline-tab__badge" aria-label={`${homeworkCount} homework items`}>
                {homeworkCount > 99 ? '99+' : homeworkCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Single presence avatar ────────────────────────────────────────────────────

const MAX_VISIBLE = 4;

interface PresenceAvatarProps {
  user: OnlineUser;
  size?: number;
  /** Show the floating name tooltip */
  showTooltip?: boolean;
}

function PresenceAvatar({ user, size = 28, showTooltip = true }: PresenceAvatarProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const color     = user.color ?? getAvatarColor(user.user_id);
  const initial   = (user.user_name ?? '?').charAt(0).toUpperCase();
  const firstName = (user.user_name ?? '').split(' ')[0];

  const showTip  = () => { timerRef.current = setTimeout(() => setTooltipVisible(true),  200); };
  const hideTip  = () => { if (timerRef.current) clearTimeout(timerRef.current); setTooltipVisible(false); };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div
      className="ch-presence-avatar"
      style={{ width: size, height: size }}
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
      aria-label={`${user.user_name} is online`}
    >
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.user_name}
          className="ch-presence-avatar__img"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <span
          className="ch-presence-avatar__initial"
          style={{ background: color }}
        >
          {initial}
        </span>
      )}

      {/* Tooltip */}
      {showTooltip && tooltipVisible && (
        <div className="ch-presence-tooltip" role="tooltip">
          {firstName}
        </div>
      )}
    </div>
  );
}

// ─── Presence cluster (the full group shown in the header) ────────────────────

interface OnlinePresenceClusterProps {
  users: OnlineUser[];
}

function OnlinePresenceCluster({ users }: OnlinePresenceClusterProps) {
  const [expanded, setExpanded] = useState(false);

  if (users.length === 0) return null;

  const visible  = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - MAX_VISIBLE;

  return (
    <div className="ch-presence-cluster" aria-label={`${users.length} student${users.length !== 1 ? 's' : ''} online`}>
      {/* Stacked avatars */}
      <div className="ch-presence-stack">
        {visible.map((u) => (
          <PresenceAvatar key={u.user_id} user={u} size={28} />
        ))}

        {overflow > 0 && (
          <button
            type="button"
            className="ch-presence-overflow"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={`Show ${overflow} more students`}
          >
            +{overflow}
          </button>
        )}
      </div>

      {/* Expanded dropdown — shows all users */}
      {expanded && overflow > 0 && (
        <>
          {/* backdrop */}
          <div
            className="ch-presence-backdrop"
            onClick={() => setExpanded(false)}
            aria-hidden
          />
          <div className="ch-presence-dropdown" role="listbox" aria-label="Online students">
            {users.map((u) => {
              const color   = u.color ?? getAvatarColor(u.user_id);
              const initial = (u.user_name ?? '?').charAt(0).toUpperCase();
              return (
                <div key={u.user_id} className="ch-presence-dropdown__item" role="option" aria-selected={false}>
                  <div className="ch-presence-dropdown__avatar" style={{ background: u.avatar_url ? undefined : color }}>
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt={u.user_name} />
                      : initial
                    }
                  </div>
                  <span className="ch-presence-dropdown__name">{u.user_name}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClassroomHeader({
  classroom,
  course,
  currentUnit,
  units = [],
  completedUnitIds,
  progress: _progress,
  onBack,
  onSelectUnit,
  onOpenUnitSelector: _onOpenUnitSelector,
  lessonRail,
  activeTab = 'lesson',
  onTabChange,
  homeworkCount = 0,
  isTeacher = false,
  generateUnitId,
  generateUnitTitle,
  onGenerateSuccess,
  onlineUsers = [],
  onAddStudent,
  onToggleAnswersPanel,
  answersPanelOpen = false,
  answersPanelHeaderButtonRef,
}: ClassroomHeaderProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const canUseModal = units.length > 0 && typeof onSelectUnit === 'function';

  const handleOpenChanger = () => {
    if (canUseModal) {
      setModalOpen(true);
    } else {
      _onOpenUnitSelector?.();
    }
  };

  const handleSelectUnit = (unit: any) => {
    onSelectUnit?.(unit);
    setModalOpen(false);
  };

  const hasRail      = !!lessonRail && !!currentUnit;
  const showTabs     = !!currentUnit && !!onTabChange;
  // useOnlinePresence excludes the current user; any remaining entry is another person in the room (students).
  const hasOnlineStudent = onlineUsers.length > 0;

  return (
    <>
      <header
        className={[
          'sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm',
          'classroom-header',
          // Reserves correct main-bar padding for the viewport-pinned icon cluster (teacher vs student)
          isTeacher ? 'classroom-header--teacher' : 'classroom-header--student',
          hasRail ? 'classroom-header--has-rail' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* ── Main bar ─────────────────────────────────────────────────────── */}
        <div className="relative flex h-12 w-full items-center ch-main-row">

          {/* ── Centred content ───────────────────────────────────────────── */}
          <div className="mx-auto flex h-full w-full max-w-7xl items-center gap-3 px-4 md:px-6 lg:px-8 ch-main-bar-inner ch-main-inner">

            {/* LEFT: back → divider → course icon + name */}
            <div className="flex min-w-0 shrink-0 items-center gap-2 ch-left-group">
              <button
                onClick={onBack}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                aria-label="Back to My Classes"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden min-[480px]:inline sm:inline">Classes</span>
              </button>

              <div className="hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />

              {/* Compact course context on very narrow screens (full row is hidden below `sm`) */}
              <button
                type="button"
                onClick={onBack}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:hidden"
                aria-label={`Leave classroom (${course.title})`}
              >
                {course.thumbnail_url ? (
                  <img
                    src={course.thumbnail_url}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-md object-cover ring-1 ring-slate-200"
                  />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-violet-700 shadow-sm">
                    <GraduationCap className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <span className="min-w-0 truncate text-xs font-semibold text-slate-800">
                  {course.title}
                </span>
                {course.level && <LevelBadge level={course.level} />}
              </button>

              <button
                type="button"
                onClick={onBack}
                className="hidden items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:flex"
                aria-label={`Leave classroom (${course.title})`}
              >
                {course.thumbnail_url ? (
                  <img
                    src={course.thumbnail_url}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-violet-700 shadow-sm">
                    <GraduationCap className="h-4 w-4 text-white" />
                  </div>
                )}
                <span className="max-w-[140px] truncate text-sm font-semibold text-slate-800 lg:max-w-[220px]">
                  {course.title}
                </span>
                {course.level && <LevelBadge level={course.level} />}
              </button>
            </div>

            {/* INLINE TABS */}
            {showTabs && (
              <>
                <div className="hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
                <div className="ch-tabs-wrap">
                  <InlineTabSwitcher
                    activeTab={activeTab}
                    onTabChange={onTabChange!}
                    homeworkCount={homeworkCount}
                  />
                </div>
              </>
            )}

            {/* Spacer */}
            <div className="flex-1 ch-main-spacer" />

            {/* ── Right content: unit title (compact) + teacher chip (student) ─── */}
            <div className="flex items-center gap-2 ch-right-content">

              {/* Unit title (no-tabs mode) */}
              {!showTabs && currentUnit && (
                <p className="hidden max-w-[180px] truncate text-sm font-semibold text-slate-700 md:block lg:max-w-[260px]">
                  {currentUnit.title}
                </p>
              )}

              {/* Teacher name chip (student view) */}
              {classroom?.teacher_name && !isTeacher && (
                <div className="hidden items-center gap-1.5 lg:flex">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
                    {classroom.teacher_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-slate-500">
                    {classroom.teacher_name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Far-right panel: always pinned to the viewport right edge ─── */}
          <div className="ch-far-right-panel">
            {/* Same horizontal inset as LessonWorkspace / SectionSidePanel (CSS variable on layout root). */}
            <button
              type="button"
              onClick={handleOpenChanger}
              className="ch-change-unit-btn flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <span className="ch-change-unit-label hidden sm:inline">{currentUnit ? 'Change Unit' : 'Choose Unit'}</span>
              <span className="ch-change-unit-label ch-change-unit-label--mobile sm:hidden">{currentUnit ? 'Unit' : 'Choose'}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>

            {/* TEACHER: answers icon + add-student + presence cluster + divider + exit */}
            {isTeacher && (
              <>
                {hasOnlineStudent && (
                  <>
                    <div className="flex items-center gap-2">
                      {/* Answers: homework always; lesson uses workspace rail except ≤480px (ClassroomPage). */}
                      {onToggleAnswersPanel && (
                        <button
                          ref={answersPanelHeaderButtonRef ?? undefined}
                          type="button"
                          onClick={onToggleAnswersPanel}
                          aria-label="View student answers"
                          aria-pressed={answersPanelOpen}
                          title="Student answers"
                          className={[
                            'ch-icon-btn',
                            answersPanelOpen
                              ? 'ch-icon-btn--answers ch-icon-btn--answers-active'
                              : 'ch-icon-btn--answers',
                          ].join(' ')}
                        >
                          <LayoutGrid size={15} strokeWidth={2.2} />
                        </button>
                      )}

                      {/* Add-student icon */}
                      <button
                        type="button"
                        onClick={onAddStudent}
                        aria-label="Add student to classroom"
                        className="ch-icon-btn ch-icon-btn--add"
                        disabled={!onAddStudent}
                      >
                        <UserPlus size={15} strokeWidth={2.2} />
                      </button>

                      <OnlinePresenceCluster users={onlineUsers} />
                    </div>

                    <div className="hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
                  </>
                )}

                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Exit classroom"
                  className="ch-icon-btn ch-icon-btn--exit"
                >
                  <LogOut size={15} strokeWidth={2.2} />
                </button>
              </>
            )}

            {/* STUDENT: divider + exit */}
            {!isTeacher && (
              <>
                <div className="hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Exit classroom"
                  className="ch-icon-btn ch-icon-btn--exit"
                >
                  <LogOut size={15} strokeWidth={2.2} />
                </button>
              </>
            )}
          </div>

        </div>

        {/* ── Lesson rail (lesson steps) — DISABLED ───────────────────────────── */}
        {/* Was: {hasRail && lessonRail} — LessonProgressRail stubbed in LessonPlayerShared. */}
        {/* {hasRail && lessonRail} */}

        {/* ── Mobile unit strip ─────────────────────────────────────────────── */}
        {currentUnit && !showTabs && (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-1.5 md:hidden">
            <p className="truncate text-xs font-medium text-slate-700">
              <span className="mr-1 text-slate-400">Unit:</span>
              {currentUnit.title}
            </p>
          </div>
        )}
      </header>

      {/* Unit selector modal */}
      {canUseModal && (
        <UnitSelectorModal
          open={modalOpen}
          units={units}
          currentUnitId={currentUnit?.id ?? null}
          courseTitle={course.title}
          completedUnitIds={completedUnitIds}
          onClose={() => setModalOpen(false)}
          onSelectUnit={handleSelectUnit}
          isTeacher={isTeacher}
          generateUnitId={generateUnitId}
          generateUnitTitle={generateUnitTitle}
          onGenerateSuccess={onGenerateSuccess}
        />
      )}
    </>
  );
}