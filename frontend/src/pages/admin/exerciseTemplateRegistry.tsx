/**
 * exerciseTemplateRegistry.tsx  (v2 — drag_to_gap activated)
 *
 * Single source of truth for every template card in the gallery
 * (ExerciseDraftsPage) and the mappings that drive handleCreate logic.
 *
 * Lives in the same folder as ExerciseDraftsPage.tsx.
 *
 * Changes from v1:
 *   • Added `customEditor` field to TemplateConfig — when set, ExerciseDraftsPage
 *     routes to a dedicated editor component rather than ExerciseEditorWorkspace.
 *   • Added DragToGapPreview component.
 *   • Activated the "drag-to-gap" entry (customEditor: "drag_to_gap").
 *
 * -----------------------------------------------------------------------------
 * To add a new exercise to the gallery:
 *   1. Add a preview component below (or import it from a separate file).
 *   2. Add one entry to TEMPLATE_REGISTRY.
 *   3. Create the block component in the flow/ folder.
 *   4. Register it in flow/exerciseRegistrations.ts.
 * -----------------------------------------------------------------------------
 */

import { ReactNode } from "react";
import type { MediaBlockType } from "../../components/classroom/lesson/exercise/ExerciseEditorWorkspace";
import type { QuestionDraft } from "../../components/classroom/lesson/editors/QuestionEditorRenderer";

// --- Template shape -----------------------------------------------------------

export type GallerySection =
  | "Images"
  | "Audio & Video"
  | "Words & Gaps"
  | "Tests"
  | "Put in Order";

export interface TemplateConfig {
  id: string;
  section: GallerySection;
  label: string;
  preview: ReactNode;
  /** Skip editor - inject a media block of this kind directly. */
  mediaKind?: "image" | "video" | "audio";
  /** Open editor pre-seeded with this draft type. */
  draftType?: QuestionDraft["type"];
  /** Produces both a media block AND a question draft. */
  combo?: { mediaKind: MediaBlockType; draftType: QuestionDraft["type"] };
  /**
   * When set, ExerciseDraftsPage opens a dedicated custom editor rather than
   * ExerciseEditorWorkspace. Supported values:
   *   "drag_to_gap" → DragToGapEditorPage
   *   "drag_to_image" → DragWordToImageEditorPage
   *   "type_word_to_image" → TypeWordToImageEditorPage
 *   "select_form_to_image" → SelectFormToImageEditorPage
   *   "type_word_in_gap" → TypeWordInGapEditorPage
   *   "select_word_form" → SelectWordFormEditorPage
 *   "build_sentence" → BuildSentenceEditorPage
 *   "match_pairs" → MatchPairsEditorPage
 *   "order_paragraphs" → OrderParagraphsEditorPage
 *   "sort_into_columns" → SortIntoColumnsEditorPage
 *   "test_without_timer" → TestWithoutTimerEditorPage
 *   "test_with_timer" → TestWithTimerEditorPage
 *   "true_false" → TrueFalseEditorPage
   */
  customEditor?:
    | "drag_to_gap"
    | "drag_to_image"
    | "type_word_to_image"
    | "select_form_to_image"
    | "type_word_in_gap"
    | "select_word_form"
    | "build_sentence"
    | "match_pairs"
    | "order_paragraphs"
    | "sort_into_columns"
    | "test_without_timer"
    | "test_with_timer"
    | "true_false";
}

// --- Design tokens (shared across preview components) -------------------------

const C = {
  primary: "#6C6FEF",
  bg: "#F7F7FA",
  white: "#FFFFFF",
  border: "#E8EAFD",
  text: "#1C1F3A",
  sub: "#6B6F8E",
  muted: "#A8ABCA",
};

const P = {
  card: {
    background: "#fff",
    borderRadius: 10,
    border: "1px solid #E8EAFD",
    padding: "12px 14px",
    width: 190,
    boxSizing: "border-box" as const,
  },
};

// --- Preview components -------------------------------------------------------

function ImgStackPreview() {
  return (
    <div style={{ ...P.card, display: "flex", flexDirection: "column", gap: 6 }}>
      {[{ h: 60, r: 10 }, { h: 28, r: 8 }, { h: 28, r: 8 }].map((b, i) => (
        <div key={i} style={{ height: b.h, borderRadius: b.r, background: `hsl(${220 + i * 20}, 60%, 90%)`, border: "1px solid #E8EAFD" }} />
      ))}
    </div>
  );
}

function ImgCarouselPreview() {
  return (
    <div style={{ ...P.card }}>
      <div style={{ height: 68, borderRadius: 8, background: "linear-gradient(135deg,#EEF0FE,#DDE1FC)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 22 }}>🖼️</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
        {[true, false, false].map((a, i) => <div key={i} style={{ width: a ? 18 : 6, height: 6, borderRadius: 10, background: a ? C.primary : "#E8EAFD" }} />)}
      </div>
    </div>
  );
}

function GifPreview() {
  return (
    <div style={{ ...P.card, display: "flex", alignItems: "center", justifyContent: "center", height: 90 }}>
      <div style={{ fontSize: 32 }}>🎞️</div>
    </div>
  );
}

function VideoPreview() {
  return (
    <div style={{ ...P.card, padding: 0, overflow: "hidden" }}>
      <div style={{ height: 100, background: "#1C1F3A", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 0, height: 0, borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderLeft: "14px solid white", marginLeft: 3 }} />
        </div>
      </div>
    </div>
  );
}

function AudioPreview() {
  return (
    <div style={{ ...P.card, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, borderRadius: 8, padding: "6px 10px" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "9px solid white", marginLeft: 2 }} />
        </div>
        <div style={{ flex: 1 }}>
          {[70, 100, 50].map((w, i) => <div key={i} style={{ height: 3, width: `${w}%`, background: i === 0 ? C.primary : "#E8EAFD", borderRadius: 10, marginBottom: i < 2 ? 3 : 0 }} />)}
        </div>
      </div>
    </div>
  );
}

function AudioRepeatPreview() {
  return (
    <div style={{ ...P.card, display: "flex", flexDirection: "column", gap: 8 }}>
      <AudioPreview />
      <div style={{ border: "1px solid #E8EAFD", borderRadius: 7, padding: "4px 8px", fontSize: 10, color: C.sub }}>Type what you hear…</div>
    </div>
  );
}

function ClozeDragPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {["quickly", "she", "walked"].map((w) => (
          <span key={w} style={{ padding: "3px 8px", borderRadius: 6, background: C.bg, border: "1.5px solid #E8EAFD", fontSize: 10, fontWeight: 600, color: C.sub, cursor: "grab" }}>⠿ {w}</span>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: C.text, lineHeight: 2 }}>
        Yesterday{" "}
        <span style={{ display: "inline-block", width: 42, height: 18, borderRadius: 5, border: "1.5px dashed #6C6FEF", background: "#EEF0FE", verticalAlign: "middle" }} />{" "}
        home very{" "}
        <span style={{ display: "inline-block", width: 52, height: 18, borderRadius: 5, border: "1.5px dashed #E8EAFD", background: C.bg, verticalAlign: "middle" }} />.
      </p>
    </div>
  );
}

function ClozeInputPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: C.text, lineHeight: 2 }}>
        She{" "}
        <span style={{ display: "inline-block", width: 52, height: 18, borderRadius: 5, border: "1.5px solid #6C6FEF", background: "#EEF0FE", verticalAlign: "middle" }} />{" "}
        to school every day.
      </p>
      <div style={{ border: "1.5px solid #E8EAFD", borderRadius: 7, padding: "3px 8px", fontSize: 10, color: C.muted }}>Type your answer…</div>
    </div>
  );
}

function ClozeSelectPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: C.text, lineHeight: 2 }}>
        He{" "}
        <span style={{ display: "inline-flex", alignItems: "center", height: 20, borderRadius: 5, border: "1.5px solid #6C6FEF", background: "#EEF0FE", padding: "0 6px", verticalAlign: "middle", fontSize: 10, color: C.primary }}>goes ▾</span>{" "}
        to school.
      </p>
    </div>
  );
}

function VisualDragPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ height: 55, background: "linear-gradient(135deg,#F0FDF4,#DCFCE7)", borderRadius: 8, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🌳</div>
      <ClozeDragPreview />
    </div>
  );
}

function VisualInputPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ height: 55, background: "linear-gradient(135deg,#FFF7ED,#FFEDD5)", borderRadius: 8, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏠</div>
      <ClozeInputPreview />
    </div>
  );
}

function VisualSelectPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ height: 55, background: "linear-gradient(135deg,#F0F9FF,#E0F2FE)", borderRadius: 8, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🌊</div>
      <ClozeSelectPreview />
    </div>
  );
}

function MCPreview({ hasTimer }: { hasTimer?: boolean }) {
  return (
    <div style={{ ...P.card, width: 190 }}>
      {hasTimer && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}><span style={{ fontSize: 9, color: C.primary, fontWeight: 700, background: "#EEF0FE", padding: "1px 6px", borderRadius: 10 }}>⏱ 0:30</span></div>}
      <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: C.text }}>What is the capital of France?</p>
      {["Paris", "Lyon", "Nice"].map((opt, i) => (
        <div key={opt} style={{ padding: "4px 9px", borderRadius: 7, border: `1.5px solid ${i === 0 ? C.primary : "#E8EAFD"}`, background: i === 0 ? "#EEF0FE" : C.bg, fontSize: 10, color: i === 0 ? C.primary : C.sub, fontWeight: i === 0 ? 700 : 400, marginBottom: 4 }}>{opt}</div>
      ))}
    </div>
  );
}

function TrueFalsePreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 600, color: C.text }}>Paris is in Germany.</p>
      <div style={{ display: "flex", gap: 6 }}>
        {[["✓ True", "#dcfce7", "#16a34a"], ["✗ False", "#fee2e2", "#dc2626"]].map(([label, bg, color]) => (
          <div key={label} style={{ flex: 1, padding: "5px 0", borderRadius: 8, background: bg, textAlign: "center", fontSize: 10, fontWeight: 700, color }}>{label}</div>
        ))}
      </div>
    </div>
  );
}

function OrderSentencePreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {["she", "goes", "to", "school"].map((w, i) => (
          <span key={w} style={{ padding: "3px 8px", borderRadius: 6, background: i < 2 ? "#EEF0FE" : C.bg, border: `1.5px solid ${i < 2 ? C.primary : "#E8EAFD"}`, fontSize: 10, fontWeight: 600, color: i < 2 ? C.primary : C.sub }}>{w}</span>
        ))}
      </div>
    </div>
  );
}

function SortColumnsPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[["Animals", ["🐱"]], ["Fruits", ["🍌"]]].map(([col, items]) => (
          <div key={col as string} style={{ background: C.bg, borderRadius: 8, padding: 6 }}>
            <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, color: C.sub, textTransform: "uppercase" }}>{col as string}</p>
            {(items as string[]).map((it) => <div key={it} style={{ background: C.white, borderRadius: 6, border: "1.5px solid #6C6FEF", padding: "3px 7px", fontSize: 11, marginBottom: 3 }}>{it}</div>)}
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
      {[{ text: "Then she reads an English book.", active: true }, { text: "First she makes tea.", active: false }, { text: "After that she listens to music", active: false }].map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "5px 8px", borderRadius: 7, border: `1.5px solid ${item.active ? "#6C6FEF" : "#E8EAFD"}`, background: item.active ? "#EEF0FE" : "#fff" }}>
          <span style={{ fontSize: 9, color: C.muted, fontWeight: 700 }}>{i + 1}</span>
          <span style={{ fontSize: 10, color: C.text }}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function AnagramPreview() {
  return (
    <div style={{ ...P.card, width: 190, textAlign: "center" }}>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: C.sub, fontWeight: 500 }}>Warm Season</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 6 }}>
        {["S", "_", "_", "_", "_", "r"].map((c, i) => (
          <div key={i} style={{ width: 20, height: 22, borderRadius: 5, border: "1.5px solid #E8EAFD", background: c !== "_" ? "#EEF0FE" : "#F7F7FA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.primary }}>
            {c === "S" || c === "r" ? c : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchingPreview() {
  const pairs: [string, string][] = [["English", "Hello"], ["French", "Salut"], ["Italian", "Ciao"], ["Spanish", "Hola"]];
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

// ─── DragToGapPreview (new) ───────────────────────────────────────────────────

function DragToGapPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      {/* Word chips bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap", background: "#F1F5F9", borderRadius: 7, padding: "5px 7px" }}>
        {["word", "fills", "gap"].map((w) => (
          <span
            key={w}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "2px 7px 2px 4px",
              borderRadius: 5,
              background: "#fff",
              border: "1.5px solid #E2E8F0",
              fontSize: 9.5,
              fontWeight: 600,
              color: C.text,
            }}
          >
            <span style={{ color: C.muted, fontSize: 8 }}>⠿</span>
            {w}
          </span>
        ))}
      </div>
      {/* Text with gap drop zones */}
      <p style={{ margin: 0, fontSize: 10.5, color: C.text, lineHeight: 2.2 }}>
        The{" "}
        <span style={{
          display: "inline-block",
          padding: "1px 8px",
          borderRadius: 5,
          border: "1.5px solid #06b6d4",
          background: "#f0fdff",
          fontSize: 10,
          fontWeight: 600,
          color: "#0e7490",
          verticalAlign: "middle",
        }}>
          word
        </span>{" "}
        always{" "}
        <span style={{
          display: "inline-block",
          width: 38,
          height: 18,
          borderRadius: 5,
          border: "1.5px dashed #94a3b8",
          background: "#F1F5F9",
          verticalAlign: "middle",
        }} />{" "}
        the{" "}
        <span style={{
          display: "inline-block",
          width: 30,
          height: 18,
          borderRadius: 5,
          border: "1.5px dashed #94a3b8",
          background: "#F1F5F9",
          verticalAlign: "middle",
        }} />.
      </p>
    </div>
  );
}

function TypeWordInGapPreview() {
  return (
    <div style={{ ...P.card, width: 190 }}>
      <p style={{ margin: "0 0 8px", fontSize: 10.5, color: C.text, lineHeight: 2.2 }}>
        The{" "}
        <span style={{
          display: "inline-block",
          width: 44,
          height: 20,
          borderRadius: 5,
          border: "1.5px solid #6C6FEF",
          background: "#EEF0FE",
          verticalAlign: "middle",
        }} />{" "}
        student can{" "}
        <span style={{
          display: "inline-block",
          width: 52,
          height: 20,
          borderRadius: 5,
          border: "1.5px solid #CBD5E1",
          background: "#fff",
          verticalAlign: "middle",
        }} />{" "}
        the answer.
      </p>
      <div style={{ border: "1px solid #E8EAFD", borderRadius: 7, padding: "6px 8px", fontSize: 10, color: C.sub, background: C.bg }}>
        Learner types directly into the gap
      </div>
    </div>
  );
}

// --- TEMPLATE REGISTRY -------------------------------------------------------

export const TEMPLATE_REGISTRY: TemplateConfig[] = [
  // Images
  { id: "img-stack",    section: "Images",       label: "Images stacked",       preview: <ImgStackPreview />,    mediaKind: "image" },
  { id: "img-carousel", section: "Images",       label: "Image carousel",       preview: <ImgCarouselPreview />, mediaKind: "image" },
  { id: "img-gif",      section: "Images",       label: "GIF animation",        preview: <GifPreview />,         mediaKind: "image" },
  // Audio & Video
  { id: "video-embed",  section: "Audio & Video", label: "Embed video",         preview: <VideoPreview />,       mediaKind: "video" },
  { id: "audio-clip",   section: "Audio & Video", label: "Audio clip",          preview: <AudioPreview />,       mediaKind: "audio" },
  { id: "audio-repeat", section: "Audio & Video", label: "Listen & repeat",     preview: <AudioRepeatPreview />, combo: { mediaKind: "audio", draftType: "open_answer" } },
  // Words & Gaps
  { id: "drag-to-gap",  section: "Words & Gaps",  label: "Drag word to gap",    preview: <DragToGapPreview />,   customEditor: "drag_to_gap" },
  { id: "type-word-in-gap", section: "Words & Gaps", label: "Type word in gap", preview: <TypeWordInGapPreview />, customEditor: "type_word_in_gap" },
  // Classic cloze templates are hidden while the custom gap editors are in use.
  // { id: "cloze-drag",   section: "Words & Gaps",  label: "Drag word (classic)", preview: <ClozeDragPreview />,   draftType: "cloze_drag" },
  // { id: "cloze-input",  section: "Words & Gaps",  label: "Type word (classic)", preview: <ClozeInputPreview />,  draftType: "cloze_input" },
  { id: "cloze-select", section: "Words & Gaps",  label: "Select word form",    preview: <ClozeSelectPreview />, customEditor: "select_word_form" },
  { id: "visual-drag",  section: "Words & Gaps",  label: "Drag word to image",  preview: <VisualDragPreview />,  customEditor: "drag_to_image" },
  { id: "visual-input", section: "Words & Gaps",  label: "Type word to image",  preview: <VisualInputPreview />, customEditor: "type_word_to_image" },
  { id: "visual-select",section: "Words & Gaps",  label: "Select form to image",preview: <VisualSelectPreview />,customEditor: "select_form_to_image" },
  // Tests
  { id: "mc-no-timer",  section: "Tests",         label: "Test without timer",  preview: <MCPreview />,          customEditor: "test_without_timer" },
  { id: "mc-timer",     section: "Tests",         label: "Test with timer",     preview: <MCPreview hasTimer />, customEditor: "test_with_timer" },
  { id: "true-false",   section: "Tests",         label: "True / False",        preview: <TrueFalsePreview />,   customEditor: "true_false" },
  // Put in Order
  { id: "order-sentence",section: "Put in Order", label: "Build a sentence",    preview: <OrderSentencePreview />, customEditor: "build_sentence" },
  { id: "sort-columns", section: "Put in Order",  label: "Sort into columns",   preview: <SortColumnsPreview />, customEditor: "sort_into_columns" },
  { id: "order-text",   section: "Put in Order",  label: "Order paragraphs",    preview: <OrderTextPreview />,   customEditor: "order_paragraphs" },
  { id: "anagram",      section: "Put in Order",  label: "Make a word",         preview: <AnagramPreview />,     draftType: "ordering_words" },
  { id: "matching",     section: "Put in Order",  label: "Match pairs",         preview: <MatchingPreview />,    customEditor: "match_pairs" },
];

export const GALLERY_SECTIONS: readonly GallerySection[] = [
  "Images",
  "Audio & Video",
  "Words & Gaps",
  "Tests",
  "Put in Order",
];

export function findTemplate(id: string): TemplateConfig | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.id === id);
}

/**
 * Segment `media_blocks[].kind` values (and future flow item types) that can be
 * opened in ExerciseDraftsPage custom editors from the lesson "edit" menu.
 */
export const SEGMENT_EDITABLE_EXERCISE_KINDS = new Set<string>([
  "drag_to_gap",
  "drag_to_image",
  "drag_word_to_image",
  "type_word_to_image",
  "select_form_to_image",
  "type_word_in_gap",
  "select_word_form",
  "build_sentence",
  "match_pairs",
  "order_paragraphs",
  "sort_into_columns",
  "test_without_timer",
  "test_with_timer",
]);

/**
 * Maps a persisted segment block `kind` to the gallery template id used by
 * ExerciseDraftsPage.handleCreate / findTemplate.
 */
export function templateIdForSegmentExerciseKind(kind: string): string | null {
  // Normalised keys from API / useSegmentPersistence
  const map: Record<string, string> = {
    drag_to_gap: "drag-to-gap",
    drag_to_image: "visual-drag",
    drag_word_to_image: "visual-drag",
    type_word_to_image: "visual-input",
    select_form_to_image: "visual-select",
    type_word_in_gap: "type-word-in-gap",
    select_word_form: "cloze-select",
    build_sentence: "order-sentence",
    match_pairs: "matching",
    order_paragraphs: "order-text",
    sort_into_columns: "sort-columns",
    test_without_timer: "mc-no-timer",
    test_with_timer: "mc-timer",
  };
  return map[kind] ?? null;
}