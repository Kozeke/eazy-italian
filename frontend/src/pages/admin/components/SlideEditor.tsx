/**
 * SlideEditor.tsx — Parts 4, 5, 6, 7, 11 + Lesson Mode
 *
 * Center panel: sticky toolbar → scrollable slide canvas.
 * Toolbar hosts: navigation, Add, Duplicate (Part 11), Regenerate (Part 7), Delete.
 * Canvas hosts: image panel (Part 5), editable title, BulletList, exercise, notes.
 * Switches to <SlidePreview> when viewMode === "preview" (Part 6).
 *
 * Lesson-mode additions (when lessonCtx is supplied):
 *   • A small teal chip inside the canvas header shows the lesson title,
 *     so the teacher always knows which lesson the slide belongs to.
 *   • The "Regenerate" toolbar button shows a confirmation tooltip explaining
 *     that regeneration replaces manual edits for THIS lesson's slide — the
 *     copy makes the scope unambiguous (not the whole course).
 */

import React, { useRef, useEffect, KeyboardEvent, DragEvent, useState } from "react";
import {
  ReviewSlide, DeckAction, ThemeSpec,
  themeAccent, themeText, themeMuted, themeBg,
  autogrow, AutoTA,
  IcoChevLeft, IcoChevRight, IcoPlus, IcoTrash, IcoDuplicate, IcoSparkle, IcoDots, IcoX,
} from "../shared";
import { SlidePreview } from "./SlidePreview";
import { SlideImageEditor } from "./SlideImageEditor";
import type { LessonContext } from "../ReviewSlidesPage";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SlideEditorProps {
  slide:         ReviewSlide;
  index:         number;
  total:         number;
  theme:         ThemeSpec;
  imageStatus:   string;
  viewMode:      "edit" | "preview";
  dispatch:      React.Dispatch<DeckAction>;
  /** From useSlideRegen — Part 7 */
  slideRegenBusy:  boolean;
  slideRegenError: string | null;
  onSlideRegen:    () => void;
  onPrev:       () => void;
  onNext:       () => void;
  onAddAfter:   () => void;
  onDuplicate:  () => void;     // Part 11
  onDelete:     () => void;
  /**
   * Mode B only — lesson context for the chip in the canvas header and
   * the regen confirmation label in the toolbar.
   */
  lessonCtx?:  LessonContext | null;
}

export function SlideEditor({
  slide, index, total, theme, imageStatus, viewMode,
  dispatch, slideRegenBusy, slideRegenError, onSlideRegen,
  onPrev, onNext, onAddAfter, onDuplicate, onDelete,
  lessonCtx,
}: SlideEditorProps) {

  const acc   = themeAccent(theme);
  const textC = themeText(theme);
  const muted = themeMuted(theme);
  const bg    = themeBg(theme, index);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (titleRef.current) autogrow(titleRef.current); }, [slide.title]);

  const patch = (p: Partial<ReviewSlide>) =>
    dispatch({ type: "PATCH_SLIDE", id: slide.id, patch: p });

  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="rv-editor-wrap">

      {/* ── Sticky toolbar ─────────────────────────────────────────────── */}
      <div className="rv-toolbar">
        {/* Navigation */}
        <button className="rv-tbtn" onClick={onPrev} disabled={index === 0} title="Previous slide (←)">
          <IcoChevLeft sz={15} />
        </button>
        <span className="rv-toolbar-pos">{index + 1} / {total}</span>
        <button className="rv-tbtn" onClick={onNext} disabled={index === total - 1} title="Next slide (→)">
          <IcoChevRight sz={15} />
        </button>

        {viewMode === "edit" && (
          <>
            <div className="rv-toolbar-sep" />

            {/* Add */}
            <button className="rv-tbtn rv-tbtn--lbl" onClick={onAddAfter} title="Insert slide after this one">
              <IcoPlus sz={13} /> <span>Add</span>
            </button>

            {/* Part 11 — Duplicate */}
            <button className="rv-tbtn rv-tbtn--lbl rv-tbtn--dup" onClick={onDuplicate}
              title="Duplicate this slide (creates an identical copy immediately after)">
              <IcoDuplicate /> <span>Duplicate</span>
            </button>

            {/* Part 7 — Regenerate Slide
                In lesson mode, the title clarifies scope so teachers don't
                worry they're regenerating the whole course.             */}
            <button
              className={`rv-tbtn rv-tbtn--lbl rv-tbtn--regen ${slideRegenBusy ? "rv-tbtn--busy" : ""}`}
              onClick={onSlideRegen}
              disabled={slideRegenBusy || slide._regenerating}
              title={
                lessonCtx
                  ? `Rewrite this slide's content with AI (replaces your edits for slide ${index + 1} of "${lessonCtx.title}")`
                  : "Ask AI to rewrite this slide's content (your manual edits will be replaced)"
              }
            >
              {slideRegenBusy
                ? <><span className="rv-spin-dark" /> Regenerating…</>
                : <><IcoSparkle /> Regenerate</>}
            </button>

            <div className="rv-toolbar-sep" />

            {/* Delete */}
            <button className="rv-tbtn rv-tbtn--lbl rv-tbtn--danger" onClick={onDelete}
              disabled={total <= 1} title="Delete this slide">
              <IcoTrash sz={13} /> <span>Delete</span>
            </button>
          </>
        )}

        {slideRegenError && <span className="rv-regen-err">⚠ {slideRegenError}</span>}
      </div>

      {/* ── Canvas / Preview ────────────────────────────────────────────── */}
      <div className="rv-canvas-scroll">

        {viewMode === "preview" ? (
          /* Part 6 */
          <SlidePreview
            slide={slide}
            theme={theme}
            imageStatus={imageStatus}
            lessonObjective={lessonCtx?.objective}
          />
        ) : (
          /* Edit canvas */
          <div
            className={`rv-canvas ${slide._regenerating ? "rv-canvas--regen" : ""}`}
            style={{ background: bg, borderTop: `5px solid ${acc}` }}
          >
            {/* Part 7: regeneration overlay */}
            {slide._regenerating && (
              <div className="rv-regen-overlay">
                <span className="rv-regen-spin" />
                <span>Rewriting slide with AI…</span>
                <span className="rv-regen-note">Your edits will be updated when complete</span>
              </div>
            )}

            {/* Slide counter badge + Mode B lesson chip on same row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div className="rv-canvas-num" style={{ color: acc }}>
                Slide {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </div>
              {lessonCtx && (
                <div className="rv-canvas-lesson-ctx" aria-label={`Lesson: ${lessonCtx.title}`}>
                  📖 {lessonCtx.title}
                </div>
              )}
            </div>

            {/* Part 5: Image panel */}
            <SlideImageEditor
              slide={slide}
              status={imageStatus}
              accent={acc}
              dark={theme.dark}
              fileInput={fileInput}
              onUpdate={patch}
            />
            <input ref={fileInput} type="file" accept="image/*" style={{ display: "none" }}
              onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = () => patch({ image_url: reader.result as string });
                reader.readAsDataURL(file);
                e.target.value = "";
              }} />

            {/* Title */}
            <div className="rv-field">
              <label className="rv-field-lbl" style={{ color: muted }}>Title</label>
              <textarea
                ref={titleRef}
                className="rv-title-ta"
                style={{ color: textC, caretColor: acc }}
                value={slide.title}
                placeholder="Slide title…"
                rows={1}
                onChange={e => { patch({ title: e.target.value }); autogrow(e.target); }}
                onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
              />
            </div>

            {/* Bullets */}
            <div className="rv-field">
              <label className="rv-field-lbl" style={{ color: muted }}>Bullet Points</label>
              <BulletList
                key={slide.id}
                bullets={slide.bullets}
                accent={acc}
                textColor={textC}
                onChange={b   => dispatch({ type: "SET_BULLETS",   id: slide.id, bullets: b })}
                onAdd={ai     => dispatch({ type: "ADD_BULLET",    id: slide.id, afterIdx: ai })}
                onDelete={bi  => dispatch({ type: "DELETE_BULLET", id: slide.id, bulletIdx: bi })}
                onMove={(f,t) => dispatch({ type: "MOVE_BULLET",   id: slide.id, fromIdx: f, toIdx: t })}
              />
            </div>

            {/* Exercise */}
            {slide.exercise !== null && slide.exercise !== undefined && (
              <div className="rv-exercise" style={{ borderColor: acc }}>
                <span className="rv-exercise-lbl" style={{ color: acc }}>✏️ Exercise</span>
                <AutoTA value={slide.exercise} placeholder="Describe the exercise…"
                  className="rv-exercise-ta" style={{ color: textC }}
                  onChange={v => patch({ exercise: v })} />
              </div>
            )}

            {/* Speaker Notes */}
            {slide.teacher_notes !== null && slide.teacher_notes !== undefined && (
              <div className="rv-notes">
                <span className="rv-notes-lbl">📌 Speaker Notes</span>
                <AutoTA value={slide.teacher_notes} placeholder="Add speaker notes…"
                  className="rv-notes-ta" onChange={v => patch({ teacher_notes: v })} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BulletList — lives in SlideEditor.tsx (tightly coupled to canvas styling)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface BulletListProps {
  bullets:   string[];
  accent:    string;
  textColor: string;
  onChange:  (b: string[]) => void;
  onAdd:     (afterIdx: number) => void;
  onDelete:  (idx: number) => void;
  onMove:    (from: number, to: number) => void;
}

function BulletList({ bullets, accent, textColor, onChange, onAdd, onDelete, onMove }: BulletListProps) {
  const rowRefs   = useRef<(HTMLTextAreaElement | null)[]>([]);
  const pendFocus = useRef<number | null>(null);
  const dragFrom  = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    if (pendFocus.current !== null) {
      const el = rowRefs.current[pendFocus.current];
      if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l); }
      pendFocus.current = null;
    }
  });

  const updateAt = (i: number, v: string) => {
    const next = [...bullets]; next[i] = v; onChange(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); onAdd(i); pendFocus.current = i + 1;
    } else if (e.key === "Backspace" && bullets[i] === "") {
      e.preventDefault(); onDelete(i); pendFocus.current = Math.max(0, i - 1);
    } else if (e.key === "ArrowUp"   && i > 0)                { e.preventDefault(); rowRefs.current[i - 1]?.focus(); }
    else if   (e.key === "ArrowDown" && i < bullets.length - 1) { e.preventDefault(); rowRefs.current[i + 1]?.focus(); }
  };

  const hDS = (e: DragEvent<HTMLDivElement>, i: number) => {
    dragFrom.current = i; e.dataTransfer.effectAllowed = "move";
    setTimeout(() => (e.currentTarget as HTMLElement).setAttribute("data-dragging", "1"), 0);
  };
  const hDE = (e: DragEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).removeAttribute("data-dragging");
    dragFrom.current = null; setDragOver(null);
  };
  const hDO = (e: DragEvent<HTMLDivElement>, i: number) => { e.preventDefault(); setDragOver(i); };
  const hDr = (e: DragEvent<HTMLDivElement>, to: number) => {
    e.preventDefault();
    const from = dragFrom.current;
    if (from !== null && from !== to) onMove(from, to);
    dragFrom.current = null; setDragOver(null);
  };

  return (
    <div className="rv-bullet-list" role="list">
      {bullets.map((b, i) => (
        <div key={i} role="listitem"
          className={["rv-bullet-row", dragOver === i ? "rv-bullet-row--over" : ""].filter(Boolean).join(" ")}
          draggable onDragStart={e => hDS(e, i)} onDragEnd={hDE}
          onDragOver={e => hDO(e, i)} onDrop={e => hDr(e, i)}>

          <span className="rv-bullet-drag" aria-hidden="true"><IcoDots /></span>
          <span className="rv-bullet-dot" style={{ background: accent }} aria-hidden="true" />

          <textarea
            ref={el => { rowRefs.current[i] = el; }}
            className="rv-bullet-ta"
            style={{ color: textColor, caretColor: accent }}
            value={b} placeholder="Add a bullet point…" rows={1}
            onChange={e => { updateAt(i, e.target.value); autogrow(e.target); }}
            onFocus={e => autogrow(e.target)}
            onKeyDown={e => handleKeyDown(e, i)}
            aria-label={`Bullet ${i + 1}`}
          />

          <button className="rv-bullet-delbtn" tabIndex={-1}
            aria-label={`Delete bullet ${i + 1}`}
            onClick={() => { onDelete(i); pendFocus.current = Math.max(0, i - 1); }}>
            <IcoX sz={11} />
          </button>
        </div>
      ))}

      <button className="rv-add-bullet" style={{ color: accent }}
        onClick={() => { onAdd(bullets.length - 1); pendFocus.current = bullets.length; }}>
        <IcoPlus sz={11} /> Add bullet point
        <span className="rv-add-bullet-hint">or press Enter in any bullet</span>
      </button>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SlideSettings — right-panel sidebar, lives alongside SlideEditor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SlideSettingsProps {
  slide:       ReviewSlide;
  index:       number;
  total:       number;
  imageStatus: string;
  dispatch:    React.Dispatch<DeckAction>;
  onDelete:    () => void;
  onAddAfter:  () => void;
  onDuplicate: () => void;     // Part 11
  /** Mode B — passed from ReviewSlidesPage when next lesson info is available */
  nextLesson?:   { id: string; title: string; moduleTitle: string } | null;
  onLessonDone?: () => void;
  onNextLesson?: () => void;
  saving?:       boolean;
}

export function SlideSettings({
  slide, index, total, imageStatus, dispatch, onDelete, onAddAfter, onDuplicate,
  nextLesson, onLessonDone, onNextLesson, saving,
}: SlideSettingsProps) {

  const patch = (p: Partial<ReviewSlide>) =>
    dispatch({ type: "PATCH_SLIDE", id: slide.id, patch: p });

  const isLessonMode = !!onLessonDone;

  return (
    <aside className="rv-settings" aria-label="Slide settings">
      <div className="rv-settings-inner">

        {/* Slide info */}
        <section className="rv-set-sec">
          <h3 className="rv-set-hd">Slide Info</h3>
          <div className="rv-set-row">
            <span className="rv-set-lbl">Position</span>
            <span className="rv-set-val">{index + 1} of {total}</span>
          </div>
          <div className="rv-set-row">
            <span className="rv-set-lbl">Bullets</span>
            <span className="rv-set-val">{slide.bullets.length}</span>
          </div>
          <div className="rv-set-row">
            <span className="rv-set-lbl">Image</span>
            <span className={`rv-imgst rv-imgst--${imageStatus || "none"}`}>
              {imageStatus === "loading" ? "⏳ Generating"
                : imageStatus === "done"  ? "✓ Ready"
                : imageStatus === "error" ? "⚠ Failed"
                : slide.image_url         ? "✓ Uploaded"
                :                           "— None"}
            </span>
          </div>
        </section>

        {/* Image type */}
        <section className="rv-set-sec">
          <h3 className="rv-set-hd">Image Type</h3>
          <div className="rv-imgtype-grid">
            {([ {id:"auto",label:"Auto",icon:"✨"}, {id:"diagram",label:"Diagram",icon:"🔷"},
                {id:"chart",label:"Chart",icon:"📊"}, {id:"scene",label:"Scene",icon:"🖼️"}, {id:"none",label:"None",icon:"⊘"} ] as const).map(t => (
              <button key={t.id}
                className={`rv-imgtype-btn ${slide.imageType === t.id ? "rv-imgtype-btn--on" : ""}`}
                onClick={() => patch({ imageType: t.id as ReviewSlide["imageType"] })}>
                <span className="rv-imgtype-icon">{t.icon}</span>
                <span className="rv-imgtype-lbl">{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Content toggles */}
        <section className="rv-set-sec">
          <h3 className="rv-set-hd">Content</h3>
          <label className="rv-toggle-row">
            <div>
              <div className="rv-toggle-lbl">Speaker Notes</div>
              <div className="rv-toggle-hint">Visible during presentation</div>
            </div>
            <Toggle on={slide.teacher_notes !== null && slide.teacher_notes !== undefined}
              onToggle={v => patch({ teacher_notes: v ? "" : null })} />
          </label>
          <label className="rv-toggle-row">
            <div>
              <div className="rv-toggle-lbl">Exercise</div>
              <div className="rv-toggle-hint">Student activity</div>
            </div>
            <Toggle on={slide.exercise !== null && slide.exercise !== undefined}
              onToggle={v => patch({ exercise: v ? "" : null })} />
          </label>
        </section>

        {/* Actions — Part 11 adds Duplicate */}
        <section className="rv-set-sec">
          <h3 className="rv-set-hd">Actions</h3>
          <button className="rv-act-btn rv-act-btn--add" onClick={onAddAfter}>
            <IcoPlus sz={12} /> Insert slide after
          </button>
          <button className="rv-act-btn rv-act-btn--dup" onClick={onDuplicate}>
            <IcoDuplicate /> Duplicate slide
          </button>
          <button className="rv-act-btn rv-act-btn--del" onClick={onDelete} disabled={total <= 1}>
            <IcoTrash sz={12} /> Delete this slide
          </button>
        </section>

        {/* Mode B: Next Lesson card — shown at bottom of sidebar */}
        {isLessonMode && nextLesson && onNextLesson && (
          <section className="rv-next-card">
            <h3 className="rv-set-hd" style={{ marginBottom: 6 }}>Up Next</h3>
            <div className="rv-next-meta">
              <span className="rv-next-module">{nextLesson.moduleTitle}</span>
              <span className="rv-next-title">{nextLesson.title}</span>
            </div>
            <button
              className="rv-act-btn rv-act-btn--next"
              onClick={onNextLesson}
              disabled={!!saving}
            >
              {saving
                ? <><span className="rv-spin-inline" /> Saving…</>
                : <>Generate next lesson →</>}
            </button>
            <button
              className="rv-act-btn rv-act-btn--alll"
              onClick={onLessonDone}
            >
              ← All lessons
            </button>
          </section>
        )}

        {/* Mode B: "Done with lesson" when this is the last lesson */}
        {isLessonMode && !nextLesson && onLessonDone && (
          <section className="rv-set-sec">
            <h3 className="rv-set-hd" style={{ color: "#059669" }}>🎉 Last Lesson</h3>
            <p style={{ fontSize: 12, color: "var(--k3)", lineHeight: 1.5, margin: 0 }}>
              This is the final lesson. Save and return to the overview to publish.
            </p>
            <button
              className="rv-act-btn rv-act-btn--next"
              style={{ marginTop: 6 }}
              onClick={onLessonDone}
              disabled={!!saving}
            >
              {saving ? "Saving…" : "✓ Done — All Lessons"}
            </button>
          </section>
        )}
      </div>
    </aside>
  );
}

// local copy of Toggle (avoids circular import; shared.ts exports the one used in ReviewSlidesPage)
function Toggle({ on, onToggle }: { on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on}
      className={`rv-tog ${on ? "rv-tog--on" : ""}`}
      onClick={() => onToggle(!on)} />
  );
}