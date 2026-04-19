/**
 * SlideImageEditor.legacy.tsx — Part 5 (legacy; used only from SlideEditor.legacy + ReviewSlidesPage.legacy).
 *
 * Image section shown inside the slide canvas.
 * Displays the current image and four action buttons:
 *
 *   Regenerate Image  — opens a prompt modal, calls POST /ai/regenerate-image
 *   Upload Image      — native file picker → base64 data-URI
 *   Replace Image     — alias for Regenerate (opens same modal)
 *   Remove Image      — clears image_url from slide state
 *
 * UX principle (spec):
 *   Manual editing is critical for trust.  The teacher can replace any
 *   AI-generated image at any time without being forced through regen.
 *
 * Lesson-mode note:
 *   This component is unaware of the lesson context — it operates purely
 *   at the slide level.  The containing SlideEditor.legacy passes it the same
 *   props whether we are in Mode A or Mode B.  No changes are required
 *   here for the lesson-by-lesson workflow.
 */

import React, { useState } from "react";
import {
  ReviewSlide, useImageRegen,
  LazyImage, MiniDiagram,
  IcoX, IcoUpload, IcoSparkle,
} from "../shared";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SlideImageEditorProps {
  slide:      ReviewSlide;
  status:     string;
  accent:     string;
  dark:       boolean;
  /** Forwarded file input ref from SlideEditor (single DOM node shared). */
  fileInput:  React.RefObject<HTMLInputElement>;
  onUpdate:   (patch: Partial<ReviewSlide>) => void;
}

export function SlideImageEditor({
  slide, status, accent, dark, fileInput, onUpdate,
}: SlideImageEditorProps) {

  const imgRegen = useImageRegen();
  const muted    = dark ? "rgba(255,255,255,.4)" : "rgba(0,0,0,.35)";

  const [showModal, setShowModal] = useState(false);
  const [prompt, setPrompt]       = useState(slide.image_prompt ?? "");

  const handleRegen = async () => {
    setShowModal(false);
    const finalPrompt = prompt.trim() || slide.title;
    const newUrl = await imgRegen.regen(slide.id, finalPrompt);
    if (newUrl) onUpdate({ image_url: newUrl, image_prompt: finalPrompt });
  };

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (status === "loading" || imgRegen.busy) return (
    <div className="rv-img-skeleton">
      <span className="rv-img-shimmer" />
      <span style={{ color: muted, fontSize: 12 }}>
        {imgRegen.busy ? "Generating new image…" : "Generating image…"}
      </span>
    </div>
  );

  return (
    <div className="rv-img-panel">

      {/* ── Current image ──────────────────────────────────────────────────── */}
      {slide.image_url && status !== "skipped" ? (
        <div className="rv-img-block">
          {slide.image_url.startsWith("data:image/svg+xml")
            ? <MiniDiagram title={slide.title} bullets={slide.bullets} accent={accent} />
            /* Part 10: lazy-load raster images */
            : <LazyImage src={slide.image_url} alt={`Visual: ${slide.title}`} className="rv-img-photo" />
          }
        </div>
      ) : status === "error" ? (
        <div className="rv-img-err">⚠ Image generation failed</div>
      ) : (
        /* No image placeholder */
        <div className="rv-img-empty">
          <span className="rv-img-empty-ico" aria-hidden="true">🖼️</span>
          <span style={{ color: muted, fontSize: 12 }}>No image on this slide</span>
        </div>
      )}

      {/* ── Action buttons ─────────────────────────────────────────────────── */}
      <div className="rv-img-actions">

        {/* Regenerate with prompt */}
        <button className="rv-img-actbtn rv-img-actbtn--regen"
          onClick={() => { setPrompt(slide.image_prompt ?? ""); setShowModal(true); }}
          title="Generate a new image using AI">
          <IcoSparkle /> Regenerate Image
        </button>

        {/* Upload local file */}
        <button className="rv-img-actbtn rv-img-actbtn--upload"
          onClick={() => fileInput.current?.click()}
          title="Upload an image from your device">
          <IcoUpload /> Upload Image
        </button>

        {/* Remove */}
        {slide.image_url && (
          <button className="rv-img-actbtn rv-img-actbtn--remove"
            onClick={() => onUpdate({ image_url: null, image_prompt: null })}
            title="Remove image from this slide">
            <IcoX sz={12} /> Remove Image
          </button>
        )}
      </div>

      {/* regen API error */}
      {imgRegen.error && (
        <div className="rv-img-regen-err">⚠ {imgRegen.error}</div>
      )}

      {/* ── Prompt modal ───────────────────────────────────────────────────── */}
      {showModal && (
        <div className="rv-prompt-modal" role="dialog" aria-modal="true"
          aria-label="Regenerate image"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>

          <div className="rv-prompt-card">
            <div className="rv-prompt-hd">
              <span>✨ Regenerate Image</span>
              <button className="rv-prompt-close" onClick={() => setShowModal(false)}
                aria-label="Close">
                <IcoX sz={13} />
              </button>
            </div>

            <p className="rv-prompt-hint">
              Describe the image you want for this slide.
              Leave blank to auto-generate from the slide title.
            </p>

            <textarea
              className="rv-prompt-ta"
              rows={3}
              autoFocus
              placeholder={`e.g. "A diagram showing ${slide.title.toLowerCase()}"`}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRegen();
                if (e.key === "Escape") setShowModal(false);
              }}
            />

            <div className="rv-prompt-meta">
              Slide: <strong>{slide.title || "Untitled"}</strong>
              {slide.imageType && slide.imageType !== "auto" && (
                <> · Type: <strong>{slide.imageType}</strong></>
              )}
            </div>

            <div className="rv-prompt-footer">
              <span className="rv-prompt-hint-sm">⌘ Enter to generate</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="rv-btn rv-btn--ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button className="rv-btn rv-btn--primary" onClick={handleRegen}>
                  <IcoSparkle /> Generate Image
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}