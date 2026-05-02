/**
 * GifAnimationEditorPage.tsx
 *
 * Teacher-facing editor for "GIF animation" exercise blocks.
 *
 * UX flow:
 *   1. Teacher enters an optional caption in the header (editable center field).
 *   2. Teacher provides a GIF via URL input OR file upload (converted to data URI).
 *   3. Teacher may toggle loop on/off and enter alt text for accessibility.
 *   4. A live preview with play/pause control appears below the inputs.
 *   5. Clicking "Save" calls onSave({ src, alt_text, loop, caption }).
 *
 * Output shape (GifAnimationData) is consumed by GifAnimationBlock.tsx.
 * Registered in exerciseTemplateRegistry.tsx with customEditor: "gif_animation".
 */

import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Upload, Link, RefreshCw } from "lucide-react";
import api from "../../../../services/api";
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from "../exercise/ExerciseHeader";
import "./DragToGap.css";

// ── Design tokens ─────────────────────────────────────────────────────────────
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
  warn:      "#F59E0B",
};

// ── Output data shape ─────────────────────────────────────────────────────────

export interface GifAnimationData {
  /** GIF URL or data URI rendered by GifAnimationBlock. */
  src: string;
  /** Screen-reader alt text. */
  alt_text?: string;
  /** Caption shown below the animation. */
  caption?: string;
  /** Whether the GIF should loop. Default true. */
  loop?: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialTitle?: string;
  initialData?: GifAnimationData;
  label?: string;
  /**
   * Real API segment id. When present, Save POSTs to
   * POST /segments/{segmentId}/exercises/gif_animation so the block is
   * immediately persisted server-side — matching AI-generated block behaviour.
   * When absent the caller's onSave handles persistence.
   */
  segmentId?: string | number | null;
  /**
   * Called when the teacher clicks Save.
   * `blockId` is the server-assigned id returned by the POST endpoint;
   * it is undefined when segmentId was not provided.
   */
  onSave: (data: GifAnimationData, blockId?: string) => void | Promise<void>;
  onCancel: () => void;
  /** Header cog: return to exercise template gallery (ExerciseDraftsPage). */
  onSettingsClick?: () => void;
}

// ── Small reusable field label ─────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 12,
      fontWeight: 600,
      color: C.sub,
      display: "block",
      marginBottom: 6,
    }}>
      {children}
    </span>
  );
}

// ── Preview play/pause button ─────────────────────────────────────────────────

function PreviewPlayPause({
  playing,
  onClick,
  pauseAriaLabel,
  playAriaLabel,
}: {
  playing: boolean;
  onClick: () => void;
  pauseAriaLabel: string;
  playAriaLabel: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label={playing ? pauseAriaLabel : playAriaLabel}
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
        background: hovered ? C.primaryDk : "rgba(108,111,239,0.88)",
        color: C.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(79,82,194,0.25)",
        transition: "background 0.15s, transform 0.12s",
        transform: hovered ? "scale(1.08)" : "scale(1)",
        fontFamily: "inherit",
      }}
    >
      {playing ? (
        <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
          <rect x="1" y="1" width="3.5" height="12" rx="1.2" fill="white"/>
          <rect x="7.5" y="1" width="3.5" height="12" rx="1.2" fill="white"/>
        </svg>
      ) : (
        <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
          <path d="M2 1.5L11 7L2 12.5V1.5Z" fill="white"/>
        </svg>
      )}
    </button>
  );
}

// ── GifAnimationEditorPage ─────────────────────────────────────────────────────

export default function GifAnimationEditorPage({
  initialTitle = "",
  initialData,
  label,
  segmentId,
  onSave,
  onCancel,
  onSettingsClick,
}: Props) {
  const { t } = useTranslation();

  const [caption, setCaption] = useState(
    initialTitle || initialData?.caption || "",
  );
  const [src,     setSrc]     = useState(initialData?.src ?? "");
  const [altText, setAltText] = useState(initialData?.alt_text ?? "");
  const [loop,    setLoop]    = useState(initialData?.loop !== false);

  const [inputMode,   setInputMode]   = useState<"url" | "upload">("url");
  const [showPreview, setShowPreview] = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [imgError,    setImgError]    = useState(false);
  const [imgLoaded,   setImgLoaded]   = useState(false);

  // Preview play/pause
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [frameSrc, setFrameSrc]             = useState<string | null>(null);
  const previewImgRef                       = useRef<HTMLImageElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDirty = src.trim().length > 0;

  // ── Capture first frame for pause simulation ─────────────────────────────────
  const handlePreviewLoad = useCallback(() => {
    setImgLoaded(true);
    if (previewImgRef.current) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width  = previewImgRef.current.naturalWidth  || 1;
        canvas.height = previewImgRef.current.naturalHeight || 1;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(previewImgRef.current, 0, 0);
          setFrameSrc(canvas.toDataURL("image/png"));
        }
      } catch {
        // CORS-restricted src: canvas tainted, just skip frame capture
      }
    }
  }, []);

  const previewDisplaySrc =
    !previewPlaying && frameSrc ? frameSrc : src;

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!src.trim() || saving) return;
    setSaving(true);
    try {
      const gifData: GifAnimationData = {
        src:      src.trim(),
        alt_text: altText.trim() || undefined,
        caption:  caption.trim() || undefined,
        loop,
      };

      // ── Lesson context: POST to create the block server-side immediately ──
      // Mirrors the ImageEditorPage flow (POST /segments/{id}/exercises/image)
      // so the block gets a stable server-assigned id and is persisted before
      // the caller navigates back.
      const numericSegmentId = segmentId != null ? Number(segmentId) : NaN;
      if (Number.isFinite(numericSegmentId) && numericSegmentId > 0) {
        try {
          const response = await api.post<{ block: { id: string } }>(
            `/segments/${numericSegmentId}/exercises/gif_animation`,
            {
              src:      gifData.src,
              alt_text: gifData.alt_text ?? null,
              caption:  gifData.caption ?? null,
              loop:     gifData.loop !== false,
              title:    caption.trim() || label || t("mediaEditor.gifAnimationFallback"),
            },
          );
          const blockId: string | undefined = response.data?.block?.id;
          await onSave(gifData, blockId);
          return;
        } catch (err) {
          // If the POST fails, fall through so the teacher never loses their work.
          console.error("[GifAnimationEditorPage] server POST failed, falling through:", err);
        }
      }

      await onSave(gifData);
    } finally {
      setSaving(false);
    }
  }, [src, altText, caption, loop, saving, segmentId, label, onSave, t]);

  // ── File upload ──────────────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Warn if not a GIF but allow upload anyway
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result;
        if (typeof result === "string") {
          setSrc(result);
          setImgError(false);
          setImgLoaded(false);
          setFrameSrc(null);
          setPreviewPlaying(true);
        }
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  const isGifSrc = src.toLowerCase().includes(".gif") ||
    src.startsWith("data:image/gif");

  // ── Shared input style ────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 14px",
    borderRadius: 12,
    border: `1.5px solid ${C.border}`,
    background: C.white,
    fontSize: 14,
    color: C.text,
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s",
  };

  return (
    <div
      className="dtg-editor-root"
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'Inter','Helvetica Neue',system-ui,sans-serif",
      }}
    >
      <ExerciseHeader
        title={caption}
        headerLabel={label ?? t("mediaEditor.gifAnimationFallback")}
        editableTitleInHeader
        isDirty={isDirty}
        onSettingsClick={onSettingsClick}
        onClose={onCancel}
        onTitleChange={setCaption}
      />

      <div
        className="dtg-editor-content"
        style={{
          paddingTop: EXERCISE_HEADER_HEIGHT_PX + 14,
          paddingLeft: 24,
          paddingRight: 24,
          maxWidth: 860,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <div style={{ marginBottom: 20 }}>
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
            {showPreview ? <Eye size={14} strokeWidth={2} /> : <EyeOff size={14} strokeWidth={2} />}
            {showPreview ? t("mediaEditor.hidePreview") : t("mediaEditor.showPreview")}
          </button>
        </div>

        {/* Input mode tabs */}
        <div style={{
          display: "flex",
          marginBottom: 14,
          borderRadius: 9,
          border: `1.5px solid ${C.border}`,
          overflow: "hidden",
          alignSelf: "flex-start",
        }}>
          {(
            [["url", t("mediaEditor.gifUrl"), Link], ["upload", t("mediaEditor.uploadGif"), Upload]] as const
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

        {/* URL input */}
        {inputMode === "url" && (
          <div style={{ marginBottom: 16 }}>
            <input
              type="url"
              value={src}
              onChange={(e) => {
                setSrc(e.target.value);
                setImgError(false);
                setImgLoaded(false);
                setFrameSrc(null);
                setPreviewPlaying(true);
              }}
              placeholder={t("mediaEditor.urlPlaceholderGif")}
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }}
            />
            {src.trim() && !isGifSrc && (
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: C.warn }}>
                ⚠ {t("mediaEditor.gifUrlWarning")}
              </p>
            )}
          </div>
        )}

        {/* File upload */}
        {inputMode === "upload" && (
          <div style={{ marginBottom: 16 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/gif,.gif"
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
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: C.tint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
              }}>
                🎞️
              </div>
              <span style={{ fontWeight: 600 }}>{t("mediaEditor.clickUploadGif")}</span>
              <span style={{ fontSize: 11.5, color: C.muted }}>
                {t("mediaEditor.formatsGifHelp")}
              </span>
            </button>

            {src && (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: C.success }}>
                ✓ {t("mediaEditor.gifLoadedHint")}
              </p>
            )}
          </div>
        )}

        {/* Alt text */}
        <label style={{ display: "block", marginBottom: 16 }}>
          <FieldLabel>
            {t("mediaEditor.altTextLabel")}{" "}
            <span style={{ fontWeight: 400, color: C.muted }}>
              {t("mediaEditor.altTextHint")}
            </span>
          </FieldLabel>
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder={t("mediaEditor.altPlaceholderGif")}
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }}
          />
        </label>

        {/* Loop toggle */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderRadius: 12,
          border: `1.5px solid ${C.border}`,
          background: C.white,
          marginBottom: 24,
          cursor: "pointer",
        }}
          onClick={() => setLoop((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setLoop((v) => !v);
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: loop ? C.tint : C.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s",
            }}>
              <RefreshCw size={15} color={loop ? C.primary : C.muted} strokeWidth={2.2} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>
                {t("mediaEditor.loopAnimation")}
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: C.muted }}>
                {loop ? t("mediaEditor.loopOnHint") : t("mediaEditor.loopOffHint")}
              </p>
            </div>
          </div>

          {/* Toggle pill */}
          <div style={{
            width: 40,
            height: 22,
            borderRadius: 11,
            background: loop ? C.primary : C.muted,
            position: "relative",
            transition: "background 0.18s",
            flexShrink: 0,
          }}>
            <div style={{
              position: "absolute",
              top: 3,
              left: loop ? 21 : 3,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: C.white,
              boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
              transition: "left 0.18s",
            }} />
          </div>
        </div>

        {/* Live preview */}
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
              {t("mediaEditor.preview")}
            </p>

            <div style={{
              borderRadius: 16,
              background: C.white,
              border: `1.5px solid ${C.border}`,
              overflow: "hidden",
              boxShadow: "0 1px 6px rgba(108,111,239,0.08)",
            }}>
              {/* Image area */}
              <div style={{
                background: C.bg,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                borderRadius: caption.trim() ? "14px 14px 0 0" : 14,
                minHeight: 120,
              }}>
                {/* GIF badge */}
                {imgLoaded && !imgError && (
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
                  }}>
                    {t("mediaEditor.gifBadge")}
                  </div>
                )}

                {/* Freeze overlay */}
                {!previewPlaying && !frameSrc && imgLoaded && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 2,
                    background: "rgba(247,247,250,0.82)",
                    backdropFilter: "blur(2px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>
                      {t("mediaEditor.paused")}
                    </span>
                  </div>
                )}

                {/* No-loop badge */}
                {imgLoaded && !imgError && !loop && (
                  <div style={{
                    position: "absolute",
                    top: 10,
                    right: previewPlaying ? 10 : 54,
                    zIndex: 3,
                    padding: "2px 7px",
                    borderRadius: 6,
                    background: "rgba(168,171,202,0.88)",
                    color: C.white,
                    fontSize: 10,
                    fontWeight: 700,
                  }}>
                    {t("mediaEditor.noLoopBadge")}
                  </div>
                )}

                {!imgError ? (
                  <img
                    ref={previewImgRef}
                    key={previewDisplaySrc}
                    src={previewDisplaySrc}
                    alt={altText || t("mediaEditor.previewAltGif")}
                    onLoad={handlePreviewLoad}
                    onError={() => setImgError(true)}
                    style={{
                      maxWidth: "100%",
                      maxHeight: 480,
                      width: "100%",
                      height: "auto",
                      display: "block",
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  <div style={{
                    padding: "40px 24px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    color: C.muted,
                    textAlign: "center",
                  }}>
                    <span style={{ fontSize: 36 }}>🎞️</span>
                    <span style={{ fontSize: 13 }}>{t("mediaEditor.gifLoadError")}</span>
                    <span style={{ fontSize: 11, color: C.danger }}>
                      {t("mediaEditor.gifLoadErrorHint")}
                    </span>
                  </div>
                )}

                {/* Play/Pause button */}
                {imgLoaded && !imgError && (
                  <PreviewPlayPause
                    playing={previewPlaying}
                    onClick={() => setPreviewPlaying((v) => !v)}
                    pauseAriaLabel={t("mediaEditor.pausePreviewAria")}
                    playAriaLabel={t("mediaEditor.playPreviewAria")}
                  />
                )}
              </div>

              {/* Caption strip */}
              {caption.trim() && (
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
                  {caption.trim()}
                </div>
              )}
            </div>

            {/* Helper note */}
            <p style={{
              margin: "10px 0 0",
              fontSize: 11.5,
              color: C.muted,
              textAlign: "center",
            }}>
              {t("mediaEditor.studentPlayPauseHint")}
            </p>
          </div>
        )}

        <div className="dtg-footer">
          <div className="dtg-footer-btns">
            <button type="button" className="dtg-btn-cancel" onClick={onCancel}>
              {t("mediaEditor.cancel")}
            </button>
            <button
              type="button"
              className={[
                "dtg-btn-save",
                !isDirty || saving ? "dtg-btn-save--disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={handleSave}
              disabled={!isDirty || saving}
              title={!isDirty ? t("mediaEditor.saveNeedGif") : t("mediaEditor.save")}
            >
              {saving ? t("mediaEditor.saving") : t("mediaEditor.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}