/**
 * ImagePlaceholderBlock.tsx
 *
 * Renders an `image_placeholder` block written by the unit generator.
 *
 * Behaviour mirrors the ThumbnailZone in CreateCourseModal:
 *  • Idle   — shows a styled placeholder zone with a "Generate Image" button.
 *  • Active — spinner overlay on top of the zone, button is disabled.
 *  • Done   — the generated SVG/image appears inline, right in place.
 *             A "Regenerate" button fades in on hover so teachers can redo.
 *             No "reload the page" message — the image is shown immediately.
 *
 * In student mode the block renders nothing (students never see unresolved
 * placeholders; once resolved the kind becomes "image" and ImageBlock takes over).
 *
 * Data shape (block.data):
 *   { image_description: string; alt_text?: string; _unit_id: number; _segment_id: number }
 */

import { useState, useCallback } from "react";
import type { ExerciseBlockProps } from "./exerciseBlock.types";

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  primary:   "#6C6FEF",
  primaryDk: "#4F52C2",
  tint:      "#EEF0FE",
  bg:        "#F7F7FA",
  white:     "#FFFFFF",
  border:    "#E8EAFD",
  text:      "#1C1F3A",
  sub:       "#6B6F8E",
  muted:     "#A8ABCA",
  error:     "#EF4444",
  errorBg:   "#FEF2F2",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extract raw SVG markup from a data URI (same logic as ImageBlock.tsx). */
function extractSvgMarkup(src: string): string | null {
  if (!src.startsWith("data:image/svg")) return null;
  const commaIdx = src.indexOf(",");
  if (commaIdx === -1) return null;
  const header  = src.slice(0, commaIdx);
  const payload = src.slice(commaIdx + 1);
  if (header.includes("base64")) {
    try { return atob(payload); } catch { return null; }
  }
  try { return decodeURIComponent(payload); } catch { return payload; }
}

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, "");

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlaceholderGraphic() {
  return (
    <svg
      width="100%" height="100%" viewBox="0 0 320 180"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="320" height="180" rx="12" fill={C.tint} />
      <rect x="110" y="66" width="100" height="68" rx="10" fill="#DDE1FC" />
      <circle cx="160" cy="100" r="22" fill={C.white} opacity="0.7" />
      <circle cx="160" cy="100" r="14" fill="#B8BCEF" opacity="0.6" />
      <rect x="130" y="58" width="28" height="12" rx="5" fill="#DDE1FC" />
      <circle cx="230" cy="72" r="4" fill={C.primary} opacity="0.25" />
      <circle cx="90"  cy="118" r="3" fill={C.primary} opacity="0.18" />
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ImagePlaceholderBlock({ item, mode }: ExerciseBlockProps) {
  const data = (item as any).data as {
    image_description?: string;
    alt_text?: string;
    _unit_id?: number;
    _segment_id?: number;
  } | undefined;

  const description = data?.image_description ?? "";
  const altText     = data?.alt_text ?? "Educational illustration";
  const blockId     = (item as any).id as string | undefined;
  const segmentId   = data?._segment_id;
  const unitId      = data?._unit_id;

  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [imageSrc,   setImageSrc]   = useState<string | null>(null);
  const [hovered,    setHovered]    = useState(false);

  // Students never see unresolved placeholders
  if (mode !== "teacher") return null;

  const handleGenerate = useCallback(async () => {
    if (!blockId || !segmentId || !unitId) {
      setError("Missing block / segment / unit context — cannot generate image.");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(
        `${API_BASE}/units/${unitId}/segments/${segmentId}/generate-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ block_id: blockId }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).detail ?? `HTTP ${res.status}`);
      }
      const result = await res.json() as { src: string; alt_text: string };
      setImageSrc(result.src);
    } catch (err: any) {
      setError(err?.message ?? "Image generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [blockId, segmentId, unitId]);

  // ── Rendered image state ───────────────────────────────────────────────────
  if (imageSrc) {
    const svgMarkup = extractSvgMarkup(imageSrc);
    return (
      <>
        <style>{`
          @keyframes ip-spin { to { transform: rotate(360deg); } }
          .ip-zone { position: relative; }
          .ip-regen-btn { opacity: 0; transition: opacity .18s; }
          .ip-zone:hover .ip-regen-btn { opacity: 1; }
        `}</style>

        <div
          className="ip-zone"
          style={{
            borderRadius: 16,
            background: C.white,
            border: `1.5px solid ${C.border}`,
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(108,111,239,0.07)",
          }}
        >
          <div style={{ background: C.bg, lineHeight: 0 }}>
            {svgMarkup ? (
              <div
                aria-label={altText} role="img"
                style={{ width: "100%", lineHeight: 0 }}
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : (
              <img
                src={imageSrc} alt={altText}
                style={{ width: "100%", height: "auto", display: "block", objectFit: "contain", maxHeight: 480 }}
              />
            )}
          </div>

          {/* Hover overlay — Regenerate */}
          <div
            className="ip-regen-btn"
            style={{
              position: "absolute", inset: 0,
              background: "rgba(28,31,58,.38)",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 14,
              pointerEvents: "none",
            }}
          >
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              style={{
                pointerEvents: "auto",
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 18px", borderRadius: 10, border: "none",
                background: generating ? "rgba(255,255,255,.18)" : C.primary,
                color: C.white, fontSize: 13, fontWeight: 700,
                cursor: generating ? "not-allowed" : "pointer",
                backdropFilter: "blur(4px)",
                boxShadow: "0 2px 10px rgba(108,111,239,.35)",
                fontFamily: "inherit",
                transition: "background .14s",
              }}
              onMouseEnter={(e) => { if (!generating) e.currentTarget.style.background = C.primaryDk; }}
              onMouseLeave={(e) => { if (!generating) e.currentTarget.style.background = generating ? "rgba(255,255,255,.18)" : C.primary; }}
            >
              {generating ? (
                <>
                  <span style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff",
                    animation: "ip-spin .7s linear infinite", display: "inline-block", flexShrink: 0,
                  }} />
                  Regenerating…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M8 1.5l1.5 4h4l-3.2 2.5 1.2 4L8 9.5 4.5 12l1.2-4L2.5 5.5h4L8 1.5z"
                      fill="white" stroke="white" strokeWidth="0.5" />
                  </svg>
                  Regenerate
                </>
              )}
            </button>
          </div>

          {error && (
            <div style={{
              padding: "9px 16px", background: C.errorBg,
              borderTop: `1px solid #FECACA`,
              fontSize: 12.5, color: C.error,
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="7" stroke={C.error} strokeWidth="1.4" />
                <path d="M8 5v4M8 11v1" stroke={C.error} strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}
        </div>
      </>
    );
  }

  // ── Idle / placeholder state ───────────────────────────────────────────────
  return (
    <>
      <style>{`@keyframes ip-spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{
        borderRadius: 16,
        border: `1.5px dashed ${C.border}`,
        background: C.bg,
        overflow: "hidden",
      }}>

        {/* 16:9 visual zone */}
        <div
          style={{ position: "relative", width: "100%", aspectRatio: "16/9", cursor: generating ? "default" : "pointer" }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={!generating ? handleGenerate : undefined}
        >
          <PlaceholderGraphic />

          {/* Spinner overlay while generating */}
          {generating && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(28,31,58,.52)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12,
              borderRadius: "14px 14px 0 0",
            }}>
              <span style={{
                width: 28, height: 28,
                border: "3px solid rgba(255,255,255,.25)", borderTopColor: "#fff",
                borderRadius: "50%",
                animation: "ip-spin .7s linear infinite",
                display: "block",
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "inherit" }}>
                Generating…
              </span>
            </div>
          )}

          {/* Hover overlay — Generate button */}
          {!generating && (
            <div style={{
              position: "absolute", inset: 0,
              background: hovered ? "rgba(108,111,239,.10)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "14px 14px 0 0",
              transition: "background .18s",
            }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 20px", borderRadius: 10, border: "none",
                  background: hovered ? C.primary : "rgba(108,111,239,.75)",
                  color: C.white, fontSize: 13, fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: hovered ? "0 2px 12px rgba(108,111,239,.4)" : "none",
                  backdropFilter: "blur(4px)",
                  fontFamily: "inherit",
                  opacity: hovered ? 1 : 0,
                  transition: "background .15s, box-shadow .15s, opacity .18s",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M8 1.5l1.5 4h4l-3.2 2.5 1.2 4L8 9.5 4.5 12l1.2-4L2.5 5.5h4L8 1.5z"
                    fill="white" stroke="white" strokeWidth="0.5" />
                </svg>
                Generate Image
              </button>
            </div>
          )}
        </div>

        {/* Bottom strip */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "12px 16px",
          borderTop: `1px solid ${C.border}`,
          background: C.white,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: C.tint, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.primary}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2" y="7" width="20" height="14" rx="3" />
                <circle cx="12" cy="14" r="3.5" />
                <path d="M8 7V5a1 1 0 011-1h6a1 1 0 011 1v2" />
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                Image placeholder
              </div>
              {description && (
                <div style={{
                  fontSize: 11.5, color: C.sub, marginTop: 2, lineHeight: 1.45,
                  overflow: "hidden", textOverflow: "ellipsis",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                  fontStyle: "italic",
                }}>
                  {description}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 9, border: "none",
              background: generating ? C.primaryDk : C.primary,
              color: C.white, fontSize: 12.5, fontWeight: 700,
              cursor: generating ? "not-allowed" : "pointer",
              opacity: generating ? 0.88 : 1,
              flexShrink: 0, fontFamily: "inherit",
              whiteSpace: "nowrap",
              transition: "background .14s, transform .1s",
            }}
            onMouseEnter={(e) => { if (!generating) e.currentTarget.style.background = C.primaryDk; }}
            onMouseLeave={(e) => { if (!generating) e.currentTarget.style.background = generating ? C.primaryDk : C.primary; }}
            onMouseDown={(e)  => { if (!generating) e.currentTarget.style.transform = "scale(0.97)"; }}
            onMouseUp={(e)    => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {generating ? (
              <>
                <span style={{
                  width: 12, height: 12, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff",
                  animation: "ip-spin .7s linear infinite", display: "inline-block",
                }} />
                Generating…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M8 1.5l1.5 4h4l-3.2 2.5 1.2 4L8 9.5 4.5 12l1.2-4L2.5 5.5h4L8 1.5z"
                    fill="white" stroke="white" strokeWidth="0.5" />
                </svg>
                Generate
              </>
            )}
          </button>
        </div>

        {error && (
          <div style={{
            margin: "0 14px 12px", padding: "9px 12px", borderRadius: 9,
            background: C.errorBg, border: `1px solid #FECACA`,
            fontSize: 12.5, color: C.error,
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="7" stroke={C.error} strokeWidth="1.4" />
              <path d="M8 5v4M8 11v1" stroke={C.error} strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}
      </div>
    </>
  );
}