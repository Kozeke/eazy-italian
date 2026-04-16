/**
 * ReviewSlidesPage.tsx — Part 12 root (Parts 1 – 12 fully wired)
 *
 * Supports two operating modes:
 *
 * ── Mode A: Classic (standalone course review) ─────────────────────────────
 *   Pass result / form / design / slides / imageProgress as before.
 *   lessonCtx, nextLesson, onLessonDone, onNextLesson are all undefined.
 *   Behaviour is 100% identical to Parts 1-12 before this diff.
 *
 * ── Mode B: Lesson-by-lesson workflow ──────────────────────────────────────
 *   Additionally pass lessonCtx + nextLesson + onLessonDone + onNextLesson.
 *
 *   UX flow (Step 2 → Step 3):
 *     1. Teacher clicks a lesson in CourseBuildScreen.
 *     2. AI generates ONLY that lesson's slides (Step 2).
 *     3. ReviewSlidesPage mounts in Mode B (Step 3).
 *     4. Topbar shows breadcrumb:  Module  ›  Lesson  ·  Lesson 3 / 8
 *     5. A teal objective bar appears below the subbar.
 *     6. Teacher edits freely — all existing tools work unchanged.
 *     7. Footer shows:
 *          ← All Lessons  |  [slide counter]  |  Save  |  Next Lesson →
 *     8. The right sidebar gains a "Next Lesson" card at the bottom.
 *     9. Teacher clicks "Next Lesson →" — current lesson is saved, and
 *        onNextLesson() fires so CourseBuildScreen starts generation.
 *
 * Drop-in replacement for Step 4 in AdminGenerateSlidePage.tsx (Mode A):
 *
 *   {step === 4 && (
 *     <ReviewSlidesPage
 *       result={result}  form={form}  design={design}  slides={slides}
 *       courseId={courseId}  onBack={() => setStep(3)}  onSave={handleSave}
 *       saving={saving}  saved={saved}  imageProgress={imageProgress}
 *     />
 *   )}
 *
 * Usage in Mode B (CourseBuildScreen):
 *
 *   <ReviewSlidesPage
 *     result={lessonResult}  form={form}  design={design}  slides={[]}
 *     imageProgress={imageProgress}  onBack={handleBack}
 *     onSave={handleSave}  saving={saving}  saved={saved}
 *     lessonCtx={{
 *       id: lesson.id,  title: lesson.title,  objective: lesson.objective,
 *       moduleTitle: lesson.moduleTitle,  lessonIndex: 2,  totalLessons: 8,
 *     }}
 *     nextLesson={{ id: "m1l4", title: "Greetings in formal context", moduleTitle: "Module 1" }}
 *     onLessonDone={() => setPhase("build")}
 *     onNextLesson={() => startNextLesson()}
 *   />
 */

import { useState, useCallback, useEffect } from "react";
import {
  // types
  ReviewSlide, UpstreamResultSlide, UpstreamFormData,
  UpstreamDesign, UpstreamSlide, SlideDeckResult,
  // hooks
  useDeck, useDebounce, useAutosave, useSlideRegen, useKeyboardNav,
  // coercion
  fromResultSlide, fromOutlineSlide, toSavePayload,
  // constants
  THEMES,
  // atoms
  SaveBtn, SlideProgressBar,
  // icons
  IcoChevLeft, IcoChevRight,
} from "./shared";
import { SlideNavigator }  from "./components/SlideNavigator";
import { SlideEditor, SlideSettings } from "./components/SlideEditor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Full context for the lesson currently being edited (Mode B only). */
export interface LessonContext {
  id:           string;
  title:        string;
  objective:    string;
  moduleTitle:  string;
  /** 0-based index within the full course. */
  lessonIndex:  number;
  /** Total number of lessons in the course. */
  totalLessons: number;
}

/** Minimal info for the lesson that comes after the current one. */
export interface NextLessonInfo {
  id:          string;
  title:       string;
  moduleTitle: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROPS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ReviewSlidesPageProps {
  result:        SlideDeckResult | null;
  form:          UpstreamFormData;
  design:        UpstreamDesign;
  slides:        UpstreamSlide[];
  /** Optional — enables Part 10 autosave draft every 10 s */
  courseId?:     number | null;
  onBack:        () => void;
  /** Part 9 — receives final edited slides for POST /courses/{id}/slides */
  onSave:        (editedSlides?: UpstreamResultSlide[]) => void;
  saving:        boolean;
  saved:         boolean;
  /** 1-based index → "loading" | "done" | "error" | "skipped" */
  imageProgress: Record<number, string>;

  // ── Mode B: lesson-by-lesson workflow ──────────────────────────────────────
  /** When provided, activates the lesson-by-lesson UI layer (Mode B). */
  lessonCtx?:     LessonContext | null;
  /** The lesson immediately after the current one (null = last lesson). */
  nextLesson?:    NextLessonInfo | null;
  /** Mode B: save current lesson and return to the build overview. */
  onLessonDone?:  () => void;
  /**
   * Mode B: save current lesson and start generating the next one.
   * Called with the saved slides so the parent can persist before generating.
   */
  onNextLesson?:  (savedSlides: UpstreamResultSlide[]) => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUB-COMPONENTS (Mode B only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Teal banner below the subbar showing the lesson's learning objective.
 * Only rendered in Mode B.
 */
function LessonObjectiveBar({ objective }: { objective: string }) {
  return (
    <div className="rv-obj-bar" role="note" aria-label="Lesson objective">
      <span className="rv-obj-bar-icon" aria-hidden="true">🎯</span>
      <span className="rv-obj-bar-label">Objective</span>
      <span className="rv-obj-bar-text">{objective}</span>
    </div>
  );
}

/**
 * Shown at the very bottom of the slide canvas when there is a next lesson.
 * Gives a visually prominent CTA that's impossible to miss after reviewing
 * the last slide.
 */
function NextLessonBanner({
  next,
  saving,
  onNext,
}: {
  next:   NextLessonInfo;
  saving: boolean;
  onNext: () => void;
}) {
  return (
    <div className="rv-next-banner" role="complementary" aria-label="Proceed to next lesson">
      <div className="rv-next-banner-inner">
        <div className="rv-next-banner-info">
          <span className="rv-next-banner-check" aria-hidden="true">✓</span>
          <div>
            <div className="rv-next-banner-head">Lesson slides look good?</div>
            <div className="rv-next-banner-sub">
              Next: <strong>{next.moduleTitle}</strong> — {next.title}
            </div>
          </div>
        </div>
        <button
          className="rv-btn rv-btn--primary rv-btn--lg rv-next-banner-btn"
          onClick={onNext}
          disabled={saving}
        >
          {saving
            ? <><span className="rv-spin" /> Saving…</>
            : <>Generate next lesson →</>}
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ROOT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function ReviewSlidesPage({
  result, form, design, slides, courseId,
  onBack, onSave, saving, saved, imageProgress,
  // Mode B
  lessonCtx, nextLesson, onLessonDone, onNextLesson,
}: ReviewSlidesPageProps) {

  /** True when running inside the lesson-by-lesson build workflow. */
  const isLessonMode = !!lessonCtx;

  // ── Theme ─────────────────────────────────────────────────────────────────
  const theme = THEMES.find((t: { id: string }) => t.id === design.theme) ?? THEMES[2];

  // ── Initial deck ──────────────────────────────────────────────────────────
  const initial = useCallback((): ReviewSlide[] => {
    if (result?.slides?.length) return result.slides.map(fromResultSlide);
    return slides.map(fromOutlineSlide);
  }, []); // eslint-disable-line

  const deck = useDeck(initial());

  // ── Part 6 — view mode ────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  // ── Part 7 — slide regeneration ───────────────────────────────────────────
  const slideRegen = useSlideRegen(deck.dispatch);

  // ── Part 10 — autosave draft ──────────────────────────────────────────────
  const debouncedSlides = useDebounce(deck.slides, 1500);
  const autosaveStatus  = useAutosave(debouncedSlides, courseId);

  // ── Part 11 — keyboard navigation (← / →) ────────────────────────────────
  useKeyboardNav(deck.selectPrev, deck.selectNext);

  // ── Patch images arriving via SSE ─────────────────────────────────────────
  useEffect(() => {
    if (!result?.slides) return;
    result.slides.forEach((s: UpstreamResultSlide, i: number) => {
      if (s.image) deck.dispatch({ type: "PATCH_IMAGE", index: i, image_url: s.image });
    });
  }, [result]); // eslint-disable-line

  // ── Image-generation banner counts ────────────────────────────────────────
  const imgVals      = Object.values(imageProgress);
  const pendingCount = imgVals.filter(v => v === "loading").length;
  const doneCount    = imgVals.filter(v => v === "done").length;
  const totalImgCount = imgVals.filter(v => v !== "skipped").length;

  // ── Part 9 — save handler ─────────────────────────────────────────────────
  const savedSlides = () => deck.slides.map(toSavePayload);
  const handleSave  = () => onSave(savedSlides());

  // ── Mode B — lesson done / next lesson ───────────────────────────────────
  const handleLessonDone = () => {
    onSave(savedSlides());
    onLessonDone?.();
  };
  const handleNextLesson = () => {
    onNextLesson?.(savedSlides());
  };

  // ── Active slide state ────────────────────────────────────────────────────
  const activeImgStatus =
    imageProgress[deck.activeIdx + 1] ||
    (deck.activeSlide?.image_url ? "done" : "skipped");

  // ── Error state ───────────────────────────────────────────────────────────
  if (result?._error) {
    return (
      <div className="sg-panel sg-fadein">
        <div className="sg-hero">
          <span className="sg-badge sg-badge--err">Generation Failed</span>
          <h1 className="sg-h1">Something went wrong</h1>
          <p className="sg-sub">{result._error}</p>
        </div>
        <button className="sg-btn sg-btn--ghost" onClick={onBack}>← Back to Design</button>
      </div>
    );
  }

  return (
    <div className="rv-root sg-fadein">

      {/* ══════════════════════════════════════════════════════════════════════
          TOP BAR
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rv-topbar">

        {/* Left: title + meta — adapts to lesson mode */}
        <div className="rv-topbar-left">

          {isLessonMode ? (
            /* Mode B: breadcrumb + lesson progress pill */
            <>
              <span className="rv-badge-draft">Draft</span>
              <nav className="rv-lesson-breadcrumb" aria-label="Lesson context">
                <span className="rv-bc-module">{lessonCtx!.moduleTitle}</span>
                <span className="rv-bc-sep" aria-hidden="true">›</span>
                <span className="rv-bc-lesson">{lessonCtx!.title}</span>
              </nav>
              <span className="rv-lesson-pill" title={`Lesson ${lessonCtx!.lessonIndex + 1} of ${lessonCtx!.totalLessons}`}>
                {lessonCtx!.lessonIndex + 1} / {lessonCtx!.totalLessons}
              </span>
              <span className="rv-topbar-meta">
                {deck.slides.length} slides · {form.language}
              </span>
            </>
          ) : (
            /* Mode A: original title + meta */
            <>
              <span className="rv-badge-draft">Draft</span>
              <span className="rv-topbar-title">{form.title || "Untitled Course"}</span>
              <span className="rv-topbar-meta">
                {deck.slides.length} slides · {form.language} · {form.tone}
              </span>
            </>
          )}
        </div>

        {/* Centre: image generation banner */}
        {pendingCount > 0 && (
          <div className="rv-img-banner" role="status" aria-live="polite">
            <span className="rv-img-spin" aria-hidden="true" />
            Generating images — {doneCount} of {totalImgCount} ready
          </div>
        )}

        {/* Part 10: autosave status pill */}
        {autosaveStatus === "saving" && (
          <span className="rv-autosave rv-autosave--saving">
            <span className="rv-img-spin" aria-hidden="true" /> Saving draft…
          </span>
        )}
        {autosaveStatus === "saved"  && <span className="rv-autosave rv-autosave--saved">✓ Draft saved</span>}
        {autosaveStatus === "error"  && <span className="rv-autosave rv-autosave--error">⚠ Draft save failed</span>}

        {/* Right: view-mode toggle + back + save */}
        <div className="rv-topbar-actions">

          {/* Part 6: Edit | Preview toggle */}
          <div className="rv-mode-toggle" role="group" aria-label="View mode">
            <button
              className={`rv-mode-btn ${viewMode === "edit"    ? "rv-mode-btn--on" : ""}`}
              onClick={() => setViewMode("edit")}
              aria-pressed={viewMode === "edit"}
            >✎ Edit</button>
            <button
              className={`rv-mode-btn ${viewMode === "preview" ? "rv-mode-btn--on" : ""}`}
              onClick={() => setViewMode("preview")}
              aria-pressed={viewMode === "preview"}
            >▶ Preview</button>
          </div>

          {isLessonMode ? (
            /* Mode B: "All Lessons" replaces "Back to Design" */
            <button className="rv-btn rv-btn--ghost" onClick={handleLessonDone}>
              <IcoChevLeft sz={14} /> All Lessons
            </button>
          ) : (
            <button className="rv-btn rv-btn--ghost" onClick={onBack}>
              <IcoChevLeft sz={14} /> Back to Design
            </button>
          )}

          <SaveBtn saving={saving} saved={saved} onClick={handleSave} />
        </div>
      </div>

      {/* Part 11: progress bar + keyboard hint */}
      <div className="rv-subbar">
        <SlideProgressBar current={deck.activeIdx} total={deck.slides.length} />
        <span className="rv-kbd-hint" aria-hidden="true">
          <kbd>←</kbd> <kbd>→</kbd> to navigate · <kbd>↵</kbd> to add bullet
        </span>
      </div>

      {/* Mode B: learning objective strip */}
      {isLessonMode && lessonCtx!.objective && (
        <LessonObjectiveBar objective={lessonCtx!.objective} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          THREE-COLUMN BODY
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rv-body">

        {/* ── Part 3: Slide Navigator ──────────────────────────────────────── */}
        <SlideNavigator
          slides={deck.slides}
          activeId={deck.activeSlide?.id ?? ""}
          theme={theme}
          imageProgress={imageProgress}
          lessonObjective={isLessonMode ? lessonCtx!.objective : undefined}
          onSelect={deck.selectById}
          onAdd={deck.addSlide}
          onDuplicate={deck.duplicateSlide}
          onDelete={deck.deleteSlide}
          onReorder={deck.moveSlide}
        />

        {/* ── Parts 4 + 5 + 6 + 7 + 11: Slide Editor ─────────────────────── */}
        <main className="rv-center" aria-label="Slide editor">
          {deck.activeSlide && (
            <SlideEditor
              key={deck.activeSlide.id}
              slide={deck.activeSlide}
              index={deck.activeIdx}
              total={deck.slides.length}
              theme={theme}
              imageStatus={activeImgStatus}
              viewMode={viewMode}
              dispatch={deck.dispatch}
              slideRegenBusy={slideRegen.busy}
              slideRegenError={slideRegen.error}
              onSlideRegen={() => slideRegen.regen(deck.activeSlide!)}
              onPrev={deck.selectPrev}
              onNext={deck.selectNext}
              onAddAfter={() => deck.addSlide(deck.activeSlide!.id)}
              onDuplicate={() => deck.duplicateSlide(deck.activeSlide!.id)}
              onDelete={() => deck.deleteSlide(deck.activeSlide!.id)}
              lessonCtx={isLessonMode ? lessonCtx : undefined}
            />
          )}

          {/* Mode B: next-lesson banner below the last slide */}
          {isLessonMode && nextLesson && deck.activeIdx === deck.slides.length - 1 && (
            <NextLessonBanner
              next={nextLesson}
              saving={saving}
              onNext={handleNextLesson}
            />
          )}
        </main>

        {/* ── Settings sidebar (hidden in preview mode) ────────────────────── */}
        {deck.activeSlide && viewMode === "edit" && (
          <SlideSettings
            slide={deck.activeSlide}
            index={deck.activeIdx}
            total={deck.slides.length}
            imageStatus={activeImgStatus}
            dispatch={deck.dispatch}
            onDelete={() => deck.deleteSlide(deck.activeSlide!.id)}
            onAddAfter={() => deck.addSlide(deck.activeSlide!.id)}
            onDuplicate={() => deck.duplicateSlide(deck.activeSlide!.id)}
            /* Mode B: pass next-lesson card props to settings panel */
            nextLesson={isLessonMode ? nextLesson : undefined}
            onLessonDone={isLessonMode ? handleLessonDone : undefined}
            onNextLesson={isLessonMode ? handleNextLesson : undefined}
            saving={saving}
          />
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════════════════ */}
      <footer className="rv-footer">

        {/* Left action — adapts to mode */}
        {isLessonMode ? (
          <button className="rv-btn rv-btn--ghost" onClick={handleLessonDone}>
            ← All Lessons
          </button>
        ) : (
          <button className="rv-btn rv-btn--ghost" onClick={onBack}>← Edit Design</button>
        )}

        {/* Centre: arrow nav */}
        <div className="rv-footer-nav" role="navigation" aria-label="Slide navigation">
          <button className="rv-footer-navbtn"
            disabled={deck.activeIdx === 0}
            onClick={deck.selectPrev}
            aria-label="Previous slide">
            <IcoChevLeft sz={14} />
          </button>
          <span className="rv-footer-count" aria-live="polite">
            {deck.activeIdx + 1} / {deck.slides.length}
          </span>
          <button className="rv-footer-navbtn"
            disabled={deck.activeIdx === deck.slides.length - 1}
            onClick={deck.selectNext}
            aria-label="Next slide">
            <IcoChevRight sz={14} />
          </button>
        </div>

        {/* Right actions */}
        {isLessonMode ? (
          /* Mode B: Save lesson + Next lesson */
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <SaveBtn size="lg" saving={saving} saved={saved} onClick={handleSave} />
            {nextLesson && (
              <button
                className="rv-btn rv-btn--primary rv-btn--lg rv-btn--next"
                onClick={handleNextLesson}
                disabled={saving}
                title={`Generate: ${nextLesson.title}`}
              >
                {saving
                  ? <><span className="rv-spin" /> Saving…</>
                  : <>Next Lesson <IcoChevRight sz={14} /></>}
              </button>
            )}
          </div>
        ) : (
          <SaveBtn size="lg" saving={saving} saved={saved} onClick={handleSave} />
        )}
      </footer>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STYLES — all rv-* classes for every part (1 – 12) + lesson-mode additions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function ReviewStyles() {
  return (
    <style>{`
      /* ── LAYOUT ROOT ─────────────────────────────────────────────────────── */
      .rv-root {
        position: fixed;
        inset: 0;
        display: flex; flex-direction: column;
        height: 100vh;
        overflow: hidden; background: var(--bg);
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        z-index: 100;
      }

      /* ── TOP BAR ─────────────────────────────────────────────────────────── */
      .rv-topbar {
        display: flex; align-items: center; gap: 12px;
        padding: 8px 20px; min-height: 50px;
        background: var(--sur); border-bottom: 1px solid var(--bdr);
        flex-shrink: 0; flex-wrap: wrap;
      }
      .rv-topbar-left {
        display: flex; align-items: center; gap: 10px;
        flex: 1; min-width: 0; overflow: hidden;
      }
      .rv-topbar-title {
        font-size: 14px; font-weight: 700; color: var(--ink);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .rv-topbar-meta {
        font-size: 12px; color: var(--k4); white-space: nowrap; flex-shrink: 0;
      }
      .rv-topbar-actions {
        display: flex; gap: 8px; align-items: center; flex-shrink: 0;
      }
      .rv-badge-draft {
        padding: 2px 8px; border-radius: 20px;
        font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
        background: var(--ambbg); color: var(--amb); border: 1px solid #FDE68A;
        flex-shrink: 0;
      }

      /* image generation banner */
      .rv-img-banner {
        display: flex; align-items: center; gap: 7px;
        padding: 5px 12px; border-radius: 20px;
        background: var(--blubg); border: 1px solid #BFDBFE;
        font-size: 12px; color: #1D4ED8; font-weight: 500; white-space: nowrap;
      }
      .rv-img-spin {
        display: inline-block; width: 12px; height: 12px; border-radius: 50%;
        border: 2px solid rgba(37,99,235,.2); border-top-color: var(--blu);
        animation: rv-spin .65s linear infinite; flex-shrink: 0;
      }

      /* Part 10: autosave pill */
      .rv-autosave {
        font-size: 11px; font-weight: 600;
        padding: 4px 10px; border-radius: 20px; white-space: nowrap;
      }
      .rv-autosave--saving {
        background: var(--blubg); color: var(--blu);
        display: flex; align-items: center; gap: 5px;
      }
      .rv-autosave--saved  { background: var(--grnbg); color: #059669; }
      .rv-autosave--error  { background: var(--redbg); color: var(--red); }

      /* Part 6: Edit / Preview toggle */
      .rv-mode-toggle {
        display: flex; border-radius: 8px;
        border: 1.5px solid var(--bdr); overflow: hidden;
      }
      .rv-mode-btn {
        padding: 5px 14px; font-size: 12px; font-weight: 600;
        border: none; background: transparent; color: var(--k3);
        cursor: pointer; transition: all .14s;
      }
      .rv-mode-btn--on  { background: var(--blu); color: #fff; }
      .rv-mode-btn:not(.rv-mode-btn--on):hover { background: var(--bg); color: var(--ink); }

      /* ── Mode B: LESSON BREADCRUMB ───────────────────────────────────────── */
      .rv-lesson-breadcrumb {
        display: flex; align-items: center; gap: 5px;
        font-size: 13px; white-space: nowrap; overflow: hidden;
        max-width: 420px; flex-shrink: 1;
      }
      .rv-bc-module {
        color: var(--k3); font-weight: 600;
        overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; min-width: 0;
      }
      .rv-bc-sep   { color: var(--k4); font-weight: 400; flex-shrink: 0; }
      .rv-bc-lesson {
        color: var(--ink); font-weight: 700;
        overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; min-width: 0;
      }
      .rv-lesson-pill {
        padding: 2px 9px; border-radius: 20px; flex-shrink: 0;
        font-size: 11px; font-weight: 700; letter-spacing: .04em;
        background: rgba(13,185,94,.12); color: #059669;
        border: 1px solid rgba(13,185,94,.28);
        white-space: nowrap;
      }

      /* ── Part 11: SUBBAR (progress + keyboard hint) ───────────────────────── */
      .rv-subbar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 5px 20px 6px; background: var(--bg);
        border-bottom: 1px solid var(--bdr); flex-shrink: 0; gap: 16px;
      }

      /* Part 11: segmented progress bar */
      .rv-progress {
        display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;
      }
      .rv-progress-label {
        font-size: 11px; font-weight: 700; color: var(--k3);
        white-space: nowrap; min-width: 72px;
      }
      .rv-progress-track {
        position: relative; flex: 1; height: 5px;
        background: var(--bdr2); border-radius: 3px; overflow: visible;
        max-width: 320px;
      }
      .rv-progress-fill {
        position: absolute; left: 0; top: 0; height: 100%;
        background: var(--blu); border-radius: 3px;
        transition: width .22s cubic-bezier(.4,0,.2,1);
      }
      .rv-progress-tick {
        position: absolute; top: -2px;
        width: 1px; height: 9px;
        background: var(--sur); transform: translateX(-50%);
        pointer-events: none;
      }

      /* keyboard hint */
      .rv-kbd-hint {
        font-size: 11px; color: var(--k4); white-space: nowrap; flex-shrink: 0;
      }
      .rv-kbd-hint kbd {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 1px 5px; border-radius: 4px;
        border: 1px solid var(--bdr2); background: var(--sur);
        font-family: inherit; font-size: 10px; font-weight: 600;
        color: var(--k2); box-shadow: 0 1px 0 var(--bdr2);
      }

      /* ── Mode B: OBJECTIVE BAR ───────────────────────────────────────────── */
      .rv-obj-bar {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 20px; flex-shrink: 0;
        background: rgba(13,185,94,.07);
        border-bottom: 1px solid rgba(13,185,94,.18);
        font-size: 12px; line-height: 1.4;
      }
      .rv-obj-bar-icon  { font-size: 14px; flex-shrink: 0; }
      .rv-obj-bar-label {
        font-size: 10px; font-weight: 800; letter-spacing: .08em;
        text-transform: uppercase; color: #059669; flex-shrink: 0;
      }
      .rv-obj-bar-text  { color: var(--k2); }

      /* ── THREE-COLUMN BODY ───────────────────────────────────────────────── */
      .rv-body {
        display: grid;
        grid-template-columns: 200px 1fr 280px;
        flex: 1; min-height: 0; overflow: hidden;
      }

      /* ── NAVIGATOR (Part 3) ──────────────────────────────────────────────── */
      .rv-nav {
        display: flex; flex-direction: column;
        border-right: 1px solid var(--bdr); background: var(--sur);
        overflow: hidden; user-select: none;
      }
      .rv-nav-hd {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px 8px; border-bottom: 1px solid var(--bdr); flex-shrink: 0;
      }
      .rv-nav-label {
        font-size: 10px; font-weight: 800; letter-spacing: .09em;
        text-transform: uppercase; color: var(--k3);
      }
      .rv-nav-addbtn {
        width: 26px; height: 26px; border-radius: 6px;
        border: 1.5px solid var(--bdr); background: transparent;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        color: var(--k3); transition: all .14s;
      }
      .rv-nav-addbtn:hover { border-color: var(--blu); color: var(--blu); background: var(--blubg); }

      /* Mode B: lesson objective header in navigator */
      .rv-nav-obj {
        padding: 8px 12px; border-bottom: 1px solid var(--bdr);
        flex-shrink: 0;
      }
      .rv-nav-obj-toggle {
        display: flex; align-items: center; justify-content: space-between;
        width: 100%; border: none; background: transparent; cursor: pointer;
        padding: 0; margin-bottom: 3px; gap: 4px;
      }
      .rv-nav-obj-lbl {
        font-size: 9px; font-weight: 800; letter-spacing: .09em;
        text-transform: uppercase; color: #059669;
      }
      .rv-nav-obj-chevron {
        font-size: 10px; color: #059669; opacity: .7;
        transition: transform .18s; flex-shrink: 0;
      }
      .rv-nav-obj-text {
        font-size: 10px; color: var(--k3); line-height: 1.45;
        display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .rv-nav-lesson-hint {
        padding: 6px 12px 10px; font-size: 9px; font-weight: 600;
        color: var(--k4); text-align: center; letter-spacing: .04em;
        border-top: 1px solid var(--bdr); flex-shrink: 0;
      }

      .rv-nav-list {
        list-style: none; margin: 0; padding: 8px 8px 4px;
        flex: 1; overflow-y: auto;
        display: flex; flex-direction: column; gap: 3px;
      }
      .rv-nav-list::-webkit-scrollbar { width: 4px; }
      .rv-nav-list::-webkit-scrollbar-thumb { background: var(--bdr2); border-radius: 2px; }

      /* thumbnail card */
      .rv-thumb {
        position: relative; border-radius: 8px; cursor: pointer;
        border: 2px solid transparent;
        transition: border-color .14s, box-shadow .14s, opacity .12s;
      }
      .rv-thumb:hover          { border-color: var(--bdr2); box-shadow: var(--sh); }
      .rv-thumb--active        { border-color: var(--blu) !important; box-shadow: 0 0 0 3px rgba(37,99,235,.12) !important; }
      .rv-thumb--dragging      { opacity: .3; }
      .rv-thumb--droptarget    { border-color: var(--blu); border-style: dashed; }
      .rv-thumb-drag {
        position: absolute; left: -22px; top: 50%; transform: translateY(-50%);
        color: var(--k4); opacity: 0; transition: opacity .14s;
        cursor: grab; padding: 4px; z-index: 2;
      }
      .rv-thumb:hover .rv-thumb-drag { opacity: 1; }
      .rv-thumb-drag:active     { cursor: grabbing; }
      .rv-thumb-canvas {
        padding: 9px 10px; border-radius: 6px; overflow: hidden;
        display: flex; flex-direction: column; gap: 5px;
        position: relative; min-height: 72px;
      }
      .rv-thumb-num {
        font-size: 9px; font-weight: 800; letter-spacing: .1em; opacity: .75;
      }
      .rv-thumb-title {
        font-size: 10px; font-weight: 700; line-height: 1.3;
        overflow: hidden; display: -webkit-box;
        -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      }
      .rv-thumb-lines { display: flex; flex-direction: column; gap: 3px; margin-top: 2px; }
      .rv-thumb-line  { height: 2px; border-radius: 2px; opacity: .18; }

      /* status dots */
      .rv-dot {
        position: absolute; bottom: 6px; right: 6px;
        width: 6px; height: 6px; border-radius: 50%;
        border: 1.5px solid rgba(255,255,255,.45);
      }
      .rv-dot--loading { background: var(--amb); animation: rv-pulse 1.1s ease-in-out infinite; }
      .rv-dot--done    { background: var(--grn); }
      .rv-dot--error   { background: var(--red); }
      .rv-dot--regen   { background: var(--blu); animation: rv-pulse .8s ease-in-out infinite; }

      /* hover action buttons */
      .rv-thumb-acts {
        position: absolute; top: 4px; right: 4px;
        display: flex; gap: 3px; opacity: 0; transition: opacity .13s; z-index: 3;
      }
      .rv-thumb:hover .rv-thumb-acts { opacity: 1; }
      .rv-tact {
        width: 20px; height: 20px; border-radius: 4px; border: none;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: background .12s;
      }
      .rv-tact--add { background: rgba(255,255,255,.22); color: rgba(255,255,255,.9); }
      .rv-tact--add:hover { background: rgba(37,99,235,.65); }
      /* Part 11: duplicate button in thumbnail */
      .rv-tact--dup { background: rgba(255,255,255,.18); color: rgba(255,255,255,.8); }
      .rv-tact--dup:hover { background: rgba(124,58,237,.6); }
      .rv-tact--del { background: rgba(255,255,255,.18); color: rgba(255,255,255,.8); }
      .rv-tact--del:hover { background: rgba(239,68,68,.65); }
      .rv-tact:disabled { opacity: .3; cursor: default; }

      .rv-nav-addfooter {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        margin: 6px 8px 10px; padding: 7px;
        border-radius: 7px; border: 1.5px dashed var(--bdr2);
        background: transparent; font-size: 12px; font-weight: 600;
        color: var(--k3); cursor: pointer; transition: all .14s;
        font-family: inherit; flex-shrink: 0;
      }
      .rv-nav-addfooter:hover { border-color: var(--blu); color: var(--blu); background: var(--blubg); }

      /* ── CENTER EDITOR ───────────────────────────────────────────────────── */
      .rv-center {
        overflow-y: auto; background: var(--bg);
        display: flex; flex-direction: column;
      }
      .rv-center::-webkit-scrollbar { width: 5px; }
      .rv-center::-webkit-scrollbar-thumb { background: var(--bdr2); border-radius: 3px; }

      .rv-editor-wrap { display: flex; flex-direction: column; flex: 1; }

      /* toolbar */
      .rv-toolbar {
        display: flex; align-items: center; gap: 5px;
        padding: 7px 18px; background: var(--sur);
        border-bottom: 1px solid var(--bdr);
        position: sticky; top: 0; z-index: 20;
        flex-shrink: 0; flex-wrap: wrap;
      }
      .rv-toolbar-pos {
        font-size: 12px; font-weight: 600; color: var(--k4);
        min-width: 44px; text-align: center;
      }
      .rv-toolbar-sep {
        width: 1px; height: 18px; background: var(--bdr); margin: 0 3px; flex-shrink: 0;
      }
      .rv-tbtn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 5px 9px; border-radius: 6px; border: 1.5px solid var(--bdr);
        background: transparent; cursor: pointer;
        font-size: 12px; font-weight: 500; color: var(--k2);
        transition: all .13s; font-family: inherit; white-space: nowrap;
      }
      .rv-tbtn:not(:disabled):hover { border-color: var(--blu); color: var(--blu); background: var(--blubg); }
      .rv-tbtn:disabled  { opacity: .35; cursor: default; }
      .rv-tbtn--lbl      { padding: 5px 11px; }
      .rv-tbtn--danger:not(:disabled):hover {
        border-color: var(--red) !important; color: var(--red) !important;
        background: var(--redbg) !important;
      }

      /* Part 11: duplicate button in toolbar */
      .rv-tbtn--dup { color: #7C3AED; border-color: rgba(124,58,237,.3); }
      .rv-tbtn--dup:not(:disabled):hover { border-color: #7C3AED; background: #F5F3FF; color: #7C3AED; }

      /* Part 7: regen button */
      .rv-tbtn--regen { color: #7C3AED; border-color: rgba(124,58,237,.3); }
      .rv-tbtn--regen:not(:disabled):hover { border-color: #7C3AED; background: #F5F3FF; }
      .rv-tbtn--busy  { opacity: .6; cursor: default; }
      .rv-regen-err   { font-size: 11px; color: var(--red); font-weight: 500; }
      .rv-spin-dark {
        display: inline-block; width: 12px; height: 12px; border-radius: 50%;
        border: 2px solid rgba(124,58,237,.2); border-top-color: #7C3AED;
        animation: rv-spin .65s linear infinite; flex-shrink: 0;
      }

      /* canvas */
      .rv-canvas-scroll {
        flex: 1; overflow-y: auto; padding: 24px 28px 36px;
      }
      .rv-canvas-scroll::-webkit-scrollbar { width: 5px; }
      .rv-canvas-scroll::-webkit-scrollbar-thumb { background: var(--bdr2); border-radius: 3px; }

      .rv-canvas {
        border-radius: 16px; padding: 28px 30px 32px;
        display: flex; flex-direction: column; gap: 20px;
        box-shadow: 0 6px 32px rgba(0,0,0,.14), 0 1px 4px rgba(0,0,0,.07);
        position: relative;
      }
      .rv-canvas--regen { opacity: .65; pointer-events: none; }
      .rv-canvas-num {
        font-size: 11px; font-weight: 800; letter-spacing: .12em;
        text-transform: uppercase; opacity: .6;
      }

      /* Mode B: lesson context chip inside the canvas */
      .rv-canvas-lesson-ctx {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 3px 10px; border-radius: 20px;
        font-size: 10px; font-weight: 700; letter-spacing: .05em;
        background: rgba(13,185,94,.12); color: #059669;
        border: 1px solid rgba(13,185,94,.22); align-self: flex-start;
      }

      /* Part 7: regeneration overlay */
      .rv-regen-overlay {
        position: absolute; inset: 0; border-radius: 16px;
        background: rgba(0,0,0,.42); backdrop-filter: blur(5px);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 10px; z-index: 10; color: #fff;
        font-size: 15px; font-weight: 600;
      }
      .rv-regen-spin {
        width: 38px; height: 38px; border-radius: 50%;
        border: 3px solid rgba(255,255,255,.2); border-top-color: #fff;
        animation: rv-spin .7s linear infinite;
      }
      .rv-regen-note { font-size: 12px; font-weight: 400; opacity: .65; }

      /* ── Part 5: IMAGE PANEL ─────────────────────────────────────────────── */
      .rv-img-panel    { display: flex; flex-direction: column; gap: 10px; }
      .rv-img-skeleton {
        height: 156px; border-radius: 10px;
        background: rgba(255,255,255,.1);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 10px;
      }
      .rv-img-shimmer {
        display: block; width: 34px; height: 34px; border-radius: 50%;
        border: 3px solid rgba(255,255,255,.18); border-top-color: rgba(255,255,255,.7);
        animation: rv-spin .8s linear infinite;
      }
      .rv-img-err {
        padding: 6px 12px; border-radius: 7px; font-size: 12px;
        background: rgba(239,68,68,.18); color: #FCA5A5; display: inline-block;
      }
      .rv-img-empty {
        height: 80px; border-radius: 10px;
        border: 2px dashed rgba(255,255,255,.18);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 6px;
      }
      .rv-img-empty-ico { font-size: 22px; opacity: .35; }
      .rv-img-block     { position: relative; border-radius: 10px; overflow: hidden; }
      .rv-img-photo     { width: 100%; max-height: 220px; object-fit: cover; display: block; }

      /* image action buttons */
      .rv-img-actions   { display: flex; flex-wrap: wrap; gap: 6px; }
      .rv-img-actbtn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 5px 11px; border-radius: 7px; border: 1.5px solid var(--bdr);
        background: rgba(255,255,255,.08);
        font-size: 11px; font-weight: 600; cursor: pointer;
        transition: all .13s; font-family: inherit; white-space: nowrap;
      }
      .rv-img-actbtn--regen  { color: rgba(255,255,255,.85); }
      .rv-img-actbtn--regen:hover  { border-color: #A78BFA; background: rgba(167,139,250,.2); color: #fff; }
      .rv-img-actbtn--upload { color: rgba(255,255,255,.7); }
      .rv-img-actbtn--upload:hover { border-color: rgba(255,255,255,.5); background: rgba(255,255,255,.15); color: #fff; }
      .rv-img-actbtn--remove { color: rgba(255,100,100,.8); border-color: rgba(255,100,100,.25); }
      .rv-img-actbtn--remove:hover { border-color: #FCA5A5; background: rgba(239,68,68,.2); color: #FCA5A5; }
      .rv-img-regen-err { font-size: 11px; color: #FCA5A5; font-weight: 500; }

      /* regenerate prompt modal */
      .rv-prompt-modal {
        position: fixed; inset: 0;
        background: rgba(0,0,0,.55); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999; padding: 20px;
      }
      .rv-prompt-card {
        background: var(--sur); border-radius: 14px; padding: 24px;
        width: 100%; max-width: 460px;
        display: flex; flex-direction: column; gap: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,.3);
      }
      .rv-prompt-hd {
        display: flex; align-items: center; justify-content: space-between;
        font-size: 15px; font-weight: 700; color: var(--ink);
      }
      .rv-prompt-close {
        background: transparent; border: none; cursor: pointer; color: var(--k4);
        padding: 2px; border-radius: 4px; display: flex;
        align-items: center; justify-content: center; transition: color .13s;
      }
      .rv-prompt-close:hover { color: var(--ink); }
      .rv-prompt-hint    { font-size: 13px; color: var(--k3); line-height: 1.5; }
      .rv-prompt-hint-sm { font-size: 11px; color: var(--k4); }
      .rv-prompt-ta {
        width: 100%; border-radius: 8px; border: 1.5px solid var(--bdr);
        padding: 10px 12px; font-size: 13px; line-height: 1.5;
        font-family: inherit; outline: none; resize: none; color: var(--ink);
        transition: border-color .13s; background: var(--bg);
      }
      .rv-prompt-ta:focus { border-color: var(--blu); }
      .rv-prompt-meta    { font-size: 11px; color: var(--k4); }
      .rv-prompt-footer  {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }

      /* ── Part 6: PREVIEW MODE ────────────────────────────────────────────── */
      .rv-preview-wrap  { display: flex; flex-direction: column; flex: 1; }
      .rv-preview-chrome {
        padding: 8px 20px; background: var(--sur);
        border-bottom: 1px solid var(--bdr);
        display: flex; align-items: center; gap: 10px;
      }
      .rv-preview-badge { font-size: 12px; font-weight: 700; color: var(--k3); }
      .rv-preview-hint  { font-size: 11px; color: var(--k4); }
      /* Mode B: lesson objective in preview chrome */
      .rv-preview-obj-pill {
        margin-left: auto; display: flex; align-items: center; gap: 5px;
        padding: 2px 9px; border-radius: 20px;
        font-size: 10px; font-weight: 700; letter-spacing: .05em;
        background: rgba(13,185,94,.10); color: #059669;
        border: 1px solid rgba(13,185,94,.22);
      }
      .rv-preview-card  {
        margin: 24px 28px 36px; border-radius: 16px; padding: 40px 40px 44px;
        display: flex; flex-direction: column; gap: 24px;
        box-shadow: 0 6px 32px rgba(0,0,0,.14);
      }
      .rv-preview-title {
        font-size: 28px; font-weight: 800; line-height: 1.25; margin: 0;
      }
      .rv-preview-img   { border-radius: 12px; overflow: hidden; }
      .rv-preview-photo { width: 100%; max-height: 220px; object-fit: cover; display: block; }
      .rv-preview-bullets {
        list-style: none; margin: 0; padding: 0;
        display: flex; flex-direction: column; gap: 13px;
      }
      .rv-preview-bullet {
        display: flex; align-items: flex-start; gap: 12px;
        font-size: 16px; line-height: 1.6;
      }
      .rv-preview-dot   { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 9px; }
      .rv-preview-examples {
        display: flex; flex-direction: column; gap: 4px;
        font-size: 13px; font-style: italic;
      }
      .rv-preview-ex-label {
        font-size: 10px; font-weight: 800; letter-spacing: .07em;
        text-transform: uppercase; font-style: normal; display: block; margin-bottom: 4px;
      }
      .rv-preview-exercise {
        padding: 14px 16px; border-left: 4px solid;
        border-radius: 0 10px 10px 0; background: rgba(255,255,255,.1);
        display: flex; flex-direction: column; gap: 6px;
      }
      .rv-preview-ex-badge { font-size: 12px; font-weight: 700; }

      /* ── CANVAS FIELDS ───────────────────────────────────────────────────── */
      .rv-field     { display: flex; flex-direction: column; gap: 5px; }
      .rv-field-lbl {
        font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase;
      }
      .rv-title-ta {
        width: 100%; resize: none; overflow: hidden;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 24px; font-weight: 700; line-height: 1.3;
        background: rgba(255,255,255,.09); border: 2px solid transparent;
        border-radius: 8px; padding: 6px 8px; outline: none;
        transition: background .14s, border-color .14s;
      }
      .rv-title-ta::placeholder { opacity: .32; }
      .rv-title-ta:focus { background: rgba(255,255,255,.17); border-color: rgba(255,255,255,.24); }

      /* bullets */
      .rv-bullet-list { display: flex; flex-direction: column; gap: 3px; }
      .rv-bullet-row  {
        display: flex; align-items: flex-start; gap: 8px;
        padding: 2px 4px 2px 0; border-radius: 7px; transition: background .1s;
      }
      .rv-bullet-row--over { background: rgba(255,255,255,.1); }
      .rv-bullet-drag {
        padding: 5px 3px; cursor: grab; color: rgba(255,255,255,.25);
        flex-shrink: 0; transition: color .12s; margin-top: 5px;
      }
      .rv-bullet-drag:hover  { color: rgba(255,255,255,.6); }
      .rv-bullet-drag:active { cursor: grabbing; }
      .rv-bullet-row:hover .rv-bullet-drag { color: rgba(255,255,255,.45); }
      .rv-bullet-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 10px; }
      .rv-bullet-ta  {
        flex: 1; resize: none; overflow: hidden;
        font-size: 15px; line-height: 1.55; font-family: inherit;
        background: rgba(255,255,255,.07); border: 1.5px solid transparent;
        border-radius: 6px; padding: 4px 8px; outline: none;
        transition: background .12s, border-color .12s;
      }
      .rv-bullet-ta::placeholder { opacity: .3; }
      .rv-bullet-ta:focus { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.2); }
      .rv-bullet-delbtn {
        width: 24px; height: 24px; border-radius: 5px; border: none;
        background: transparent; cursor: pointer; color: rgba(255,255,255,.2);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; margin-top: 5px; transition: all .12s; opacity: 0;
      }
      .rv-bullet-row:hover .rv-bullet-delbtn { opacity: 1; }
      .rv-bullet-delbtn:hover { background: rgba(239,68,68,.25); color: #FCA5A5; }
      .rv-add-bullet {
        display: inline-flex; align-items: center; gap: 5px;
        margin-top: 5px; padding: 5px 8px; border-radius: 6px;
        border: none; background: transparent; cursor: pointer;
        font-size: 12px; font-weight: 600; font-family: inherit;
        transition: background .12s;
      }
      .rv-add-bullet:hover { background: rgba(255,255,255,.1); }
      .rv-add-bullet-hint { font-size: 10px; font-weight: 400; opacity: .45; }

      .rv-exercise {
        padding: 12px 14px; border-left: 3px solid;
        border-radius: 0 8px 8px 0; background: rgba(255,255,255,.08);
      }
      .rv-exercise-lbl { font-size: 11px; font-weight: 700; display: block; margin-bottom: 5px; }
      .rv-exercise-ta  {
        width: 100%; resize: none; overflow: hidden;
        background: rgba(255,255,255,.1); border: 1.5px solid rgba(255,255,255,.18);
        border-radius: 6px; padding: 5px 8px;
        font-size: 13px; line-height: 1.5; outline: none; font-family: inherit;
      }
      .rv-exercise-ta:focus { border-color: rgba(255,255,255,.3); }
      .rv-notes       { background: rgba(0,0,0,.15); border-radius: 8px; padding: 10px 12px; }
      .rv-notes-lbl   { font-size: 11px; font-weight: 700; color: rgba(255,255,255,.42); display: block; margin-bottom: 4px; }
      .rv-notes-ta    {
        width: 100%; resize: none; overflow: hidden;
        background: rgba(255,255,255,.07); border: 1.5px solid rgba(255,255,255,.12);
        border-radius: 6px; padding: 5px 8px;
        font-size: 12px; line-height: 1.5; color: rgba(255,255,255,.55);
        outline: none; font-family: inherit;
      }
      .rv-notes-ta::placeholder { color: rgba(255,255,255,.22); }
      .rv-notes-ta:focus        { border-color: rgba(255,255,255,.25); color: rgba(255,255,255,.72); }

      /* ── SETTINGS SIDEBAR ────────────────────────────────────────────────── */
      .rv-settings     { border-left: 1px solid var(--bdr); background: var(--sur); overflow-y: auto; }
      .rv-settings::-webkit-scrollbar { width: 4px; }
      .rv-settings::-webkit-scrollbar-thumb { background: var(--bdr2); border-radius: 2px; }
      .rv-settings-inner { padding: 14px; display: flex; flex-direction: column; gap: 18px; }
      .rv-set-sec      { display: flex; flex-direction: column; gap: 8px; }
      .rv-set-hd       {
        font-size: 10px; font-weight: 800; letter-spacing: .09em;
        text-transform: uppercase; color: var(--k4); margin: 0 0 2px;
      }
      .rv-set-row      { display: flex; justify-content: space-between; font-size: 12px; }
      .rv-set-lbl      { color: var(--k3); }
      .rv-set-val      { font-weight: 600; color: var(--ink); }
      .rv-imgst        { font-size: 11px; font-weight: 600; }
      .rv-imgst--done    { color: var(--grn); }
      .rv-imgst--loading { color: var(--amb); }
      .rv-imgst--error   { color: var(--red); }
      .rv-imgst--skipped, .rv-imgst--none { color: var(--k4); }

      .rv-imgtype-grid   { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
      .rv-imgtype-btn    {
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        padding: 7px 4px; border-radius: 7px; border: 1.5px solid var(--bdr);
        background: transparent; cursor: pointer; transition: all .13s; font-family: inherit;
      }
      .rv-imgtype-btn:hover    { border-color: var(--blu); background: var(--blubg); }
      .rv-imgtype-btn--on      { border-color: var(--blu); background: var(--blubg); }
      .rv-imgtype-icon         { font-size: 16px; }
      .rv-imgtype-lbl          { font-size: 10px; font-weight: 600; color: var(--k2); }
      .rv-imgtype-btn--on .rv-imgtype-lbl { color: var(--blu); }

      .rv-toggle-row    {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 8px 0; border-bottom: 1px solid var(--bdr); cursor: pointer;
      }
      .rv-toggle-row:last-child { border-bottom: none; }
      .rv-toggle-lbl  { font-size: 12px; font-weight: 600; color: var(--k2); }
      .rv-toggle-hint { font-size: 11px; color: var(--k4); margin-top: 1px; }
      .rv-tog {
        width: 36px; height: 20px; border-radius: 10px;
        background: var(--bdr2); border: none; cursor: pointer;
        position: relative; flex-shrink: 0; transition: background .18s;
      }
      .rv-tog--on { background: var(--blu); }
      .rv-tog::after {
        content: ''; position: absolute; top: 2px; left: 2px;
        width: 16px; height: 16px; border-radius: 50%;
        background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.22);
        transition: transform .2s cubic-bezier(.34,1.56,.64,1);
      }
      .rv-tog--on::after { transform: translateX(16px); }

      .rv-act-btn {
        display: flex; align-items: center; gap: 6px; width: 100%;
        padding: 8px 12px; border-radius: 7px; border: 1.5px solid var(--bdr);
        background: transparent; font-size: 12px; font-weight: 600;
        color: var(--k2); cursor: pointer; text-align: left;
        transition: all .13s; font-family: inherit;
      }
      .rv-act-btn + .rv-act-btn { margin-top: 5px; }
      .rv-act-btn--add:hover { border-color: var(--grn); color: var(--grn); background: var(--grnbg); }
      /* Part 11: duplicate action button */
      .rv-act-btn--dup { color: #7C3AED; border-color: rgba(124,58,237,.25); }
      .rv-act-btn--dup:hover { border-color: #7C3AED; background: #F5F3FF; }
      .rv-act-btn--del { color: var(--red); border-color: rgba(239,68,68,.3); }
      .rv-act-btn--del:hover { border-color: var(--red); background: var(--redbg); }
      .rv-act-btn:disabled { opacity: .4; cursor: default; }

      /* Mode B: next lesson + all-lessons buttons in sidebar */
      .rv-next-card {
        padding: 12px; border-radius: 10px;
        border: 1.5px solid rgba(13,185,94,.3);
        background: rgba(13,185,94,.05);
        display: flex; flex-direction: column; gap: 10px;
      }
      .rv-next-meta {
        display: flex; flex-direction: column; gap: 2px;
      }
      .rv-next-module {
        font-size: 10px; font-weight: 700; color: #059669;
        text-transform: uppercase; letter-spacing: .06em;
      }
      .rv-next-title {
        font-size: 13px; font-weight: 700; color: var(--ink); line-height: 1.35;
      }
      .rv-act-btn--next {
        background: rgba(13,185,94,.1); border-color: rgba(13,185,94,.4);
        color: #059669; font-weight: 700;
      }
      .rv-act-btn--next:hover:not(:disabled) {
        background: rgba(13,185,94,.18); border-color: #059669;
      }
      .rv-act-btn--next:disabled { opacity: .5; cursor: default; }
      .rv-act-btn--alll { color: var(--k3); }
      .rv-act-btn--alll:hover { border-color: var(--bdr2); color: var(--ink); background: var(--bg); }
      .rv-spin-inline {
        display: inline-block; width: 10px; height: 10px; border-radius: 50%;
        border: 2px solid rgba(5,150,105,.25); border-top-color: #059669;
        animation: rv-spin .65s linear infinite; flex-shrink: 0;
      }

      /* Mode B: next lesson banner below last slide */
      .rv-next-banner {
        margin: 0 28px 36px; border-radius: 14px;
        border: 2px solid rgba(13,185,94,.3);
        background: linear-gradient(135deg, rgba(13,185,94,.06) 0%, rgba(13,185,94,.02) 100%);
        overflow: hidden;
      }
      .rv-next-banner-inner {
        display: flex; align-items: center; justify-content: space-between;
        gap: 16px; padding: 18px 22px; flex-wrap: wrap;
      }
      .rv-next-banner-info {
        display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;
      }
      .rv-next-banner-check {
        width: 32px; height: 32px; border-radius: 50%;
        background: rgba(13,185,94,.15); color: #059669;
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; font-weight: 900; flex-shrink: 0;
      }
      .rv-next-banner-head {
        font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 2px;
      }
      .rv-next-banner-sub {
        font-size: 12px; color: var(--k3); white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
      }
      .rv-next-banner-btn {
        background: #059669 !important;
        border-color: #059669 !important;
        flex-shrink: 0;
      }
      .rv-next-banner-btn:hover:not(:disabled) {
        background: #047857 !important; border-color: #047857 !important;
      }

      /* Mode B: next-lesson button in footer */
      .rv-btn--next {
        background: #059669 !important; border-color: #059669 !important;
      }
      .rv-btn--next:hover:not(:disabled) {
        background: #047857 !important; border-color: #047857 !important;
      }

      /* ── FOOTER ──────────────────────────────────────────────────────────── */
      .rv-footer {
        display: flex; align-items: center; justify-content: space-between; gap: 14px;
        padding: 10px 20px; background: var(--sur); border-top: 1px solid var(--bdr);
        flex-shrink: 0;
      }
      .rv-footer-nav   { display: flex; align-items: center; gap: 8px; }
      .rv-footer-count {
        font-size: 12px; font-weight: 700; color: var(--k3);
        min-width: 52px; text-align: center;
      }
      .rv-footer-navbtn {
        width: 32px; height: 32px; border-radius: 7px;
        border: 1.5px solid var(--bdr); background: transparent;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        color: var(--k2); transition: all .13s;
      }
      .rv-footer-navbtn:not(:disabled):hover { border-color: var(--blu); color: var(--blu); background: var(--blubg); }
      .rv-footer-navbtn:disabled { opacity: .3; cursor: default; }

      /* ── BUTTONS ─────────────────────────────────────────────────────────── */
      .rv-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 16px; border-radius: 8px; border: 1.5px solid transparent;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 13px; font-weight: 600; cursor: pointer;
        white-space: nowrap; transition: all .14s;
      }
      .rv-btn--ghost   { border-color: var(--bdr); color: var(--k2); background: transparent; }
      .rv-btn--ghost:hover { border-color: var(--bdr2); background: var(--bg); color: var(--ink); }
      .rv-btn--primary { background: var(--blu); border-color: var(--blu); color: #fff; }
      .rv-btn--primary:not(:disabled):hover { background: var(--bluh); border-color: var(--bluh); }
      .rv-btn--lg  { padding: 9px 22px; font-size: 14px; }
      .rv-btn--off { opacity: .6; cursor: not-allowed; }
      .rv-spin {
        display: inline-block; width: 14px; height: 14px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
        animation: rv-spin .65s linear infinite; flex-shrink: 0;
      }

      /* ── KEYFRAMES ───────────────────────────────────────────────────────── */
      @keyframes rv-spin  { to { transform: rotate(360deg); } }
      @keyframes rv-pulse { 0%,100% { opacity: .3; } 50% { opacity: 1; } }

      /* ── RESPONSIVE ──────────────────────────────────────────────────────── */
      @media (max-width: 1100px) {
        .rv-body { grid-template-columns: 180px 1fr 260px; }
      }
      @media (max-width: 860px) {
        .rv-body { grid-template-columns: 180px 1fr; }
        .rv-settings { display: none; }
        .rv-kbd-hint { display: none; }
      }
      @media (max-width: 640px) {
        .rv-body { grid-template-columns: 1fr; }
        .rv-nav  { display: none; }
        .rv-root { position: relative; height: auto; overflow: visible; }
        .rv-canvas-scroll { padding: 14px; }
        .rv-title-ta      { font-size: 19px; }
        .rv-preview-card  { margin: 14px; padding: 24px; }
        .rv-preview-title { font-size: 20px; }
        .rv-subbar        { padding: 4px 14px; }
        .rv-next-banner-inner { flex-direction: column; align-items: flex-start; }
        .rv-lesson-breadcrumb { max-width: 180px; }
      }
    `}</style>
  );
}