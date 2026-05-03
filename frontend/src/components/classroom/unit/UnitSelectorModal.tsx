/**
 * UnitSelectorModal.tsx  (v5 — unit reorder via @dnd-kit)
 *
 * • Teachers reorder units by dragging the grip control next to Share in each row
 *   (search field must be empty). Persists via POST /admin/courses/:id/units/reorder.
 *
 * What changed from v3:
 * ─────────────────────
 * • Imports EditUnitModal and its UnitEditData type.
 * • Tracks `editingUnit` state — set when the teacher clicks "Редактировать"
 *   in the UnitListItem three-dot dropdown.
 * • The EditUnitModal opens over this modal (z-[70]) and calls onEditUnit
 *   with the saved data on confirm.
 * • All existing props and behaviour are unchanged.
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  X,
  Search,
  BookOpen,
  Share2,
  MoreHorizontal,
  Filter,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import UnitListItem from './UnitListItem';
import EditCourseModal, { type CourseEditData } from './EditCourseModal';
import EditUnitModal, { type UnitEditData } from './EditUnitModal';
import CreateUnitModal, { type CreateUnitData } from './CreateUnitModal';
import GenerateUnitModal from '../unit/GenerateUnitModal';
import EditOutlineModal from './EditOutlineModal';
import CourseOutlineReviewPanel from './CourseOutlineReviewPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreatingUnitMode = 'manual' | 'ai' | null;

export type UnitSelectorModalProps = {
  // ── Existing props (unchanged) ─────────────────────────────────────────
  open: boolean;
  units: any[];
  currentUnitId: number | string | null;
  onClose: () => void;
  onSelectUnit: (unit: any) => void;
  completedUnitIds?: Set<number | string>;
  courseTitle?: string;
  isTeacher?: boolean;
  onCreateUnit?: (mode: CreatingUnitMode) => void;

  // ── New optional props ─────────────────────────────────────────────────
  courseThumbnailUrl?: string;
  courseSubtitle?: string;
  onAddUnit?: () => void;
  onGenerateUnit?: () => void;
  onShareCourse?: () => void;
  /**
   * Called with the full saved UnitEditData after the teacher saves changes.
   * The `unit` argument is the original unit object so callers can identify it.
   */
  onEditUnit?: (unit: any, data: UnitEditData) => void;
  /** Persist new unit from CreateUnitModal — may be async; errors should reject so the modal stays open. */
  onCreateUnitData?: (data: CreateUnitData) => void | Promise<void>;
  onHideUnit?: (unit: any) => void;
  onCopyUnit?: (unit: any) => void;
  onDeleteUnit?: (unit: any) => void;
  /** Persist course metadata — may be async (PUT /admin/courses/:id) */
  onEditCourse?: (data: CourseEditData) => void | Promise<void>;
  onDeleteCourse?: () => void;
  /** Seeds EditCourseModal from GET course — description */
  editCourseDescription?: string;
  /** Seeds EditCourseModal — UI language code (en, ru, …) */
  editCourseLanguage?: string;
  /** Seeds EditCourseModal — lesson grouping by sections */
  editCourseSectionsEnabled?: boolean;
  /** Seeds EditCourseModal — age band tag */
  editCourseAge?: string;
  /** Seeds EditCourseModal — display level (Beginner, …) */
  editCourseLevel?: string;
  /** Seeds EditCourseModal — material type (Course, …) */
  editCourseType?: string;
  /** ID of the unit to fill with AI content when "Generate" is clicked */
  generateUnitId?: number | null;
  /** Title shown inside the GenerateUnitModal header */
  generateUnitTitle?: string;
  /** Called after a successful AI generation so the parent can reload content */
  /** `exercises_created` is optional — unit generate API may omit it (see GenerateUnitModal GenerateResult). */
  onGenerateSuccess?: (result: { segments_created: number; exercises_created?: number; segments: any[] }) => void;
  /**
   * Called when the footer "Сгенерировать" button is clicked.
   * Should create a brand-new unit and return its { id, title }.
   * When provided, this replaces the generateUnitId / generateUnitTitle props
   * for the footer button (per-unit dropdown still uses the unit's own id).
   */
  onCreateAndGenerate?: () => Promise<{ id: number; title: string } | null>;

  // ── Course-level generation (AI outline flow) ──────────────────────────
  /**
   * Full course outline returned by POST /course-builder/generate-outline.
   * When set, the modal shows a generation-review panel instead of the
   * normal contents tab until the teacher starts (or dismisses) generation.
   */
  courseOutline?: any | null;
  /**
   * Per-unit status map driven by useCourseGeneration.
   * Key: unit_id (number).  Value: 'pending' | 'generating' | 'done' | 'error'.
   */
  unitGenerationStatuses?: Record<number, 'pending' | 'generating' | 'done' | 'error'>;
  /** True while the SSE stream from useCourseGeneration is alive. */
  isGeneratingCourse?: boolean;
  /** Kick off the SSE content-generation stream for all units. */
  onStartCourseGeneration?: () => void;
  /**
   * Numeric course ID — forwarded to EditOutlineModal so it can call
   * PATCH /course-builder/{courseId}/outline on save.
   */
  courseId?: number | null;
  /**
   * Called with the updated outline after the teacher saves edits in
   * EditOutlineModal.  The parent should update its local outline state
   * and sessionStorage so the CourseGenerationPanel reflects the changes.
   */
  /**
   * CEFR level forwarded to the segment plan endpoint (e.g. 'B1').
   * Comes from the ?level= URL param written by CreateCourseModal.
   */
  generationLevel?: string;
  /**
   * Target language forwarded to the segment plan endpoint (e.g. 'English').
   * Comes from editCourseLanguage resolved to a display name.
   */
  generationLanguage?: string;
  onEditOutline?: (updatedOutline: any) => void;
  /**
   * Teacher-only: persist a new canonical unit order after drag-and-drop in the list.
   */
  onReorderUnits?: (orderedUnitIds: number[]) => void | Promise<void>;
};

type ActiveTab = 'contents' | 'description';

/**
 * Picks the human-readable title for a unit row when both AI outline and DB titles exist.
 * Outline topics replace generic placeholders such as "Unit 4" from create-unit defaults.
 */
function resolveUnitRowTitle(
  outlineTitle: string,
  dbTitle: string,
  orderIndex: number,
  t: TFunction,
): string {
  const trimmedOutline = outlineTitle.trim();
  const trimmedDb = dbTitle.trim();
  // Matches auto-generated titles from ClassroomPage / create-unit flows
  const isGenericDbTitle = /^unit\s*\d+$/i.test(trimmedDb);
  if (trimmedOutline) return trimmedOutline;
  if (trimmedDb && !isGenericDbTitle) return trimmedDb;
  return t('classroom.unitSelector.unnamedUnit', { index: orderIndex + 1 });
}

/**
 * Resolves the visible title for a persisted unit, using the cached course outline when useful.
 */
function resolveUnitListItemTitle(
  unit: { title?: string; order_index?: number },
  courseOutline: any | null | undefined,
  t: TFunction,
): string {
  const orderIdx = unit.order_index ?? 0;
  const outlineSlice =
    typeof unit.order_index === 'number' && Array.isArray(courseOutline?.units)
      ? courseOutline.units[unit.order_index]
      : undefined;
  const outlineTitle = String(outlineSlice?.title ?? '');
  return resolveUnitRowTitle(outlineTitle, unit.title ?? '', orderIdx, t);
}

/** One sortable row: outer `<li>` for @dnd-kit, inner `UnitListItem` root is `div` to avoid invalid nesting. */
type SortableTeacherUnitRowProps = {
  unit: any;
  isCurrent: boolean;
  isCompleted: boolean;
  isLocked: boolean;
  isAiGenerating: boolean;
  displayTitle: string;
  teacherCallbacks: {
    showActions?: boolean;
    onEdit?: (u: any) => void;
    onGenerate?: (u: any) => void;
    onHide?: (u: any) => void;
    onCopy?: (u: any) => void;
    onDelete?: (u: any) => void;
  };
  onRowClick: () => void;
  shareCourseId?: number | null;
};

function SortableTeacherUnitRow({
  unit,
  isCurrent,
  isCompleted,
  isLocked,
  isAiGenerating,
  displayTitle,
  teacherCallbacks,
  onRowClick,
  shareCourseId,
}: SortableTeacherUnitRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: unit.id,
    disabled: isLocked,
  });
  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    listStyle: 'none',
    opacity: isDragging ? 0.92 : 1,
    zIndex: isDragging ? 2 : undefined,
    position: 'relative',
  };

  return (
    <li ref={setNodeRef} style={sortableStyle}>
      <UnitListItem
        unit={unit}
        isCurrent={isCurrent}
        isCompleted={isCompleted}
        isLocked={isLocked}
        onClick={onRowClick}
        {...teacherCallbacks}
        displayTitle={displayTitle}
        isAiGenerating={isAiGenerating}
        rootElement="div"
        dragHandleBinder={{ attributes, listeners }}
        shareCourseId={shareCourseId}
      />
    </li>
  );
}

type UnitGenStatus = 'pending' | 'generating' | 'done' | 'error';

// ─── GenerationProgressBanner ─────────────────────────────────────────────────
// Compact sticky banner shown at the top of the units list while background
// generation is in progress. Disappears once all units are done.

interface GenerationProgressBannerProps {
  unitStatuses: Record<number, UnitGenStatus>;
  units: any[];
  isGenerating: boolean;
}

function GenerationProgressBanner({ unitStatuses, units, isGenerating }: GenerationProgressBannerProps) {
  // Provides localized labels for the generation progress banner.
  const { t } = useTranslation();
  const total    = units.length;
  const doneCount  = Object.values(unitStatuses).filter((s) => s === 'done').length;
  const hasError   = Object.values(unitStatuses).some((s) => s === 'error');
  const allDone    = !isGenerating && doneCount > 0 && doneCount >= total;

  if (!isGenerating && !allDone) return null;

  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div
      style={{
        margin: '0 0 2px',
        padding: '10px 16px',
        background: allDone ? '#EEF0FE' : '#F5F6FF',
        borderBottom: '1px solid',
        borderColor: allDone ? '#C7CAFB' : '#E0E3FD',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}
    >
      {/* Icon / spinner */}
      {allDone ? (
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          background: '#6C6FEF',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
            <path d="M3 8l3.5 3.5 6.5-7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      ) : (
        <span style={{
          width: 16, height: 16, borderRadius: '50%',
          border: '2px solid #6C6FEF',
          borderTopColor: 'transparent',
          display: 'inline-block',
          flexShrink: 0,
          animation: 'usm-spin 0.75s linear infinite',
        }} />
      )}

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#4F52C2', lineHeight: 1.3 }}>
          {allDone
            ? t('classroom.unitSelector.progressBanner.allGenerated', { total })
            : hasError
              ? t('classroom.unitSelector.progressBanner.generatingWithErrors', { done: doneCount, total })
              : t('classroom.unitSelector.progressBanner.generatingBackground', { done: doneCount, total })
          }
        </p>
      </div>

      {/* Mini progress bar */}
      {total > 0 && (
        <div style={{
          width: 56, height: 4, borderRadius: 2,
          background: '#C7CAFB', overflow: 'hidden', flexShrink: 0,
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: '#6C6FEF',
            borderRadius: 2,
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}
    </div>
  );
}

// ─── Course thumbnail ─────────────────────────────────────────────────────────

function CourseThumbnail({ url, initial }: { url?: string; initial: string }) {
  // Provides localized image alt text for the course thumbnail.
  const { t } = useTranslation();
  if (url) {
    return (
      <img
        src={url}
        alt={t('classroom.unitSelector.courseThumbnailAlt')}
        style={{ height: 64, width: 64, flexShrink: 0, borderRadius: 14, objectFit: 'cover', boxShadow: '0 2px 8px rgba(108,111,239,0.15)' }}
      />
    );
  }
  return (
    <div style={{
      display: 'flex', height: 64, width: 64, flexShrink: 0,
      alignItems: 'center', justifyContent: 'center',
      borderRadius: 14,
      background: 'linear-gradient(135deg, #6C6FEF 0%, #4F52C2 100%)',
      color: '#FFFFFF',
      boxShadow: '0 4px 12px rgba(108,111,239,0.30)',
    }}>
      <span style={{ fontSize: 22, fontWeight: 700, userSelect: 'none' }}>{initial.toUpperCase()}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnitSelectorModal({
  open,
  units,
  currentUnitId,
  onClose,
  onSelectUnit,
  completedUnitIds,
  courseTitle = 'Course',
  isTeacher = false,
  onCreateUnit,
  courseThumbnailUrl,
  courseSubtitle,
  onGenerateUnit,
  onShareCourse,
  onEditUnit,
  onHideUnit,
  onCopyUnit,
  onDeleteUnit,
  onEditCourse,
  onDeleteCourse,
  editCourseDescription,
  editCourseLanguage,
  editCourseSectionsEnabled,
  editCourseAge,
  editCourseLevel,
  editCourseType,
  onCreateUnitData,
  generateUnitId,
  generateUnitTitle,
  onGenerateSuccess,
  onCreateAndGenerate,
  courseOutline,
  unitGenerationStatuses = {},
  isGeneratingCourse = false,
  onStartCourseGeneration,
  courseId,
  generationLevel = 'B1',
  generationLanguage = 'English',
  onEditOutline,
  onReorderUnits,
}: UnitSelectorModalProps) {
  // Provides localized labels for unit selector modal controls and states.
  const { t } = useTranslation();
  const [query, setQuery]               = useState('');
  const [activeTab, setActiveTab]       = useState<ActiveTab>('contents');
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const [editCourseOpen, setEditCourseOpen] = useState(false);

  // ── EditUnitModal state ──────────────────────────────────────────────────
  const [editingUnit, setEditingUnit]   = useState<any | null>(null);

  // ── CreateUnitModal state ────────────────────────────────────────────────
  const [createUnitOpen, setCreateUnitOpen] = useState(false);

  // ── EditOutlineModal state ───────────────────────────────────────────────
  const [editOutlineOpen, setEditOutlineOpen] = useState(false);

  // ── GenerateUnitModal state ──────────────────────────────────────────────
  // Target unit for AI generation — can be set either from the footer button
  // (uses onCreateAndGenerate to create a fresh unit first) or from the
  // per-unit dropdown (generates into the existing unit).
  const [generateTarget, setGenerateTarget] = useState<{ id: number; title: string } | null>(null);
  const [creatingForGenerate, setCreatingForGenerate] = useState(false);

  const searchRef    = useRef<HTMLInputElement>(null);
  const panelRef     = useRef<HTMLDivElement>(null);
  const courseMenuRef = useRef<HTMLDivElement>(null);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveTab('contents');
      setCourseMenuOpen(false);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (courseMenuOpen) { setCourseMenuOpen(false); return; }
        // Don't close this modal when child modals are open — let them handle Escape
        if (editingUnit) return;
        if (createUnitOpen) return;
        if (editOutlineOpen) return;
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, courseMenuOpen, editingUnit, createUnitOpen, editOutlineOpen]);

  // Lock body scroll
  useEffect(() => {
    if (open) document.body.classList.add('classroom-mode-locked');
    else      document.body.classList.remove('classroom-mode-locked');
    return () => document.body.classList.remove('classroom-mode-locked');
  }, [open]);

  // Close course menu on outside click
  useEffect(() => {
    if (!courseMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (courseMenuRef.current && !courseMenuRef.current.contains(e.target as Node)) {
        setCourseMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [courseMenuOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) => {
      const resolvedLabel = resolveUnitListItemTitle(u, courseOutline, t).toLowerCase();
      const rawTitle = (u.title ?? '').toLowerCase();
      return resolvedLabel.includes(q) || rawTitle.includes(q);
    });
  }, [units, query, courseOutline, t]);

  // Stable lesson order for the list; matches server order_index
  const displaySortedUnits = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
      ),
    [filtered],
  );

  // Drag-and-drop would fight filtered subsets — only enable with an empty search query
  const reorderEnabled = Boolean(isTeacher && onReorderUnits && !query.trim());

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleUnitsDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!onReorderUnits || !over || active.id === over.id) return;
      const oldIndex = displaySortedUnits.findIndex(
        (u) => String(u.id) === String(active.id),
      );
      const newIndex = displaySortedUnits.findIndex(
        (u) => String(u.id) === String(over.id),
      );
      if (oldIndex < 0 || newIndex < 0) return;
      const nextIds = arrayMove(displaySortedUnits, oldIndex, newIndex).map(
        (u: { id: number }) => u.id,
      );
      void onReorderUnits(nextIds);
    },
    [onReorderUnits, displaySortedUnits],
  );

  // generationStarted is used to drive the GenerationProgressBanner in the
  // normal units list.  CourseOutlineReviewPanel now shows for the full
  // outline flow (before + during + after generation) so we no longer use it
  // to gate the panel.
  const generationStarted = isGeneratingCourse || Object.keys(unitGenerationStatuses).length > 0;

  if (!open) return null;

  const handleSelect = (unit: any) => {
    onSelectUnit(unit);
    onClose();
  };

  const initial = courseTitle?.[0] ?? t('classroom.unitSelector.defaultCourseInitial');

  // Teacher action callbacks passed to UnitListItem
  const teacherCallbacks = isTeacher
    ? {
        showActions: true,
        onEdit:     (unit: any) => setEditingUnit(unit),   // ← opens EditUnitModal
        onGenerate: (unit: any) =>
          setGenerateTarget({
            id: unit.id,
            title: resolveUnitListItemTitle(unit, courseOutline, t),
          }),
        onHide:     onHideUnit,
        onCopy:     onCopyUnit,
        onDelete:   onDeleteUnit,
      }
    : {};

  return (
    <>
      {/* Keyframes for the generating pulse dot */}
      <style>{`
        @keyframes usm-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(15,17,40,0.45)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
        aria-hidden
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={courseTitle}
        ref={panelRef}
        style={{
          position: 'fixed', zIndex: 50,
          left: '50%', top: '4vh',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: 640,
          display: 'flex', flexDirection: 'column',
          background: '#FFFFFF',
          borderRadius: 20,
          boxShadow: '0 8px 40px rgba(108,111,239,0.14), 0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          height: '92vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Close button ─────────────────────────────────────────────────── */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', right: 16, top: 16, zIndex: 10,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 10, padding: 6,
            background: '#F7F7FA',
            border: 'none',
            color: '#9CA3AF',
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#EEF0FE'; (e.currentTarget as HTMLButtonElement).style.color = '#6C6FEF'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F7F7FA'; (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF'; }}
          aria-label={t('common.close')}
        >
          <X style={{ width: 18, height: 18 }} />
        </button>

        {/* ── Course header ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '20px 20px 16px' }}>
          <CourseThumbnail url={courseThumbnailUrl} initial={initial} />

          <div style={{ flex: 1, minWidth: 0, paddingRight: 36 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {courseTitle}
            </h2>
            {courseSubtitle && (
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6B7280', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {courseSubtitle}
              </p>
            )}

            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={onShareCourse}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  borderRadius: 10,
                  border: '1.5px solid #E5E7EB',
                  background: '#FFFFFF',
                  padding: '5px 12px',
                  fontSize: 12, fontWeight: 600, color: '#374151',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#A5A8F5'; b.style.background = '#EEF0FE'; b.style.color = '#4F52C2'; }}
                onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#E5E7EB'; b.style.background = '#FFFFFF'; b.style.color = '#374151'; }}
              >
                <Share2 style={{ width: 13, height: 13 }} />
                {t('classroom.unitSelector.share')}
              </button>

              {isTeacher && (
                <div style={{ position: 'relative' }} ref={courseMenuRef}>
                  <button
                    onClick={() => setCourseMenuOpen((v) => !v)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 10,
                      border: '1.5px solid #E5E7EB',
                      background: courseMenuOpen ? '#EEF0FE' : '#FFFFFF',
                      padding: 6,
                      color: courseMenuOpen ? '#6C6FEF' : '#6B7280',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#A5A8F5'; b.style.background = '#EEF0FE'; b.style.color = '#6C6FEF'; }}
                    onMouseLeave={(e) => { if (!courseMenuOpen) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#E5E7EB'; b.style.background = '#FFFFFF'; b.style.color = '#6B7280'; } }}
                    aria-label={t('classroom.unitSelector.moreCourseOptions')}
                  >
                    <MoreHorizontal style={{ width: 15, height: 15 }} />
                  </button>
                  {courseMenuOpen && (
                    <div style={{
                      position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 50,
                      width: 176,
                      borderRadius: 14,
                      border: '1px solid #E5E7EB',
                      background: '#FFFFFF',
                      padding: 5,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
                    }}>
                      <button
                        type="button"
                        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151', background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F7F7FA'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                        onClick={() => { setCourseMenuOpen(false); setEditCourseOpen(true); }}
                      >
                        {t('classroom.unitSelector.courseSettings')}
                      </button>
                      <button
                        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151', background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F7F7FA'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                      >
                        {t('classroom.unitSelector.copyCourse')}
                      </button>
                      <div style={{ margin: '4px 0', borderTop: '1px solid #F3F4F6' }} />
                      <button
                        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#DC2626', background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                        onClick={() => {
                          setCourseMenuOpen(false);
                          onDeleteCourse?.();
                        }}
                      >
                        {t('classroom.unitSelector.deleteCourse')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', borderBottom: '1.5px solid #F3F4F6', padding: '0 20px' }}>
          {(['contents', 'description'] as const).map((tab) => {
            const label = tab === 'contents'
              ? t('classroom.unitSelector.tabs.contents')
              : t('classroom.unitSelector.tabs.description');
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  marginRight: 24,
                  paddingBottom: 10, paddingTop: 4,
                  fontSize: 13, fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: active ? '#6C6FEF' : '#9CA3AF',
                  borderBottom: active ? '2px solid #6C6FEF' : '2px solid transparent',
                  marginBottom: -1.5,
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF'; }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Tab body ─────────────────────────────────────────────────────── */}
        {/* Generation panel — shown for the FULL outline flow:
            before generation, while generating, and after all done.
            Units with status 'done' are directly clickable to navigate.  */}
        {courseOutline && activeTab === 'contents' ? (
          <CourseOutlineReviewPanel
            outline={courseOutline}
            unitStatuses={unitGenerationStatuses}
            units={units}
            isGenerating={isGeneratingCourse}
            courseId={courseId ?? null}
            level={generationLevel}
            language={generationLanguage}
            onStart={() => onStartCourseGeneration?.()}
            onEditOutline={onEditOutline ? () => setEditOutlineOpen(true) : undefined}
            onOutlineChanged={(updated) => { onEditOutline?.(updated); }}
            onSelectUnit={(unit) => { handleSelect(unit); }}
          />
        ) : activeTab === 'description' ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '64px 0', fontSize: 13, color: '#9CA3AF' }}>
            {t('classroom.unitSelector.descriptionComingSoon')}
          </div>
        ) : (
          <>
            {/* Generation-in-progress banner — shown while SSE stream is alive */}
            {generationStarted && (
              <GenerationProgressBanner
                unitStatuses={unitGenerationStatuses}
                units={units}
                isGenerating={isGeneratingCourse}
              />
            )}

            {/* Search bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 10px', borderBottom: '1.5px solid #F3F4F6' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#9CA3AF', pointerEvents: 'none' }} />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder={t('classroom.unitSelector.searchPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1.5px solid #E5E7EB',
                    background: '#F7F7FA',
                    padding: '8px 12px 8px 32px',
                    fontSize: 13,
                    color: '#111827',
                    outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#6C6FEF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(108,111,239,0.10)'; e.currentTarget.style.background = '#FFFFFF'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = '#F7F7FA'; }}
                  aria-label={t('classroom.unitSelector.searchAria')}
                />
              </div>
              <button
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  borderRadius: 12,
                  border: '1.5px solid #E5E7EB',
                  background: '#FFFFFF',
                  padding: '7px 12px',
                  fontSize: 12, fontWeight: 600, color: '#6B7280',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#A5A8F5'; b.style.color = '#4F52C2'; b.style.background = '#EEF0FE'; }}
                onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#E5E7EB'; b.style.color = '#6B7280'; b.style.background = '#FFFFFF'; }}
              >
                <Filter style={{ width: 13, height: 13 }} />
                {t('classroom.unitSelector.filter')}
              </button>
            </div>

            {/* Unit list */}
            <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
              {filtered.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', textAlign: 'center', color: '#9CA3AF' }}>
                  <BookOpen style={{ marginBottom: 12, width: 40, height: 40, opacity: 0.2 }} />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
                    {query
                      ? t('classroom.unitSelector.empty.noMatches')
                      : t('classroom.unitSelector.empty.noUnits')}
                  </p>
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      style={{ marginTop: 8, fontSize: 12, color: '#6C6FEF', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {t('classroom.unitSelector.empty.resetSearch')}
                    </button>
                  )}
                </div>
              ) : reorderEnabled ? (
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleUnitsDragEnd}
                >
                  <SortableContext
                    items={displaySortedUnits.map((u) => u.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul
                      style={{ listStyle: 'none', margin: 0, padding: '4px 0', borderTop: 'none' }}
                      role="listbox"
                      aria-label={t('classroom.unitSelector.availableUnitsAria')}
                    >
                      {displaySortedUnits.map((unit) => {
                        const isCurrent   = String(unit.id) === String(currentUnitId);
                        const isCompleted = completedUnitIds?.has(unit.id) ?? false;
                        const isLocked    = unit.is_visible_to_students === false;
                        const genStatus   = unitGenerationStatuses[unit.id];
                        const isGeneratingNow = genStatus === 'generating' || genStatus === 'pending';

                        return (
                          <SortableTeacherUnitRow
                            key={unit.id}
                            unit={unit}
                            isCurrent={isCurrent}
                            isCompleted={isCompleted}
                            isLocked={isLocked}
                            isAiGenerating={isGeneratingNow}
                            displayTitle={resolveUnitListItemTitle(unit, courseOutline, t)}
                            teacherCallbacks={teacherCallbacks}
                            onRowClick={() => !isLocked && handleSelect(unit)}
                            shareCourseId={courseId}
                          />
                        );
                      })}
                    </ul>
                  </SortableContext>
                </DndContext>
              ) : (
                <ul
                  style={{ listStyle: 'none', margin: 0, padding: '4px 0', borderTop: 'none' }}
                  role="listbox"
                  aria-label={t('classroom.unitSelector.availableUnitsAria')}
                >
                  {displaySortedUnits.map((unit) => {
                    const isCurrent   = String(unit.id) === String(currentUnitId);
                    const isCompleted = completedUnitIds?.has(unit.id) ?? false;
                    const isLocked    = unit.is_visible_to_students === false;
                    const genStatus   = unitGenerationStatuses[unit.id];
                    const isGeneratingNow = genStatus === 'generating' || genStatus === 'pending';

                    return (
                      <li key={unit.id} style={{ listStyle: 'none' }}>
                        <UnitListItem
                          unit={unit}
                          isCurrent={isCurrent}
                          isCompleted={isCompleted}
                          isLocked={isLocked}
                          onClick={() => !isLocked && handleSelect(unit)}
                          {...teacherCallbacks}
                          displayTitle={resolveUnitListItemTitle(unit, courseOutline, t)}
                          isAiGenerating={isGeneratingNow}
                          shareCourseId={courseId}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer (teacher only) */}
            {isTeacher && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderTop: '1.5px solid #F3F4F6', padding: '10px 16px' }}>
                <button
                  onClick={() => { setCreateUnitOpen(true); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 13, fontWeight: 600,
                    color: '#6C6FEF',
                    background: 'none', border: 'none',
                    borderRadius: 10, padding: '6px 10px',
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#EEF0FE'; b.style.color = '#4F52C2'; }}
                  onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'none'; b.style.color = '#6C6FEF'; }}
                >
                  <Plus style={{ width: 15, height: 15 }} />
                  {t('classroom.unitSelector.createUnit')}
                </button>
                <button
                  disabled={creatingForGenerate}
                  onClick={async () => {
                    if (onCreateAndGenerate) {
                      setCreatingForGenerate(true);
                      try {
                        const target = await onCreateAndGenerate();
                        if (target) setGenerateTarget(target);
                      } finally {
                        setCreatingForGenerate(false);
                      }
                    } else if (generateUnitId) {
                      setGenerateTarget({ id: generateUnitId, title: generateUnitTitle ?? '' });
                    } else {
                      setCreateUnitOpen(true);
                      onGenerateUnit?.();
                      onCreateUnit?.('ai');
                    }
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 13, fontWeight: 600,
                    color: creatingForGenerate ? '#A5A8F5' : '#6C6FEF',
                    background: 'none', border: 'none',
                    borderRadius: 10, padding: '6px 10px',
                    cursor: creatingForGenerate ? 'not-allowed' : 'pointer',
                    opacity: creatingForGenerate ? 0.6 : 1,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!creatingForGenerate) { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#EEF0FE'; b.style.color = '#4F52C2'; } }}
                  onMouseLeave={(e) => { if (!creatingForGenerate) { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'none'; b.style.color = '#6C6FEF'; } }}
                >
                  <Sparkles style={{ width: 15, height: 15 }} />
                  {creatingForGenerate
                    ? t('classroom.unitSelector.creating')
                    : t('classroom.unitSelector.generate')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Edit Course Modal ─────────────────────────────────────────────── */}
      <EditCourseModal
        open={editCourseOpen}
        onClose={() => setEditCourseOpen(false)}
        onSave={async (data) => {
          await onEditCourse?.(data);
        }}
        onDelete={() => { onDeleteCourse?.(); setEditCourseOpen(false); onClose(); }}
        initialTitle={courseTitle}
        initialCoverUrl={courseThumbnailUrl}
        initialDescription={editCourseDescription ?? ''}
        initialLanguage={editCourseLanguage ?? 'en'}
        initialSectionsEnabled={editCourseSectionsEnabled ?? false}
        initialAge={editCourseAge ?? ''}
        initialLevel={editCourseLevel ?? ''}
        initialType={editCourseType ?? ''}
      />

      {/* ── Edit Unit Modal ───────────────────────────────────────────────── */}
      <EditUnitModal
        open={editingUnit !== null}
        onClose={() => setEditingUnit(null)}
        onSave={(data) => {
          if (editingUnit) onEditUnit?.(editingUnit, data);
          setEditingUnit(null);
        }}
        onDelete={() => {
          if (editingUnit) onDeleteUnit?.(editingUnit);
          setEditingUnit(null);
        }}
        initialTitle={editingUnit?.title ?? ''}
        initialDescription={editingUnit?.description ?? ''}
        initialCoverUrl={editingUnit?.cover_url}
      />

      {/* ── Edit Outline Modal ────────────────────────────────────────────── */}
      <EditOutlineModal
        open={editOutlineOpen}
        outline={courseOutline}
        courseId={courseId ?? null}
        onClose={() => setEditOutlineOpen(false)}
        onSave={(updatedOutline) => {
          onEditOutline?.(updatedOutline);
          setEditOutlineOpen(false);
        }}
      />

      {/* ── Create Unit Modal ─────────────────────────────────────────────── */}
      <CreateUnitModal
        open={createUnitOpen}
        onClose={() => setCreateUnitOpen(false)}
        onCreate={async (data) => {
          try {
            await onCreateUnitData?.(data);
            onCreateUnit?.(null);
            setCreateUnitOpen(false);
          } catch {
            // Error toast lives in ClassroomPage; keep CreateUnitModal open for retry.
          }
        }}
      />

      {/* ── Generate Unit Modal ───────────────────────────────────────────── */}
      {generateTarget && (
        <GenerateUnitModal
          unitId={generateTarget.id}
          unitTitle={generateTarget.title}
          onClose={() => setGenerateTarget(null)}
          onSuccess={(result) => {
            onGenerateSuccess?.(result);
            setGenerateTarget(null);
          }}
        />
      )}
    </>
  );
}