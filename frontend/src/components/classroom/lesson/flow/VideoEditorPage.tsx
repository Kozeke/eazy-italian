/**
 * VideoEditorPage.tsx
 *
 * Teacher-facing editor for custom "Video block" exercises.
 *
 * UX flow:
 *   1. Teacher provides a video URL (YouTube / Vimeo / direct video file).
 *   2. Teacher optionally sets title and caption.
 *   3. A live preview is rendered using VideoBlock-compatible rules.
 *   4. Clicking Save calls onSave({ src, title, caption }).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Link, Upload, Video } from "lucide-react";
import api from "../../../../services/api";
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from "../exercise/ExerciseHeader";
import "./DragToGap.css";

// Stores design tokens shared across this editor page.
const C = {
  primary: "#6C6FEF",
  tint: "#EEF0FE",
  bg: "#F7F7FA",
  white: "#FFFFFF",
  border: "#E8EAFD",
  text: "#1C1F3A",
  sub: "#6B6F8E",
  muted: "#A8ABCA",
  danger: "#EF4444",
};

// Defines persisted payload shape consumed by VideoBlock.
export interface VideoBlockData {
  // Stores video URL for iframe/video element rendering.
  src: string;
  // Stores optional card title shown above player.
  title?: string;
  // Stores optional caption shown under player.
  caption?: string;
}

// Defines editor props used by ExerciseDraftsPage.
interface Props {
  // Stores preloaded header title for edit mode.
  initialTitle?: string;
  // Stores preloaded block payload for edit mode.
  initialData?: VideoBlockData;
  // Stores gallery label for header fallback.
  label?: string;
  // Stores current segment id; when present we persist server-side immediately.
  segmentId?: string | number | null;
  // Stores callback invoked when teacher saves the editor.
  onSave: (data: VideoBlockData, blockId?: string) => void | Promise<void>;
  // Stores callback invoked when teacher cancels editing.
  onCancel: () => void;
  // Header cog: return to exercise template gallery (ExerciseDraftsPage).
  onSettingsClick?: () => void;
}

// Extracts YouTube id from known public YouTube URL formats.
function extractYouTubeId(url: string): string | null {
  // Stores regex match result for the supported URL variants.
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/,
  );
  return match?.[1] ?? null;
}

// Extracts Vimeo id from standard Vimeo URL formats.
function extractVimeoId(url: string): string | null {
  // Stores regex match result containing numeric Vimeo id.
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match?.[1] ?? null;
}

export default function VideoEditorPage({
  initialTitle = "",
  initialData,
  label,
  segmentId,
  onSave,
  onCancel,
  onSettingsClick,
}: Props) {
  const { t } = useTranslation();

  // Stores the editable title mapped to block.data.title.
  const [title, setTitle] = useState(initialTitle || initialData?.title || "");
  // Stores current video URL value.
  const [src, setSrc] = useState(initialData?.src ?? "");
  // Stores optional caption text rendered under the player.
  const [caption, setCaption] = useState(initialData?.caption ?? "");
  // Stores selected input mode (URL or local file upload).
  const [inputMode, setInputMode] = useState<"url" | "upload">("url");
  // Stores preview panel visibility toggle.
  const [showPreview, setShowPreview] = useState(true);
  // Stores loading state while save promise is pending.
  const [saving, setSaving] = useState(false);
  // Stores failed preview state for inaccessible URLs/files.
  const [videoError, setVideoError] = useState(false);
  // Stores hidden file input reference used by upload mode.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stores "dirty" state used by header highlight.
  const isDirty = src.trim().length > 0;

  // Stores derived embeddable iframe URL for YouTube/Vimeo sources.
  const embedSrc = useMemo(() => {
    // Stores cleaned URL used for all id extraction checks.
    const trimmedSrc = src.trim();
    // Stores extracted YouTube id when source is YouTube.
    const youtubeId = extractYouTubeId(trimmedSrc);
    if (youtubeId) return `https://www.youtube.com/embed/${youtubeId}`;
    // Stores extracted Vimeo id when source is Vimeo.
    const vimeoId = extractVimeoId(trimmedSrc);
    if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}`;
    return null;
  }, [src]);

  // Converts selected local video file to data URI for preview/save.
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Stores first selected local file.
      const file = e.target.files?.[0];
      if (!file) return;
      // Stores reader used to convert file bytes into a data URI.
      const reader = new FileReader();
      reader.onload = (ev) => {
        // Stores FileReader result that may contain a data URI string.
        const result = ev.target?.result;
        if (typeof result === "string") {
          setSrc(result);
          setVideoError(false);
        }
      };
      // Triggers asynchronous conversion to base64 data URI.
      reader.readAsDataURL(file);
    },
    [],
  );

  // Saves a normalised VideoBlockData payload to parent handler.
  const handleSave = useCallback(async () => {
    if (!src.trim() || saving) return;
    setSaving(true);
    try {
      // Stores payload consumed by VideoBlock renderer.
      const videoData: VideoBlockData = {
        src: src.trim(),
        title: title.trim() || undefined,
        caption: caption.trim() || undefined,
      };

      // Stores numeric segment id required by the manual-save endpoint.
      const numericSegmentId = segmentId != null ? Number(segmentId) : NaN;
      if (Number.isFinite(numericSegmentId) && numericSegmentId > 0) {
        try {
          // Persists a custom video block immediately so we get stable block id.
          const response = await api.post<{ block: { id: string } }>(
            `/segments/${numericSegmentId}/exercises/video_embed`,
            {
              title: videoData.title || label || t("mediaEditor.videoBlockFallback"),
              data: videoData,
            },
          );
          // Stores server-created block id returned by the manual-save endpoint.
          const blockId: string | undefined = response.data?.block?.id;
          await onSave(videoData, blockId);
          return;
        } catch (err) {
          // Prevent crash if the POST fails; fallback keeps user progress.
          console.warn("[VideoEditorPage] POST /exercises/video_embed failed, falling back:", err);
        }
      }

      // Runs fallback save path for non-lesson contexts or failed POST.
      await onSave(videoData);
    } finally {
      setSaving(false);
    }
  }, [src, title, caption, saving, segmentId, label, onSave, t]);

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
        title={title}
        headerLabel={label ?? t("mediaEditor.videoBlockFallback")}
        editableTitleInHeader
        isDirty={isDirty}
        onSettingsClick={onSettingsClick}
        onClose={onCancel}
        onTitleChange={setTitle}
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

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, display: "block", marginBottom: 8 }}>
            {t("mediaEditor.videoSource")}
          </span>
          <div style={{
            display: "flex",
            marginBottom: 10,
            borderRadius: 9,
            border: `1.5px solid ${C.border}`,
            overflow: "hidden",
            alignSelf: "flex-start",
            width: "fit-content",
          }}>
            {(
              [["url", t("mediaEditor.videoUrl"), Link], ["upload", t("mediaEditor.uploadFile"), Upload]] as const
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
          {inputMode === "url" && (
            <div style={{ position: "relative" }}>
              <Link size={14} color={C.muted} style={{ position: "absolute", left: 12, top: 12 }} />
              <input
                type="url"
                value={src}
                onChange={(e) => { setSrc(e.target.value); setVideoError(false); }}
                placeholder={t("mediaEditor.urlPlaceholderVideo")}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px 10px 34px",
                  borderRadius: 10,
                  border: `1.5px solid ${C.border}`,
                  background: C.white,
                  fontSize: 13.5,
                  color: C.text,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
            </div>
          )}
          {inputMode === "upload" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: "100%",
                  padding: "26px 20px",
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
                }}
              >
                <Upload size={24} color={C.muted} strokeWidth={1.5} />
                <span style={{ fontWeight: 600 }}>{t("mediaEditor.clickUploadVideo")}</span>
                <span style={{ fontSize: 11, color: C.muted }}>{t("mediaEditor.formatsVideo")}</span>
              </button>
            </div>
          )}
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, display: "block", marginBottom: 6 }}>
            {t("mediaEditor.captionLabel")}{" "}
            <span style={{ fontWeight: 400, color: C.muted }}>{t("mediaEditor.optionalShort")}</span>
          </span>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={t("mediaEditor.videoCaptionPlaceholder")}
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
            }}
          />
        </label>

        {showPreview && src.trim() && (
          <div>
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 12,
                fontWeight: 700,
                color: C.sub,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {t("mediaEditor.preview")}
            </p>

            <div
              style={{
                borderRadius: 16,
                background: C.white,
                border: `1.5px solid ${C.border}`,
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(108,111,239,0.07)",
              }}
            >
              {title.trim() && (
                <div
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.text,
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  {title.trim()}
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
                      title={title.trim() || t("mediaEditor.videoIframeTitle")}
                    />
                  </div>
                ) : !videoError ? (
                  <video
                    src={src.trim()}
                    controls
                    style={{ width: "100%", display: "block", maxHeight: 520, background: "#000" }}
                    onError={() => setVideoError(true)}
                  />
                ) : (
                  <div
                    style={{
                      padding: "34px 20px",
                      textAlign: "center",
                      color: C.muted,
                      fontSize: 12,
                    }}
                  >
                    {t("mediaEditor.videoLoadError")}
                  </div>
                )}
              </div>

              {caption.trim() && (
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
                  {caption.trim()}
                </div>
              )}
            </div>
          </div>
        )}

        {showPreview && !src.trim() && (
          <div
            style={{
              marginTop: 4,
              borderRadius: 12,
              border: `1.5px dashed ${C.border}`,
              background: C.white,
              padding: "24px 16px",
              textAlign: "center",
              color: C.muted,
            }}
          >
            <Video size={26} strokeWidth={1.6} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 12.5, color: C.sub }}>{t("mediaEditor.emptyVideoPreview")}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: C.danger }}>
              {t("mediaEditor.emptyVideoHint")}
            </div>
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
                !src.trim() || saving ? "dtg-btn-save--disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={handleSave}
              disabled={!src.trim() || saving}
              title={!src.trim() ? t("mediaEditor.saveNeedVideo") : t("mediaEditor.save")}
            >
              {saving ? t("mediaEditor.saving") : t("mediaEditor.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
