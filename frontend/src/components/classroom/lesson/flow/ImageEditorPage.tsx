/**
 * ImageEditorPage.tsx
 *
 * Teacher-facing editor for "Image block" exercises.
 *
 * UX flow:
 *   1. Teacher enters an optional title/caption in the header (editable center field).
 *   2. Teacher provides an image via URL input OR file upload (converted to data URI).
 *   3. Teacher may enter alt text for screen-reader accessibility.
 *   4. A live preview of the rendered ImageBlock appears below the inputs.
 *   5. Clicking "Save" calls onSave({ src, alt_text, title }).
 *
 * Output shape (ImageBlockData) is consumed by ImageBlock.tsx in the lesson flow.
 * Registered in exerciseTemplateRegistry.tsx as customEditor: "image_block".
 */

import { useState, useCallback, useRef } from "react";
import { ImageIcon, Eye, EyeOff, Upload, Link, Sparkles } from "lucide-react";
import api from "../../../../services/api";
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from "../exercise/ExerciseHeader";
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from "./AI_generation/AIExerciseGeneratorModal";

// ── Design tokens (mirrors project-wide palette) ───────────────────────────────
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
  success:   "#10B981",
  danger:    "#EF4444",
};

// ── Output data shape (matches ImageBlock.tsx consumer) ───────────────────────

export interface ImageBlockData {
  /** Image URL or data URI rendered by ImageBlock. */
  src: string;
  /** Screen-reader alt text for the image. */
  alt_text?: string;
  /** Optional caption displayed in the caption strip below the image. */
  title?: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Pre-populated title for re-editing an existing block. */
  initialTitle?: string;
  /** Pre-populated data for re-editing an existing block. */
  initialData?: ImageBlockData;
  /** Gallery label forwarded from exerciseTemplateRegistry. */
  label?: string;
  /**
   * Real API segment id (integer). When present, Save POSTs to
   * POST /segments/{segmentId}/exercises/image so the block is immediately
   * persisted server-side — matching the behaviour of AI-generated blocks.
   * When absent (non-lesson contexts) the caller's onSave handles persistence.
   */
  segmentId?: string | number | null;
  /**
   * Called when the teacher clicks Save.
   * `blockId` is the server-assigned id returned by the POST endpoint;
   * it is undefined when segmentId was not provided.
   */
  onSave: (data: ImageBlockData, blockId?: string) => void | Promise<void>;
  /** Called when the teacher clicks × or Cancel. */
  onCancel: () => void;
}

// ── ImageEditorPage component ──────────────────────────────────────────────────

export default function ImageEditorPage({
  initialTitle = "",
  initialData,
  label,
  segmentId,
  onSave,
  onCancel,
}: Props) {
  /** Caption/title shown in the caption strip of the rendered ImageBlock. */
  const [title, setTitle] = useState(initialTitle || initialData?.title || "");

  /** Image source — either a URL string or a base64 data URI from file upload. */
  const [src, setSrc] = useState(initialData?.src ?? "");

  /** Accessibility alt text for the image. */
  const [altText, setAltText] = useState(initialData?.alt_text ?? "");

  /** Whether the teacher is providing a URL or uploading a file. */
  const [inputMode, setInputMode] = useState<"url" | "upload">("url");

  /** Whether the live preview panel is visible. */
  const [showPreview, setShowPreview] = useState(true);

  /** True while the async save is in flight. */
  const [saving, setSaving] = useState(false);

  /** Controls visibility of the AI image generation modal. */
  const [showAIModal, setShowAIModal] = useState(false);

  /** True if the preview img element fires an onError (broken URL). */
  const [imgError, setImgError] = useState(false);

  /** Stores server block id returned by AI generation for direct reuse on save. */
  const generatedBlockIdRef = useRef<string | null>(null);

  /** Whether a src has been provided — gates the Save button. */
  const isDirty = src.trim().length > 0;

  /** Hidden file input used by the upload mode. */
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Applies AI-generated image payload into the local editor fields. */
  const applyGeneratedBlock = useCallback((block: GeneratedBlock) => {
    if (block.kind !== "image" || !block.data || typeof block.data !== "object") return;
    generatedBlockIdRef.current = block.id;
    /** Normalized generated data object returned by the AI modal callback. */
    const generatedData = block.data as Record<string, unknown>;
    /** Generated image source, trimmed for save and preview consistency. */
    const generatedSrc =
      typeof generatedData.src === "string" ? generatedData.src.trim() : "";
    /** Optional generated alt text to preserve accessibility metadata. */
    const generatedAltText =
      typeof generatedData.alt_text === "string" ? generatedData.alt_text : "";
    /** Generated block title used to seed the editor header title. */
    const generatedTitle = block.title?.trim() || "";
    if (!generatedSrc) return;
    setSrc(generatedSrc);
    setAltText(generatedAltText);
    if (generatedTitle) {
      setTitle(generatedTitle);
    }
    setImgError(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!src.trim() || saving) return;
    setSaving(true);
    try {
      const imageData: ImageBlockData = {
        src: src.trim(),
        alt_text: altText.trim() || undefined,
        title: title.trim() || undefined,
      };

      // Reuse server-created block id if content was generated through AI modal.
      /** Server id assigned during AI generation; reuse it to avoid duplicate POSTs. */
      const generatedBlockId = generatedBlockIdRef.current;
      if (generatedBlockId) {
        await onSave(imageData, generatedBlockId);
        return;
      }

      // ── Lesson context: POST to create the block server-side immediately ──
      // Mirrors the AI-generated image flow (POST /segments/{id}/exercises/image)
      // so the block gets a stable server-assigned id and is persisted before the
      // caller navigates back — avoiding the race with the debounced PUT autosave.
      const numericSegmentId = segmentId != null ? Number(segmentId) : NaN;
      if (Number.isFinite(numericSegmentId) && numericSegmentId > 0) {
        try {
          const response = await api.post<{ block: { id: string } }>(
            `/segments/${numericSegmentId}/exercises/image`,
            {
              title: imageData.title || label || "Image block",
              data: imageData,
            },
          );
          const blockId: string | undefined = response.data?.block?.id;
          await onSave(imageData, blockId);
          return;
        } catch (err) {
          // If the POST fails (network error, etc.), fall through to the
          // caller-managed save so the teacher never loses their work.
          console.warn("[ImageEditorPage] POST /exercises/image failed, falling back:", err);
        }
      }

      // ── Fallback / non-lesson path ────────────────────────────────────────
      await onSave(imageData);
    } finally {
      setSaving(false);
    }
  }, [src, altText, title, saving, segmentId, label, onSave]);

  /** Reads the selected file and stores it as a data URI in src. */
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result;
        if (typeof result === "string") {
          setSrc(result);
          setImgError(false);
        }
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  /** SVG data URIs must render full-width; regular images use maxWidth. */
  const isSvgDataUri =
    src.startsWith("data:image/svg+xml") || src.startsWith("data:image/svg");

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      fontFamily: "'Inter','Helvetica Neue',system-ui,sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* ── Fixed top header bar ──────────────────────────────────────────── */}
      <ExerciseHeader
        title={title}
        headerLabel={label ?? "Image block"}
        editableTitleInHeader
        isDirty={isDirty}
        onClose={onCancel}
        onTitleChange={setTitle}
      />

      {/* ── Editor body (below the fixed header) ─────────────────────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "32px 24px",
        maxWidth: 860,
        width: "100%",
        margin: `${EXERCISE_HEADER_HEIGHT_PX}px auto 0`,
        boxSizing: "border-box",
      }}>

        {/* Toolbar row: preview toggle + save button */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 8,
              border: `1.5px solid ${C.border}`,
              background: showPreview ? C.tint : C.white,
              color: showPreview ? C.primary : C.sub,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {showPreview
              ? <Eye size={14} strokeWidth={2} />
              : <EyeOff size={14} strokeWidth={2} />}
            {showPreview ? "Hide preview" : "Show preview"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => setShowAIModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 14px",
                borderRadius: 9,
                border: `1.5px solid ${C.border}`,
                background: C.white,
                color: C.primary,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Sparkles size={14} strokeWidth={2} />
              Generate
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!src.trim() || saving}
              style={{
                padding: "9px 24px",
                borderRadius: 9,
                border: "none",
                background: !src.trim() || saving ? C.muted : C.primary,
                color: C.white,
                fontSize: 13,
                fontWeight: 700,
                cursor: !src.trim() || saving ? "default" : "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* Input mode tabs: URL vs file upload */}
        <div style={{
          display: "flex",
          marginBottom: 14,
          borderRadius: 9,
          border: `1.5px solid ${C.border}`,
          overflow: "hidden",
          alignSelf: "flex-start",
        }}>
          {(
            [["url", "Image URL", Link], ["upload", "Upload file", Upload]] as const
          ).map(([mode, modeLabel, Icon]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setInputMode(mode)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 16px",
                border: "none",
                borderRight: mode === "url" ? `1.5px solid ${C.border}` : "none",
                background: inputMode === mode ? C.tint : C.white,
                color: inputMode === mode ? C.primary : C.sub,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Icon size={13} strokeWidth={2} />
              {modeLabel}
            </button>
          ))}
        </div>

        {/* URL input field */}
        {inputMode === "url" && (
          <input
            type="url"
            value={src}
            onChange={(e) => { setSrc(e.target.value); setImgError(false); }}
            placeholder="https://example.com/image.png"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 16px",
              borderRadius: 12,
              border: `1.5px solid ${C.border}`,
              background: C.white,
              fontSize: 14,
              color: C.text,
              fontFamily: "inherit",
              outline: "none",
              marginBottom: 16,
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }}
          />
        )}

        {/* File upload drop-zone */}
        {inputMode === "upload" && (
          <div style={{ marginBottom: 16 }}>
            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: "100%",
                padding: "32px 20px",
                borderRadius: 12,
                border: `2px dashed ${C.border}`,
                background: C.white,
                color: C.sub,
                fontSize: 13.5,
                fontFamily: "inherit",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; }}
            >
              <Upload size={26} color={C.muted} strokeWidth={1.5} />
              <span style={{ fontWeight: 600 }}>Click to upload an image</span>
              <span style={{ fontSize: 11, color: C.muted }}>PNG, JPG, GIF, SVG, WEBP</span>
            </button>

            {/* Confirmation that a file has been loaded */}
            {src && (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: C.success }}>
                Image loaded — see preview below.
              </p>
            )}
          </div>
        )}

        {/* Alt text input (shown regardless of input mode) */}
        <label style={{ display: "block", marginBottom: 24 }}>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.sub,
            display: "block",
            marginBottom: 6,
          }}>
            Alt text <span style={{ fontWeight: 400, color: C.muted }}>(accessibility description)</span>
          </span>
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="e.g. A diagram showing Italian verb conjugation"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1.5px solid ${C.border}`,
              background: C.white,
              fontSize: 13.5,
              color: C.text,
              fontFamily: "inherit",
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }}
          />
        </label>

        {/* Live preview — mirrors ImageBlock.tsx rendering exactly */}
        {showPreview && src.trim() && (
          <div>
            <p style={{
              margin: "0 0 10px",
              fontSize: 12,
              fontWeight: 700,
              color: C.sub,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Preview
            </p>

            <div style={{
              borderRadius: 16,
              background: C.white,
              border: `1.5px solid ${C.border}`,
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(108,111,239,0.07)",
            }}>
              {/* Image area */}
              <div style={{
                background: C.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                borderRadius: title.trim() ? "14px 14px 0 0" : 14,
              }}>
                {!imgError ? (
                  <img
                    key={src}
                    src={src}
                    alt={altText || "Educational illustration"}
                    style={{
                      width: isSvgDataUri ? "100%" : undefined,
                      maxWidth: "100%",
                      height: "auto",
                      display: "block",
                    }}
                    onError={() => setImgError(true)}
                  />
                ) : (
                  /* Error placeholder shown when the URL fails to load */
                  <div style={{
                    padding: "40px 24px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    color: C.muted,
                    textAlign: "center",
                  }}>
                    <ImageIcon size={40} color={C.muted} strokeWidth={1.5} />
                    <span style={{ fontSize: 13 }}>Image could not be loaded</span>
                    <span style={{ fontSize: 11, color: C.danger }}>
                      Check that the URL is correct and publicly accessible.
                    </span>
                  </div>
                )}
              </div>

              {/* Caption strip — only rendered when a title is provided */}
              {title.trim() && (
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
                  {title.trim()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AIExerciseGeneratorModal
        exerciseType="image"
        open={showAIModal}
        onClose={() => setShowAIModal(false)}
        segmentId={segmentId}
        onGenerated={(block) => {
          applyGeneratedBlock(block);
        }}
      />
    </div>
  );
}