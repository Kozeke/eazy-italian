/**
 * ImageStackedEditorPage.tsx
 *
 * Teacher editor for stacked image blocks (multiple illustrations in one segment block).
 * Supports URL / upload per row, optional alt text, and AI generation (HF + SVG fallback).
 */

import { useState, useCallback, useRef } from "react";
import { Plus, Sparkles, Trash2, Upload, Link, Eye, EyeOff } from "lucide-react";
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from "../exercise/ExerciseHeader";
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from "./AI_generation/AIExerciseGeneratorModal";
import api from "../../../../services/api";

const C = {
  primary: "#6C6FEF",
  tint:    "#EEF0FE",
  bg:      "#F7F7FA",
  white:   "#FFFFFF",
  border:  "#E8EAFD",
  text:    "#1C1F3A",
  sub:     "#6B6F8E",
  muted:   "#A8ABCA",
};

/** One row in the stacked image editor. */
export interface ImageStackedRow {
  id: string;
  src: string;
  alt_text: string;
}

/** Payload persisted on the segment block and read by ImageStackedBlock. */
export interface ImageStackedData {
  title?: string;
  images: Array<{ src: string; alt_text?: string }>;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyRow(): ImageStackedRow {
  return { id: uid(), src: "", alt_text: "" };
}

function rowsFromData(data?: ImageStackedData): ImageStackedRow[] {
  const imgs = data?.images;
  if (!Array.isArray(imgs) || imgs.length === 0) {
    return [emptyRow(), emptyRow()];
  }
  return imgs.map((im) => ({
    id: uid(),
    src: String(im.src ?? ""),
    alt_text: String(im.alt_text ?? ""),
  }));
}

interface Props {
  initialTitle?: string;
  initialData?: ImageStackedData;
  label?: string;
  segmentId?: string | number | null;
  onSave: (data: ImageStackedData, blockId?: string) => void | Promise<void>;
  onCancel: () => void;
}

export default function ImageStackedEditorPage({
  initialTitle = "",
  initialData,
  label,
  segmentId,
  onSave,
  onCancel,
}: Props) {
  /** Section title stored in block.data.title and shown above the stack in the player. */
  const [title, setTitle] = useState(initialTitle || initialData?.title || "");

  /** Editable rows (each maps to one frame in ImageStackedBlock). */
  const [rows, setRows] = useState<ImageStackedRow[]>(() => rowsFromData(initialData));

  /** Per-row input mode: paste URL or upload file. */
  const [rowModes, setRowModes] = useState<Record<string, "url" | "upload">>({});

  const [showAIModal, setShowAIModal] = useState(false);
  /** Controls visibility of the stacked images preview panel. */
  const [showPreview, setShowPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const generatedBlockIdRef = useRef<string | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const setRowMode = (rowId: string, mode: "url" | "upload") => {
    setRowModes((prev) => ({ ...prev, [rowId]: mode }));
  };

  const getRowMode = (rowId: string) => rowModes[rowId] ?? "url";

  const canSave = rows.filter((r) => r.src.trim().length > 0).length >= 2;

  const applyGeneratedBlock = useCallback((block: GeneratedBlock) => {
    if (block.kind !== "image_stacked" || !block.data || typeof block.data !== "object") return;
    generatedBlockIdRef.current = block.id;
    const d = block.data as Record<string, unknown>;
    const raw = d.images;
    if (!Array.isArray(raw) || raw.length === 0) return;
    const nextRows: ImageStackedRow[] = raw.map((item) => {
      const o = item as Record<string, unknown>;
      return {
        id: uid(),
        src: String(o.src ?? ""),
        alt_text: String(o.alt_text ?? ""),
      };
    });
    const padded =
      nextRows.length >= 2
        ? nextRows
        : [
            ...nextRows,
            ...Array.from({ length: 2 - nextRows.length }, () => emptyRow()),
          ];
    setRows(padded);
    const t = d.title != null && String(d.title).trim() ? String(d.title).trim() : block.title;
    if (t) setTitle(t);
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const images = rows
        .filter((r) => r.src.trim().length > 0)
        .map((r) => ({
          src: r.src.trim(),
          alt_text: r.alt_text.trim() || undefined,
        }));
      const data: ImageStackedData = {
        title: title.trim() || undefined,
        images,
      };

      // If we already have a server-persisted block id from AI generation, use it.
      // Otherwise, if segmentId is present, POST the block to the server now so
      // the src URLs are actually saved (same fix as ImageEditorPage).
      let resolvedBlockId: string | undefined =
        generatedBlockIdRef.current ?? undefined;

      if (!resolvedBlockId && segmentId) {
        try {
          const res = await api.post(
            `/segments/${segmentId}/exercises/image_stacked`,
            { images, title: data.title ?? null },
          );
          const serverBlock = res.data?.block;
          if (serverBlock?.id) {
            resolvedBlockId = String(serverBlock.id);
          }
        } catch (err) {
          // Fall through — let the caller-managed path handle persistence so
          // the teacher never loses their work even on a network error.
          console.warn("[ImageStackedEditorPage] server persist failed, falling through:", err);
        }
      }

      await onSave(data, resolvedBlockId);
    } finally {
      setSaving(false);
    }
  }, [rows, title, canSave, saving, segmentId, onSave]);

  const updateRow = (rowId: string, patch: Partial<ImageStackedRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (rowId: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== rowId);
      return next.length >= 2 ? next : [emptyRow(), emptyRow()];
    });
  };

  const onPickFile = (rowId: string, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") updateRow(rowId, { src: result });
    };
    reader.readAsDataURL(file);
  };

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
        headerLabel={label ?? "Image carousel"}
        editableTitleInHeader
        isDirty={canSave}
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
            onClick={() => setShowPreview((value) => !value)}
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
              <Sparkles size={14} />
              Generate
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              style={{
                padding: "9px 24px",
                borderRadius: 9,
                border: "none",
                background: !canSave || saving ? C.muted : C.primary,
                color: C.white,
                fontSize: 13,
                fontWeight: 700,
                cursor: !canSave || saving ? "default" : "pointer",
                fontFamily: "inherit",
              }}
              title={!canSave ? "Need at least 2 images" : "Save"}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div
          style={{
            border: `1.5px solid ${C.border}`,
            borderRadius: 12,
            padding: 16,
            background: C.white,
            marginBottom: 14,
          }}
        >
          <p style={{ margin: "0 0 12px", fontSize: 12, color: C.muted }}>
            Add at least two images for the carousel. Each row becomes one slide.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {rows.map((row, idx) => (
              <div
                key={row.id}
                style={{
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 12,
                  padding: 14,
                  background: C.white,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>Image {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length <= 2}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: rows.length <= 2 ? "default" : "pointer",
                      color: rows.length <= 2 ? C.muted : C.sub,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                    }}
                    title={rows.length <= 2 ? "At least 2 rows required" : "Delete"}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>

                <div style={{ display: "flex", marginBottom: 10, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden", width: "fit-content" }}>
                  {(["url", "upload"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRowMode(row.id, mode)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        border: "none",
                        borderRight: mode === "url" ? `1px solid ${C.border}` : "none",
                        background: getRowMode(row.id) === mode ? C.tint : C.white,
                        color: getRowMode(row.id) === mode ? C.primary : C.sub,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {mode === "url" ? <Link size={12} /> : <Upload size={12} />}
                      {mode === "url" ? "URL" : "File"}
                    </button>
                  ))}
                </div>

                <input
                  ref={(el) => { fileInputsRef.current[row.id] = el; }}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    onPickFile(row.id, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />

                {getRowMode(row.id) === "url" ? (
                  <input
                    type="url"
                    value={row.src}
                    onChange={(e) => updateRow(row.id, { src: e.target.value })}
                    placeholder="https://…"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1.5px solid ${C.border}`,
                      fontSize: 13,
                      marginBottom: 8,
                      fontFamily: "inherit",
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputsRef.current[row.id]?.click()}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: 10,
                      border: `2px dashed ${C.border}`,
                      background: C.bg,
                      cursor: "pointer",
                      fontSize: 13,
                      color: C.sub,
                      marginBottom: 8,
                      fontFamily: "inherit",
                    }}
                  >
                    Select file...
                  </button>
                )}

                <input
                  type="text"
                  value={row.alt_text}
                  onChange={(e) => updateRow(row.id, { alt_text: e.target.value })}
                  placeholder="Alt text (accessibility)"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1.5px solid ${C.border}`,
                    fontSize: 12.5,
                    fontFamily: "inherit",
                  }}
                />

                {showPreview && row.src.trim() ? (
                  <div style={{
                    marginTop: 12,
                    borderRadius: 10,
                    border: `1.5px solid ${C.border}`,
                    overflow: "hidden",
                    background: C.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <img
                      src={row.src}
                      alt={row.alt_text || ""}
                      style={{
                        width: row.src.startsWith("data:image/svg") ? "100%" : undefined,
                        maxWidth: "100%",
                        height: "auto",
                        display: "block",
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            style={{
              marginTop: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: `1.5px solid ${C.border}`,
              background: C.white,
              color: C.primary,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Plus size={15} />
            Add image
          </button>
        </div>
      </div>

      <AIExerciseGeneratorModal
        exerciseType="image_stacked"
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