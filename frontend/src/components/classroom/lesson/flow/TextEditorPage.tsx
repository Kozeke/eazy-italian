/**
 * TextEditorPage.tsx
 *
 * Teacher-facing editor for "Text block" exercises.
 *
 * UX flow:
 *   1. Teacher enters an optional title in the title row (same pattern as gap / match-pair editors).
 *   2. Teacher writes Markdown in the card textarea (or uses Generate with AI when a segment is open).
 *   3. A live preview of the rendered TextBlock appears below the card when enabled.
 *   4. Footer Cancel / Save matches other custom exercise editors.
 *
 * Output shape (TextBlockData) is consumed by TextBlock.tsx in the lesson flow.
 * Registered in exerciseTemplateRegistry.tsx as customEditor: "text_block".
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Eye, EyeOff } from "lucide-react";
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from "../exercise/ExerciseHeader";
import AIExerciseGenerateButton from "./AI_generation/AIExerciseGenerateButton";
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from "./AI_generation/AIExerciseGeneratorModal";
import "./DragToGap.css";

// ── Design tokens (mirrors project-wide palette) ───────────────────────────────
const C = {
  primary:   "#6C6FEF",
  primaryDk: "#4F52C2",
  tint:      "#EEF0FE",
  tintDeep:  "#DDE1FC",
  bg:        "#F7F7FA",
  white:     "#FFFFFF",
  border:    "#E8EAFD",
  text:      "#1C1F3A",
  sub:       "#6B6F8E",
  muted:     "#A8ABCA",
};

// ── Output data shape (matches TextBlock.tsx consumer) ────────────────────────

export interface TextBlockData {
  /** Markdown body rendered by TextBlock. */
  content: string;
  /** Always "markdown" — consumed by TextBlock to pick the renderer. */
  format: "markdown";
  /** Optional title shown in the BookOpen header strip of TextBlock. */
  title?: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Pre-populated title for re-editing an existing block. */
  initialTitle?: string;
  /** Pre-populated data for re-editing an existing block. */
  initialData?: TextBlockData;
  /** Gallery label forwarded from exerciseTemplateRegistry. */
  label?: string;
  /** Segment id for POST /segments/{id}/exercises/text (lesson context). */
  segmentId?: string | number | null;
  /** Called when the teacher clicks Save; optional block id from AI upsert. */
  onSave: (data: TextBlockData, blockId?: string) => void | Promise<void>;
  /** Called when the teacher clicks × or Cancel. */
  onCancel: () => void;
  /** Header cog: return to exercise template gallery (ExerciseDraftsPage). */
  onSettingsClick?: () => void;
}

// ── Minimal Markdown → React renderer (copied from TextBlock for live preview) ─

type InlineSegment =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "bold-italic"; value: string };

/** Parses ***bold-italic***, **bold**, *italic* inline tokens. */
function parseInline(raw: string): InlineSegment[] {
  const pattern = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const segments: InlineSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw)) !== null) {
    if (match.index > last) {
      segments.push({ kind: "text", value: raw.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith("***")) {
      segments.push({ kind: "bold-italic", value: token.slice(3, -3) });
    } else if (token.startsWith("**")) {
      segments.push({ kind: "bold", value: token.slice(2, -2) });
    } else {
      segments.push({ kind: "italic", value: token.slice(1, -1) });
    }
    last = match.index + token.length;
  }

  if (last < raw.length) {
    segments.push({ kind: "text", value: raw.slice(last) });
  }

  return segments;
}

function InlineContent({ raw }: { raw: string }) {
  const segments = useMemo(() => parseInline(raw), [raw]);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "bold-italic") return <strong key={i}><em>{seg.value}</em></strong>;
        if (seg.kind === "bold")        return <strong key={i}>{seg.value}</strong>;
        if (seg.kind === "italic")      return <em key={i}>{seg.value}</em>;
        return <span key={i}>{seg.value}</span>;
      })}
    </>
  );
}

/** Renders Markdown content into React nodes for the live preview. */
function renderMarkdown(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const output: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];
  let paraBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    output.push(
      <ul key={key++} style={{ margin: "6px 0 10px", padding: "0 0 0 20px", listStyle: "none" }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
            <span style={{ marginTop: 7, flexShrink: 0, width: 5, height: 5, borderRadius: "50%", background: C.primary, display: "inline-block" }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  const flushPara = () => {
    const text = paraBuffer.join(" ").trim();
    if (!text) { paraBuffer = []; return; }
    output.push(
      <p key={key++} style={{ margin: "0 0 8px", fontSize: 14, color: C.text, lineHeight: 1.7 }}>
        <InlineContent raw={text} />
      </p>,
    );
    paraBuffer = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flushList(); flushPara();
      output.push(<h2 key={key++} style={{ margin: "14px 0 6px", fontSize: 15, fontWeight: 700, color: C.primaryDk, letterSpacing: "-0.01em", borderBottom: `1.5px solid ${C.tintDeep}`, paddingBottom: 4 }}><InlineContent raw={line.slice(3)} /></h2>);
      continue;
    }
    if (line.startsWith("### ")) {
      flushList(); flushPara();
      output.push(<h3 key={key++} style={{ margin: "12px 0 4px", fontSize: 13.5, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em" }}><InlineContent raw={line.slice(4)} /></h3>);
      continue;
    }
    if (/^[-*]{3,}$/.test(line.trim())) {
      flushList(); flushPara();
      output.push(<hr key={key++} style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "12px 0" }} />);
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      flushPara();
      listBuffer.push(<InlineContent key={key++} raw={line.slice(2)} />);
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      flushPara();
      listBuffer.push(<InlineContent key={key++} raw={line.replace(/^\d+\.\s/, "")} />);
      continue;
    }
    if (line.trim() === "") {
      flushList(); flushPara();
      continue;
    }
    flushList();
    paraBuffer.push(line);
  }

  flushList();
  flushPara();
  return output;
}

// ── TextEditorPage component ───────────────────────────────────────────────────

export default function TextEditorPage({
  initialTitle = "",
  initialData,
  label,
  segmentId,
  onSave,
  onCancel,
  onSettingsClick,
}: Props) {
  const { t, i18n } = useTranslation();
  /** Visible block title synced with TextBlock header strip and save payload. */
  const [title, setTitle] = useState(initialTitle || initialData?.title || "");

  /** Markdown body edited by the teacher. */
  const [content, setContent] = useState(initialData?.content ?? "");

  /** Toggles the live Markdown preview below the editor card. */
  const [showPreview, setShowPreview] = useState(true);

  /** AI generator modal visibility. */
  const [showAIModal, setShowAIModal] = useState(false);

  /** True while Save is awaiting onSave. */
  const [saving, setSaving] = useState(false);

  /** Server block id after AI generation — forwarded on Save to avoid duplicate blocks. */
  const generatedBlockIdRef = useRef<string | null>(null);

  /** True when the textarea has non-whitespace content (enables Save). */
  const canSave = content.trim().length > 0;

  /** Memoized preview nodes derived from Markdown content. */
  const previewNodes = useMemo(() => renderMarkdown(content), [content]);

  /** Applies a persisted AI block into local editor state. */
  const applyGeneratedBlock = useCallback((block: GeneratedBlock) => {
    if (block.kind !== "text" || !block.data || typeof block.data !== "object") return;
    generatedBlockIdRef.current = block.id;
    const d = block.data as Record<string, unknown>;
    const nextTitle = String(d.title ?? block.title ?? "").trim();
    const nextContent = String(d.content ?? "");
    setTitle(nextTitle);
    setContent(nextContent);
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave(
        { content, format: "markdown", title: title.trim() || undefined },
        generatedBlockIdRef.current ?? undefined,
      );
    } finally {
      setSaving(false);
    }
  }, [content, title, canSave, saving, onSave]);

  /** Header «?» copy: text blocks hold Markdown only; media lives in other block types. */
  const textBlockHelpTooltip = useMemo(() => {
    const typeLabel =
      (label?.trim() || title.trim() || t("exerciseHeader.untitledExercise"));
    return [
      t("exerciseHeader.helpLine1", { label: typeLabel }),
      t("exerciseHeader.textBlockHelpLine2"),
      t("exerciseHeader.helpLine3"),
      t("exerciseHeader.helpLine4"),
    ].join("\n");
  }, [label, title, t, i18n.language]);

  /** Shown in the fixed header when the gallery label is absent. */
  const resolvedGalleryLabel = label ?? t("aiExerciseGenerator.types.text.label");

  return (
    <div className="dtg-editor-root">
      <ExerciseHeader
        title={title}
        headerLabel={resolvedGalleryLabel}
        editableTitleInHeader={false}
        helpTooltip={textBlockHelpTooltip}
        onSettingsClick={onSettingsClick}
        onClose={onCancel}
      />

      <div
        className="dtg-editor-content"
        style={{ paddingTop: EXERCISE_HEADER_HEIGHT_PX + 14 }}
        aria-label={`${resolvedGalleryLabel} editor`}
      >
        <div className="dtg-title-row">
          <input
            className="dtg-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название упражнения"
            aria-label="Exercise title"
          />
        </div>

        <div className="mp-editor-card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
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
              {showPreview ? "Скрыть предпросмотр" : "Показать предпросмотр"}
            </button>

            <AIExerciseGenerateButton
              onClick={() => setShowAIModal(true)}
              style={{ margin: 0 }}
            />
          </div>

          <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Markdown: <code style={{ background: C.bg, borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>**жирный**</code>
            {" "}
            <code style={{ background: C.bg, borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>*курсив*</code>
            {" "}
            <code style={{ background: C.bg, borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>## Заголовок</code>
            {" "}
            <code style={{ background: C.bg, borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>- список</code>
          </p>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={"Текст в Markdown…\n\n## Правило\n**Пример:** *essere* для состояний.\n- io sono\n- tu sei"}
            rows={14}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 16px",
              borderRadius: 12,
              border: `1.5px solid ${C.border}`,
              background: C.white,
              fontSize: 14,
              color: C.text,
              lineHeight: 1.7,
              fontFamily: "'JetBrains Mono','Fira Mono','Courier New',monospace",
              resize: "vertical",
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
          />
        </div>

        {showPreview && content.trim() && (
          <div style={{ marginTop: 18 }}>
            <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Предпросмотр
            </p>

            <div style={{
              borderRadius: 16,
              background: C.white,
              border: `1.5px solid ${C.border}`,
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(108,111,239,0.07)",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "12px 18px",
                background: C.tint,
                borderBottom: `1.5px solid ${C.border}`,
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: C.primary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <BookOpen size={14} color={C.white} strokeWidth={2} />
                </div>
                {title.trim() && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.primaryDk, letterSpacing: "-0.01em" }}>
                    {title.trim()}
                  </span>
                )}
              </div>

              <div style={{ padding: "16px 20px 12px", lineHeight: 1.65 }}>
                {previewNodes}
              </div>
            </div>
          </div>
        )}

        <div className="dtg-footer">
          {/*
          <label className="dtg-pro-toggle">
            Pro
            <input type="checkbox" style={{ marginLeft: 6 }} />
          </label>
          */}

          <div className="dtg-footer-btns">
            <button type="button" className="dtg-btn-cancel" onClick={onCancel}>
              Отмена
            </button>
            <button
              type="button"
              className={[
                "dtg-btn-save",
                !canSave || saving ? "dtg-btn-save--disabled" : "",
              ].filter(Boolean).join(" ")}
              onClick={handleSave}
              disabled={!canSave || saving}
              title={!canSave ? "Введите текст перед сохранением" : "Сохранить блок"}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>

      <AIExerciseGeneratorModal
        exerciseType="text"
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
