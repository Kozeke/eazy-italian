/**
 * TextEditorPage.tsx
 *
 * Teacher-facing editor for "Text block" exercises.
 *
 * UX flow:
 *   1. Teacher enters an optional title in the header (editable center field).
 *   2. Teacher writes Markdown content in the large textarea.
 *   3. A live preview of the rendered TextBlock appears below the textarea.
 *   4. Clicking "Save" calls onSave({ type: "text", data: { content, format: "markdown" } }).
 *
 * Output shape (TextBlockData) is consumed by TextBlock.tsx in the lesson flow.
 * Registered in exerciseTemplateRegistry.tsx as customEditor: "text_block".
 */

import { useState, useCallback, useMemo } from "react";
import { BookOpen, Eye, EyeOff } from "lucide-react";
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from "../exercise/ExerciseHeader";

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
  success:   "#10B981",
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
  /** Called when the teacher clicks Save. */
  onSave: (data: TextBlockData) => void | Promise<void>;
  /** Called when the teacher clicks × or Cancel. */
  onCancel: () => void;
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
  onSave,
  onCancel,
}: Props) {
  /** Editable block title (shown in the BookOpen header strip of the rendered block). */
  const [title, setTitle] = useState(initialTitle || initialData?.title || "");

  /** Markdown content body typed by the teacher. */
  const [content, setContent] = useState(initialData?.content ?? "");

  /** Whether the live preview panel is visible. */
  const [showPreview, setShowPreview] = useState(true);

  /** True while the async save is in flight. */
  const [saving, setSaving] = useState(false);

  /** Whether the content has been modified since last save. */
  const isDirty = content.trim().length > 0;

  /** Rendered preview nodes, recalculated on every content change. */
  const previewNodes = useMemo(() => renderMarkdown(content), [content]);

  const handleSave = useCallback(async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ content, format: "markdown", title: title.trim() || undefined });
    } finally {
      setSaving(false);
    }
  }, [content, title, saving, onSave]);

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
        headerLabel={label ?? "Text block"}
        editableTitleInHeader
        isDirty={isDirty}
        onClose={onCancel}
        onTitleChange={setTitle}
      />

      {/* ── Editor body (below the fixed header) ─────────────────────────── */}
      <div style={{
        marginTop: EXERCISE_HEADER_HEIGHT_PX,
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
          marginBottom: 16,
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
            {showPreview ? <Eye size={14} strokeWidth={2} /> : <EyeOff size={14} strokeWidth={2} />}
            {showPreview ? "Hide preview" : "Show preview"}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!content.trim() || saving}
            style={{
              padding: "9px 24px",
              borderRadius: 9,
              border: "none",
              background: !content.trim() || saving ? C.muted : C.primary,
              color: C.white,
              fontSize: 13,
              fontWeight: 700,
              cursor: !content.trim() || saving ? "default" : "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {/* Markdown hint */}
        <p style={{ margin: "0 0 10px", fontSize: 12, color: C.muted }}>
          Supports Markdown: <code style={{ background: C.bg, borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>**bold**</code>{" "}
          <code style={{ background: C.bg, borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>*italic*</code>{" "}
          <code style={{ background: C.bg, borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>## Heading</code>{" "}
          <code style={{ background: C.bg, borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>- list item</code>
        </p>

        {/* Markdown textarea */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"Write your text in Markdown…\n\n## Grammar Rule\n**Rule:** Use *essere* for states of being.\n- io sono\n- tu sei\n- lui/lei è"}
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

        {/* Live preview panel */}
        {showPreview && content.trim() && (
          <div style={{ marginTop: 24 }}>
            <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Preview
            </p>

            {/* Renders exactly as TextBlock.tsx would in the lesson flow */}
            <div style={{
              borderRadius: 16,
              background: C.white,
              border: `1.5px solid ${C.border}`,
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(108,111,239,0.07)",
            }}>
              {/* BookOpen header strip */}
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

              {/* Rendered markdown body */}
              <div style={{ padding: "16px 20px 12px", lineHeight: 1.65 }}>
                {previewNodes}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
