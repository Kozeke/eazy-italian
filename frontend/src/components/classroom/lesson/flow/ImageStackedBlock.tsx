/**
 * ImageStackedBlock.tsx
 *
 * Renders stacked illustrations (URLs or data URIs) as a navigable
 * carousel — matching the ImageCarouselViewer UX but driven by
 * { images: { src, alt_text }[] } data from ImageStackedEditorPage.
 *
 * Registered in exerciseRegistrations.ts as "image_stacked".
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ExerciseBlockProps } from "./exerciseBlock.types";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  primary:     "#6C6FEF",
  primaryDark: "#4F52C2",
  tint:        "#EEF0FE",
  bg:          "#F7F7FA",
  white:       "#FFFFFF",
  border:      "#E8EAFD",
  sub:         "#6B6F8E",
  muted:       "#A8ABCA",
};

type StackedImageItem = { src: string; alt_text?: string };

function extractSvgMarkup(src: string): string | null {
  if (!src.startsWith("data:image/svg")) return null;
  const commaIdx = src.indexOf(",");
  if (commaIdx === -1) return null;
  const header = src.slice(0, commaIdx);
  const payload = src.slice(commaIdx + 1);
  if (header.includes("base64")) {
    try { return atob(payload); } catch { return null; }
  }
  try { return decodeURIComponent(payload); } catch { return payload; }
}

function SlideImage({ src, alt }: { src: string; alt: string }) {
  const svgMarkup = extractSvgMarkup(src);
  return svgMarkup ? (
    <div
      aria-label={alt}
      role="img"
      style={{ width: "100%", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  ) : (
    <img
      src={src}
      alt={alt}
      style={{
        maxWidth: "100%",
        maxHeight: "100%",
        height: "auto",
        display: "block",
        objectFit: "contain",
        borderRadius: 10,
      }}
    />
  );
}

export default function ImageStackedBlock({ item }: ExerciseBlockProps) {
  const data = (item as { data?: Record<string, unknown> }).data;
  const rawImages = data?.images;
  const images: StackedImageItem[] = Array.isArray(rawImages)
    ? rawImages.filter(
        (x): x is StackedImageItem =>
          Boolean(x) && typeof x === "object" && typeof (x as StackedImageItem).src === "string",
      )
    : [];

  const blockLabel = String((item as { label?: string }).label ?? "");
  const dataTitle = typeof data?.title === "string" ? data.title.trim() : "";
  const caption = dataTitle || blockLabel;

  const filled = images.filter((im) => im.src.trim().length > 0);
  // Emits hydration diagnostics so missing image_stacked blocks are easier to trace.
  console.log("[ImageStackedBlock] render payload diagnostics", {
    itemId: item.id,
    itemType: item.type,
    blockLabel,
    dataTitle,
    dataKeys: data ? Object.keys(data) : [],
    rawImagesType: Array.isArray(rawImages) ? "array" : typeof rawImages,
    rawImagesLength: Array.isArray(rawImages) ? rawImages.length : 0,
    validImagesLength: images.length,
    filledImagesLength: filled.length,
    sampleRawImage:
      Array.isArray(rawImages) && rawImages.length > 0 ? rawImages[0] : null,
  });

  const [current, setCurrent] = useState(0);

  if (filled.length === 0) {
    // Highlights why the block intentionally returns null in empty/invalid data cases.
    console.warn("[ImageStackedBlock] no renderable images found", {
      itemId: item.id,
      itemType: item.type,
      rawImages,
      parsedImages: images,
      data,
    });
    return null;
  }

  const slide = filled[current];
  const altText =
    (slide.alt_text && slide.alt_text.trim()) ||
    `${caption || "Illustration"} — ${current + 1}`;

  const prev = () => setCurrent((i) => Math.max(0, i - 1));
  const next = () => setCurrent((i) => Math.min(filled.length - 1, i + 1));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        background: C.white,
        border: `1.5px solid ${C.border}`,
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(108,111,239,0.08)",
      }}
    >
      {/* Caption / title */}
      {caption ? (
        <div
          style={{
            padding: "10px 16px 0",
            fontSize: 12,
            fontWeight: 700,
            color: C.sub,
            letterSpacing: "-0.01em",
          }}
        >
          {caption}
        </div>
      ) : null}

      {/* Image frame */}
      <div
        style={{
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
          padding: 16,
          overflow: "hidden",
        }}
      >
        <SlideImage src={slide.src.trim()} alt={altText} />
      </div>

      {/* Navigation bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "10px 16px",
          borderTop: `1px solid ${C.border}`,
          background: C.white,
        }}
      >
        {/* Prev */}
        <button
          type="button"
          onClick={prev}
          disabled={current === 0}
          aria-label="Previous image"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: `1.5px solid ${current === 0 ? C.border : C.primary}`,
            background: current === 0 ? C.bg : C.tint,
            color: current === 0 ? C.muted : C.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: current === 0 ? "default" : "pointer",
            transition: "all 0.15s",
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={16} strokeWidth={2.2} />
        </button>

        {/* Dot indicators */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {filled.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Go to image ${idx + 1}`}
              onClick={() => setCurrent(idx)}
              style={{
                width: idx === current ? 20 : 8,
                height: 8,
                borderRadius: 4,
                border: "none",
                background: idx === current ? C.primary : C.border,
                cursor: "pointer",
                padding: 0,
                transition: "all 0.2s",
              }}
            />
          ))}
        </div>

        {/* Next */}
        <button
          type="button"
          onClick={next}
          disabled={current === filled.length - 1}
          aria-label="Next image"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: `1.5px solid ${current === filled.length - 1 ? C.border : C.primary}`,
            background: current === filled.length - 1 ? C.bg : C.tint,
            color: current === filled.length - 1 ? C.muted : C.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: current === filled.length - 1 ? "default" : "pointer",
            transition: "all 0.15s",
            flexShrink: 0,
          }}
        >
          <ChevronRight size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}