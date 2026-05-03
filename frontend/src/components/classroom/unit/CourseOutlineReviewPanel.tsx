/**
 * CourseOutlineReviewPanel.tsx
 * ==============================
 * Shown for the FULL outline-based course creation flow:
 *   • Before generation  — review, edit, then click Generate
 *   • During generation  — live per-unit status (pending / generating / done / error)
 *   • After generation   — click any done unit card to open it
 *
 * The parent (UnitSelectorModal) no longer swaps this panel out when
 * generation starts — it stays visible throughout and handles all states.
 *
 * Features
 * ─────────
 * • Inline editing of unit title (pencil button, hover-aware via React state)
 *   and description (click-to-edit textarea)
 * • Lazy-loads segment plan per unit on expand via POST /units/{id}/plan
 * • Plan is cached per {title, description} — re-fetched ONLY when those
 *   values actually changed after a save, never on a plain expand/collapse
 * • Done units show an "Open unit →" pill; clicking it calls onSelectUnit
 * • Auto-saves edits to PATCH /course-builder/{courseId}/outline on blur
 *
 * Design tokens: Primary #6C6FEF · Dark #4F52C2 · Tint #EEF0FE · Bg #F7F7FA
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────

const DS = {
  primary:     '#6C6FEF',
  primaryDark: '#4F52C2',
  tint:        '#EEF0FE',
  tintStrong:  '#E0E3FD',
  bg:          '#F7F7FA',
  white:       '#FFFFFF',
  border:      '#E5E7EB',
  borderFocus: '#A5A8F5',
  textMain:    '#1E293B',
  textMuted:   '#6B7280',
  textSubtle:  '#9CA3AF',
  danger:      '#EF4444',
  dangerBg:    '#FEE2E2',
  successBg:   '#D1FAE5',
  successText: '#065F46',
} as const;

// ─── API helpers ──────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token') ?? '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface SegmentPlanItem {
  index: number;
  title: string;
  focus: string;
  is_intro: boolean;
}

async function fetchSegmentPlan(
  unitId: number,
  topic: string,
  description: string,
  level: string,
  language: string,
): Promise<SegmentPlanItem[]> {
  const res = await fetch(`/api/v1/units/${unitId}/plan`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      topic,
      description: description || undefined,
      level,
      language,
      num_segments: 3,
      exercise_types: ['drag_to_gap', 'match_pairs'],
      instruction_language: 'english',
    }),
  });
  if (!res.ok) throw new Error(`Plan fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.segments ?? []) as SegmentPlanItem[];
}

async function patchOutline(
  courseId: number,
  units: Array<{ title: string; description: string; sections: any[] }>,
): Promise<void> {
  const res = await fetch(`/api/v1/course-builder/${courseId}/outline`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ units }),
  });
  if (!res.ok) throw new Error(`Patch outline failed: ${res.status}`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type UnitGenStatus = 'pending' | 'generating' | 'done' | 'error';

export interface CourseOutlineReviewPanelProps {
  outline: any;
  units: any[];
  unitStatuses: Record<number, UnitGenStatus>;
  isGenerating: boolean;
  courseId: number | null;
  level: string;
  language: string;
  onStart: () => void;
  onEditOutline?: () => void;
  onOutlineChanged?: (updatedOutline: any) => void;
  /**
   * Called when the user clicks "Open unit →" on a done unit card.
   * Parent should navigate to the unit and close the modal.
   */
  onSelectUnit?: (unit: any) => void;
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: UnitGenStatus | undefined }) {
  if (status === 'generating') {
    return (
      <span style={{
        width: 22, height: 22, borderRadius: '50%',
        border: `2.5px solid ${DS.primary}`,
        borderTopColor: 'transparent',
        display: 'inline-block', flexShrink: 0,
        animation: 'corp-spin 0.7s linear infinite',
      }} />
    );
  }
  if (status === 'done') {
    return (
      <span style={{
        width: 22, height: 22, borderRadius: '50%',
        background: DS.primary,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
          <path d="M3 8l3.5 3.5 6.5-7" stroke="#fff" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span style={{
        width: 22, height: 22, borderRadius: '50%',
        background: DS.dangerBg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke={DS.danger} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  // pending or undefined
  return (
    <span style={{
      width: 22, height: 22, borderRadius: '50%',
      border: `2px solid ${DS.border}`,
      display: 'inline-block', flexShrink: 0,
    }} />
  );
}

// ─── Segment plan row ─────────────────────────────────────────────────────────

function SegmentPlanRow({ item }: { item: SegmentPlanItem }) {
  const isIntro = item.is_intro;
  return (
    <div style={{
      display: 'flex', gap: 10,
      padding: '8px 0',
      borderBottom: `1px solid ${DS.bg}`,
    }}>
      <span style={{
        flexShrink: 0,
        width: 22, height: 22, borderRadius: 6,
        background: isIntro ? DS.tint : DS.bg,
        border: `1px solid ${isIntro ? DS.borderFocus : DS.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700,
        color: isIntro ? DS.primary : DS.textMuted,
        marginTop: 1,
      }}>
        {item.index + 1}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 600,
          color: isIntro ? DS.primary : DS.textMain,
          lineHeight: 1.35,
        }}>
          {isIntro && (
            <span style={{
              display: 'inline-block',
              fontSize: 9, fontWeight: 700,
              color: DS.primary, background: DS.tint,
              border: `1px solid ${DS.borderFocus}`,
              borderRadius: 4, padding: '1px 5px',
              marginRight: 5, verticalAlign: 'middle',
              lineHeight: 1.5, letterSpacing: '0.03em',
            }}>
              INTRO
            </span>
          )}
          {item.title}
        </p>
        {item.focus && (
          <p style={{
            margin: '3px 0 0', fontSize: 11, color: DS.textMuted,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as any,
            overflow: 'hidden',
          }}>
            {item.focus.split('\n')[0]}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Unit card ────────────────────────────────────────────────────────────────

interface UnitCardProps {
  outlineUnit: any;
  dbUnit: any | undefined;
  index: number;
  status: UnitGenStatus | undefined;
  isGenerating: boolean;
  level: string;
  language: string;
  courseId: number | null;
  allOutlineUnits: any[];
  onOutlineChanged?: (updatedOutline: any) => void;
  onSelectUnit?: (unit: any) => void;
}

function UnitCard({
  outlineUnit,
  dbUnit,
  index,
  status,
  isGenerating,
  level,
  language,
  courseId,
  allOutlineUnits,
  onOutlineChanged,
  onSelectUnit,
}: UnitCardProps) {
  const [expanded,     setExpanded]     = useState(false);
  const [hovered,      setHovered]      = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc,  setEditingDesc]  = useState(false);
  const [title,        setTitle]        = useState<string>(outlineUnit?.title ?? '');
  const [description,  setDescription] = useState<string>(outlineUnit?.description ?? '');
  const [segmentPlans, setSegmentPlans] = useState<SegmentPlanItem[] | null>(null);
  const [planLoading,  setPlanLoading]  = useState(false);
  const [planError,    setPlanError]    = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);

  /**
   * Records the {title, description} inputs that produced the cached plan.
   * New fetch triggered ONLY when saved values differ — plain expand/collapse
   * never causes a re-fetch.
   */
  const planGeneratedFor = useRef<{ title: string; description: string } | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const descRef  = useRef<HTMLTextAreaElement>(null);

  // Sync when outline changes externally (EditOutlineModal save, etc.)
  useEffect(() => {
    const nextTitle = outlineUnit?.title ?? '';
    const nextDesc  = outlineUnit?.description ?? '';
    setTitle(nextTitle);
    setDescription(nextDesc);
    if (
      planGeneratedFor.current !== null &&
      (planGeneratedFor.current.title !== nextTitle ||
        planGeneratedFor.current.description !== nextDesc)
    ) {
      setSegmentPlans(null);
      planGeneratedFor.current = null;
    }
  }, [outlineUnit?.title, outlineUnit?.description]);

  useEffect(() => { if (editingTitle) titleRef.current?.focus(); }, [editingTitle]);
  useEffect(() => { if (editingDesc)  descRef.current?.focus();  }, [editingDesc]);

  const sections: any[] = outlineUnit?.sections ?? [];
  const isDone   = status === 'done';
  const isActive = status === 'generating';

  // ── Lazy plan load — cache-hit check ─────────────────────────────────────
  const loadPlan = useCallback(async () => {
    if (!dbUnit?.id || planLoading) return;

    const curTitle = title.trim() || outlineUnit?.title || `Unit ${index + 1}`;
    const curDesc  = description.trim() || outlineUnit?.description || '';

    if (
      segmentPlans !== null &&
      planGeneratedFor.current?.title       === curTitle &&
      planGeneratedFor.current?.description === curDesc
    ) {
      return; // cache hit — same inputs, skip the request
    }

    setPlanLoading(true);
    setPlanError(null);
    try {
      const plans = await fetchSegmentPlan(dbUnit.id, curTitle, curDesc, level, language);
      setSegmentPlans(plans);
      planGeneratedFor.current = { title: curTitle, description: curDesc };
    } catch (err: any) {
      setPlanError(err?.message ?? 'Failed to load plan');
    } finally {
      setPlanLoading(false);
    }
  }, [dbUnit?.id, planLoading, segmentPlans, title, description, outlineUnit, index, level, language]);

  const handleToggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) loadPlan();
      return next;
    });
  };

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const saveChanges = useCallback(async (newTitle: string, newDesc: string) => {
    if (!courseId || isGenerating) return;
    setSaving(true);
    try {
      await patchOutline(
        courseId,
        allOutlineUnits.map((u: any, i: number) =>
          i === index
            ? { title: newTitle, description: newDesc, sections: u.sections ?? [] }
            : { title: u.title ?? '', description: u.description ?? '', sections: u.sections ?? [] },
        ),
      );
      onOutlineChanged?.({
        units: allOutlineUnits.map((u: any, i: number) =>
          i === index ? { ...u, title: newTitle, description: newDesc } : u,
        ),
      });
      // Invalidate plan cache ONLY when inputs changed
      if (
        planGeneratedFor.current !== null &&
        (planGeneratedFor.current.title !== newTitle ||
          planGeneratedFor.current.description !== newDesc)
      ) {
        setSegmentPlans(null);
        planGeneratedFor.current = null;
      }
    } catch { /* silently ignore — local state is still correct */ }
    finally { setSaving(false); }
  }, [courseId, isGenerating, index, allOutlineUnits, onOutlineChanged]);

  const handleTitleBlur = () => {
    setEditingTitle(false);
    const trimmed = title.trim() || outlineUnit?.title || `Unit ${index + 1}`;
    setTitle(trimmed);
    void saveChanges(trimmed, description);
  };

  const handleDescBlur = () => {
    setEditingDesc(false);
    void saveChanges(title, description);
  };

  // ── Card style ────────────────────────────────────────────────────────────
  const borderColor = isActive
    ? DS.primary
    : isDone
      ? '#C7CAFB'
      : hovered && !isGenerating
        ? DS.borderFocus
        : DS.border;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isDone ? '#FAFBFF' : DS.white,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 14,
        marginBottom: 10,
        overflow: 'hidden',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: isActive
          ? '0 0 0 3px rgba(108,111,239,0.12)'
          : hovered && !isGenerating
            ? '0 2px 8px rgba(108,111,239,0.08)'
            : 'none',
      }}
    >
      {/* ── Card header ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 14px',
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={handleToggle}
      >
        {/* Index badge */}
        <span style={{
          flexShrink: 0,
          width: 26, height: 26, borderRadius: 8,
          background: isDone ? DS.tint : DS.bg,
          border: `1px solid ${isDone ? DS.borderFocus : DS.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          color: isDone ? DS.primary : DS.textMuted,
          marginTop: 1,
        }}>
          {index + 1}
        </span>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            {editingTitle ? (
              <input
                ref={titleRef}
                type="text"
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') { setTitle(outlineUnit?.title ?? ''); setEditingTitle(false); }
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1, fontSize: 13, fontWeight: 600, color: DS.textMain,
                  border: `1.5px solid ${DS.borderFocus}`,
                  borderRadius: 7, padding: '3px 8px',
                  outline: 'none', background: DS.white, fontFamily: 'inherit',
                }}
              />
            ) : (
              <p style={{
                margin: 0, fontSize: 13, fontWeight: 600,
                color: isDone ? DS.primaryDark : DS.textMain,
                lineHeight: 1.3, flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {title || `Unit ${index + 1}`}
              </p>
            )}

            {/* Pencil button — always rendered, opacity driven by React hovered state */}
            {!isGenerating && !editingTitle && !isDone && (
              <button
                title="Edit unit title"
                onClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 7px', borderRadius: 7,
                  border: `1px solid ${hovered ? DS.borderFocus : 'transparent'}`,
                  background: hovered ? DS.tint : 'transparent',
                  color: hovered ? DS.primary : DS.textSubtle,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  opacity: hovered ? 1 : 0.4,
                  transition: 'opacity 0.15s, background 0.15s, border-color 0.15s, color 0.15s',
                }}
              >
                <Pencil size={11} />
                {hovered && <span>Edit</span>}
              </button>
            )}

            {/* Saving spinner */}
            {saving && (
              <span style={{ flexShrink: 0, color: DS.primary, display: 'flex' }}>
                <Loader2 size={13} style={{ animation: 'corp-spin 0.7s linear infinite' }} />
              </span>
            )}
          </div>

          {/* Description */}
          {editingDesc ? (
            <textarea
              ref={descRef}
              value={description}
              maxLength={300}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescBlur}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setDescription(outlineUnit?.description ?? ''); setEditingDesc(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', fontSize: 11, color: DS.textMuted,
                border: `1.5px solid ${DS.borderFocus}`,
                borderRadius: 7, padding: '5px 8px',
                outline: 'none', background: DS.white,
                resize: 'vertical', minHeight: 50,
                fontFamily: 'inherit', lineHeight: 1.45, boxSizing: 'border-box',
              }}
            />
          ) : (
            <p
              title={!isGenerating && !isDone ? 'Click to edit description' : undefined}
              onClick={(e) => {
                if (!isGenerating && !isDone) { e.stopPropagation(); setEditingDesc(true); }
              }}
              style={{
                margin: 0, fontSize: 11, color: DS.textMuted,
                lineHeight: 1.45,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as any,
                overflow: 'hidden',
                cursor: !isGenerating && !isDone ? 'text' : 'default',
                minHeight: description ? undefined : 14,
              }}
            >
              {description || (
                <span style={{ color: DS.textSubtle, fontStyle: 'italic' }}>
                  {isDone ? '' : 'Click to add description…'}
                </span>
              )}
            </p>
          )}

          {/* Section chips */}
          {sections.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
              {sections.map((sec: any, sIdx: number) => (
                <span key={sIdx} style={{
                  background: DS.bg, border: `1px solid ${DS.border}`,
                  borderRadius: 6, padding: '2px 8px',
                  fontSize: 10, color: DS.textMuted, fontWeight: 500,
                }}>
                  {sec.title}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right side: status + chevron OR open-unit button */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0, paddingTop: 1,
        }}>
          <StatusIcon status={status} />

          {/*
            Done units: show "Open →" button that navigates to the unit.
            Replaces the chevron entirely — the plan expand is less relevant once
            content has been generated.
          */}
          {isDone && onSelectUnit && dbUnit ? (
            <button
              title="Open this unit"
              onClick={(e) => { e.stopPropagation(); onSelectUnit(dbUnit); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 7,
                border: `1.5px solid ${DS.borderFocus}`,
                background: hovered ? DS.tint : DS.white,
                color: DS.primary,
                fontSize: 11, fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = DS.tintStrong; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = hovered ? DS.tint : DS.white; }}
            >
              Open <ArrowRight size={11} />
            </button>
          ) : (
            <span style={{ color: DS.textSubtle }}>
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </span>
          )}
        </div>
      </div>

      {/* ── Segment plan (expand, not shown for done units) ───────────────── */}
      {expanded && !isDone && (
        <div style={{
          borderTop: `1px solid ${DS.bg}`,
          padding: '10px 14px 10px 50px',
          background: '#FAFBFF',
        }}>
          <p style={{
            margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: DS.textSubtle,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Layers size={10} />
            Segment Plan
          </p>

          {planLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', color: DS.textMuted }}>
              <Loader2 size={14} style={{ animation: 'corp-spin 0.7s linear infinite' }} />
              <span style={{ fontSize: 12 }}>Planning segments…</span>
            </div>
          )}

          {planError && !planLoading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 8,
              background: DS.dangerBg, color: DS.danger, fontSize: 11,
            }}>
              <AlertCircle size={13} />
              <span style={{ flex: 1 }}>Couldn't load plan — will generate with default segments</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSegmentPlans(null);
                  planGeneratedFor.current = null;
                  setPlanError(null);
                  void loadPlan();
                }}
                style={{
                  flexShrink: 0, padding: '2px 8px', borderRadius: 5,
                  border: `1px solid ${DS.danger}`, background: 'transparent',
                  color: DS.danger, fontSize: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                <RotateCcw size={10} /> Retry
              </button>
            </div>
          )}

          {segmentPlans && !planLoading && (
            <div>
              {segmentPlans.map((seg) => (
                <SegmentPlanRow key={seg.index} item={seg} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function CourseOutlineReviewPanel({
  outline,
  units,
  unitStatuses,
  isGenerating,
  courseId,
  level,
  language,
  onStart,
  onEditOutline,
  onOutlineChanged,
  onSelectUnit,
}: CourseOutlineReviewPanelProps) {
  const outlineUnits: any[] = outline?.units ?? [];
  const totalUnits = outlineUnits.length;
  const doneCount  = Object.values(unitStatuses).filter((s) => s === 'done').length;
  const allDone    = !isGenerating && doneCount > 0 && doneCount >= units.length;

  const dbUnitByIndex = React.useMemo(() => {
    const map: Record<number, any> = {};
    units.forEach((u) => { if (typeof u.order_index === 'number') map[u.order_index] = u; });
    return map;
  }, [units]);

  const generationPercent = units.length > 0
    ? Math.round((doneCount / units.length) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <style>{`@keyframes corp-spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Banner ───────────────────────────────────────────────────────── */}
      <div style={{
        background: DS.tint,
        borderBottom: `1px solid ${DS.tintStrong}`,
        padding: '13px 20px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 9, background: DS.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {isGenerating
              ? <Loader2 size={15} color="#fff" style={{ animation: 'corp-spin 0.7s linear infinite' }} />
              : <Sparkles size={15} color="#fff" />}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: 0, fontSize: 13, fontWeight: 700, color: DS.primaryDark,
              lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {allDone
                ? `All ${doneCount} unit${doneCount !== 1 ? 's' : ''} generated`
                : isGenerating
                  ? `Generating… ${doneCount} / ${units.length} units done`
                  : `${totalUnits} unit${totalUnits !== 1 ? 's' : ''} ready to review`}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: DS.primary, marginTop: 1 }}>
              {allDone
                ? 'Click any unit card to open it'
                : isGenerating
                  ? 'Done units can be opened while others are still generating'
                  : 'Review & edit below, then click Generate to start'}
            </p>
          </div>

          {!isGenerating && !allDone && onEditOutline && (
            <button
              onClick={onEditOutline}
              style={{
                flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 9,
                border: `1.5px solid ${DS.borderFocus}`,
                background: DS.white, color: DS.primaryDark,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background = DS.tint; b.style.borderColor = DS.primary;
              }}
              onMouseLeave={(e) => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background = DS.white; b.style.borderColor = DS.borderFocus;
              }}
            >
              <Pencil size={12} /> Edit outline
            </button>
          )}
        </div>

        {/* Progress bar */}
        {(isGenerating || (allDone && units.length > 0)) && (
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 5, borderRadius: 3, background: DS.tintStrong, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${generationPercent}%`,
                background: DS.primary, borderRadius: 3,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 10, color: DS.primary, fontWeight: 600 }}>
              {generationPercent}% complete
            </p>
          </div>
        )}
      </div>

      {/* ── Unit list ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 4px', overscrollBehavior: 'contain' }}>
        {outlineUnits.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '40px 0', color: DS.textSubtle, gap: 10,
          }}>
            <BookOpen size={32} color={DS.borderFocus} />
            <p style={{ margin: 0, fontSize: 13 }}>No units in this outline</p>
          </div>
        )}

        {outlineUnits.map((outlineUnit: any, idx: number) => {
          const dbUnit = dbUnitByIndex[idx];
          const status = dbUnit
            ? (unitStatuses[dbUnit.id] ?? (isGenerating ? 'pending' : undefined))
            : undefined;
          return (
            <UnitCard
              key={idx}
              outlineUnit={outlineUnit}
              dbUnit={dbUnit}
              index={idx}
              status={status}
              isGenerating={isGenerating}
              level={level}
              language={language}
              courseId={courseId}
              allOutlineUnits={outlineUnits}
              onOutlineChanged={onOutlineChanged}
              onSelectUnit={onSelectUnit}
            />
          );
        })}
        <div style={{ height: 12 }} />
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: `1px solid ${DS.tintStrong}`,
        padding: '12px 18px', flexShrink: 0,
        background: DS.white,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {isGenerating ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            color: DS.primary, fontSize: 12, fontWeight: 600,
          }}>
            <Loader2 size={16} style={{ animation: 'corp-spin 0.7s linear infinite' }} />
            Generating content… done units are available to open above
          </div>
        ) : allDone ? (
          <p style={{ flex: 1, margin: 0, fontSize: 11, color: DS.textMuted }}>
            All units are ready — click <strong>Open</strong> on any card above to enter it.
          </p>
        ) : (
          <>
            <p style={{ flex: 1, margin: 0, fontSize: 11, color: DS.textMuted }}>
              Expand any unit to preview its segment plan before generating
            </p>
            <button
              onClick={onStart}
              style={{
                flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: DS.primary, color: DS.white,
                border: 'none', borderRadius: 11,
                padding: '10px 20px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.2s, transform 0.1s',
                boxShadow: '0 2px 10px rgba(108,111,239,0.30)',
              }}
              onMouseEnter={(e) => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background = DS.primaryDark; b.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background = DS.primary; b.style.transform = 'translateY(0)';
              }}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0) scale(0.98)';
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }}
            >
              <Sparkles size={15} />
              Generate Course
            </button>
          </>
        )}
      </div>
    </div>
  );
}