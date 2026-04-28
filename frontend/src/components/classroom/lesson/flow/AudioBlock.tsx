/**
 * AudioBlock.tsx
 *
 * Renders a custom lesson audio exercise block created from AudioEditorPage.
 *
 * Data shape (block.data):
 *   { src: string; caption?: string; title?: string }
 *
 * Registered in exerciseRegistrations.ts as "audio_embed".
 */

import type { ExerciseBlockProps } from "./exerciseBlock.types";

// Stores shared visual tokens for the audio block card.
const C = {
  white: "#FFFFFF",
  border: "#E8EAFD",
  sub: "#6B6F8E",
};

export default function AudioBlock({ item }: ExerciseBlockProps) {
  // Stores normalized block data payload.
  const data = (item as any).data as
    | { src?: string; caption?: string; title?: string }
    | undefined;
  // Stores resolved audio source URL (prefers data.src, then legacy block.url).
  const src = (data?.src ?? "").trim() || ((item as any).url ?? "").trim();
  // Stores optional caption under the player.
  const caption = (data?.caption ?? "").trim();
  // Stores optional title above the player.
  const title = (data?.title ?? (item as any).label ?? "").trim();

  if (!src) return null;

  return (
    <div
      style={{
        borderRadius: 16,
        background: C.white,
        border: `1.5px solid ${C.border}`,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(108,111,239,0.07)",
      }}
    >
      {title && (
        <div
          style={{
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 700,
            color: "#1C1F3A",
            borderBottom: `1px solid ${C.border}`,
            background: C.white,
          }}
        >
          {title}
        </div>
      )}

      <div style={{ padding: "14px 16px", background: "#F7F7FA" }}>
        <audio src={src} controls style={{ width: "100%", display: "block" }} />
      </div>

      {caption && (
        <div
          style={{
            padding: "9px 16px",
            borderTop: `1px solid ${C.border}`,
            background: C.white,
            fontSize: 12.5,
            color: C.sub,
            fontStyle: "italic",
            textAlign: "center",
            letterSpacing: "0.01em",
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
