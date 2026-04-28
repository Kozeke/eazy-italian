/**
 * VideoBlock.tsx
 *
 * Renders a custom lesson video exercise block created from VideoEditorPage.
 *
 * Data shape (block.data):
 *   { src: string; caption?: string; title?: string }
 *
 * Registered in exerciseRegistrations.ts as "video_embed".
 */

import type { ExerciseBlockProps } from "./exerciseBlock.types";

// Stores shared visual tokens for the video block card.
const C = {
  bg: "#F7F7FA",
  white: "#FFFFFF",
  border: "#E8EAFD",
  sub: "#6B6F8E",
};

// Extracts YouTube video id from common YouTube URL formats.
function extractYouTubeId(url: string): string | null {
  // Stores regex match result for youtu.be / watch?v= / embed / shorts formats.
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/,
  );
  return match?.[1] ?? null;
}

// Extracts Vimeo video id from a public Vimeo URL.
function extractVimeoId(url: string): string | null {
  // Stores regex match result for vimeo.com/{id} format.
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match?.[1] ?? null;
}

export default function VideoBlock({ item }: ExerciseBlockProps) {
  // Stores normalised custom data object.
  const data = (item as any).data as
    | { src?: string; caption?: string; title?: string }
    | undefined;
  // Stores resolved source URL (prefers structured data, then legacy block.url).
  const src = (data?.src ?? "").trim() || ((item as any).url ?? "").trim();
  // Stores rendered caption text under the player.
  const caption = (data?.caption ?? "").trim();
  // Stores heading text for the block header.
  const title = (data?.title ?? (item as any).label ?? "").trim();

  if (!src) return null;

  // Stores matched YouTube id when src points to YouTube.
  const youtubeId = extractYouTubeId(src);
  // Stores matched Vimeo id when src points to Vimeo.
  const vimeoId = extractVimeoId(src);
  // Stores embeddable iframe URL for supported platforms.
  const embedSrc = youtubeId
    ? `https://www.youtube.com/embed/${youtubeId}`
    : vimeoId
      ? `https://player.vimeo.com/video/${vimeoId}`
      : null;

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

      <div style={{ background: C.bg }}>
        {embedSrc ? (
          <div style={{ borderRadius: 0, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
            <iframe
              src={embedSrc}
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={title || "Lesson video"}
            />
          </div>
        ) : (
          <video
            src={src}
            controls
            style={{ width: "100%", display: "block", maxHeight: 560, background: "#000" }}
          />
        )}
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
