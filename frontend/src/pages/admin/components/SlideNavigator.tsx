/**
 * SlideNavigator.tsx — Part 3 + Part 11 + Lesson Mode
 *
 * Left panel slide list with:
 *   • Thumbnail cards (mini-rendered theme canvas)
 *   • Image status dots
 *   • Native drag-to-reorder
 *   • Hover actions: Add After, Duplicate (Part 11), Delete
 *   • "Add Slide" footer button
 *
 * Lesson-mode addition:
 *   When `lessonObjective` is supplied (Mode B), a teal header strip is
 *   rendered above the slide list, reminding the teacher of the lesson goal
 *   while they navigate between slides.  This is read-only — the objective
 *   is set once at generation time.
 */

import React, { useRef, useState, DragEvent } from "react";
import {
  ReviewSlide, ThemeSpec,
  themeBg, themeAccent, themeText,
  IcoPlus, IcoTrash, IcoDuplicate, IcoDots,
} from "../shared";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SlideNavigatorProps {
  slides:        ReviewSlide[];
  activeId:      string;
  theme:         ThemeSpec;
  imageProgress: Record<number, string>;   // 1-based → "loading"|"done"|"error"|"skipped"
  onSelect:      (id: string) => void;
  onAdd:         (afterId: string) => void;
  onDuplicate:   (id: string) => void;     // Part 11
  onDelete:      (id: string) => void;
  onReorder:     (fromIdx: number, toIdx: number) => void;
  /**
   * Mode B only — learning objective for the current lesson.
   * When provided, renders a compact objective strip above the slide list
   * to keep the teacher's goal visible while editing individual slides.
   */
  lessonObjective?: string;
}

export function SlideNavigator({
  slides, activeId, theme, imageProgress,
  onSelect, onAdd, onDuplicate, onDelete, onReorder,
  lessonObjective,
}: SlideNavigatorProps) {

  const dragFrom = useRef<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  /** Collapse / expand the objective strip without losing scroll position. */
  const [objExpanded, setObjExpanded] = useState(true);

  const handleDragStart = (e: DragEvent<HTMLLIElement>, i: number) => {
    dragFrom.current = i;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
    setTimeout(() => (e.target as HTMLElement).classList.add("rv-thumb--dragging"), 0);
  };
  const handleDragEnd = (e: DragEvent<HTMLLIElement>) => {
    (e.target as HTMLElement).classList.remove("rv-thumb--dragging");
    dragFrom.current = null; setDropAt(null);
  };
  const handleDragOver = (e: DragEvent<HTMLLIElement>, i: number) => {
    e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropAt(i);
  };
  const handleDrop = (e: DragEvent<HTMLLIElement>, toIdx: number) => {
    e.preventDefault();
    const from = dragFrom.current;
    if (from !== null && from !== toIdx) onReorder(from, toIdx);
    dragFrom.current = null; setDropAt(null);
  };

  const lastId = slides[slides.length - 1]?.id ?? "";

  return (
    <aside className="rv-nav" aria-label="Slide list">

      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="rv-nav-hd">
        <span className="rv-nav-label">Slides</span>
        <button className="rv-nav-addbtn" title="Add slide at end" onClick={() => onAdd(lastId)}>
          <IcoPlus sz={12} />
        </button>
      </div>

      {/* ── Mode B: lesson objective strip ─────────────────────────────────── */}
      {lessonObjective && (
        <div className="rv-nav-obj">
          <button
            className="rv-nav-obj-toggle"
            onClick={() => setObjExpanded(v => !v)}
            aria-expanded={objExpanded}
            title={objExpanded ? "Collapse objective" : "Expand objective"}
          >
            <span className="rv-nav-obj-lbl">🎯 Objective</span>
            <span className="rv-nav-obj-chevron" style={{ transform: objExpanded ? "rotate(0)" : "rotate(-90deg)" }}>
              ▾
            </span>
          </button>
          {objExpanded && (
            <p className="rv-nav-obj-text">{lessonObjective}</p>
          )}
        </div>
      )}

      {/* ── Scrollable slide list ───────────────────────────────────────────── */}
      <ol className="rv-nav-list" role="listbox">
        {slides.map((slide, i) => {
          const bg    = themeBg(theme, i);
          const acc   = themeAccent(theme);
          const textC = themeText(theme);
          const imgSt = imageProgress[i + 1];

          return (
            <li
              key={slide.id}
              role="option"
              aria-selected={slide.id === activeId}
              className={[
                "rv-thumb",
                slide.id === activeId ? "rv-thumb--active"    : "",
                dropAt    === i       ? "rv-thumb--droptarget" : "",
              ].filter(Boolean).join(" ")}
              draggable
              onDragStart={e => handleDragStart(e, i)}
              onDragEnd={handleDragEnd}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={e => handleDrop(e, i)}
              onClick={() => onSelect(slide.id)}
            >
              {/* Drag handle */}
              <span className="rv-thumb-drag" title="Drag to reorder" aria-hidden="true">
                <IcoDots />
              </span>

              {/* Mini slide canvas */}
              <div className="rv-thumb-canvas" style={{ background: bg, borderTop: `3px solid ${acc}` }}>
                <span className="rv-thumb-num" style={{ color: acc }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="rv-thumb-title" style={{ color: textC }}>
                  {slide.title
                    ? (slide.title.length > 34 ? slide.title.slice(0, 34) + "…" : slide.title)
                    : <em style={{ opacity: .4 }}>Untitled</em>}
                </span>
                {/* Bullet stubs */}
                <div className="rv-thumb-lines">
                  {Array.from({ length: Math.min(slide.bullets.length, 3) }).map((_, j) => (
                    <div key={j} className="rv-thumb-line"
                      style={{ background: textC, width: j === 2 ? "52%" : "80%" }} />
                  ))}
                </div>

                {/* Status dot */}
                {slide._regenerating             && <span className="rv-dot rv-dot--regen"   title="Regenerating…"  />}
                {!slide._regenerating && imgSt === "loading" && <span className="rv-dot rv-dot--loading" title="Generating image…"/>}
                {!slide._regenerating && imgSt === "done"    && <span className="rv-dot rv-dot--done"    title="Image ready"    />}
                {!slide._regenerating && imgSt === "error"   && <span className="rv-dot rv-dot--error"   title="Image failed"   />}
              </div>

              {/* Hover action row — Part 11 adds Duplicate */}
              <div className="rv-thumb-acts">
                <button className="rv-tact rv-tact--add"
                  title="Insert slide after"
                  onClick={e => { e.stopPropagation(); onAdd(slide.id); }}>
                  <IcoPlus sz={9} />
                </button>
                <button className="rv-tact rv-tact--dup"
                  title="Duplicate slide"
                  onClick={e => { e.stopPropagation(); onDuplicate(slide.id); }}>
                  <IcoDuplicate />
                </button>
                <button className="rv-tact rv-tact--del"
                  title="Delete slide"
                  disabled={slides.length <= 1}
                  onClick={e => { e.stopPropagation(); onDelete(slide.id); }}>
                  <IcoTrash sz={9} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Add at end */}
      <button className="rv-nav-addfooter" onClick={() => onAdd(lastId)}>
        <IcoPlus sz={11} /> Add Slide
      </button>

      {/* Mode B: compact next-lesson hint at the very bottom of the nav */}
      {lessonObjective && (
        <div className="rv-nav-lesson-hint" aria-hidden="true">
          Edit freely · save when ready
        </div>
      )}
    </aside>
  );
}