/**
 * SectionSidePanel.tsx  (v4 — renamed from UnitSidePanel)
 *
 * Changes from v2:
 * ─────────────────
 * • Primary list is now `segments` (Segment[]) instead of `units`.
 * • Each row represents one Segment inside the current Unit.
 * • "Add section" footer button calls onAddSegment() → POST /admin/units/:id/segments.
 * • currentSegmentId replaces currentUnitId as the active-row key.
 * • completedUnitIds / isLocked logic preserved (mapped onto segment rows).
 * • All original footer buttons (FinishUnitButton, AddUnitButton, ExtraButton)
 *   kept verbatim; AddUnitButton now also wires to onAddSegment.
 * • Backward-compat: old `units` / `currentUnitId` / `onSelectUnit` /
 *   `onAddUnit` props still accepted so existing callers don't break.
 * • Optional `onRemoveSegment`: teacher-only control to delete the active section
 *   after confirmation (replaces the former right-side “active” dot).
 * • Optional `onReorderSegments`: teacher-only — drag handle reorders sections;
 *   parent persists POST …/segments/reorder and refetches.
 *
 * Design system unchanged:
 *   Primary #6C6FEF · Dark #4F52C2 · Tint #EEF0FE · Bg #F7F7FA · White #FFFFFF
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Flag, BookOpen, CheckCircle2, Circle, X, GripVertical } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Segment = {
  id:                      number;
  title:                   string;
  order_index:             number;
  status:                  string;
  is_visible_to_students:  boolean;
  videos?:                 any[];
  tasks?:                  any[];
  tests?:                  any[];
  presentations?:          any[];
};

export type SectionSidePanelProps = {
  /** When false the panel is hidden and the flex layout returns to full-width. */
  open?: boolean;

  // ── NEW: segment-based props ───────────────────────────────────────────────
  /** Segments for the active unit. When present, these are rendered instead of `units`. */
  segments?:          Segment[];
  /** ID of the segment currently being edited / viewed. */
  currentSegmentId?:  number | string | null;
  onSelectSegment?:   (segment: Segment) => void;
  /** Called when the teacher clicks "Add section". */
  onAddSegment?:      () => void;
  /** Teacher: after confirm, delete this segment (API). Omit to hide the row remove control. */
  onRemoveSegment?:   (segment: Segment) => void | Promise<void>;
  /** Teacher: persist new section order — receives segment ids top-to-bottom (order_index 0..n). */
  onReorderSegments?: (orderedSegmentIds: number[]) => void | Promise<void>;

  // ── ORIGINAL props kept for backward compat ────────────────────────────────
  units:              any[];
  currentUnitId:      number | string | null;
  completedUnitIds?:  Set<number | string>;
  courseTitle?:       string;
  onSelectUnit:       (unit: any) => void;
  onAddUnit?:         () => void;
  onFinishUnit?:      () => void;
  onExtra?:           () => void;
  /**
   * Optional: steps/sections for the current unit so we can show
   * a mini progress summary in the sidebar.
   * Each item: { label: string; done: boolean }
   */
  currentUnitSteps?:  Array<{ label: string; done: boolean }>;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SectionSidePanel({
  open = true,

  // segment props
  segments:        segmentsProp,
  currentSegmentId,
  onSelectSegment,
  onAddSegment,
  onRemoveSegment,
  onReorderSegments,

  // original props
  units,
  currentUnitId,
  completedUnitIds,
  courseTitle,
  onSelectUnit,
  onAddUnit,
  onFinishUnit,
  onExtra,
  currentUnitSteps,
}: SectionSidePanelProps) {

  // Decide rendering mode: segments take priority when provided + non-empty
  const useSegmentMode = (segmentsProp?.length ?? 0) > 0 || onAddSegment !== undefined;

  const sortedSegments = useMemo(
    () => [...(segmentsProp ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [segmentsProp],
  );

  // Stable id list for @dnd-kit SortableContext (must match each row’s sortable id)
  const segmentIdsForSortable = useMemo(
    () => sortedSegments.map((s) => s.id),
    [sortedSegments],
  );

  // Pointer + keyboard so drag does not fight row click; keyboard matches sortable a11y defaults
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * Computes the new id order after a drag and notifies the parent to persist + refetch.
   */
  const handleSegmentDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!onReorderSegments || !over || active.id === over.id) return;
    const oldIndex = sortedSegments.findIndex(
      (s) => s.id === active.id || String(s.id) === String(active.id),
    );
    const newIndex = sortedSegments.findIndex(
      (s) => s.id === over.id || String(s.id) === String(over.id),
    );
    if (oldIndex < 0 || newIndex < 0) return;
    const nextIds = arrayMove(sortedSegments, oldIndex, newIndex).map((s) => s.id);
    void onReorderSegments(nextIds);
  };

  // Original unit list (kept for backward compat / student mode)
  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [units],
  );

  // Segment pending delete confirmation (modal); null when dialog is closed
  const [removeConfirmSegment, setRemoveConfirmSegment] = useState<Segment | null>(null);

  // Avoid reopening the confirm dialog if the panel was closed while it was open
  useEffect(() => {
    if (!open) setRemoveConfirmSegment(null);
  }, [open]);

  if (!open) return null;

  // ── Footer handler ────────────────────────────────────────────────────────
  // When onAddSegment is provided (teacher mode) only fire that — never also
  // call onAddUnit, which would trigger unit creation instead of segment creation.
  const handleAddSection = () => {
    if (onAddSegment) {
      onAddSegment();
    } else {
      onAddUnit?.();
    }
  };

  // Controls whether the "Add section" footer action is visible for the current mode.
  const showAddSectionButton = useSegmentMode
    ? Boolean(onAddSegment)
    : Boolean(onAddUnit || onAddSegment);

  // Controls whether the footer block should be rendered at all.
  const showFooterActions = showAddSectionButton || Boolean(onFinishUnit || onExtra);

  return (
    <aside
      style={{
        /* Sizing — sit flush beside .lp-player-frame */
        width: 240,
        flexShrink: 0,

        /* Detach from full-height stretch — float like a card beside the content */
        alignSelf: 'flex-start',
        maxHeight: '50%',

        /* Internal layout */
        display: 'flex',
        flexDirection: 'column',

        /* Visual — mirror .lp-player-frame */
        background: '#ffffff',
        borderRadius: 'var(--lp-player-radius, 1rem)',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 24px 0 rgba(0, 0, 0, 0.06)',
        overflow: 'hidden',
      }}
      aria-label={useSegmentMode ? 'Section navigator' : 'Unit navigator'}
    >

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '14px 14px 12px',
          borderBottom: '1px solid #F0F1F8',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              color: '#1e293b',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Sections
          </p>
        </div>
      </div>

      {/* ── Current unit progress summary ──────────────────────────────────── */}
      {currentUnitSteps && currentUnitSteps.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            padding: '12px 14px',
            borderBottom: '1px solid #F0F1F8',
            background: '#FAFBFF',
          }}
        >
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#A8ABCA',
            }}
          >
            Sections
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {currentUnitSteps.map((step, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                {step.done ? (
                  <CheckCircle2 style={{ width: 13, height: 13, color: '#6C6FEF', flexShrink: 0 }} />
                ) : (
                  <Circle style={{ width: 13, height: 13, color: '#C7C9EE', flexShrink: 0 }} />
                )}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: step.done ? 500 : 400,
                    color: step.done ? '#4F52C2' : '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: step.done ? 'none' : 'none',
                  }}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
          {/* Mini progress bar */}
          {(() => {
            const done = currentUnitSteps.filter(s => s.done).length;
            const total = currentUnitSteps.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    height: 3,
                    borderRadius: 99,
                    background: '#EEF0FE',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      borderRadius: 99,
                      background: 'linear-gradient(90deg, #4F52C2 0%, #6C6FEF 100%)',
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 9, color: '#A8ABCA', fontWeight: 600 }}>
                  {done} / {total} completed
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── List (segments or units) ───────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          scrollbarWidth: 'thin' as any,
          scrollbarColor: '#cbd5e1 transparent',
        }}
      >
        {useSegmentMode ? (
          /* ── SEGMENT mode ─────────────────────────────────────────────────── */
          sortedSegments.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 16px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#EEF0FE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 8,
                }}
              >
                <BookOpen style={{ width: 18, height: 18, color: '#6C6FEF' }} />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>
                No sections yet
              </p>
            </div>
          ) : onReorderSegments ? (
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSegmentDragEnd}
            >
              <SortableContext
                items={segmentIdsForSortable}
                strategy={verticalListSortingStrategy}
              >
                <ul
                  role="listbox"
                  aria-label="Available sections"
                  style={{ margin: 0, padding: '4px 0', listStyle: 'none' }}
                >
                  {sortedSegments.map((seg) => {
                    const isCurrent = String(seg.id) === String(currentSegmentId);
                    const isLocked = seg.is_visible_to_students === false;
                    const contentCount =
                      (seg.videos?.length ?? 0) +
                      (seg.tasks?.length ?? 0) +
                      (seg.tests?.length ?? 0) +
                      (seg.presentations?.length ?? 0);

                    return (
                      <SortableSidePanelSegmentRow
                        key={seg.id}
                        segment={seg}
                        isCurrent={isCurrent}
                        isLocked={isLocked}
                        contentCount={contentCount}
                        onRequestRemove={
                          onRemoveSegment && isCurrent
                            ? () => {
                                setRemoveConfirmSegment(seg);
                              }
                            : undefined
                        }
                        onClick={() => {
                          onSelectSegment?.(seg);
                        }}
                      />
                    );
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <ul
              role="listbox"
              aria-label="Available sections"
              style={{ margin: 0, padding: '4px 0', listStyle: 'none' }}
            >
              {sortedSegments.map((seg) => {
                const isCurrent = String(seg.id) === String(currentSegmentId);
                const isLocked = seg.is_visible_to_students === false;
                const contentCount =
                  (seg.videos?.length ?? 0) +
                  (seg.tasks?.length ?? 0) +
                  (seg.tests?.length ?? 0) +
                  (seg.presentations?.length ?? 0);

                return (
                  <SidePanelSegmentRow
                    key={seg.id}
                    segment={seg}
                    isCurrent={isCurrent}
                    isLocked={isLocked}
                    contentCount={contentCount}
                    onRequestRemove={
                      onRemoveSegment && isCurrent
                        ? () => {
                            setRemoveConfirmSegment(seg);
                          }
                        : undefined
                    }
                    onClick={() => {
                      onSelectSegment?.(seg);
                    }}
                  />
                );
              })}
            </ul>
          )
        ) : (
          /* ── UNIT mode (original / student / backward-compat) ─────────────── */
          sortedUnits.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 16px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#EEF0FE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 8,
                }}
              >
                <BookOpen style={{ width: 18, height: 18, color: '#6C6FEF' }} />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>
                No units yet
              </p>
            </div>
          ) : (
            <ul
              role="listbox"
              aria-label="Available units"
              style={{ margin: 0, padding: '4px 0', listStyle: 'none' }}
            >
              {sortedUnits.map((unit) => {
                const isCurrent   = String(unit.id) === String(currentUnitId);
                const isCompleted = completedUnitIds?.has(unit.id) ?? false;
                const isLocked    = unit.is_visible_to_students === false;

                return (
                  <SidePanelUnitRow
                    key={unit.id}
                    unit={unit}
                    isCurrent={isCurrent}
                    isCompleted={isCompleted}
                    isLocked={isLocked}
                    onClick={() => !isLocked && onSelectUnit(unit)}
                  />
                );
              })}
            </ul>
          )
        )}
      </div>

      {/* ── Footer actions ─────────────────────────────────────────────────── */}
      {showFooterActions && (
        <div
          style={{
            flexShrink: 0,
            padding: '10px 10px 12px',
            borderTop: '1px solid #F0F1F8',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {onFinishUnit && <FinishUnitButton onClick={onFinishUnit} />}
          {showAddSectionButton && <AddUnitButton onClick={handleAddSection} />}
          {onExtra      && <ExtraButton      onClick={onExtra} />}
        </div>
      )}

      {/* Confirm remove section — portal so parent aside overflow does not clip */}
      {removeConfirmSegment &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="presentation"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 80,
              background: 'rgba(15, 23, 42, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setRemoveConfirmSegment(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setRemoveConfirmSegment(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="section-remove-dialog-title"
              style={{
                width: '100%',
                maxWidth: 340,
                background: '#ffffff',
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                boxShadow: '0 16px 48px rgba(15, 23, 42, 0.18)',
                padding: '18px 18px 14px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p
                id="section-remove-dialog-title"
                style={{
                  margin: '0 0 8px',
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#0f172a',
                  lineHeight: 1.35,
                }}
              >
                Remove this section?
              </p>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
                {`Are you sure you want to remove "${removeConfirmSegment.title}"? This cannot be undone.`}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setRemoveConfirmSegment(null)}
                  style={{
                    padding: '7px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#64748b',
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const seg = removeConfirmSegment;
                    setRemoveConfirmSegment(null);
                    if (seg) void onRemoveSegment?.(seg);
                  }}
                  style={{
                    padding: '7px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#ffffff',
                    background: 'linear-gradient(135deg, #6C6FEF 0%, #4F52C2 100%)',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </aside>
  );
}

// ─── SidePanelSegmentRow  (NEW) ───────────────────────────────────────────────

type SegmentRowProps = {
  segment:         Segment;
  isCurrent:       boolean;
  isLocked:        boolean;
  contentCount:    number;
  onClick:         () => void;
  /** Opens parent confirm dialog when the small remove control is used */
  onRequestRemove?: () => void;
};

/**
 * Same as SidePanelSegmentRow but registered with @dnd-kit — drag handle only, row click still navigates.
 */
function SortableSidePanelSegmentRow(props: SegmentRowProps) {
  const {
    segment,
    isCurrent,
    isLocked,
    contentCount,
    onClick,
    onRequestRemove,
  } = props;

  // Hover + rail colors mirror the non-sortable row
  const [hovered, setHovered] = React.useState(false);
  const rowBg = isCurrent ? '#EEF0FE' : hovered && !isLocked ? '#F7F7FA' : 'transparent';
  const dotBg = isCurrent ? '#6C6FEF' : '#cbd5e1';

  // Sortable id matches Segment.id; locked sections cannot be dragged
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: segment.id,
    disabled: isLocked,
  });

  // Smooth transform while dragging so the list animates predictably
  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
    zIndex: isDragging ? 3 : undefined,
    position: 'relative' as const,
  };

  return (
    <li ref={setNodeRef} style={sortableStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          width: '100%',
          borderLeft: isCurrent ? '3px solid #6C6FEF' : '3px solid transparent',
          background: rowBg,
          transition: 'background 0.12s ease, border-color 0.12s ease',
        }}
      >
        {/* Drag handle — isolated from navigation button so clicks do not start a drag */}
        <button
          type="button"
          className="touch-none"
          aria-label={`Drag to reorder ${segment.title}`}
          disabled={isLocked}
          {...attributes}
          {...listeners}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            flexShrink: 0,
            width: 26,
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: isLocked ? 'not-allowed' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            opacity: isLocked ? 0.35 : 1,
          }}
        >
          <GripVertical aria-hidden style={{ width: 14, height: 14 }} strokeWidth={2} />
        </button>

        <button
          disabled={isLocked}
          onClick={onClick}
          role="option"
          aria-selected={isCurrent}
          aria-disabled={isLocked}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'block',
            textAlign: 'left',
            padding: '8px 12px 8px 0',
            background: 'transparent',
            border: 'none',
            cursor: isLocked ? 'not-allowed' : 'pointer',
            opacity: isLocked ? 0.4 : 1,
            outline: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                flexShrink: 0,
                background: dotBg,
              }}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: isCurrent ? 600 : 500,
                  color: isCurrent ? '#4F52C2' : isLocked ? '#cbd5e1' : '#334155',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.35,
                }}
              >
                {segment.title}
              </span>
              {contentCount > 0 && (
                <span
                  style={{
                    display: 'block',
                    fontSize: 9,
                    color: isCurrent ? '#6C6FEF' : '#94a3b8',
                    fontWeight: 500,
                    marginTop: 1,
                  }}
                >
                  {contentCount} item{contentCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {onRequestRemove && (
              <button
                type="button"
                aria-label={`Remove section ${segment.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestRemove();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  padding: 0,
                  flexShrink: 0,
                  border: 'none',
                  borderRadius: 6,
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f1f5f9';
                  e.currentTarget.style.color = '#64748b';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#94a3b8';
                }}
              >
                <X aria-hidden style={{ width: 13, height: 13 }} strokeWidth={2.25} />
              </button>
            )}
          </div>

          {/* "Now studying" micro-label (hidden) */}
          {/*
          {isCurrent && (
            <p
              style={{
                margin: '2px 0 0 18px',
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                color: '#6C6FEF',
                opacity: 0.65,
              }}
            >
              Now studying
            </p>
          )}
          */}
        </button>
      </div>
    </li>
  );
}

function SidePanelSegmentRow({
  segment,
  isCurrent,
  isLocked,
  contentCount,
  onClick,
  onRequestRemove,
}: SegmentRowProps) {
  const [hovered, setHovered] = React.useState(false);

  // Row background: highlight current row or hover affordance when navigable
  const rowBg = isCurrent ? '#EEF0FE' : hovered && !isLocked ? '#F7F7FA' : 'transparent';
  // Dot color for the left rail: brand when active, neutral otherwise (replaces numbered badges)
  const dotBg = isCurrent ? '#6C6FEF' : '#cbd5e1';

  return (
    <li>
      <button
        disabled={isLocked}
        onClick={onClick}
        role="option"
        aria-selected={isCurrent}
        aria-disabled={isLocked}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '8px 12px 8px 9px',
          background: rowBg,
          border: 'none',
          borderLeft: isCurrent ? '3px solid #6C6FEF' : '3px solid transparent',
          cursor: isLocked ? 'not-allowed' : 'pointer',
          opacity: isLocked ? 0.4 : 1,
          transition: 'background 0.12s ease, border-color 0.12s ease',
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Position dot (non-numeric rail indicator) */}
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              flexShrink: 0,
              background: dotBg,
            }}
          />

          {/* Title + content count */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: isCurrent ? 600 : 500,
                color: isCurrent ? '#4F52C2' : isLocked ? '#cbd5e1' : '#334155',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.35,
              }}
            >
              {segment.title}
            </span>
            {contentCount > 0 && (
              <span
                style={{
                  display: 'block',
                  fontSize: 9,
                  color: isCurrent ? '#6C6FEF' : '#94a3b8',
                  fontWeight: 500,
                  marginTop: 1,
                }}
              >
                {contentCount} item{contentCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Remove control (replaces active pulse dot) — does not trigger row navigation */}
          {onRequestRemove && (
            <button
              type="button"
              aria-label={`Remove section ${segment.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onRequestRemove();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                padding: 0,
                flexShrink: 0,
                border: 'none',
                borderRadius: 6,
                background: 'transparent',
                color: '#94a3b8',
                cursor: 'pointer',
                transition: 'background 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f1f5f9';
                e.currentTarget.style.color = '#64748b';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              <X aria-hidden style={{ width: 13, height: 13 }} strokeWidth={2.25} />
            </button>
          )}
        </div>

        {/* "Active" / "Now studying" micro-label (hidden) */}
        {/*
        {isCurrent && (
          <p
            style={{
              margin: '2px 0 0 18px',
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: '#6C6FEF',
              opacity: 0.65,
            }}
          >
            Now studying
          </p>
        )}
        */}
      </button>
    </li>
  );
}

// ─── SidePanelUnitRow  (ORIGINAL — unchanged) ─────────────────────────────────

type RowProps = {
  unit: any;
  isCurrent: boolean;
  isCompleted: boolean;
  isLocked: boolean;
  onClick: () => void;
};

function SidePanelUnitRow({ unit, isCurrent, isCompleted, isLocked, onClick }: RowProps) {
  const [hovered, setHovered] = React.useState(false);

  // Row background: highlight current row or hover affordance when navigable
  const rowBg = isCurrent ? '#EEF0FE' : hovered && !isLocked ? '#F7F7FA' : 'transparent';
  // Dot color: current → brand; completed (not current) → tinted brand; else neutral (replaces numbers/check badge)
  const dotBg = isCurrent ? '#6C6FEF' : isCompleted ? '#93A0F5' : '#cbd5e1';

  return (
    <li>
      <button
        disabled={isLocked}
        onClick={onClick}
        role="option"
        aria-selected={isCurrent}
        aria-disabled={isLocked}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '8px 12px 8px 9px',
          background: rowBg,
          border: 'none',
          borderLeft: isCurrent ? '3px solid #6C6FEF' : '3px solid transparent',
          cursor: isLocked ? 'not-allowed' : 'pointer',
          opacity: isLocked ? 0.4 : 1,
          transition: 'background 0.12s ease, border-color 0.12s ease',
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Position dot (non-numeric rail indicator; completed units use a brighter dot) */}
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              flexShrink: 0,
              background: dotBg,
            }}
          />

          {/* Title */}
          <span
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: isCurrent ? 600 : 500,
              color: isCurrent ? '#4F52C2' : isLocked ? '#cbd5e1' : '#334155',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.35,
            }}
          >
            {unit.title}
          </span>
        </div>

        {/* "Now studying" micro-label (hidden) */}
        {/*
        {isCurrent && (
          <p
            style={{
              margin: '2px 0 0 18px',
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: '#6C6FEF',
              opacity: 0.65,
            }}
          >
            Now studying
          </p>
        )}
        */}
      </button>
    </li>
  );
}

// ─── Footer action buttons  (ORIGINAL — unchanged) ────────────────────────────

function AddUnitButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        width: '100%',
        padding: '7px 10px',
        background: hovered ? '#EEF0FE' : 'transparent',
        border: `1.5px dashed ${hovered ? '#6C6FEF' : '#CBD5E1'}`,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'background 0.12s ease, border-color 0.12s ease',
        outline: 'none',
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          background: '#EEF0FE',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Plus style={{ width: 11, height: 11, color: '#6C6FEF' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#6C6FEF' }}>
        Add section
      </span>
    </button>
  );
}

function FinishUnitButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: '100%',
        padding: '9px 10px',
        background: hovered
          ? 'linear-gradient(135deg, #5A5DE0 0%, #4345B0 100%)'
          : 'linear-gradient(135deg, #6C6FEF 0%, #4F52C2 100%)',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        boxShadow: hovered
          ? '0 3px 12px 0 rgba(108, 111, 239, 0.40)'
          : '0 2px 8px 0 rgba(108, 111, 239, 0.30)',
        transition: 'background 0.12s ease, box-shadow 0.12s ease',
        outline: 'none',
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <Flag style={{ width: 13, height: 13, color: '#ffffff' }} />
      Finish unit
    </button>
  );
}

function ExtraButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: '6px 10px',
        background: hovered ? '#F7F7FA' : 'transparent',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'background 0.12s ease',
        outline: 'none',
        color: hovered ? '#6C6FEF' : '#94a3b8',
        fontSize: 11,
        textAlign: 'left',
      }}
    >
      <BookOpen style={{ width: 13, height: 13, flexShrink: 0 }} />
      Additional materials
    </button>
  );
}