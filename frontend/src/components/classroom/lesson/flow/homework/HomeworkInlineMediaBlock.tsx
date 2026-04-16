/**
 * HomeworkInlineMediaBlock.tsx
 *
 * Renders an inline image / video / audio item inside the HomeworkPlayer.
 *
 * Item shape expected:
 *   {
 *     type:      'inline_media',
 *     id:        string,
 *     mediaKind: 'image' | 'video' | 'audio',
 *     url:       string,        // may be empty when first added
 *     caption:   string,
 *     label?:    string,
 *     status:    'available'
 *   }
 *
 * Teacher mode  → shows an editable URL input when url is empty,
 *                 allows editing caption.
 * Student mode  → read-only; if url is empty shows a friendly placeholder.
 */

import { useState } from "react";
import { ImageIcon, VideoIcon, Music2, Link2, CheckCircle2 } from "lucide-react";
import type { ExerciseBlockProps } from "../exerciseBlock.types";

// ─── Design tokens (matches ExerciseDraftsPage + design system) ───────────────

const C = {
  primary:    "#6C6FEF",
  primaryDk:  "#4F52C2",
  tint:       "#EEF0FE",
  bg:         "#F7F7FA",
  white:      "#FFFFFF",
  border:     "#E8EAFD",
  text:       "#1C1F3A",
  sub:        "#6B6F8E",
  muted:      "#A8ABCA",
  cardShadow: "0 1px 3px rgba(60,64,120,0.07), 0 4px 18px rgba(60,64,120,0.05)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MediaKind = "image" | "video" | "audio";

function MediaIcon({ kind, size = 20 }: { kind: MediaKind; size?: number }) {
  if (kind === "video") return <VideoIcon size={size} strokeWidth={1.8} />;
  if (kind === "audio") return <Music2   size={size} strokeWidth={1.8} />;
  return                       <ImageIcon size={size} strokeWidth={1.8} />;
}

function kindLabel(kind: MediaKind): string {
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  return "Image";
}

// ─── URL input (teacher mode, no URL yet) ─────────────────────────────────────

function UrlInput({
  kind,
  onConfirm,
}: {
  kind: MediaKind;
  onConfirm: (url: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const placeholder =
    kind === "video"
      ? "https://youtube.com/…  or direct video URL"
      : kind === "audio"
      ? "https://… direct audio URL"
      : "https://… image URL";

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "stretch",
        marginTop: 12,
        padding: "0 2px",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: C.bg,
          border: `1.5px solid ${C.border}`,
          borderRadius: 10,
          padding: "9px 12px",
        }}
      >
        <Link2 size={13} color={C.muted} strokeWidth={2} />
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) onConfirm(draft.trim());
          }}
          placeholder={placeholder}
          style={{
            border: "none",
            background: "transparent",
            outline: "none",
            fontSize: 13,
            color: C.text,
            flex: 1,
            fontFamily: "inherit",
            minWidth: 0,
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => draft.trim() && onConfirm(draft.trim())}
        style={{
          padding: "0 14px",
          borderRadius: 10,
          border: "none",
          background: draft.trim() ? C.primary : C.tint,
          color:       draft.trim() ? C.white   : C.muted,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: draft.trim() ? "pointer" : "default",
          transition: "background 0.15s, color 0.15s",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        Set URL
      </button>
    </div>
  );
}

// ─── Image preview ────────────────────────────────────────────────────────────

function ImagePreview({ url, caption }: { url: string; caption: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div
        style={{
          borderRadius: 10,
          background: C.bg,
          border: `1.5px dashed ${C.border}`,
          height: 160,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          color: C.muted,
          fontSize: 12,
        }}
      >
        <ImageIcon size={22} strokeWidth={1.5} />
        <span>Could not load image</span>
      </div>
    );
  }
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", lineHeight: 0 }}>
      <img
        src={url}
        alt={caption || "Homework image"}
        onError={() => setErrored(true)}
        style={{
          width: "100%",
          maxHeight: 320,
          objectFit: "contain",
          background: C.bg,
          display: "block",
        }}
      />
    </div>
  );
}

// ─── Video preview ────────────────────────────────────────────────────────────

function VideoPreview({ url }: { url: string }) {
  const isYouTube =
    url.includes("youtube.com") || url.includes("youtu.be");
  const isVimeo = url.includes("vimeo.com");

  const embedSrc = (() => {
    if (isYouTube) {
      const idMatch =
        url.match(/[?&]v=([^&]+)/) ??
        url.match(/youtu\.be\/([^?]+)/);
      const id = idMatch?.[1];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (isVimeo) {
      const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  })();

  if (embedSrc) {
    return (
      <div
        style={{
          borderRadius: 10,
          overflow: "hidden",
          position: "relative",
          paddingBottom: "56.25%",
        }}
      >
        <iframe
          src={embedSrc}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
          allowFullScreen
          title="Video"
        />
      </div>
    );
  }

  return (
    <video
      src={url}
      controls
      style={{ width: "100%", borderRadius: 10, background: "#000", display: "block", maxHeight: 300 }}
    />
  );
}

// ─── Audio preview ────────────────────────────────────────────────────────────

function AudioPreview({ url }: { url: string }) {
  return (
    <div
      style={{
        background: C.bg,
        border: `1.5px solid ${C.border}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <audio src={url} controls style={{ width: "100%", display: "block" }} />
    </div>
  );
}

// ─── Main block ───────────────────────────────────────────────────────────────

export default function HomeworkInlineMediaBlock({
  item,
  mode,
  onComplete,
}: ExerciseBlockProps) {
  const mediaKind: MediaKind = (item as any).mediaKind ?? "image";
  const [url,     setUrl    ] = useState<string>((item as any).url     ?? "");
  const [caption, setCaption] = useState<string>((item as any).caption ?? "");
  const [done,    setDone   ] = useState(false);

  const hasUrl = url.trim().length > 0;

  // ── Empty state (teacher) ─────────────────────────────────────────────────
  function renderEmptyTeacher() {
    return (
      <div
        style={{
          padding: "24px 20px",
          borderRadius: 12,
          background: C.tint,
          border: `1.5px dashed ${C.primary}`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: C.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 10px",
            color: C.primary,
          }}
        >
          <MediaIcon kind={mediaKind} size={20} />
        </div>
        <p style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 700, color: C.text }}>
          Add {kindLabel(mediaKind)}
        </p>
        <p style={{ margin: "0 0 0", fontSize: 12, color: C.sub }}>
          Paste a URL below to embed this {kindLabel(mediaKind).toLowerCase()} in homework
        </p>
        <UrlInput kind={mediaKind} onConfirm={(u) => setUrl(u)} />
      </div>
    );
  }

  // ── Empty state (student) ─────────────────────────────────────────────────
  function renderEmptyStudent() {
    return (
      <div
        style={{
          padding: "28px 20px",
          borderRadius: 12,
          background: C.bg,
          border: `1.5px solid ${C.border}`,
          textAlign: "center",
          color: C.muted,
        }}
      >
        <MediaIcon kind={mediaKind} size={24} />
        <p style={{ margin: "8px 0 0", fontSize: 13, color: C.sub }}>
          {kindLabel(mediaKind)} not available yet
        </p>
      </div>
    );
  }

  // ── Media with URL ────────────────────────────────────────────────────────
  function renderMedia() {
    if (mediaKind === "video") return <VideoPreview url={url} />;
    if (mediaKind === "audio") return <AudioPreview url={url} />;
    return <ImagePreview url={url} caption={caption} />;
  }

  return (
    <div className="hw-media-block">
      {/* Header bar — icon + label */}
      <div className="hw-media-block__header">
        <div className="hw-media-block__icon">
          <MediaIcon kind={mediaKind} size={14} />
        </div>
        <span className="hw-media-block__label">
          {(item as any).label ?? kindLabel(mediaKind)}
        </span>
        {done && (
          <CheckCircle2 size={16} color="#22c55e" strokeWidth={2} />
        )}
      </div>

      {/* Body */}
      <div className="hw-media-block__body">
        {!hasUrl
          ? mode === "teacher"
            ? renderEmptyTeacher()
            : renderEmptyStudent()
          : renderMedia()}

        {/* Caption (teacher editable, student read-only) */}
        {hasUrl && (
          <div style={{ marginTop: 10 }}>
            {mode === "teacher" ? (
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption (optional)…"
                style={{
                  width: "100%",
                  border: "none",
                  borderBottom: `1px solid ${C.border}`,
                  background: "transparent",
                  outline: "none",
                  fontSize: 12.5,
                  color: C.sub,
                  padding: "4px 0",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            ) : caption ? (
              <p style={{ margin: 0, fontSize: 12.5, color: C.sub, textAlign: "center" }}>
                {caption}
              </p>
            ) : null}
          </div>
        )}

        {/* Teacher: change URL link */}
        {hasUrl && mode === "teacher" && (
          <div style={{ marginTop: 8, textAlign: "right" }}>
            <button
              type="button"
              onClick={() => setUrl("")}
              style={{
                fontSize: 11.5,
                color: C.muted,
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "inherit",
              }}
            >
              Change URL
            </button>
          </div>
        )}

        {/* Student: mark as viewed */}
        {hasUrl && mode === "student" && !done && (
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <button
              type="button"
              onClick={() => { setDone(true); onComplete?.(); }}
              style={{
                padding: "8px 20px",
                borderRadius: 10,
                border: "none",
                background: C.primary,
                color: C.white,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Mark as viewed
            </button>
          </div>
        )}
      </div>
    </div>
  );
}