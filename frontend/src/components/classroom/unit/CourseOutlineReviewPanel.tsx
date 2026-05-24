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
 * • Any unit (including done) can expand to preview the segment plan; done
 *   units also show an Open button beside the chevron
 * • Done units: "Open" calls onSelectUnit; header click still toggles expand
 * • Copy lives in locales: classroom.unitSelector.outlineReview (+ courseGeneration)
 * • Auto-saves edits to PATCH /course-builder/{courseId}/outline on blur
 *
 * Design tokens: Primary #6C6FEF · Dark #4F52C2 · Tint #EEF0FE · Bg #F7F7FA
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { API_V1_BASE } from '../../../services/api';
import { fetchWithAuth } from '../../../services/apiClient';

// ─── Design tokens ────────────────────────────────────────────────────────────
// NOTE: authHeaders() is kept only for segment-plan POST (non-critical read).
// The PATCH outline call now uses fetchWithAuth so token refresh is handled.

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
  const res = await fetch(`${API_V1_BASE}/units/${unitId}/plan`, {
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
  // Uses fetchWithAuth so a 401 (expired token) triggers a silent refresh + retry.
  const res = await fetchWithAuth(`${API_V1_BASE}/course-builder/${courseId}/outline`, {
    method: 'PATCH',
    body: JSON.stringify({ units }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `Patch outline failed: ${res.status}`);
  }
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

function SegmentPlanRow({ item, t }: { item: SegmentPlanItem; t: TFunction }) {
  // Whether this row is the lesson intro segment (localized badge)
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
              {t('classroom.unitSelector.outlineReview.introBadge')}
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
  onRemoveUnit?: (index: number) => void;
  /** i18n helper for all teacher-visible strings in this card */
  t: TFunction;
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
  onRemoveUnit,
  t,
}: UnitCardProps) {
  // Whether the segment-plan block is expanded
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

    const fallbackTitle = t('classroom.unitSelector.unnamedUnit', { index: index + 1 });
    const curTitle = title.trim() || outlineUnit?.title || fallbackTitle;
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
    } catch {
      // Show a single localized message — avoids leaking raw HTTP text into the UI
      setSegmentPlans(null);
      setPlanError(t('classroom.unitSelector.outlineReview.planLoadError'));
    } finally {
      setPlanLoading(false);
    }
  }, [dbUnit?.id, planLoading, segmentPlans, title, description, outlineUnit, index, level, language, t]);

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
    const trimmed = title.trim() || outlineUnit?.title || t('classroom.unitSelector.unnamedUnit', { index: index + 1 });
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
                {title || t('classroom.unitSelector.unnamedUnit', { index: index + 1 })}
              </p>
            )}

            {/* Pencil button — always rendered, opacity driven by React hovered state */}
            {!isGenerating && !editingTitle && !isDone && (
              <button
                title={t('classroom.unitSelector.outlineReview.editUnitTitle')}
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
                {hovered && <span>{t('classroom.unitList.actions.edit')}</span>}
              </button>
            )}

            {/* Delete button — shown on hover when not generating and not done */}
            {!isGenerating && !isDone && onRemoveUnit && (
              <button
                title={t('classroom.unitSelector.outlineReview.removeUnitTitle')}
                onClick={(e) => { e.stopPropagation(); onRemoveUnit(index); }}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, borderRadius: 7,
                  border: `1px solid ${hovered ? '#FECACA' : 'transparent'}`,
                  background: hovered ? '#FEF2F2' : 'transparent',
                  color: hovered ? DS.danger : DS.textSubtle,
                  cursor: 'pointer',
                  opacity: hovered ? 1 : 0.3,
                  transition: 'opacity 0.15s, background 0.15s, border-color 0.15s, color 0.15s',
                }}
              >
                <Trash2 size={12} />
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
              title={!isGenerating && !isDone ? t('classroom.unitSelector.outlineReview.clickEditDescription') : undefined}
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
                  {isDone ? '' : t('classroom.unitSelector.outlineReview.clickAddDescription')}
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

          {/* Done units: Open navigates; chevron still toggles segment plan */}
          {isDone && onSelectUnit && dbUnit ? (
            <>
              <button
                title={t('classroom.unitSelector.outlineReview.openUnit')}
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
                {t('classroom.unitSelector.outlineReview.open')} <ArrowRight size={11} />
              </button>
              <span style={{ color: DS.textSubtle, display: 'flex' }}>
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </span>
            </>
          ) : (
            <span style={{ color: DS.textSubtle }}>
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </span>
          )}
        </div>
      </div>

      {/* ── Segment plan (expand any unit — including done — to inspect the AI plan) ─ */}
      {expanded && (
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
            {t('classroom.unitSelector.outlineReview.segmentPlanTitle')}
          </p>

          {!dbUnit?.id && (
            <p style={{ margin: 0, fontSize: 12, color: DS.textMuted, lineHeight: 1.45 }}>
              {t('classroom.unitSelector.outlineReview.planNeedsDbUnit')}
            </p>
          )}

          {dbUnit?.id && planLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', color: DS.textMuted }}>
              <Loader2 size={14} style={{ animation: 'corp-spin 0.7s linear infinite' }} />
              <span style={{ fontSize: 12 }}>{t('classroom.unitSelector.outlineReview.planningSegments')}</span>
            </div>
          )}

          {dbUnit?.id && planError && !planLoading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 8,
              background: DS.dangerBg, color: DS.danger, fontSize: 11,
            }}>
              <AlertCircle size={13} />
              <span style={{ flex: 1 }}>{planError}</span>
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
                <RotateCcw size={10} /> {t('classroom.unitSelector.outlineReview.retry')}
              </button>
            </div>
          )}

          {dbUnit?.id && segmentPlans && !planLoading && (
            <div>
              {segmentPlans.map((seg) => (
                <SegmentPlanRow key={seg.index} item={seg} t={t} />
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
  // Localizes banner, footer, and unit-card chrome for the outline review step
  const { t } = useTranslation();
  const outlineUnits: any[] = outline?.units ?? [];
  const totalUnits = outlineUnits.length;
  const doneCount  = Object.values(unitStatuses).filter((s) => s === 'done').length;
  // Use totalUnits (outline length) not units.length (DB records) — removing units
  // from the outline before generating leaves stale DB records that are never
  // generated, so completion must be measured against what the outline says.
  const allDone    = !isGenerating && doneCount > 0 && doneCount >= totalUnits;

  const [addingUnit, setAddingUnit] = React.useState(false);
  // Stores the last outline-mutation error so the teacher sees feedback instead of silence.
  const [outlineError, setOutlineError] = React.useState<string | null>(null);

  const dbUnitByIndex = React.useMemo(() => {
    const map: Record<number, any> = {};
    units.forEach((u) => { if (typeof u.order_index === 'number') map[u.order_index] = u; });
    return map;
  }, [units]);

  const generationPercent = totalUnits > 0
    ? Math.round((doneCount / totalUnits) * 100)
    : 0;

  // ── Remove a unit from the outline ────────────────────────────────────────
  const handleRemoveUnit = React.useCallback(async (index: number) => {
    if (!courseId || isGenerating) return;
    setOutlineError(null);
    const next = outlineUnits.filter((_: any, i: number) => i !== index);
    try {
      await patchOutline(
        courseId,
        next.map((u: any) => ({
          title: u.title ?? '',
          description: u.description ?? '',
          sections: u.sections ?? [],
        })),
      );
      onOutlineChanged?.({ ...(outline ?? {}), units: next });
    } catch (err) {
      // Surface the error so the teacher knows the unit was NOT removed.
      setOutlineError(err instanceof Error ? err.message : 'Failed to remove unit');
    }
  }, [courseId, isGenerating, outlineUnits, outline, onOutlineChanged]);

  // ── Add a blank unit to the outline ───────────────────────────────────────
  const handleAddUnit = React.useCallback(async () => {
    if (!courseId || isGenerating || addingUnit) return;
    setOutlineError(null);
    setAddingUnit(true);
    const newUnit = {
      title: t('classroom.unitSelector.unnamedUnit', { index: outlineUnits.length + 1 }),
      description: '',
      sections: [],
    };
    const next = [...outlineUnits, newUnit];
    try {
      await patchOutline(
        courseId,
        next.map((u: any) => ({
          title: u.title ?? '',
          description: u.description ?? '',
          sections: u.sections ?? [],
        })),
      );
      onOutlineChanged?.({ ...(outline ?? {}), units: next });
    } catch (err) {
      // Surface the error so the teacher knows the unit was NOT added.
      setOutlineError(err instanceof Error ? err.message : 'Failed to add unit');
    } finally { setAddingUnit(false); }
  }, [courseId, isGenerating, addingUnit, outlineUnits, outline, onOutlineChanged, t]);

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
                ? t('classroom.unitSelector.outlineReview.bannerAllDone', { count: doneCount })
                : isGenerating
                  ? t('classroom.unitSelector.outlineReview.bannerGenerating', { done: doneCount, total: totalUnits })
                  : t('classroom.unitSelector.outlineReview.unitsReadyToReview', { count: totalUnits })}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: DS.primary, marginTop: 1 }}>
              {allDone
                ? t('classroom.unitSelector.outlineReview.subtitleAllDone')
                : isGenerating
                  ? t('classroom.unitSelector.outlineReview.subtitleGenerating')
                  : t('classroom.unitSelector.outlineReview.subtitleReview')}
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
              <Pencil size={12} /> {t('classroom.unitSelector.courseGeneration.editOutline')}
            </button>
          )}
        </div>

        {/* Progress bar */}
        {(isGenerating || (allDone && totalUnits > 0)) && (
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 5, borderRadius: 3, background: DS.tintStrong, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${generationPercent}%`,
                background: DS.primary, borderRadius: 3,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 10, color: DS.primary, fontWeight: 600 }}>
              {t('classroom.unitSelector.outlineReview.percentComplete', { percent: generationPercent })}
            </p>
          </div>
        )}
      </div>

      {/* ── Outline mutation error banner ────────────────────────────────── */}
      {outlineError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          margin: '8px 18px 0',
          padding: '8px 12px',
          background: DS.dangerBg,
          border: `1px solid ${DS.danger}`,
          borderRadius: 8,
          fontSize: 12, color: DS.danger, fontWeight: 500,
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{outlineError}</span>
          <button
            onClick={() => setOutlineError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: DS.danger, lineHeight: 1 }}
            aria-label="Dismiss error"
          >×</button>
        </div>
      )}

      {/* ── Unit list ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 4px', overscrollBehavior: 'contain' }}>
        {outlineUnits.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '40px 0', color: DS.textSubtle, gap: 10,
          }}>
            <BookOpen size={32} color={DS.borderFocus} />
            <p style={{ margin: 0, fontSize: 13 }}>{t('classroom.unitSelector.outlineReview.noUnitsInOutline')}</p>
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
              onRemoveUnit={!isGenerating ? handleRemoveUnit : undefined}
              t={t}
            />
          );
        })}

        {/* ── Add unit button ─────────────────────────────────────────────── */}
        {!isGenerating && !allDone && (
          <button
            onClick={handleAddUnit}
            disabled={addingUnit}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '10px 16px',
              borderRadius: 12,
              border: `1.5px dashed ${DS.borderFocus}`,
              background: 'transparent',
              color: DS.primary,
              fontSize: 12, fontWeight: 600,
              cursor: addingUnit ? 'not-allowed' : 'pointer',
              opacity: addingUnit ? 0.6 : 1,
              transition: 'background 0.15s, border-color 0.15s',
              marginBottom: 2,
            }}
            onMouseEnter={(e) => {
              if (!addingUnit) {
                (e.currentTarget as HTMLButtonElement).style.background = DS.tint;
                (e.currentTarget as HTMLButtonElement).style.borderColor = DS.primary;
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.borderColor = DS.borderFocus;
            }}
          >
            {addingUnit
              ? <Loader2 size={13} style={{ animation: 'corp-spin 0.7s linear infinite' }} />
              : <Plus size={13} />}
            {addingUnit ? t('classroom.unitSelector.outlineReview.adding') : t('classroom.unitSelector.outlineReview.addUnit')}
          </button>
        )}

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
            {t('classroom.unitSelector.outlineReview.footerGenerating')}
          </div>
        ) : allDone ? (
          <p style={{ flex: 1, margin: 0, fontSize: 11, color: DS.textMuted }}>
            {t('classroom.unitSelector.outlineReview.footerAllDone')}
          </p>
        ) : (
          <>
            <p style={{ flex: 1, margin: 0, fontSize: 11, color: DS.textMuted }}>
              {t('classroom.unitSelector.outlineReview.footerExpandHint')}
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
              {t('classroom.unitSelector.courseGeneration.generateCourseButton')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}