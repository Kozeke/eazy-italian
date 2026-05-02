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
  // Provides localized labels for the course generation panel.
  const { t } = useTranslation();
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
              ? t('classroom.unitSelector.courseGeneration.generatedReady', { count: doneCount })
              : isGenerating
                ? t('classroom.unitSelector.courseGeneration.generatingProgress', { done: doneCount, total: units.length })
                : t('classroom.unitSelector.courseGeneration.outlineReady', { count: totalUnits })}
          </p>
          {!isGenerating && !allDone && (
            <p style={{ margin: 0, fontSize: 11, color: '#6C6FEF', marginTop: 2 }}>
              {t('classroom.unitSelector.courseGeneration.reviewBeforeGeneratePrefix')} <strong>{t('classroom.unitSelector.courseGeneration.generateCourseButton')}</strong>.
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
            {t('classroom.unitSelector.courseGeneration.editOutline')}
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
                    {t('classroom.unitSelector.unitLabel', { index: idx + 1, title: outlineUnit.title })}
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
                {t('classroom.unitSelector.courseGeneration.generatingShort')}
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <path d="M8 1.5l1.91 3.87L14 6.35l-3 2.93.71 4.15L8 11.5l-3.71 1.93.71-4.15L2 6.35l4.09-.98L8 1.5z"
                    fill="#fff" stroke="#fff" strokeWidth="0.8" strokeLinejoin="round"/>
                </svg>
                {t('classroom.unitSelector.courseGeneration.generateCourseButton')}
              </>
            )}
          </button>
          {!isGenerating && (
            <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF' }}>
              {t('classroom.unitSelector.courseGeneration.fillAllUnits', { count: totalUnits })}
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
            {t('classroom.unitSelector.courseGeneration.allUnitsGenerated')}
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
  onEditOutline,
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

  const initial = courseTitle?.[0] ?? t('classroom.unitSelector.defaultCourseInitial');

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
              ) : (
                <ul
                  style={{ listStyle: 'none', margin: 0, padding: '4px 0', borderTop: 'none' }}
                  role="listbox"
                  aria-label={t('classroom.unitSelector.availableUnitsAria')}
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
                            {t('classroom.unitSelector.generatedBadge')}
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
                            {t('classroom.unitSelector.generatingBadge')}
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