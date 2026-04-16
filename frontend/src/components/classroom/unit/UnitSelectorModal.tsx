/**
 * UnitSelectorModal.tsx  (v4 — with EditUnitModal)
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

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  X,
  Search,
  BookOpen,
  Share2,
  MoreHorizontal,
  Filter,
  Plus,
  Sparkles,
  Pencil,
} from 'lucide-react';
import UnitListItem from './UnitListItem';
import EditCourseModal, { type CourseEditData } from './EditCourseModal';
import EditUnitModal, { type UnitEditData } from './EditUnitModal';
import CreateUnitModal, { type CreateUnitData } from './CreateUnitModal';
import GenerateUnitModal from '../unit/GenerateUnitModal';
import EditOutlineModal from './EditOutlineModal';

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
  onCreateUnitData?: (data: CreateUnitData) => void;
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
  onGenerateSuccess?: (result: { segments_created: number; exercises_created: number; segments: any[] }) => void;
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
  onEditOutline?: (updatedOutline: any) => void;
};

type ActiveTab = 'contents' | 'description';

// ─── CourseGenerationPanel ────────────────────────────────────────────────────
// Shown inside UnitSelectorModal when an AI outline is present and the teacher
// needs to review the structure before triggering full content generation.

type UnitGenStatus = 'pending' | 'generating' | 'done' | 'error';

function UnitStatusIcon({ status }: { status: UnitGenStatus | undefined }) {
  if (!status || status === 'pending') {
    return (
      <span
        style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #D1D5DB', display: 'inline-block', flexShrink: 0 }}
      />
    );
  }
  if (status === 'generating') {
    return (
      <span
        style={{
          width: 20, height: 20, borderRadius: '50%',
          border: '2px solid #6C6FEF',
          borderTopColor: 'transparent',
          display: 'inline-block',
          flexShrink: 0,
          animation: 'usm-spin 0.75s linear infinite',
        }}
      />
    );
  }
  if (status === 'done') {
    return (
      <span
        style={{
          width: 20, height: 20, borderRadius: '50%',
          background: '#6C6FEF',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
          <path d="M3 8l3.5 3.5 6.5-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  // error
  return (
    <span
      style={{
        width: 20, height: 20, borderRadius: '50%',
        background: '#FEE2E2',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
        <path d="M4 4l8 8M12 4l-8 8" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </span>
  );
}

interface CourseGenerationPanelProps {
  outline: any;
  /** unit.id → status  (only for DB-persisted units; outline units have no id yet) */
  unitStatuses: Record<number, UnitGenStatus>;
  units: any[];        // DB units from useClassroom — used to match by order_index
  isGenerating: boolean;
  onStart: () => void;
  /** Opens the EditOutlineModal overlay */
  onEditOutline?: () => void;
}

function CourseGenerationPanel({
  outline,
  unitStatuses,
  units,
  isGenerating,
  onStart,
  onEditOutline,
}: CourseGenerationPanelProps) {
  const outlineUnits: any[] = outline?.units ?? [];
  const totalUnits     = outlineUnits.length;
  const doneCount      = Object.values(unitStatuses).filter((s) => s === 'done').length;
  const allDone        = isGenerating === false && doneCount > 0 && doneCount >= units.length;

  // Map DB units by order_index so we can look up their id from the outline index
  const dbUnitByIndex = React.useMemo(() => {
    const map: Record<number, any> = {};
    units.forEach((u) => { if (typeof u.order_index === 'number') map[u.order_index] = u; });
    return map;
  }, [units]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* ── Spinning keyframe (injected once) */}
      <style>{`
        @keyframes usm-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Header strip */}
      <div style={{
        background: '#EEF0FE',
        borderBottom: '1px solid #E0E3FD',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
          <path d="M10 2l2.39 4.84L18 7.64l-4 3.9.94 5.5L10 14.27 5.06 17.04 6 11.54 2 7.64l5.61-.8L10 2z"
            fill="#6C6FEF" stroke="#6C6FEF" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#4F52C2', lineHeight: 1.3 }}>
            {allDone
              ? `Course generated — ${doneCount} unit${doneCount !== 1 ? 's' : ''} ready`
              : isGenerating
                ? `Generating… ${doneCount} / ${units.length} unit${units.length !== 1 ? 's' : ''} done`
                : `AI outline ready — ${totalUnits} unit${totalUnits !== 1 ? 's' : ''}`
            }
          </p>
          {!isGenerating && !allDone && (
            <p style={{ margin: 0, fontSize: 11, color: '#6C6FEF', marginTop: 2 }}>
              Review the structure below, then click <strong>Generate Course</strong>.
            </p>
          )}
        </div>

        {/* Edit Outline button — only before generation starts */}
        {!isGenerating && !allDone && onEditOutline && (
          <button
            onClick={onEditOutline}
            style={{
              display:       'inline-flex',
              alignItems:    'center',
              gap:            5,
              padding:       '5px 11px',
              borderRadius:   8,
              border:        '1.5px solid #A5A8F5',
              background:    '#FFFFFF',
              color:         '#4F52C2',
              fontSize:       11,
              fontWeight:     700,
              cursor:        'pointer',
              flexShrink:     0,
              transition:    'background 0.15s, border-color 0.15s',
              whiteSpace:    'nowrap',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#EEF0FE';
              e.currentTarget.style.borderColor = '#6C6FEF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FFFFFF';
              e.currentTarget.style.borderColor = '#A5A8F5';
            }}
          >
            <Pencil size={11} />
            Edit Outline
          </button>
        )}

        {/* Progress bar */}
        {(isGenerating || allDone) && units.length > 0 && (
          <div style={{
            width: 72, height: 6, borderRadius: 3,
            background: '#C7CAFB', overflow: 'hidden', flexShrink: 0,
          }}>
            <div style={{
              height: '100%',
              width: `${Math.round((doneCount / units.length) * 100)}%`,
              background: '#6C6FEF',
              borderRadius: 3,
              transition: 'width 0.4s ease',
            }} />
          </div>
        )}
      </div>

      {/* ── Scrollable unit list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 0', overscrollBehavior: 'contain' }}>
        {outlineUnits.map((outlineUnit: any, idx: number) => {
          const dbUnit   = dbUnitByIndex[idx];
          const status   = dbUnit ? (unitStatuses[dbUnit.id] ?? (isGenerating ? 'pending' : undefined)) : undefined;
          const sections: any[] = outlineUnit.sections ?? [];

          return (
            <div
              key={idx}
              style={{
                background: '#FFFFFF',
                border: '1px solid',
                borderColor: status === 'generating' ? '#A5A8F5' : status === 'done' ? '#C7CAFB' : '#E5E7EB',
                borderRadius: 12,
                padding: '11px 14px',
                marginBottom: 10,
                transition: 'border-color 0.25s',
              }}
            >
              {/* Unit row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <UnitStatusIcon status={status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 600,
                    color: status === 'done' ? '#4F52C2' : '#1E293B',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    Unit {idx + 1} · {outlineUnit.title}
                  </p>
                  {outlineUnit.description && (
                    <p style={{
                      margin: '2px 0 0', fontSize: 11, color: '#6B7280',
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {outlineUnit.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Section chips */}
              {sections.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, marginLeft: 30 }}>
                  {sections.map((sec: any, sIdx: number) => (
                    <span
                      key={sIdx}
                      style={{
                        background: '#F7F7FA',
                        border: '1px solid #E5E7EB',
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 10,
                        color: '#6B7280',
                        fontWeight: 500,
                      }}
                    >
                      {sec.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ height: 8 }} />
      </div>

      {/* ── CTA footer */}
      {!allDone && (
        <div style={{
          borderTop: '1px solid #EEF0FE',
          padding: '12px 20px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#FFFFFF',
        }}>
          <button
            disabled={isGenerating}
            onClick={onStart}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: isGenerating ? '#A5A8F5' : '#6C6FEF',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 10,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              boxShadow: isGenerating ? 'none' : '0 2px 8px rgba(108,111,239,0.28)',
            }}
            onMouseEnter={(e) => { if (!isGenerating) (e.currentTarget as HTMLButtonElement).style.background = '#4F52C2'; }}
            onMouseLeave={(e) => { if (!isGenerating) (e.currentTarget as HTMLButtonElement).style.background = '#6C6FEF'; }}
          >
            {isGenerating ? (
              <>
                <span style={{
                  width: 13, height: 13, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: '#FFFFFF',
                  display: 'inline-block',
                  animation: 'usm-spin 0.75s linear infinite',
                }} />
                Generating…
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <path d="M8 1.5l1.91 3.87L14 6.35l-3 2.93.71 4.15L8 11.5l-3.71 1.93.71-4.15L2 6.35l4.09-.98L8 1.5z"
                    fill="#fff" stroke="#fff" strokeWidth="0.8" strokeLinejoin="round"/>
                </svg>
                Generate Course
              </>
            )}
          </button>
          {!isGenerating && (
            <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF' }}>
              This will fill all {totalUnits} units with AI content.
            </p>
          )}
        </div>
      )}

      {allDone && (
        <div style={{
          borderTop: '1px solid #EEF0FE',
          padding: '12px 20px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#FFFFFF',
        }}>
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
            <circle cx="10" cy="10" r="9" fill="#EEF0FE"/>
            <path d="M6 10l2.5 2.5 5.5-5" stroke="#6C6FEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p style={{ margin: 0, fontSize: 12, color: '#4F52C2', fontWeight: 600 }}>
            All units generated! Select a unit below to start teaching.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── GenerationProgressBanner ─────────────────────────────────────────────────
// Compact sticky banner shown at the top of the units list while background
// generation is in progress. Disappears once all units are done.

interface GenerationProgressBannerProps {
  unitStatuses: Record<number, UnitGenStatus>;
  units: any[];
  isGenerating: boolean;
}

function GenerationProgressBanner({ unitStatuses, units, isGenerating }: GenerationProgressBannerProps) {
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
            ? `All ${total} units generated — click any unit to start teaching`
            : hasError
              ? `Generating… ${doneCount}/${total} done (some errors)`
              : `Generating in background… ${doneCount}/${total} units done`
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
  if (url) {
    return (
      <img
        src={url}
        alt="Course thumbnail"
        className="h-16 w-16 shrink-0 rounded-xl object-cover"
      />
    );
  }
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-teal-500 text-white">
      <span className="text-2xl font-bold select-none">{initial.toUpperCase()}</span>
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
  onAddUnit,
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
  onEditOutline,
}: UnitSelectorModalProps) {
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
    return units.filter((u) => u.title?.toLowerCase().includes(q));
  }, [units, query]);

  // Once the SSE stream has started (or produced any statuses), switch from the
  // outline-review panel to the normal units list so units are immediately clickable.
  const generationStarted = isGeneratingCourse || Object.keys(unitGenerationStatuses).length > 0;

  if (!open) return null;

  const handleSelect = (unit: any) => {
    onSelectUnit(unit);
    onClose();
  };

  const initial = courseTitle?.[0] ?? 'C';

  // Teacher action callbacks passed to UnitListItem
  const teacherCallbacks = isTeacher
    ? {
        showActions: true,
        onEdit:     (unit: any) => setEditingUnit(unit),   // ← opens EditUnitModal
        onGenerate: (unit: any) => setGenerateTarget({ id: unit.id, title: unit.title ?? '' }),
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
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={courseTitle}
        ref={panelRef}
        className="fixed z-50 inset-x-4 top-[4vh] mx-auto max-w-2xl flex flex-col bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden"
        style={{ height: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Close button ─────────────────────────────────────────────────── */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ── Course header ─────────────────────────────────────────────────── */}
        <div className="flex items-start gap-4 px-5 pt-5 pb-4">
          <CourseThumbnail url={courseThumbnailUrl} initial={initial} />

          <div className="flex-1 min-w-0 pr-8">
            <h2 className="text-[16px] font-bold text-slate-900 leading-snug truncate">
              {courseTitle}
            </h2>
            {courseSubtitle && (
              <p className="mt-0.5 text-[12px] text-slate-500 leading-snug line-clamp-2">
                {courseSubtitle}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={onShareCourse}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              >
                <Share2 className="h-3.5 w-3.5" />
                Поделиться
              </button>

              {isTeacher && (
                <div className="relative" ref={courseMenuRef}>
                  <button
                    onClick={() => setCourseMenuOpen((v) => !v)}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                    aria-label="More course options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {courseMenuOpen && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                        onClick={() => { setCourseMenuOpen(false); setEditCourseOpen(true); }}
                      >
                        Настройки курса
                      </button>
                      <button className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
                        Скопировать курс
                      </button>
                      <div className="my-1 border-t border-slate-100" />
                      <button className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        Удалить курс
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="flex border-b border-slate-200 px-5">
          {(['contents', 'description'] as const).map((tab) => {
            const label = tab === 'contents' ? 'Содержание' : 'Описание';
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'mr-6 pb-2.5 pt-1 text-[13px] font-semibold transition-colors focus:outline-none',
                  active
                    ? 'text-teal-600 border-b-2 border-teal-500 -mb-px'
                    : 'text-slate-500 hover:text-slate-700 border-b-2 border-transparent',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Tab body ─────────────────────────────────────────────────────── */}
        {/* Generation panel — shown only BEFORE generation starts (outline review) */}
        {courseOutline && !generationStarted && activeTab === 'contents' ? (
          <CourseGenerationPanel
            outline={courseOutline}
            unitStatuses={unitGenerationStatuses}
            units={units}
            isGenerating={isGeneratingCourse}
            onStart={() => onStartCourseGeneration?.()}
            onEditOutline={onEditOutline ? () => setEditOutlineOpen(true) : undefined}
          />
        ) : activeTab === 'description' ? (
          <div className="flex flex-1 items-center justify-center py-16 text-[13px] text-slate-400">
            Description coming soon
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
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Поиск уроков"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
                  aria-label="Search units"
                />
              </div>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400">
                <Filter className="h-3.5 w-3.5" />
                Фильтр
              </button>
            </div>

            {/* Unit list */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                  <BookOpen className="mb-3 h-10 w-10 opacity-20" />
                  <p className="text-sm font-medium">
                    {query ? 'Нет совпадений' : 'Нет доступных уроков'}
                  </p>
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="mt-2 text-xs text-teal-600 hover:underline"
                    >
                      Сбросить поиск
                    </button>
                  )}
                </div>
              ) : (
                <ul
                  className="divide-y divide-slate-100 py-1"
                  role="listbox"
                  aria-label="Available units"
                >
                  {filtered.map((unit) => {
                    const isCurrent   = String(unit.id) === String(currentUnitId);
                    const isCompleted = completedUnitIds?.has(unit.id) ?? false;
                    const isLocked    = unit.is_visible_to_students === false;
                    const genStatus   = unitGenerationStatuses[unit.id];
                    const isGeneratedDone = genStatus === 'done';
                    const isGeneratingNow = genStatus === 'generating' || genStatus === 'pending';

                    return (
                      <li key={unit.id} style={{ position: 'relative', listStyle: 'none' }}>
                        <UnitListItem
                          unit={unit}
                          isCurrent={isCurrent}
                          isCompleted={isCompleted}
                          isLocked={isLocked}
                          onClick={() => !isLocked && handleSelect(unit)}
                          {...teacherCallbacks}
                        />

                        {/* ── "Generated" badge — shown when AI content is ready ── */}
                        {isGeneratedDone && (
                          <span
                            style={{
                              position: 'absolute',
                              top: '50%',
                              right: 48,
                              transform: 'translateY(-50%)',
                              pointerEvents: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: '#EEF0FE',
                              color: '#4F52C2',
                              fontSize: 10,
                              fontWeight: 700,
                              borderRadius: 20,
                              padding: '3px 9px',
                              letterSpacing: '0.02em',
                              whiteSpace: 'nowrap',
                              boxShadow: '0 1px 3px rgba(108,111,239,0.10)',
                            }}
                          >
                            {/* sparkle dot */}
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path
                                d="M4 0.5L4.9 3.1H7.5L5.4 4.7L6.2 7.5L4 5.8L1.8 7.5L2.6 4.7L0.5 3.1H3.1L4 0.5Z"
                                fill="#6C6FEF"
                              />
                            </svg>
                            Generated
                          </span>
                        )}

                        {/* ── Pulsing dot — shown while still generating ── */}
                        {isGeneratingNow && (
                          <span
                            style={{
                              position: 'absolute',
                              top: '50%',
                              right: 52,
                              transform: 'translateY(-50%)',
                              pointerEvents: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              color: '#6C6FEF',
                              fontSize: 10,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#6C6FEF',
                                display: 'inline-block',
                                animation: 'usm-pulse 1.2s ease-in-out infinite',
                              }}
                            />
                            Generating…
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer (teacher only) */}
            {isTeacher && (
              <div className="flex items-center gap-4 border-t border-slate-100 px-5 py-3">
                <button
                  onClick={() => { setCreateUnitOpen(true); onAddUnit?.(); onCreateUnit?.('manual'); }}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-600 hover:text-teal-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded"
                >
                  <Plus className="h-4 w-4" />
                  Создать урок
                </button>
                <button
                  disabled={creatingForGenerate}
                  onClick={async () => {
                    if (onCreateAndGenerate) {
                      // Create a brand-new unit, then open GenerateUnitModal for it
                      setCreatingForGenerate(true);
                      try {
                        const target = await onCreateAndGenerate();
                        if (target) setGenerateTarget(target);
                      } finally {
                        setCreatingForGenerate(false);
                      }
                    } else if (generateUnitId) {
                      // Legacy fallback: generate into an already-selected unit
                      setGenerateTarget({ id: generateUnitId, title: generateUnitTitle ?? '' });
                    } else {
                      setCreateUnitOpen(true);
                      onGenerateUnit?.();
                      onCreateUnit?.('ai');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-600 hover:text-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded"
                >
                  <Sparkles className="h-4 w-4" />
                  {creatingForGenerate ? 'Создание…' : 'Сгенерировать'}
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
        onCreate={(data) => {
          onCreateUnitData?.(data);
          onCreateUnit?.(null);
          setCreateUnitOpen(false);
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