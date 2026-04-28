/**
 * GifAnimationBlock.tsx
 *
 * Renders a GIF animation block in the lesson flow.
 *
 * Data shape (block.data):
 *   { src: string; alt_text?: string; loop?: boolean; caption?: string }
 *
 * Registered in exerciseRegistrations.ts as "gif_animation".
 *
 * Features:
 *   • Play / pause toggle (replaces src with a static thumbnail proxy trick via
 *     a canvas snapshot — falls back to a CSS freeze overlay when canvas is unavailable)
 *   • Loop badge indicator
 *   • Caption strip (when provided)
 *   • Graceful error state when src fails to load
 */

import { useState, useRef, useCallback, useEffect } from "react";
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
  danger:    "#EF4444",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Captures the current frame of an <img> element to a data URI via canvas. */
function captureFrame(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width  = img.naturalWidth  || img.width  || 1;
    canvas.height = img.naturalHeight || img.height || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlayPauseButton({
  playing,
  onClick,
}: {
  playing: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label={playing ? "Pause animation" : "Play animation"}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        bottom: 10,
        right: 10,
        zIndex: 4,
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "none",
        background: hovered
          ? C.primaryDk
          : "rgba(108,111,239,0.88)",
        color: C.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(79,82,194,0.30)",
        transition: "background 0.15s, transform 0.12s",
        transform: hovered ? "scale(1.08)" : "scale(1)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        fontFamily: "inherit",
      }}
    >
      {playing ? (
        /* Pause icon: two vertical bars */
        <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
          <rect x="1" y="1" width="3.5" height="12" rx="1.2" fill="white"/>
          <rect x="7.5" y="1" width="3.5" height="12" rx="1.2" fill="white"/>
        </svg>
      ) : (
        /* Play icon: triangle */
        <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
          <path d="M2 1.5L11 7L2 12.5V1.5Z" fill="white"/>
        </svg>
      )}
    </button>
  );
}

// ── GifAnimationBlock ──────────────────────────────────────────────────────────

export default function GifAnimationBlock({ item }: ExerciseBlockProps) {
  const data    = (item as any).data as {
    src?: string;
    alt_text?: string;
    loop?: boolean;
    caption?: string;
  } | undefined;

  const src     = (data?.src ?? "").trim();
  const altText = data?.alt_text ?? (item as any).label ?? "Animated illustration";
  const caption = data?.caption ?? (item as any).label ?? "";
  const loop    = data?.loop !== false; // default: loop enabled

  const [playing, setPlaying]   = useState(true);
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded]     = useState(false);

  // We store the first-frame snapshot once the img loads
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // After the <img> loads, capture the first frame for the paused state
  const handleLoad = useCallback(() => {
    setLoaded(true);
    if (imgRef.current) {
      const snap = captureFrame(imgRef.current);
      setFrameSrc(snap);
    }
  }, []);

  // Sync loop attribute whenever `loop` data prop changes
  useEffect(() => {
    if (!imgRef.current) return;
    // GIF looping is inherent to the file; we simulate "no loop" by swapping
    // the src to a snapshot. Nothing we can do natively.
  }, [loop]);

  if (!src) return null;

  // Displayed src: when paused show the captured first frame (or keep original
  // visible under a frosted overlay if canvas capture failed)
  const displaySrc = !playing && frameSrc ? frameSrc : src;
  const showFreezeOverlay = !playing && !frameSrc;

  return (
    <div style={{
      borderRadius: 16,
      background: C.white,
      border: `1.5px solid ${C.border}`,
      overflow: "hidden",
      boxShadow: "0 1px 6px rgba(108,111,239,0.08)",
    }}>
      {/* ── Image area ─────────────────────────────────────────────────────── */}
      <div style={{
        background: C.bg,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderRadius: caption ? "14px 14px 0 0" : 14,
        minHeight: loaded ? undefined : 160,
      }}>
        {/* GIF badge */}
        {loaded && !imgError && (
          <div style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 3,
            padding: "2px 8px",
            borderRadius: 6,
            background: "rgba(108,111,239,0.90)",
            color: C.white,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.07em",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            boxShadow: "0 1px 4px rgba(79,82,194,0.22)",
          }}>
            GIF
          </div>
        )}

        {/* Freeze overlay when paused and canvas snapshot unavailable */}
        {showFreezeOverlay && (
          <div style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            background: "rgba(247,247,250,0.82)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>Paused</span>
          </div>
        )}

        {/* Loop badge */}
        {loaded && !imgError && !loop && (
          <div style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 3,
            padding: "2px 7px",
            borderRadius: 6,
            background: "rgba(168,171,202,0.88)",
            color: C.white,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}>
            NO LOOP
          </div>
        )}

        {/* Loading skeleton */}
        {!loaded && !imgError && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(90deg, ${C.bg} 25%, ${C.tint} 50%, ${C.bg} 75%)`,
            backgroundSize: "200% 100%",
            animation: "gif-shimmer 1.4s ease-in-out infinite",
          }} />
        )}

        {/* The actual GIF / first-frame snapshot */}
        {!imgError ? (
          <img
            ref={imgRef}
            key={displaySrc}
            src={displaySrc}
            alt={altText}
            onLoad={handleLoad}
            onError={() => setImgError(true)}
            style={{
              maxWidth: "100%",
              maxHeight: 480,
              width: "100%",
              height: "auto",
              display: "block",
              objectFit: "contain",
              opacity: loaded ? 1 : 0,
              transition: "opacity 0.2s",
            }}
          />
        ) : (
          /* Error state */
          <div style={{
            padding: "48px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            color: C.muted,
            textAlign: "center",
          }}>
            <span style={{ fontSize: 36 }}>🎞️</span>
            <span style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>
              Could not load animation
            </span>
            <span style={{ fontSize: 11, color: C.danger }}>
              Check the GIF URL or re-upload the file.
            </span>
          </div>
        )}

        {/* Play / Pause button */}
        {loaded && !imgError && (
          <PlayPauseButton
            playing={playing}
            onClick={() => setPlaying((v) => !v)}
          />
        )}
      </div>

      {/* ── Caption strip ──────────────────────────────────────────────────── */}
      {caption && (
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
          {caption}
        </div>
      )}

      {/* Keyframe for shimmer effect */}
      <style>{`
        @keyframes gif-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}