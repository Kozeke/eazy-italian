/**
 * SlidePreview.legacy.tsx — Part 6 + Lesson Mode (legacy; SlideEditor.legacy only).
 *
 * Read-only student view of a slide, rendered with the chosen theme.
 * Shown when the teacher toggles "Preview" mode in the top bar.
 *
 * UX principle (from spec):
 *   The preview must be pixel-identical to what the student sees.
 *   No editing affordances are rendered here — trust is built by
 *   showing the teacher exactly the final output.
 *
 * Lesson-mode addition:
 *   When `lessonObjective` is supplied (Mode B), a small teal pill
 *   appears on the right side of the chrome bar.  This reminds the
 *   teacher of the lesson goal while they're previewing — it does NOT
 *   appear on the rendered slide itself (students never see it).
 */

import { ReviewSlide, ThemeSpec, themeAccent, themeText, LazyImage, MiniDiagram } from "../shared";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SlidePreviewProps {
  slide:            ReviewSlide;
  theme:            ThemeSpec;
  imageStatus:      string;
  /**
   * Mode B only — shown in the chrome bar for teacher reference.
   * Never rendered on the student-facing slide card.
   */
  lessonObjective?: string;
}

export function SlidePreview({ slide, theme, imageStatus, lessonObjective }: SlidePreviewProps) {
  const acc    = themeAccent(theme);
  const textC  = themeText(theme);
  const muted  = theme.dark ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.5)";
  const bg     = theme.colors[1] || theme.colors[0];

  const showImage = imageStatus === "done" && !!slide.image_url;

  return (
    <div className="rv-preview-wrap">

      {/* Chrome bar tells teacher this is the student view */}
      <div className="rv-preview-chrome">
        <span className="rv-preview-badge">👁 Student View</span>
        <span className="rv-preview-hint">Exactly as students will see it</span>

        {/* Mode B: lesson objective pill — teacher-only, right-aligned */}
        {lessonObjective && (
          <span
            className="rv-preview-obj-pill"
            title={`Lesson objective: ${lessonObjective}`}
            aria-label={`Lesson objective: ${lessonObjective}`}
          >
            🎯 {lessonObjective}
          </span>
        )}
      </div>

      {/* Slide card — pixel-identical to what students see */}
      <div
        className="rv-preview-card"
        style={{ background: bg, borderTop: `6px solid ${acc}` }}
      >
        {/* Title */}
        <h1 className="rv-preview-title" style={{ color: textC }}>
          {slide.title || <em style={{ opacity: .3 }}>No title</em>}
        </h1>

        {/* Image — Part 10: LazyImage for raster; SVG rendered inline */}
        {showImage && (
          <div className="rv-preview-img">
            {slide.image_url!.startsWith("data:image/svg+xml")
              ? <MiniDiagram title={slide.title} bullets={slide.bullets} accent={acc} />
              : <LazyImage src={slide.image_url!} alt={slide.title} className="rv-preview-photo" />
            }
          </div>
        )}

        {/* Bullets */}
        {(slide.bullets || []).filter(Boolean).length > 0 && (
          <ul className="rv-preview-bullets" aria-label="Bullet points">
            {(slide.bullets || []).filter(Boolean).map((b, i) => (
              <li key={i} className="rv-preview-bullet" style={{ color: textC }}>
                <span className="rv-preview-dot" style={{ background: acc }} aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Examples */}
        {(slide.examples || []).filter(Boolean).length > 0 && (
          <div className="rv-preview-examples">
            <span className="rv-preview-ex-label" style={{ color: acc }}>Examples</span>
            {(slide.examples || []).filter(Boolean).map((ex, i) => (
              <p key={i} style={{ color: muted }}>{ex}</p>
            ))}
          </div>
        )}

        {/* Exercise */}
        {slide.exercise && (
          <div className="rv-preview-exercise" style={{ borderColor: acc }}>
            <span className="rv-preview-ex-badge" style={{ color: acc }}>✏️ Exercise</span>
            <p style={{ color: textC }}>{slide.exercise}</p>
          </div>
        )}
      </div>
    </div>
  );
}