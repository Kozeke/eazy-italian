/**
 * EditOutlineModal.tsx
 * =====================
 * Allows the teacher to edit the AI-generated course outline before
 * triggering full content generation.
 *
 * Opens as a full-screen overlay (z-[80], above UnitSelectorModal at z-50).
 *
 * Features:
 * ─────────
 * • Edit unit title and description inline
 * • Edit section titles and descriptions
 * • Add / remove sections within a unit
 * • Add / remove units
 * • Saves to PATCH /course-builder/{courseId}/outline  (updates DB units)
 * • On success calls onSave(updatedOutline) so parent can sync state
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { API_V1_BASE } from '../../../services/api';
import {
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Layers,
  AlertCircle,
  Check,
  GripVertical,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const DS = {
  primary:     '#6C6FEF',
  primaryDark: '#4F52C2',
  tint:        '#EEF0FE',
  bg:          '#F7F7FA',
  white:       '#FFFFFF',
  border:      '#E5E7EB',
  borderFocus: '#A5A8F5',
  textMain:    '#1E293B',
  textMuted:   '#6B7280',
  textSubtle:  '#9CA3AF',
  danger:      '#EF4444',
  dangerBg:    '#FEE2E2',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SectionEdit {
  title:       string;
  description: string;
}

export interface UnitEdit {
  title:       string;
  description: string;
  sections:    SectionEdit[];
  expanded:    boolean;
}

export interface OutlineEdit {
  title: string;
  units: UnitEdit[];
}

export interface EditOutlineModalProps {
  open:      boolean;
  outline:   any | null;   // raw outline from sessionStorage / API
  courseId:  number | null;
  onClose:   () => void;
  /** Called with the saved outline after a successful PATCH */
  onSave:    (updatedOutline: any) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toEditState(outline: any): OutlineEdit {
  return {
    title: outline?.title ?? '',
    units: (outline?.units ?? []).map((u: any) => ({
      title:       u.title ?? '',
      description: u.description ?? '',
      sections:    (u.sections ?? []).map((s: any) => ({
        title:       s.title ?? '',
        description: s.description ?? '',
      })),
      expanded: true,
    })),
  };
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token') ?? '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

interface FieldProps {
  label:       string;
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  multiline?:  boolean;
  maxLength?:  number;
}

function Field({ label, value, onChange, placeholder, multiline, maxLength }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const inputStyle: React.CSSProperties = {
    width:        '100%',
    padding:      multiline ? '8px 12px' : '7px 12px',
    borderRadius: 10,
    border:       `1.5px solid ${focused ? DS.borderFocus : DS.border}`,
    background:   DS.white,
    fontSize:     13,
    color:        DS.textMain,
    outline:      'none',
    resize:       multiline ? 'vertical' : undefined,
    minHeight:    multiline ? 60 : undefined,
    transition:   'border-color 0.15s',
    boxSizing:    'border-box',
    fontFamily:   'inherit',
    lineHeight:   1.45,
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: DS.textMuted, display: 'block', marginBottom: 3 }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          style={inputStyle}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      ) : (
        <input
          type="text"
          style={inputStyle}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditOutlineModal({
  open,
  outline,
  courseId,
  onClose,
  onSave,
}: EditOutlineModalProps) {
  const [state,   setState]   = useState<OutlineEdit>({ title: '', units: [] });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);
  const panelRef              = useRef<HTMLDivElement>(null);

  // Reset state when modal opens or outline changes
  useEffect(() => {
    if (open && outline) {
      setState(toEditState(outline));
      setError(null);
      setSaved(false);
    }
  }, [open, outline]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, saving, onClose]);

  // ── State mutators ────────────────────────────────────────────────────────

  const setUnitField = useCallback(
    (uIdx: number, field: 'title' | 'description', value: string) => {
      setState((prev) => {
        const units = [...prev.units];
        units[uIdx] = { ...units[uIdx], [field]: value };
        return { ...prev, units };
      });
    },
    [],
  );

  const toggleUnit = useCallback((uIdx: number) => {
    setState((prev) => {
      const units = [...prev.units];
      units[uIdx] = { ...units[uIdx], expanded: !units[uIdx].expanded };
      return { ...prev, units };
    });
  }, []);

  const setSectionField = useCallback(
    (uIdx: number, sIdx: number, field: 'title' | 'description', value: string) => {
      setState((prev) => {
        const units = [...prev.units];
        const secs  = [...units[uIdx].sections];
        secs[sIdx]  = { ...secs[sIdx], [field]: value };
        units[uIdx] = { ...units[uIdx], sections: secs };
        return { ...prev, units };
      });
    },
    [],
  );

  const addSection = useCallback((uIdx: number) => {
    setState((prev) => {
      const units = [...prev.units];
      units[uIdx] = {
        ...units[uIdx],
        sections: [...units[uIdx].sections, { title: '', description: '' }],
        expanded: true,
      };
      return { ...prev, units };
    });
  }, []);

  const removeSection = useCallback((uIdx: number, sIdx: number) => {
    setState((prev) => {
      const units = [...prev.units];
      const secs  = units[uIdx].sections.filter((_, i) => i !== sIdx);
      units[uIdx] = { ...units[uIdx], sections: secs };
      return { ...prev, units };
    });
  }, []);

  const addUnit = useCallback(() => {
    setState((prev) => ({
      ...prev,
      units: [
        ...prev.units,
        {
          title:       '',
          description: '',
          sections:    [{ title: '', description: '' }],
          expanded:    true,
        },
      ],
    }));
  }, []);

  const removeUnit = useCallback((uIdx: number) => {
    setState((prev) => ({
      ...prev,
      units: prev.units.filter((_, i) => i !== uIdx),
    }));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!courseId) return;
    setError(null);
    setSaving(true);

    const payload = {
      units: state.units.map((u) => ({
        title:       u.title.trim() || 'Untitled Unit',
        description: u.description.trim(),
        sections:    u.sections
          .filter((s) => s.title.trim())
          .map((s) => ({ title: s.title.trim(), description: s.description.trim() })),
      })),
    };

    try {
      const res = await fetch(`${API_V1_BASE}/course-builder/${courseId}/outline`, {
        method:  'PATCH',
        headers: authHeaders(),
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `Save failed (${res.status})`);
      }

      const updated = await res.json();
      setSaved(true);
      setTimeout(() => {
        onSave(updated);
        onClose();
      }, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  }, [courseId, state, onSave, onClose]);

  if (!open) return null;

  const totalUnits = state.units.length;

  return (
    <>
      {/* ── Backdrop ────────────────────────────────────────────────────── */}
      <div
        style={{
          position:   'fixed',
          inset:      0,
          zIndex:     75,
          background: 'rgba(15,23,42,0.55)',
          backdropFilter: 'blur(3px)',
        }}
        aria-hidden
        onClick={() => { if (!saving) onClose(); }}
      />

      {/* ── Panel ───────────────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit Course Outline"
        onClick={(e) => e.stopPropagation()}
        style={{
          position:     'fixed',
          zIndex:       80,
          top:          '3vh',
          left:         '50%',
          transform:    'translateX(-50%)',
          width:        'min(720px, calc(100vw - 32px))',
          height:       '94vh',
          background:   DS.white,
          borderRadius: 20,
          boxShadow:    '0 24px 64px rgba(0,0,0,0.22)',
          display:      'flex',
          flexDirection:'column',
          overflow:     'hidden',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          gap:            12,
          padding:        '18px 20px 16px',
          borderBottom:   `1px solid ${DS.border}`,
          flexShrink:     0,
          background:     DS.white,
        }}>
          {/* Icon */}
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: DS.tint,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Pencil size={17} color={DS.primary} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: DS.textMain }}>
              Edit Course Outline
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: DS.textMuted, marginTop: 1 }}>
              {totalUnits} unit{totalUnits !== 1 ? 's' : ''} · edit titles, sections and descriptions
            </p>
          </div>

          {/* Close */}
          <button
            onClick={() => { if (!saving) onClose(); }}
            disabled={saving}
            style={{
              padding: 7, borderRadius: 9,
              border: 'none', background: 'transparent',
              cursor: saving ? 'not-allowed' : 'pointer',
              color: DS.textSubtle,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = DS.bg)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', overscrollBehavior: 'contain' }}>

          {state.units.map((unit, uIdx) => (
            <UnitCard
              key={uIdx}
              unit={unit}
              index={uIdx}
              total={totalUnits}
              onFieldChange={(field, val) => setUnitField(uIdx, field, val)}
              onToggle={() => toggleUnit(uIdx)}
              onRemove={totalUnits > 1 ? () => removeUnit(uIdx) : undefined}
              onSectionChange={(sIdx, field, val) => setSectionField(uIdx, sIdx, field, val)}
              onAddSection={() => addSection(uIdx)}
              onRemoveSection={(sIdx) => removeSection(uIdx, sIdx)}
            />
          ))}

          {/* Add unit button */}
          <button
            onClick={addUnit}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:           7,
              width:         '100%',
              padding:       '10px 14px',
              borderRadius:  12,
              border:        `1.5px dashed ${DS.borderFocus}`,
              background:    DS.tint,
              color:         DS.primary,
              fontSize:      13,
              fontWeight:    600,
              cursor:        'pointer',
              justifyContent:'center',
              marginTop:     4,
              marginBottom:  16,
              transition:    'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#E0E3FD')}
            onMouseLeave={(e) => (e.currentTarget.style.background = DS.tint)}
          >
            <Plus size={15} />
            Add Unit
          </button>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div style={{
          borderTop:   `1px solid ${DS.border}`,
          padding:     '14px 20px',
          flexShrink:  0,
          background:  DS.white,
          display:     'flex',
          alignItems:  'center',
          gap:          12,
        }}>
          {/* Error */}
          {error && (
            <div style={{
              flex:        1,
              display:     'flex',
              alignItems:  'center',
              gap:          6,
              color:        DS.danger,
              fontSize:     12,
              fontWeight:   500,
            }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}
          {!error && <div style={{ flex: 1 }} />}

          <button
            onClick={() => { if (!saving) onClose(); }}
            disabled={saving}
            style={{
              padding:      '8px 18px',
              borderRadius:  10,
              border:       `1.5px solid ${DS.border}`,
              background:    DS.white,
              color:         DS.textMuted,
              fontSize:      13,
              fontWeight:    600,
              cursor:        saving ? 'not-allowed' : 'pointer',
              transition:    'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = DS.bg)}
            onMouseLeave={(e) => (e.currentTarget.style.background = DS.white)}
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={saving || saved}
            style={{
              display:       'inline-flex',
              alignItems:    'center',
              gap:            7,
              padding:       '8px 20px',
              borderRadius:   10,
              border:        'none',
              background:    saved ? '#22C55E' : saving ? DS.primaryDark : DS.primary,
              color:         DS.white,
              fontSize:       13,
              fontWeight:     700,
              cursor:        (saving || saved) ? 'not-allowed' : 'pointer',
              transition:    'background 0.2s',
              boxShadow:     saved || saving ? 'none' : '0 2px 8px rgba(108,111,239,0.28)',
            }}
          >
            {saved ? (
              <><Check size={14} /> Saved!</>
            ) : saving ? (
              <>
                <span style={{
                  width: 13, height: 13, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.35)',
                  borderTopColor: '#fff',
                  display: 'inline-block',
                  animation: 'eom-spin 0.7s linear infinite',
                }} />
                Saving…
              </>
            ) : (
              <>
                <Check size={14} />
                Save Outline
              </>
            )}
          </button>
        </div>
      </div>

      {/* Keyframe */}
      <style>{`@keyframes eom-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ─── UnitCard ─────────────────────────────────────────────────────────────────

interface UnitCardProps {
  unit:              UnitEdit;
  index:             number;
  total:             number;
  onFieldChange:     (field: 'title' | 'description', val: string) => void;
  onToggle:          () => void;
  onRemove?:         () => void;
  onSectionChange:   (sIdx: number, field: 'title' | 'description', val: string) => void;
  onAddSection:      () => void;
  onRemoveSection:   (sIdx: number) => void;
}

function UnitCard({
  unit, index, onFieldChange, onToggle, onRemove,
  onSectionChange, onAddSection, onRemoveSection,
}: UnitCardProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div style={{
      background:   DS.white,
      border:       `1px solid ${DS.border}`,
      borderRadius:  14,
      marginBottom:  12,
      overflow:      'hidden',
      boxShadow:     '0 1px 4px rgba(0,0,0,0.05)',
      transition:    'box-shadow 0.15s',
    }}>
      {/* Unit header row */}
      <div
        style={{
          display:     'flex',
          alignItems:  'center',
          gap:          10,
          padding:     '11px 14px',
          cursor:      'pointer',
          background:  unit.expanded ? DS.white : DS.bg,
          userSelect:  'none',
        }}
        onClick={onToggle}
      >
        {/* Pill index */}
        <div style={{
          minWidth:     28, height: 22,
          borderRadius:  6,
          background:   DS.tint,
          color:        DS.primary,
          fontSize:      11,
          fontWeight:    700,
          display:      'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink:    0,
          paddingInline: 6,
        }}>
          {index + 1}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 600,
            color: unit.title.trim() ? DS.textMain : DS.textSubtle,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {unit.title.trim() || 'Untitled Unit'}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: DS.textMuted, marginTop: 1 }}>
            {unit.sections.length} section{unit.sections.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
             onClick={(e) => e.stopPropagation()}>
          {onRemove && (
            confirmRemove ? (
              <>
                <button
                  onClick={() => { onRemove(); setConfirmRemove(false); }}
                  style={{
                    padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: DS.dangerBg, color: DS.danger, border: 'none', cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  style={{
                    padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: DS.bg, color: DS.textMuted, border: `1px solid ${DS.border}`, cursor: 'pointer',
                  }}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmRemove(true)}
                style={{
                  padding: 5, borderRadius: 7, border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  color: DS.textSubtle,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = DS.dangerBg;
                  e.currentTarget.style.color = DS.danger;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = DS.textSubtle;
                }}
              >
                <Trash2 size={14} />
              </button>
            )
          )}
          <div style={{ color: DS.textSubtle, display: 'flex', alignItems: 'center' }}>
            {unit.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {unit.expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${DS.bg}` }}>
          <div style={{ paddingTop: 12 }}>
            <Field
              label="Unit Title"
              value={unit.title}
              onChange={(v) => onFieldChange('title', v)}
              placeholder="e.g. Everyday Conversations"
              maxLength={80}
            />
            <Field
              label="Description"
              value={unit.description}
              onChange={(v) => onFieldChange('description', v)}
              placeholder="What students will learn in this unit…"
              multiline
              maxLength={300}
            />
          </div>

          {/* Sections */}
          <div style={{ marginTop: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 8,
            }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Layers size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                Sections
              </p>
              <button
                onClick={onAddSection}
                style={{
                  display:     'inline-flex', alignItems: 'center', gap: 4,
                  padding:     '3px 9px', borderRadius: 7,
                  border:      `1.5px solid ${DS.borderFocus}`,
                  background:  DS.tint, color: DS.primary,
                  fontSize:    11, fontWeight: 700, cursor: 'pointer',
                  transition:  'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#E0E3FD')}
                onMouseLeave={(e) => (e.currentTarget.style.background = DS.tint)}
              >
                <Plus size={11} /> Add Section
              </button>
            </div>

            {unit.sections.length === 0 && (
              <p style={{ fontSize: 12, color: DS.textSubtle, margin: 0, padding: '6px 0', fontStyle: 'italic' }}>
                No sections — click "Add Section" to add one.
              </p>
            )}

            {unit.sections.map((sec, sIdx) => (
              <SectionRow
                key={sIdx}
                section={sec}
                index={sIdx}
                onFieldChange={(field, val) => onSectionChange(sIdx, field, val)}
                onRemove={unit.sections.length > 1 ? () => onRemoveSection(sIdx) : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SectionRow ───────────────────────────────────────────────────────────────

interface SectionRowProps {
  section:       SectionEdit;
  index:         number;
  onFieldChange: (field: 'title' | 'description', val: string) => void;
  onRemove?:     () => void;
}

function SectionRow({ section, index, onFieldChange, onRemove }: SectionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);

  return (
    <div style={{
      background:   DS.bg,
      border:       `1px solid ${DS.border}`,
      borderRadius:  10,
      marginBottom:  6,
      overflow:     'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
        {/* Drag handle (decorative) */}
        <GripVertical size={13} color={DS.textSubtle} style={{ flexShrink: 0 }} />

        {/* Section index badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, color: DS.textSubtle,
          background: DS.white, border: `1px solid ${DS.border}`,
          borderRadius: 5, padding: '1px 6px', flexShrink: 0,
        }}>
          §{index + 1}
        </span>

        {/* Title input */}
        <input
          type="text"
          value={section.title}
          placeholder="Section title…"
          maxLength={60}
          onChange={(e) => onFieldChange('title', e.target.value)}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => setTitleFocused(false)}
          style={{
            flex:         1, minWidth: 0,
            padding:      '4px 8px',
            borderRadius:  7,
            border:       `1.5px solid ${titleFocused ? DS.borderFocus : 'transparent'}`,
            background:   titleFocused ? DS.white : 'transparent',
            fontSize:      12, fontWeight: 500, color: DS.textMain,
            outline:      'none',
            transition:   'border-color 0.15s, background 0.15s',
          }}
        />

        {/* Expand desc */}
        <button
          onClick={() => setExpanded((x) => !x)}
          title="Toggle description"
          style={{
            padding: 4, borderRadius: 6,
            border: 'none', background: 'transparent',
            cursor: 'pointer', color: DS.textSubtle,
            display: 'flex', alignItems: 'center',
          }}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {/* Remove */}
        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              padding: 4, borderRadius: 6,
              border: 'none', background: 'transparent',
              cursor: 'pointer', color: DS.textSubtle,
              display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = DS.danger;
              e.currentTarget.style.background = DS.dangerBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = DS.textSubtle;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Expandable description */}
      {expanded && (
        <div style={{ padding: '0 10px 10px', paddingLeft: 35 }}>
          <textarea
            value={section.description}
            placeholder="Section description (optional)…"
            rows={2}
            maxLength={200}
            onChange={(e) => onFieldChange('description', e.target.value)}
            style={{
              width:        '100%', boxSizing: 'border-box',
              padding:      '6px 10px',
              borderRadius:  8,
              border:       `1.5px solid ${DS.border}`,
              background:   DS.white,
              fontSize:      12,
              color:         DS.textMain,
              outline:      'none',
              resize:       'vertical',
              minHeight:     52,
              fontFamily:   'inherit',
              lineHeight:    1.45,
            }}
            onFocus={(e)   => (e.target.style.borderColor = DS.borderFocus)}
            onBlur={(e)    => (e.target.style.borderColor = DS.border)}
          />
        </div>
      )}
    </div>
  );
}