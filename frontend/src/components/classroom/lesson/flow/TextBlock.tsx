/**
 * TextBlock.tsx
 *
 * Renders an AI-generated text block: grammar rules, vocabulary lists,
 * usage examples, or any educational explanation in Markdown format.
 *
 * Data shape (block.data):
 *   { content: string; format: "markdown" }
 *
 * Registered in exerciseRegistrations.ts as "text".
 * Read-only for both teacher and student — no interactive state needed.
 */

import React, { useMemo } from "react";
import type { ExerciseBlockProps } from "./exerciseBlock.types";
import { BookOpen } from "lucide-react";

// ── Design tokens (mirror the project palette) ─────────────────────────────────
const C = {
  primary:    "#6C6FEF",
  primaryDk:  "#4F52C2",
  tint:       "#EEF0FE",
  tintDeep:   "#DDE1FC",
  bg:         "#F7F7FA",
  white:      "#FFFFFF",
  border:     "#E8EAFD",
  text:       "#1C1F3A",
  sub:        "#6B6F8E",
  muted:      "#A8ABCA",
};

// ── Minimal Markdown → React nodes renderer ────────────────────────────────────

type InlineSegment =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "bold-italic"; value: string };

function parseInline(raw: string): InlineSegment[] {
  // Matches ***bold-italic***, **bold**, *italic*
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

// ── Main markdown → React block renderer ──────────────────────────────────────

function renderMarkdown(content: string): React.ReactNode[] {
  const lines   = content.split("\n");
  const output: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];
  let paraBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    output.push(
      <ul key={key++} style={{
        margin: "6px 0 10px", padding: "0 0 0 20px",
        listStyle: "none",
      }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            marginBottom: 5, fontSize: 14, color: C.text, lineHeight: 1.6,
          }}>
            <span style={{
              marginTop: 7, flexShrink: 0, width: 5, height: 5, borderRadius: "50%",
              background: C.primary, display: "inline-block",
            }} />
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
      <p key={key++} style={{
        margin: "0 0 8px", fontSize: 14, color: C.text,
        lineHeight: 1.7,
      }}>
        <InlineContent raw={text} />
      </p>,
    );
    paraBuffer = [];
  };

  for (const line of lines) {
    // H2
    if (line.startsWith("## ")) {
      flushList(); flushPara();
      output.push(
        <h2 key={key++} style={{
          margin: "14px 0 6px", fontSize: 15, fontWeight: 700,
          color: C.primaryDk, letterSpacing: "-0.01em",
          borderBottom: `1.5px solid ${C.tintDeep}`,
          paddingBottom: 4,
        }}>
          <InlineContent raw={line.slice(3)} />
        </h2>,
      );
      continue;
    }
    // H3
    if (line.startsWith("### ")) {
      flushList(); flushPara();
      output.push(
        <h3 key={key++} style={{
          margin: "12px 0 4px", fontSize: 13.5, fontWeight: 700,
          color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          <InlineContent raw={line.slice(4)} />
        </h3>,
      );
      continue;
    }
    // Horizontal rule
    if (/^[-*]{3,}$/.test(line.trim())) {
      flushList(); flushPara();
      output.push(
        <hr key={key++} style={{
          border: "none", borderTop: `1px solid ${C.border}`,
          margin: "12px 0",
        }} />,
      );
      continue;
    }
    // List item (- or *)
    if (/^[-*]\s/.test(line)) {
      flushPara();
      listBuffer.push(<InlineContent key={key++} raw={line.slice(2)} />);
      continue;
    }
    // Numbered list item
    if (/^\d+\.\s/.test(line)) {
      flushPara();
      listBuffer.push(<InlineContent key={key++} raw={line.replace(/^\d+\.\s/, "")} />);
      continue;
    }
    // Blank line → flush both buffers
    if (line.trim() === "") {
      flushList(); flushPara();
      continue;
    }
    // Regular text — flush any pending list then buffer for paragraph
    flushList();
    paraBuffer.push(line);
  }

  flushList();
  flushPara();

  return output;
}

// ── TextBlock component ────────────────────────────────────────────────────────

export default function TextBlock({ item }: ExerciseBlockProps) {
  const data    = (item as any).data as { content?: string; format?: string } | undefined;
  const title   = (item as any).label ?? (item as any).title ?? "";
  const content = data?.content ?? "";

  const nodes = useMemo(() => renderMarkdown(content), [content]);

  if (!content.trim()) return null;

  return (
    <div style={{
      borderRadius: 16,
      background: C.white,
      border: `1.5px solid ${C.border}`,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(108,111,239,0.07)",
    }}>
      {/* Header strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "12px 18px",
        background: C.tint,
        borderBottom: `1.5px solid ${C.border}`,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: C.primary,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <BookOpen size={14} color={C.white} strokeWidth={2} />
        </div>
        {title && (
          <span style={{
            fontSize: 13, fontWeight: 700, color: C.primaryDk,
            letterSpacing: "-0.01em",
          }}>
            {title}
          </span>
        )}
      </div>

      {/* Markdown body */}
      <div style={{
        padding: "16px 20px 12px",
        lineHeight: 1.65,
      }}>
        {nodes}
      </div>
    </div>
  );
}