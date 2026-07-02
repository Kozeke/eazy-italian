/**
 * VocabularyBlock.tsx
 *
 * Renders the unit's key-vocabulary glossary as a 3-column table:
 *   1. Word        — the term in the TARGET language being taught
 *   2. Translation — its meaning in the explanation (instruction) language
 *   3. Example     — one short example sentence in the target language
 *
 * Data shape (block.data):
 *   {
 *     target_language?: string;
 *     explanation_language?: string;
 *     entries: Array<{ word: string; translation: string; example: string }>;
 *   }
 *
 * Created by the unit generator (kind: "vocabulary") on the FIRST section only.
 * Registered in exerciseRegistrations.ts as "vocabulary".
 * Read-only for both teacher and student — no interactive state needed.
 */

import React, { useMemo } from "react";
import type { ExerciseBlockProps } from "./exerciseBlock.types";
import { BookMarked } from "lucide-react";

// ── Design tokens — mandated palette ────────────────────────────────────────
// Only the five system colors, plus ONE neutral for body text (the palette
// defines no text color). Secondary text is derived from it via rgba —
// no additional hex values are introduced.
const C = {
  primary:   "#6C6FEF",
  primaryDk: "#4F52C2",
  tint:      "#EEF0FE",
  bg:        "#F7F7FA",
  white:     "#FFFFFF",
  text:      "#1C1F3A",
  sub:       "rgba(28, 31, 58, 0.58)",
};

interface VocabEntry {
  word: string;
  translation: string;
  example: string;
}

interface VocabData {
  target_language?: string;
  explanation_language?: string;
  entries?: VocabEntry[];
}

// Title-case a language label like "italian" -> "Italian" for column headers.
function labelize(raw?: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function VocabularyBlock({ item }: ExerciseBlockProps) {
  const data  = (item as any).data as VocabData | undefined;
  const title = (item as any).label ?? (item as any).title ?? "Key Vocabulary";

  const entries = useMemo<VocabEntry[]>(() => {
    const raw = data?.entries;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (e) =>
          e &&
          typeof e.word === "string" &&
          typeof e.translation === "string" &&
          typeof e.example === "string" &&
          e.word.trim() !== "",
      )
      .map((e) => ({
        word: e.word.trim(),
        translation: e.translation.trim(),
        example: e.example.trim(),
      }));
  }, [data]);

  if (entries.length === 0) return null;

  const tgtLabel  = labelize(data?.target_language);
  const explLabel = labelize(data?.explanation_language);

  const wordHeader    = tgtLabel  ? `Word (${tgtLabel})`         : "Word";
  const transHeader   = explLabel ? `Translation (${explLabel})` : "Translation";
  const exampleHeader = "Example";

  return (
    <div
      style={{
        borderRadius: 16,
        background: C.white,
        border: `1px solid ${C.tint}`,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(108,111,239,0.07)",
      }}
    >
      {/* Header strip — extra right padding reserves space for ExerciseBlockMenu (⋯) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "12px 48px 12px 18px",
          background: C.tint,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: C.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <BookMarked size={14} color={C.white} strokeWidth={2} />
        </div>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontWeight: 700,
            color: C.primaryDk,
            letterSpacing: "-0.01em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 600,
            color: C.sub,
            background: C.white,
            borderRadius: 999,
            padding: "3px 10px",
          }}
        >
          {entries.length} {entries.length === 1 ? "word" : "words"}
        </span>
      </div>

      {/* Table body — horizontal scroll on very narrow viewports */}
      <div style={{ padding: "8px 14px 14px", overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 13.5,
            minWidth: 420,
          }}
        >
          <thead>
            <tr>
              {[wordHeader, transHeader, exampleHeader].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: C.sub,
                    borderBottom: `2px solid ${C.tint}`,
                    whiteSpace: "nowrap",
                    width: i === 2 ? "auto" : "26%",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const isLast = i === entries.length - 1;
              const rowBorder = isLast ? "none" : `1px solid ${C.tint}`;
              return (
                <tr
                  key={i}
                  style={{ background: i % 2 === 1 ? C.bg : C.white }}
                >
                  <td
                    style={{
                      padding: "10px 12px",
                      fontWeight: 700,
                      color: C.primaryDk,
                      verticalAlign: "top",
                      borderBottom: rowBorder,
                    }}
                  >
                    {e.word}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      color: C.text,
                      verticalAlign: "top",
                      borderBottom: rowBorder,
                    }}
                  >
                    {e.translation}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      color: C.sub,
                      fontStyle: "italic",
                      verticalAlign: "top",
                      lineHeight: 1.5,
                      borderBottom: rowBorder,
                    }}
                  >
                    {e.example}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}