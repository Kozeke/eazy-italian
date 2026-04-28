/**
 * AudioEditorPage.tsx
 *
 * Teacher-facing editor for custom "Audio block" exercises.
 *
 * UX flow:
 *   1. Teacher provides an audio URL.
 *   2. Teacher optionally sets title and caption.
 *   3. A live audio preview is rendered.
 *   4. Clicking Save calls onSave({ src, title, caption }).
 */

import { useCallback, useRef, useState } from "react";
import { Eye, EyeOff, Link, Music2, Upload } from "lucide-react";
import api from "../../../../services/api";
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from "../exercise/ExerciseHeader";

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

// Defines persisted payload shape consumed by AudioBlock.
export interface AudioBlockData {
  // Stores audio URL for the audio element.
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
  initialData?: AudioBlockData;
  // Stores gallery label for header fallback.
  label?: string;
  // Stores current segment id; when present we persist server-side immediately.
  segmentId?: string | number | null;
  // Stores callback invoked when teacher saves the editor.
  onSave: (data: AudioBlockData, blockId?: string) => void | Promise<void>;
  // Stores callback invoked when teacher cancels editing.
  onCancel: () => void;
}

export default function AudioEditorPage({
  initialTitle = "",
  initialData,
  label,
  segmentId,
  onSave,
  onCancel,
}: Props) {
  // Stores the editable title mapped to block.data.title.
  const [title, setTitle] = useState(initialTitle || initialData?.title || "");
  // Stores current audio URL value.
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
  const [audioError, setAudioError] = useState(false);
  // Stores hidden file input reference used by upload mode.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stores "dirty" state used by header highlight.
  const isDirty = src.trim().length > 0;

  // Converts selected local audio file to data URI for preview/save.
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
          setAudioError(false);
        }
      };
      // Triggers asynchronous conversion to base64 data URI.
      reader.readAsDataURL(file);
    },
    [],
  );

  // Saves a normalized AudioBlockData payload to parent handler.
  const handleSave = useCallback(async () => {
    if (!src.trim() || saving) return;
    setSaving(true);
    try {
      // Stores payload consumed by AudioBlock renderer.
      const audioData: AudioBlockData = {
        src: src.trim(),
        title: title.trim() || undefined,
        caption: caption.trim() || undefined,
      };

      // Stores numeric segment id required by the manual-save endpoint.
      const numericSegmentId = segmentId != null ? Number(segmentId) : NaN;
      if (Number.isFinite(numericSegmentId) && numericSegmentId > 0) {
        try {
          // Persists a custom audio block immediately so we get stable block id.
          const response = await api.post<{ block: { id: string } }>(
            `/segments/${numericSegmentId}/exercises/audio_embed`,
            {
              title: audioData.title || label || "Audio block",
              data: audioData,
            },
          );
          // Stores server-created block id returned by the manual-save endpoint.
          const blockId: string | undefined = response.data?.block?.id;
          await onSave(audioData, blockId);
          return;
        } catch (err) {
          // Prevent crash if the POST fails; fallback keeps user progress.
          console.warn("[AudioEditorPage] POST /exercises/audio_embed failed, falling back:", err);
        }
      }

      // Runs fallback save path for non-lesson contexts or failed POST.
      await onSave(audioData);
    } finally {
      setSaving(false);
    }
  }, [src, title, caption, saving, segmentId, label, onSave]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'Inter','Helvetica Neue',system-ui,sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ExerciseHeader
        title={title}
        headerLabel={label ?? "Audio block"}
        editableTitleInHeader
        isDirty={isDirty}
        onClose={onCancel}
        onTitleChange={setTitle}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "32px 24px",
          maxWidth: 860,
          width: "100%",
          margin: `${EXERCISE_HEADER_HEIGHT_PX}px auto 0`,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
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
            {showPreview ? "Hide preview" : "Show preview"}
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
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, display: "block", marginBottom: 8 }}>
            Audio source
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
              [["url", "Audio URL", Link], ["upload", "Upload file", Upload]] as const
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
                onChange={(e) => { setSrc(e.target.value); setAudioError(false); }}
                placeholder="https://example.com/audio.mp3"
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
                accept="audio/*"
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
                <span style={{ fontWeight: 600 }}>Click to upload audio</span>
                <span style={{ fontSize: 11, color: C.muted }}>MP3, WAV, OGG, AAC, M4A</span>
              </button>
            </div>
          )}
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, display: "block", marginBottom: 6 }}>
            Caption <span style={{ fontWeight: 400, color: C.muted }}>(optional)</span>
          </span>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="e.g. Listen and repeat each sentence"
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
              Preview
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

              <div style={{ background: C.bg, padding: "14px 16px" }}>
                {!audioError ? (
                  <audio
                    src={src.trim()}
                    controls
                    style={{ width: "100%", display: "block" }}
                    onError={() => setAudioError(true)}
                  />
                ) : (
                  <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "12px 4px" }}>
                    Audio could not be loaded. Check URL or uploaded file.
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
            <Music2 size={26} strokeWidth={1.6} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 12.5, color: C.sub }}>Paste an audio URL to preview</div>
            <div style={{ marginTop: 4, fontSize: 11, color: C.danger }}>
              Direct audio file links are supported.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
