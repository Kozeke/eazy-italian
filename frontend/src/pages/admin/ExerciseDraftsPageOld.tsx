/**
 * ExerciseDraftsPage.tsx — LinguAI v2 (refactored)
 *
 * Two-state page:
 *   State 1 — Template gallery  (pageMode === "gallery")
 *   State 2 — Inline editor     (pageMode === "editor")
 *
 * Gallery UI matches ChooseTemplateModal layout exactly:
 *   - 3-column responsive grid
 *   - Section-based grouping: Images, Audio & Video, Words & Gaps, Tests, Put in Order
 *   - Template IDs, labels, sections and preview components from ChooseTemplateModal
 *   - Search bar + grid/list toggle
 *   - AI generation banner
 *
 * On template card click:
 *   • DO NOT navigate to ExerciseEditorPage
 *   • Switch pageMode to "editor"
 *   • Render <ExerciseEditorWorkspace mode="embedded" />
 *
 * On Cancel inside the workspace:
 *   • Return to gallery (pageMode → "gallery")
 *   • No router navigation
 */

import React, { useState, useMemo, useCallback, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  X,
  Search,
  LayoutGrid,
  List,
  Sparkles,
  Wand2,
  Heart,
  Music,
  ChevronRight,
} from "lucide-react";
import ExerciseEditorWorkspace from "../../components/classroom/lesson/exercise/ExerciseEditorWorkspace";
import type { MediaBlock, MediaBlockType } from "../../components/classroom/lesson/exercise/ExerciseEditorWorkspace";
import {
  emptyDraftFor,
  QuestionDraft,
} from "../../components/classroom/lesson/editors/QuestionEditorRenderer";

// ─── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  primary: "#6C6FEF",
  primaryDk: "#4F52C2",
  tint: "#EEF0FE",
  tintDeep: "#DDE1FC",
  bg: "#F7F7FA",
  white: "#FFFFFF",
  border: "#E8EAFD",
  borderSoft: "#F1F2FA",
  text: "#1C1F3A",
  sub: "#6B6F8E",
  muted: "#A8ABCA",
  cardBorder: "#ECEEF8",
  cardShadow:
    "0 1px 3px rgba(60,64,120,0.07), 0 4px 18px rgba(60,64,120,0.05)",
  hoverShadow:
    "0 8px 24px rgba(108,111,239,0.14), 0 2px 8px rgba(108,111,239,0.06)",
};

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TemplateConfig {
  id: string;
  section: string;
  label: string;
  preview: ReactNode;
}

export interface ExerciseDraftsPageProps {
  onClose?: () => void;
  onGenerateAI?: () => void;
  onSave?: (
    title: string,
    payloads: Record<string, unknown>[],
    drafts: QuestionDraft[]
  ) => Promise<void> | void;
  /**
   * Called when the user picks a pure media template (image / video / audio).
   * The parent should navigate back to the lesson immediately — no exercise editor shown.
   */
  onSelectMediaDirect?: (kind: "image" | "video" | "audio", templateId?: string) => void;
  /**
   * @deprecated Pass onSave instead.
   */
  onCreateAndOpen?: (type: string) => void | Promise<void>;
}

// ─── Template → media block mapping (these open with a media block, no MCQ) ───

const TEMPLATE_TO_MEDIA_TYPE: Record<string, MediaBlockType> = {
  "img-stack":    "image",
  "img-carousel": "image",
  "img-gif":      "image",
  "video-embed":  "video",
  "audio-clip":   "audio",
};

// "Listen & repeat" gets both an audio block AND an open_answer question
const AUDIO_REPEAT_TEMPLATE = "audio-repeat";

// ─── Template → QuestionDraft type mapping (question-only templates) ──────────

const TEMPLATE_TO_DRAFT_TYPE: Record<string, QuestionDraft["type"]> = {
  // Words & Gaps
  "cloze-drag":   "cloze_drag",
  "cloze-input":  "cloze_input",
  "cloze-select": "cloze_input",
  "visual-drag":  "cloze_drag",
  "visual-input": "cloze_input",
  "visual-select":"cloze_input",
  // Tests
  "mc-no-timer":  "multiple_choice",
  "mc-timer":     "multiple_choice",
  "true-false":   "true_false",
  // Put in Order
  "order-sentence": "ordering_words",
  "sort-columns":   "matching_pairs",
  "order-text":     "ordering_sentences",
  anagram:          "ordering_words",
  matching:         "matching_pairs",
};

function makeMediaBlock(type: MediaBlockType): MediaBlock {
  return { id: Math.random().toString(36).slice(2, 10), kind: "media", mediaType: type, url: "", caption: "" };
}

// ═══════════════════════════════════════════════════════════════
// PREVIEW COMPONENTS — from ChooseTemplateModal
// ═══════════════════════════════════════════════════════════════

const P = {
  card: {
    background: "#fff",
    borderRadius: 10,
    border: "1px solid #E8EAFD",
    padding: "10px 12px",
    minWidth: 180,
    boxShadow: "0 2px 8px rgba(26,29,58,0.06)",
  } as React.CSSProperties,
  chip: {
    display: "inline-block",
    background: "#EEF0FE",
    color: "#4F52C2",
    borderRadius: 6,
    padding: "2px 7px",
    fontSize: 11,
    fontWeight: 600,
    margin: "2px 2px",
  } as React.CSSProperties,
  gap: {
    display: "inline-block",
    width: 40,
    height: 14,
    background: "#F1F2FA",
    borderRadius: 4,
    border: "1.5px solid #E8EAFD",
    verticalAlign: "middle",
    margin: "0 2px",
  } as React.CSSProperties,
  img: (bg = "#b8e4f9"): React.CSSProperties => ({
    width: 80,
    height: 56,
    borderRadius: 8,
    background: bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  }),
  tag: (c = "#6C6FEF"): React.CSSProperties => ({
    display: "inline-block",
    background: `${c}18`,
    color: c,
    borderRadius: 5,
    padding: "1.5px 6px",
    fontSize: 10,
    fontWeight: 600,
  }),
};

function FigureBlob({ color = "#b8e4f9", size = 48 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <ellipse cx="24" cy="28" rx="16" ry="10" fill={color} opacity=".6" />
      <circle cx="24" cy="20" r="10" fill={color} />
      <rect x="14" y="28" width="20" height="12" rx="4" fill={color} opacity=".7" />
    </svg>
  );
}

function ImgStackPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <div style={{ ...P.img(), justifyContent: "center" }}>
          <FigureBlob color="#a8d8f0" />
        </div>
        <div style={{ ...P.img("#f9c8d4"), justifyContent: "center" }}>
          <FigureBlob color="#f0a0b8" />
        </div>
      </div>
    </div>
  );
}

function ImgCarouselPreview() {
  return (
    <div style={{ ...P.card, width: 190, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
        <button style={{ background: C.border, border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.sub }}>‹</button>
        <div style={{ ...P.img("#c8e6f9"), justifyContent: "center" }}><FigureBlob /></div>
        <div style={{ ...P.img("#f5c8e8"), justifyContent: "center" }}><FigureBlob color="#e89bc8" /></div>
        <div style={{ ...P.img("#c8f0e8"), justifyContent: "center" }}><FigureBlob color="#7acfb4" /></div>
        <button style={{ background: C.border, border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.sub }}>›</button>
      </div>
    </div>
  );
}

function GifPreview() {
  return (
    <div style={{ ...P.card, width: 190, textAlign: "center" }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <div style={{ ...P.img("#fde8d8"), width: 100, justifyContent: "center", margin: "0 auto" }}>
          <FigureBlob color="#f4b896" />
        </div>
        <span style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 5, padding: "2px 6px" }}>GIF</span>
      </div>
    </div>
  );
}

function VideoPreview() {
  return (
    <div style={{ ...P.card, width: 190, textAlign: "center" }}>
      <div style={{ width: 120, height: 68, borderRadius: 8, background: "#1a1d3a", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 0, height: 0, borderLeft: "18px solid #fff", borderTop: "11px solid transparent", borderBottom: "11px solid transparent", marginLeft: 4 }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: C.sub }}>YouTube / Vimeo</div>
    </div>
  );
}

function AudioPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F0FDFA", borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#0d9488", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Music size={12} color="#fff" strokeWidth={2} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 3, background: "#E8EAFD", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: "45%", height: "100%", background: "#0d9488", borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 9, color: "#0d9488", marginTop: 4, fontWeight: 600 }}>0:12 / 0:28</div>
        </div>
      </div>
    </div>
  );
}

function AudioRepeatPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F0FDFA", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#0d9488", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Music size={10} color="#fff" />
          </div>
          <div style={{ height: 2, flex: 1, background: "#E8EAFD", borderRadius: 99 }}>
            <div style={{ width: "60%", height: "100%", background: "#0d9488", borderRadius: 99 }} />
          </div>
        </div>
        <input readOnly placeholder="Type what you hear…" style={{ fontSize: 11, padding: "6px 9px", borderRadius: 7, border: "1.5px solid #E8EAFD", outline: "none", color: C.sub, background: C.bg, fontFamily: "inherit" }} />
      </div>
    </div>
  );
}

function ClozeDragPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {["read", "school", "computer", "time"].map((w) => (<span key={w} style={P.chip}>{w}</span>))}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: C.text, lineHeight: 1.7 }}>
        Hello! I am a{" "}<span style={{ ...P.gap, borderColor: "#6C6FEF", background: "#EEF0FE" }} />{" "}at a modern <span style={P.gap} />. I <span style={P.gap} /> every day.
      </p>
    </div>
  );
}

function ClozeInputPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: C.text, lineHeight: 1.7 }}>
        Hello! I am a{" "}
        <span style={{ display: "inline-block", borderBottom: "2px solid #6C6FEF", color: "#6C6FEF", fontSize: 11, fontWeight: 600, minWidth: 50, padding: "0 2px" }}>student</span>{" "}
        at a modern <span style={P.gap} />.
      </p>
      <p style={{ margin: 0, fontSize: 11, color: C.text, lineHeight: 1.7 }}>
        I open my <span style={P.gap} /> and check the <span style={P.gap} />.
      </p>
    </div>
  );
}

function ClozeSelectPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, color: C.text, lineHeight: 1.7 }}>
        Hello! I am a{" "}
        <select style={{ fontSize: 10, borderRadius: 5, border: "1.5px solid #6C6FEF", background: "#EEF0FE", color: "#4F52C2", padding: "1px 3px", fontFamily: "inherit" }}>
          <option>student</option><option>teacher</option>
        </select>{" "}
        at a{" "}
        <select style={{ fontSize: 10, borderRadius: 5, border: "1.5px solid #E8EAFD", padding: "1px 3px", fontFamily: "inherit" }}>
          <option>modern</option>
        </select>.
      </p>
    </div>
  );
}

function VisualDragPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {["Man", "Cat", "Dog"].map((w) => (<span key={w} style={P.chip}>{w}</span>))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {([["#c8e6f9", "#a8d8f0"], ["#fde8d8", "#f4b896"], ["#d8f0e8", "#9fd8be"], ["#f5d8f8", "#e4a0f0"]] as [string, string][]).map(([bg, fig], i) => (
          <div key={i} style={{ background: bg, borderRadius: 8, padding: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <FigureBlob color={fig} size={36} />
            <div style={{ height: 12, width: 36, background: i === 0 ? "#EEF0FE" : "#F1F2FA", borderRadius: 4, border: "1px solid #E8EAFD" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function VisualInputPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {([["#c8e6f9", "#a8d8f0", "Man"], ["#fde8d8", "#f4b896", ""], ["#d8f0e8", "#9fd8be", ""], ["#f5d8f8", "#e4a0f0", ""]] as [string, string, string][]).map(([bg, fig, val], i) => (
          <div key={i} style={{ background: bg, borderRadius: 8, padding: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <FigureBlob color={fig} size={32} />
            <input readOnly value={val} placeholder="…" style={{ width: "100%", fontSize: 10, padding: "2px 5px", borderRadius: 5, border: `1.5px solid ${i === 0 ? "#6C6FEF" : "#E8EAFD"}`, background: i === 0 ? "#EEF0FE" : "#fff", textAlign: "center", fontFamily: "inherit", color: "#4F52C2" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function VisualSelectPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {([["#c8e6f9", "#a8d8f0"], ["#fde8d8", "#f4b896"], ["#d8f0e8", "#9fd8be"], ["#f5d8f8", "#e4a0f0"]] as [string, string][]).map(([bg, fig], i) => (
          <div key={i} style={{ background: bg, borderRadius: 8, padding: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <FigureBlob color={fig} size={32} />
            <select style={{ fontSize: 9, borderRadius: 5, border: `1.5px solid ${i === 0 ? "#6C6FEF" : "#E8EAFD"}`, background: i === 0 ? "#EEF0FE" : "#fff", padding: "1px 3px", fontFamily: "inherit", color: "#4F52C2" }}>
              <option>Man</option><option>Cat</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function MCPreview({ hasTimer }: { hasTimer?: boolean }) {
  return (
    <div style={{ ...P.card, width: 190 }}>
      {hasTimer && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#EEF0FE", borderRadius: 8, padding: "5px 8px", marginBottom: 8 }}>
          <span style={{ ...P.tag(), fontSize: 9 }}>Test started</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, marginLeft: "auto" }}>00:30</span>
          <span style={{ fontSize: 9, background: C.primary, color: "#fff", borderRadius: 5, padding: "2px 6px", fontWeight: 600 }}>Complete</span>
        </div>
      )}
      <p style={{ margin: "0 0 8px", fontSize: 11, color: C.text, fontWeight: 500 }}>They are going to the cinema at the moment</p>
      {["are going", "going", "go"].map((o, i) => (
        <div key={o} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${i === 0 ? "#6C6FEF" : "#D4D6EA"}`, background: i === 0 ? "#EEF0FE" : "#fff", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: C.text }}>{o}</span>
        </div>
      ))}
    </div>
  );
}

function TrueFalsePreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      {[["The Earth is a planet in space.", true], ["Water turns to ice at 0 degrees", false]].map(([q, _sel], i) => (
        <div key={i} style={{ marginBottom: i === 0 ? 10 : 0 }}>
          <p style={{ margin: "0 0 5px", fontSize: 10, color: C.text }}>{q as string}</p>
          <div style={{ display: "flex", gap: 5 }}>
            {["True", "False"].map((opt, j) => (
              <button key={opt} style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", background: (j === 0 && i === 0) || (j === 1 && i === 1) ? "#22c55e22" : "#F1F2FA", color: (j === 0 && i === 0) || (j === 1 && i === 1) ? "#15803d" : C.sub, border: (j === 0 && i === 0) || (j === 1 && i === 1) ? "1.5px solid #86efac" : "1.5px solid transparent" }}>{opt}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderSentencePreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {["California", "I", "to", "moved", "summer", "last"].map((w) => (
          <span key={w} style={{ ...P.chip, background: "#F1F2FA", color: C.sub }}>{w}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <span style={{ ...P.chip, background: "#EEF0FE", color: C.primary, border: "1.5px solid #C5C8F8" }}>I</span>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} style={{ display: "inline-block", width: 34, height: 20, background: "#F7F7FA", borderRadius: 6, border: "1.5px dashed #E8EAFD" }} />
        ))}
      </div>
      <button style={{ marginTop: 8, padding: "4px 12px", borderRadius: 7, background: C.primary, color: "#fff", border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Check</button>
    </div>
  );
}

function SortColumnsPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {["Cat", "Banana", "Dog"].map((w) => (
          <span key={w} style={{ ...P.chip, background: "#F1F2FA", color: C.sub }}>{w}</span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[["Animals", ["🐱"]], ["Fruits", ["🍌"]]].map(([col, items]) => (
          <div key={col as string} style={{ background: C.bg, borderRadius: 8, padding: 6 }}>
            <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.05em" }}>{col as string}</p>
            {(items as string[]).map((it) => (
              <div key={it} style={{ background: C.white, borderRadius: 6, border: "1.5px solid #6C6FEF", padding: "3px 7px", fontSize: 11, marginBottom: 3 }}>{it}</div>
            ))}
            <div style={{ height: 20, background: "#F1F2FA", borderRadius: 6, border: "1.5px dashed #E8EAFD" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderTextPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      {[{ text: "Then she reads an English book.", active: true }, { text: "It she makes a cup of tea.", active: false }, { text: "After that she listens to music", active: false }].map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "5px 8px", borderRadius: 7, border: `1.5px solid ${item.active ? "#6C6FEF" : "#E8EAFD"}`, background: item.active ? "#EEF0FE" : "#fff" }}>
          <span style={{ fontSize: 9, color: C.muted, fontWeight: 700 }}>{i + 1}</span>
          <span style={{ fontSize: 10, color: C.text }}>{item.text}</span>
        </div>
      ))}
      <button style={{ padding: "3px 10px", borderRadius: 6, background: C.primary, color: "#fff", border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Check</button>
    </div>
  );
}

function AnagramPreview() {
  return (
    <div style={{ ...P.card, width: 190, textAlign: "center" }}>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: C.sub, fontWeight: 500 }}>Warm Season</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 8 }}>
        {["S", "_", "_", "_", "_", "r"].map((c, i) => (
          <div key={i} style={{ width: 20, height: 22, borderRadius: 5, border: "1.5px solid #E8EAFD", background: c !== "_" ? "#EEF0FE" : "#F7F7FA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.primary }}>
            {c === "S" || c === "r" ? c : ""}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
        {["u", "m", "e", "m", "r"].map((c, i) => (
          <div key={i} style={{ width: 18, height: 18, borderRadius: 4, background: "#F1F2FA", border: "1.5px solid #E8EAFD", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.sub }}>{c}</div>
        ))}
      </div>
      <button style={{ padding: "3px 10px", borderRadius: 6, background: C.primary, color: "#fff", border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Check</button>
    </div>
  );
}

function MatchingPreview() {
  const pairs: [string, string][] = [["English", "Hello"], ["Italian", "Salut"], ["French", "Ciao"], ["Spanish", "Hola"]];
  return (
    <div style={{ ...P.card, width: 190 }}>
      {pairs.map(([l, r], i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5, alignItems: "center" }}>
          <div style={{ flex: 1, padding: "3px 7px", borderRadius: 6, fontSize: 10, textAlign: "center", border: `1.5px solid ${i % 2 === 0 ? "#6C6FEF" : "#E8EAFD"}`, background: i % 2 === 0 ? "#EEF0FE" : "#F7F7FA", color: i % 2 === 0 ? C.primary : C.sub, fontWeight: 600 }}>{l}</div>
          <div style={{ width: 12, height: 1.5, background: "#E8EAFD" }} />
          <div style={{ flex: 1, padding: "3px 7px", borderRadius: 6, fontSize: 10, textAlign: "center", border: `1.5px solid ${i % 2 === 0 ? "#6C6FEF" : "#E8EAFD"}`, background: i % 2 === 0 ? "#EEF0FE" : "#F7F7FA", color: i % 2 === 0 ? C.primary : C.sub, fontWeight: 600 }}>{r}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Template data (from ChooseTemplateModal) ─────────────────────────────────

const SECTIONS = ["Images", "Audio & Video", "Words & Gaps", "Tests", "Put in Order"] as const;

const TEMPLATES: TemplateConfig[] = [
  // ── Images ──────────────────────────────────────────────────────────────
  { id: "img-stack", section: "Images", label: "Images stacked", preview: <ImgStackPreview /> },
  { id: "img-carousel", section: "Images", label: "Image carousel", preview: <ImgCarouselPreview /> },
  { id: "img-gif", section: "Images", label: "GIF animation", preview: <GifPreview /> },

  // ── Audio & Video ────────────────────────────────────────────────────────
  { id: "video-embed", section: "Audio & Video", label: "Embed video", preview: <VideoPreview /> },
  { id: "audio-clip", section: "Audio & Video", label: "Audio clip", preview: <AudioPreview /> },
  { id: "audio-repeat", section: "Audio & Video", label: "Listen & repeat", preview: <AudioRepeatPreview /> },

  // ── Words & Gaps ─────────────────────────────────────────────────────────
  { id: "cloze-drag", section: "Words & Gaps", label: "Drag word to gap", preview: <ClozeDragPreview /> },
  { id: "cloze-input", section: "Words & Gaps", label: "Type word in gap", preview: <ClozeInputPreview /> },
  { id: "cloze-select", section: "Words & Gaps", label: "Select word form", preview: <ClozeSelectPreview /> },
  { id: "visual-drag", section: "Words & Gaps", label: "Drag word to image", preview: <VisualDragPreview /> },
  { id: "visual-input", section: "Words & Gaps", label: "Type word to image", preview: <VisualInputPreview /> },
  { id: "visual-select", section: "Words & Gaps", label: "Select form to image", preview: <VisualSelectPreview /> },

  // ── Tests ────────────────────────────────────────────────────────────────
  { id: "mc-no-timer", section: "Tests", label: "Test without timer", preview: <MCPreview hasTimer={false} /> },
  { id: "mc-timer", section: "Tests", label: "Test with timer", preview: <MCPreview hasTimer /> },
  { id: "true-false", section: "Tests", label: "True / False", preview: <TrueFalsePreview /> },

  // ── Put in Order ─────────────────────────────────────────────────────────
  { id: "order-sentence", section: "Put in Order", label: "Build a sentence", preview: <OrderSentencePreview /> },
  { id: "sort-columns", section: "Put in Order", label: "Sort into columns", preview: <SortColumnsPreview /> },
  { id: "order-text", section: "Put in Order", label: "Order paragraphs", preview: <OrderTextPreview /> },
  { id: "anagram", section: "Put in Order", label: "Make a word", preview: <AnagramPreview /> },
  { id: "matching", section: "Put in Order", label: "Match pairs", preview: <MatchingPreview /> },
];

// ─── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  creating,
  onClick,
}: {
  template: TemplateConfig;
  creating: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [liked, setLiked] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        background: C.white,
        border: `1.5px solid ${hovered ? C.primary : C.cardBorder}`,
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered ? C.hoverShadow : C.cardShadow,
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
        position: "relative",
        userSelect: "none",
      }}
    >
      {/* Loading overlay */}
      {creating && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.78)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              border: `2.5px solid ${C.tint}`,
              borderTopColor: C.primary,
              borderRadius: "50%",
              animation: "pm-spin 0.7s linear infinite",
            }}
          />
        </div>
      )}

      {/* Heart button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setLiked((l) => !l);
        }}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 2,
          width: 28,
          height: 28,
          borderRadius: 8,
          background: C.white,
          border: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: liked ? "#EF4444" : C.muted,
          transition: "color 120ms, border-color 120ms, opacity 120ms",
          opacity: hovered || liked ? 1 : 0,
        }}
      >
        <Heart size={13} strokeWidth={2} fill={liked ? "#EF4444" : "none"} />
      </button>

      {/* Preview area */}
      <div
        style={{
          height: 130,
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          padding: 8,
          borderBottom: `1px solid ${C.borderSoft}`,
        }}
      >
        <div
          style={{
            transform: "scale(0.72)",
            transformOrigin: "center",
            pointerEvents: "none",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          {template.preview}
        </div>
      </div>

      {/* Label */}
      <div style={{ padding: "10px 12px 12px", textAlign: "center" }}>
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            fontWeight: 600,
            color: C.text,
            letterSpacing: "-0.01em",
            lineHeight: 1.3,
          }}
        >
          {template.label}
        </p>
      </div>
    </div>
  );
}

// ─── ListRow ──────────────────────────────────────────────────────────────────

function ListRow({
  template,
  creating,
  onClick,
}: {
  template: TemplateConfig;
  creating: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: C.white,
        borderRadius: 12,
        border: `1.5px solid ${hovered ? C.primary : C.cardBorder}`,
        padding: "12px 16px",
        cursor: "pointer",
        boxShadow: hovered ? C.hoverShadow : C.cardShadow,
        transform: hovered ? "translateY(-1px)" : "none",
        transition: "all 0.15s",
        position: "relative",
        userSelect: "none",
      }}
    >
      {creating && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.7)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              border: `2.5px solid ${C.tint}`,
              borderTopColor: C.primary,
              borderRadius: "50%",
              animation: "pm-spin 0.7s linear infinite",
            }}
          />
        </div>
      )}

      {/* Mini preview thumbnail */}
      <div
        style={{
          flexShrink: 0,
          width: 52,
          height: 36,
          borderRadius: 8,
          overflow: "hidden",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            transform: "scale(0.28)",
            transformOrigin: "center",
            pointerEvents: "none",
          }}
        >
          {template.preview}
        </div>
      </div>

      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>
        {template.label}
      </span>

      <ChevronRight size={14} color={C.muted} strokeWidth={2} />
    </div>
  );
}

// ─── SectionBlock ─────────────────────────────────────────────────────────────

function SectionBlock({
  sectionName,
  templates,
  view,
  creating,
  onSelect,
}: {
  sectionName: string;
  templates: TemplateConfig[];
  view: "grid" | "list";
  creating: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: 28 }}>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: C.muted,
        }}
      >
        {sectionName}
      </p>

      {view === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              creating={creating === t.id}
              onClick={() => onSelect(t.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((t) => (
            <ListRow
              key={t.id}
              template={t}
              creating={creating === t.id}
              onClick={() => onSelect(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AIBanner ─────────────────────────────────────────────────────────────────

function AIBanner({ onGenerateAI }: { onGenerateAI?: () => void }) {
  const [hBtn, setHBtn] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "linear-gradient(135deg, #F5F0FF 0%, #EEF0FE 100%)",
        border: `1px solid ${C.tintDeep}`,
        borderRadius: 12,
        padding: "12px 16px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: C.white,
            border: `1.5px solid ${C.tintDeep}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Wand2 size={16} color={C.primary} strokeWidth={2} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>
            Create a full lesson in minutes
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: C.sub }}>
            Use AI generation to auto-build exercises and slides
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onGenerateAI}
        onMouseEnter={() => setHBtn(true)}
        onMouseLeave={() => setHBtn(false)}
        style={{
          padding: "8px 16px",
          borderRadius: 10,
          border: "none",
          background: hBtn ? C.primaryDk : C.primary,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          boxShadow: "0 4px 14px rgba(108,111,239,0.35)",
          transition: "background 120ms, transform 120ms",
          transform: hBtn ? "translateY(-1px)" : "none",
        }}
      >
        <Sparkles size={13} strokeWidth={2} />
        Generate lesson
      </button>
    </div>
  );
}

// ─── Gallery ──────────────────────────────────────────────────────────────────

function Gallery({
  onClose,
  onGenerateAI,
  onSelect,
}: {
  onClose?: () => void;
  onGenerateAI?: () => void;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [creating, setCreating] = useState<string | null>(null);

  const q = search.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      q
        ? TEMPLATES.filter(
            (t) =>
              t.label.toLowerCase().includes(q) ||
              t.section.toLowerCase().includes(q)
          )
        : TEMPLATES,
    [q]
  );

  const bySection = useMemo(() => {
    const acc: Record<string, TemplateConfig[]> = {};
    for (const sec of SECTIONS) {
      const items = filtered.filter((t) => t.section === sec);
      if (items.length) acc[sec] = items;
    }
    return acc;
  }, [filtered]);

  const handleSelect = useCallback(
    (id: string) => {
      setCreating(id);
      onSelect(id);
    },
    [onSelect]
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 0 80px" }}>
      <style>{`
        @keyframes pm-spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #DDE1FC; border-radius: 99px; }
      `}</style>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "36px 0 0" }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 22,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: C.tint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={15} color={C.primary} strokeWidth={2} />
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: C.text,
                letterSpacing: "-0.02em",
              }}
            >
              Choose exercise template
            </h1>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.muted,
                transition: "background 120ms",
                flexShrink: 0,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = C.bg)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
              title="Close"
            >
              <X size={16} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* ── AI Banner ───────────────────────────────────────────────────── */}
        <AIBanner onGenerateAI={onGenerateAI} />

        {/* ── Search + view toggle ─────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 10,
            paddingBottom: 8,
            marginBottom: 4,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: C.white,
              border: `1.5px solid ${C.cardBorder}`,
              borderRadius: 10,
              padding: "9px 14px",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onFocusCapture={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.borderColor = C.primary;
              el.style.boxShadow = `0 0 0 3px ${C.tint}`;
            }}
            onBlurCapture={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.borderColor = C.cardBorder;
              el.style.boxShadow = "none";
            }}
          >
            <Search size={14} color={C.muted} strokeWidth={2} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: 13,
                color: C.text,
                flex: 1,
                fontFamily: "inherit",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: C.muted,
                  padding: 0,
                  display: "flex",
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div
            style={{
              display: "flex",
              background: C.white,
              border: `1.5px solid ${C.cardBorder}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {(["grid", "list"] as const).map((mode) => {
              const Icon = mode === "grid" ? LayoutGrid : List;
              const active = view === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  title={mode === "grid" ? "Grid view" : "List view"}
                  style={{
                    width: 38,
                    height: "100%",
                    border: "none",
                    cursor: "pointer",
                    background: active ? C.tint : "transparent",
                    color: active ? C.primary : C.muted,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 120ms",
                  }}
                >
                  <Icon size={14} strokeWidth={2} />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Section list ─────────────────────────────────────────────────── */}
        <div style={{ paddingBottom: 40 }}>
          {Object.keys(bySection).length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "60px 0",
                color: C.muted,
                fontSize: 13,
              }}
            >
              No templates match "{search}"
            </div>
          ) : (
            Object.entries(bySection).map(([sec, items]) => (
              <SectionBlock
                key={sec}
                sectionName={sec}
                templates={items}
                view={view}
                creating={creating}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type PageMode = "gallery" | "editor";

interface SelectedTemplate {
  typeId: string;
  label: string;
  initialQuestions: QuestionDraft[];
  initialMediaBlocks: MediaBlock[];
}

export default function ExerciseDraftsPage({
  onClose,
  onGenerateAI,
  onSave,
  onSelectMediaDirect,
  onCreateAndOpen,
}: ExerciseDraftsPageProps) {
  const [pageMode, setPageMode] = useState<PageMode>("gallery");
  const [selected, setSelected] = useState<SelectedTemplate | null>(null);

  // ── Router state (when opened as a full page via LessonWorkspace) ───────────
  // LessonWorkspace navigates here with { returnTo, targetSectionId } in state.
  // We read those values so we can write the chosen media block back to
  // sessionStorage and return to the classroom — the same key LessonWorkspace's
  // import-effect is already polling for.
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const routerState = routerLocation.state as
    | { returnTo?: string; targetSectionId?: string | null }
    | null
    | undefined;

  // Log on mount so we can see what router state arrived
  React.useEffect(() => {
    console.log('[ExerciseDraftsPage] mounted. routerState:', routerState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Template click handler ───────────────────────────────────────────────────

  const handleCreate = useCallback(
    async (templateId: string) => {
      // Backward-compat: notify parent if they still use the old prop
      try {
        if (onCreateAndOpen) await onCreateAndOpen(templateId);
      } catch {
        /* ignore */
      }

      const mediaKind = TEMPLATE_TO_MEDIA_TYPE[templateId];
      console.log('[ExerciseDraftsPage] handleCreate', { templateId, mediaKind, routerState });

      // Pure media template (image / video / audio) — skip exercise editor entirely.
      if (mediaKind) {
        const kind = mediaKind as "image" | "video" | "audio";

        // 1. Parent provides onSelectMediaDirect (e.g. modal/embedded usage) → delegate
        if (onSelectMediaDirect) {
          console.log('[ExerciseDraftsPage] delegating to onSelectMediaDirect', kind, templateId);
          onSelectMediaDirect(kind, templateId);
          return;
        }

        // 2. Opened as a route page by LessonWorkspace (has returnTo in router state)
        //    → write the media block to sessionStorage and navigate back so
        //      LessonWorkspace's import-effect can pick it up.
        if (routerState?.returnTo) {
          const mediaBlock = {
            id: Math.random().toString(36).slice(2, 10),
            kind,
            url: "",
            caption: "",
          };
          const payload = JSON.stringify({
            mediaBlock,
            targetSectionId: routerState.targetSectionId ?? null,
            templateId,
          });
          console.log('[ExerciseDraftsPage] writing sessionStorage + navigating back', {
            mediaBlock,
            targetSectionId: routerState.targetSectionId,
            returnTo: routerState.returnTo,
            payload,
          });
          sessionStorage.setItem("lessonPendingInlineMedia", payload);
          navigate(routerState.returnTo, { replace: true });
          return;
        }

        console.warn('[ExerciseDraftsPage] media template selected but no onSelectMediaDirect and no returnTo in router state — falling through to embedded editor');
      }

      const tmpl = TEMPLATES.find((t) => t.id === templateId);
      const label = tmpl?.label ?? "Exercise";

      let initialQuestions: QuestionDraft[] = [];
      let initialMediaBlocks: MediaBlock[]  = [];

      if (mediaKind) {
        // onSelectMediaDirect not provided — fall back to opening the embedded editor
        initialMediaBlocks = [makeMediaBlock(mediaKind)];
      } else if (templateId === AUDIO_REPEAT_TEMPLATE) {
        // "Listen & repeat" → audio block + open_answer question
        initialMediaBlocks = [makeMediaBlock("audio")];
        initialQuestions   = [emptyDraftFor("open_answer")];
      } else {
        // Question-only template
        const draftType = TEMPLATE_TO_DRAFT_TYPE[templateId] ?? "multiple_choice";
        initialQuestions = [emptyDraftFor(draftType)];
      }

      setSelected({ typeId: templateId, label, initialQuestions, initialMediaBlocks });
      setPageMode("editor");
    },
    [onCreateAndOpen, onSelectMediaDirect, routerState, navigate]
  );

  // ── Cancel from editor → back to gallery ────────────────────────────────────

  const handleCancelEditor = useCallback(() => {
    setPageMode("gallery");
    setSelected(null);
  }, []);

  // ── Save from embedded workspace ─────────────────────────────────────────────

  const handleSave = useCallback(
    async (
      title: string,
      payloads: Record<string, unknown>[],
      drafts: QuestionDraft[]
    ) => {
      if (onSave) await onSave(title, payloads, drafts);
      // Stay in editor; workspace shows saved indicator.
    },
    [onSave]
  );

  // ── Render ───────────────────────────────────────────────────────────────────

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
      {/* ══════════════════════════════════════════════════════
          STATE 2 — INLINE EDITOR
          ══════════════════════════════════════════════════════ */}
      {pageMode === "editor" && selected && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "24px 24px 32px",
            overflow: "hidden",
            minHeight: "100vh",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              width: "100%",
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              flex: 1,
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                minHeight: 0,
              }}
            >
              <ExerciseEditorWorkspace
                mode="embedded"
                initialTitle=""
                initialQuestions={selected.initialQuestions}
                initialMediaBlocks={selected.initialMediaBlocks}
                onCancel={handleCancelEditor}
                onSave={handleSave}
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STATE 1 — TEMPLATE GALLERY
          ══════════════════════════════════════════════════════ */}
      {pageMode === "gallery" && (
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 48px",
          }}
        >
          <Gallery
            onClose={onClose}
            onGenerateAI={onGenerateAI}
            onSelect={handleCreate}
          />
        </div>
      )}
    </div>
  );
}