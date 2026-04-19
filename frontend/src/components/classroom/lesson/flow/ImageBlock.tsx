/**
 * ImageBlock.tsx
 *
 * Renders an AI-generated image block.  The image content lives in
 * block.data.src (a data URI — typically "data:image/svg+xml;…") rather
 * than in block.url (which is used by teacher-uploaded URL images handled
 * by InlineMediaCard in SectionBlock.tsx).
 *
 * Data shape (block.data):
 *   { src: string; alt_text?: string }
 *
 * Registered in exerciseRegistrations.ts as "image".
 *
 * Only blocks where data.src is set reach this component — teacher-added
 * URL images still go through InlineMediaCard (see isSimpleMediaBlock in
 * SectionBlock.tsx which returns false when data.src is present).
 *
 * Read-only for both teacher and student — no interactive state needed.
 */

import type { ExerciseBlockProps } from "./exerciseBlock.types";

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:         "#F7F7FA",
  white:      "#FFFFFF",
  border:     "#E8EAFD",
  tint:       "#EEF0FE",
  sub:        "#6B6F8E",
  muted:      "#A8ABCA",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Extract raw SVG markup from a data URI.
 * Handles three encoding variants:
 *   1. data:image/svg+xml;charset=utf-8,<percent-encoded SVG>
 *   2. data:image/svg+xml,<percent-encoded SVG>
 *   3. data:image/svg+xml;base64,<base64 SVG>
 * Returns null if the URI doesn't match any known SVG variant.
 */
function extractSvgMarkup(src: string): string | null {
  if (!src.startsWith("data:image/svg")) return null;

  const commaIdx = src.indexOf(",");
  if (commaIdx === -1) return null;

  const header  = src.slice(0, commaIdx);
  const payload = src.slice(commaIdx + 1);

  if (header.includes("base64")) {
    try {
      return atob(payload);
    } catch {
      return null;
    }
  }

  // Percent-encoded (charset=utf-8 or plain)
  try {
    return decodeURIComponent(payload);
  } catch {
    // Already decoded or contains literal SVG
    return payload;
  }
}

// ── ImageBlock component ───────────────────────────────────────────────────────

export default function ImageBlock({ item }: ExerciseBlockProps) {
  const data    = (item as any).data as { src?: string; alt_text?: string } | undefined;
  const src     = data?.src ?? "";
  const altText = data?.alt_text ?? (item as any).label ?? "Educational illustration";
  const title   = (item as any).label ?? "";

  if (!src) return null;

  const svgMarkup = extractSvgMarkup(src);

  return (
    <div style={{
      borderRadius: 16,
      background: C.white,
      border: `1.5px solid ${C.border}`,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(108,111,239,0.07)",
    }}>
      {/* Image container */}
      <div style={{
        background: C.bg,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderRadius: title ? "14px 14px 0 0" : 14,
      }}>
        {svgMarkup ? (
          // Inline SVG — most reliable cross-browser rendering for data URIs.
          // dangerouslySetInnerHTML is safe here: content is AI-generated SVG
          // from our own backend, not user-supplied arbitrary HTML.
          <div
            aria-label={altText}
            role="img"
            style={{ width: "100%", lineHeight: 0 }}
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        ) : (
          // Regular URL or non-SVG data URI — plain <img> works fine.
          <img
            src={src}
            alt={altText}
            style={{
              maxWidth: "100%",
              height: "auto",
              display: "block",
            }}
          />
        )}
      </div>

      {/* Caption strip (only if a title is provided) */}
      {title && (
        <div style={{
          padding: "9px 16px",
          borderTop: `1px solid ${C.border}`,
          background: C.white,
          fontSize: 12.5,
          color: C.sub,
          fontStyle: "italic",
          textAlign: "center",
          letterSpacing: "0.01em",
        }}>
          {title}
        </div>
      )}
    </div>
  );
}