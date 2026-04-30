/**
 * AIExerciseGeneratorModal.tsx  (v2 — multi-type)
 *
 * What changed from v1
 * --------------------
 * • Added EXERCISE_TYPE_CONFIGS registry — one entry per supported exercise type.
 * • exerciseType is now a PROP, not internal state. The editor that opens the modal
 *   (e.g. DragToGapEditorPage) passes its own type — no picker inside the modal.
 * • handleGenerate routes to the correct endpoint slug from the registry.
 * • Advanced panel shows/hides config options based on the selected type.
 * • ReviewStep is now generic — works for all exercise types, not just drag_to_gap.
 * • All design tokens / sub-components unchanged so the rest of the UI is stable.
 * • "By description" uses EXERCISE_PROMPT_HINTS: three quick chips + two richer chips per
 *   exercise type, plus a matching textarea placeholder.
 *
 * Adding a new exercise type
 * --------------------------
 * Add ONE entry to EXERCISE_TYPE_CONFIGS below, and (recommended) a matching
 * EXERCISE_PROMPT_HINTS entry. The editor passes exerciseType="your_type".
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  X, Sparkles, Wand2, Upload, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown, ArrowLeft, Send, CheckCircle,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  primary:    "#6C6FEF",
  primaryDk:  "#4F52C2",
  tint:       "#EEF0FE",
  tintDeep:   "#DDE1FC",
  bg:         "#F7F7FA",
  white:      "#FFFFFF",
  border:     "#E8EAFD",
  borderSoft: "#F1F2FA",
  text:       "#1C1F3A",
  sub:        "#6B6F8E",
  muted:      "#A8ABCA",
  cardBorder: "#ECEEF8",
  error:      "#EF4444",
  errorBg:    "#FEF2F2",
  success:    "#10B981",
  successBg:  "#ECFDF5",
};

// ── Exercise type registry ────────────────────────────────────────────────────
/**
 * One entry per AI-generatable exercise type.
 *
 * Fields
 * ------
 * type         Internal key used in block.kind and the URL slug (hyphens).
 * label        Display name shown in the type-picker chips.
 * icon         Emoji used in the chip and review card.
 * description  Short one-liner shown below the label in the type picker.
 * endpoint     URL slug: POST /segments/{id}/exercises/{endpoint}
 * showGaps     Whether to show gap-count + gap-type in Advanced settings.
 * showPairs    Whether to show pair/sentence count in Advanced settings.
 * defaultGapType  Pre-selected gap type for this exercise.
 */
interface ExerciseTypeConfig {
  type:           string;
  label:          string;
  icon:           string;
  description:    string;
  endpoint:       string;
  showGaps:       boolean;
  showPairs:      boolean;
  defaultGapType: string;
}

const EXERCISE_TYPE_CONFIGS: ExerciseTypeConfig[] = [
  {
    type:           "drag_to_gap",
    label:          "Drag to Gap",
    icon:           "✦",
    description:    "Drag word chips into sentence gaps",
    endpoint:       "drag-to-gap",
    showGaps:       true,
    showPairs:      false,
    defaultGapType: "Verbs only",
  },
  {
    type:           "type_word_in_gap",
    label:          "Type in Gap",
    icon:           "⌨",
    description:    "Type the missing word directly",
    endpoint:       "type-word-in-gap",
    showGaps:       true,
    showPairs:      false,
    defaultGapType: "Verbs only",
  },
  {
    type:           "select_word_form",
    label:          "Select Form",
    icon:           "▾",
    description:    "Pick the correct word form from a dropdown",
    endpoint:       "select-word-form",
    showGaps:       true,
    showPairs:      false,
    defaultGapType: "Mixed (verbs, nouns, adjectives)",
  },
  {
    type:           "match_pairs",
    label:          "Match Pairs",
    icon:           "⇌",
    description:    "Connect terms to their definitions",
    endpoint:       "match-pairs",
    showGaps:       false,
    showPairs:      true,
    defaultGapType: "",
  },
  {
    type:           "build_sentence",
    label:          "Build Sentence",
    icon:           "⬛",
    description:    "Rearrange shuffled words into a sentence",
    endpoint:       "build-sentence",
    showGaps:       false,
    showPairs:      true,
    defaultGapType: "",
  },
  {
    type:           "select_form_to_image",
    label:          "Select Form to Image",
    icon:           "🔤",
    description:    "Pick the correct word form from a dropdown below each image",
    endpoint:       "select-form-to-image",
    showGaps:       false,
    showPairs:      false,
    defaultGapType: "Mixed (verbs, nouns, adjectives)",
  },
  {
    type:           "type_word_to_image",
    label:          "Type Word to Image",
    icon:           "⌨🖼",
    description:    "Type the correct word for each image card",
    endpoint:       "drag-word-to-image",
    showGaps:       false,
    showPairs:      false,
    defaultGapType: "",
  },
  {
  type:           "drag_word_to_image",
  label:          "Drag to Image",
  icon:           "🖼",
  description:    "Drag the correct word onto an image card",
  endpoint:       "drag-word-to-image",
  showGaps:       false,
  showPairs:      false,   // neither gap nor pair — image cards
  defaultGapType: "",
  },
  {
    type:           "drag_to_image",
    label:          "Drag to Image",
    icon:           "🖼",
    description:    "Drag the correct word onto an image card",
    endpoint:       "drag-word-to-image",
    showGaps:       false,
    showPairs:      false,
    defaultGapType: "",
  },
  {
    type:           "order_paragraphs",
    label:          "Order Paragraphs",
    icon:           "↕",
    description:    "Put paragraphs into the correct sequence",
    endpoint:       "order-paragraphs",
    showGaps:       false,
    showPairs:      true,
    defaultGapType: "",
  },
  {
    type:           "test_without_timer",
    label:          "Test (no timer)",
    icon:           "📋",
    description:    "Multiple-choice quiz without a time limit",
    endpoint:       "test-without-timer",
    showGaps:       false,
    showPairs:      true,   // reuse pair-count field as "question count"
    defaultGapType: "",
  },
  {
    type:           "test_with_timer",
    label:          "Test (with timer)",
    icon:           "📋",
    description:    "Multiple-choice quiz without a time limit",
    endpoint:       "test-with-timer",
    showGaps:       false,
    showPairs:      true,   // reuse pair-count field as "question count"
    defaultGapType: "",
  },
  {
    type:           "true_false",
    label:          "True / False",
    icon:           "✓✗",
    description:    "True or false statements for quick comprehension checks",
    endpoint:       "true-false",
    showGaps:       false,
    showPairs:      true,   // reuse pair-count field as "question count"
    defaultGapType: "",
  },
  {
    type:           "sort_into_columns",
    label:          "Sort into columns",
    icon:           "↕",
    description:    "Sort into columns",
    endpoint:       "sort-into-columns",
    showGaps:       false,
    showPairs:      true,   // reuse pair-count field as "question count"
    defaultGapType: "",
  },
  {
    type:           "text",
    label:          "Reading text",
    icon:           "📖",
    description:    "Markdown reading or grammar explanation for the lesson",
    endpoint:       "text",
    showGaps:       false,
    showPairs:      false,
    defaultGapType: "",
  },
  {
    type:           "image",
    label:          "Image block",
    icon:           "🖼",
    description:    "AI illustration (Hugging Face when configured, else SVG)",
    endpoint:       "image",
    showGaps:       false,
    showPairs:      false,
    defaultGapType: "",
  },
  {
    type:           "image_stacked",
    label:          "Images stacked",
    icon:           "🖼",
    description:    "Several AI illustrations in one block (2–6 images)",
    endpoint:       "image-stacked",
    showGaps:       false,
    showPairs:      true,
    defaultGapType: "",
  },
];

// Map for fast lookup
const EXERCISE_TYPE_MAP = new Map(EXERCISE_TYPE_CONFIGS.map((c) => [c.type, c]));

// Maps legacy/variant incoming exercise type keys to the canonical modal key.
const EXERCISE_TYPE_ALIASES: Record<string, string> = {
  TypeWordToImage: "type_word_to_image",
};

// Normalizes incoming exercise type prop and applies safe fallback.
function resolveExerciseType(rawExerciseType: string): string {
  // Store the canonical key for lookups in config maps and endpoint routing.
  const canonicalType = EXERCISE_TYPE_ALIASES[rawExerciseType] ?? rawExerciseType;
  return EXERCISE_TYPE_MAP.has(canonicalType) ? canonicalType : "drag_to_gap";
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeneratedBlock {
  id:    string;
  kind:  string;
  title: string;
  data:  unknown;
}

export interface AIExerciseGeneratorModalProps {
  open:          boolean;
  onClose:       () => void;
  segmentId?:    string | number | null;
  onGenerated?:  (block: GeneratedBlock) => void;
  apiBase?:      string;
  /**
   * Which exercise type to generate.
   * Passed by the editor that opened the modal (e.g. DragToGapEditorPage passes "drag_to_gap").
   * Defaults to "drag_to_gap" for backward compatibility.
   */
  exerciseType?: string;
}

type Tab  = "description" | "materials";
type Step = "configure"   | "review";

const LANGUAGE_OPTIONS = ["Detect automatically", "English"];
const GAP_OPTIONS      = ["Auto", "3", "5", "8", "10", "15"];
const PAIR_OPTIONS     = ["Auto", "2", "3", "4", "6", "8", "10"];
const DIFFICULTY_OPTIONS = ["Beginner (A1–A2)", "Intermediate (B1–B2)", "Advanced (C1–C2)"];
const GAP_TYPE_OPTIONS   = [
  "Verbs only",
  "Nouns only",
  "Adjectives only",
  "Mixed (verbs, nouns, adjectives)",
  "Past tense verbs only",
  "Custom words",
];
// Defines the maximum allowed upload size for source material files in bytes (2 MB).
const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Suggested prompt starters: three short (lighter output) and two richer (longer
 * text / more items). Keys match EXERCISE_TYPE_CONFIGS[].type.
 */
interface ExercisePromptHints {
  /** Shorter or simpler prompts, typically lower token use */
  simple: readonly [string, string, string];
  /** Longer or denser outputs — note for teachers: uses more tokens */
  advanced: readonly [string, string];
}

// Default when a type is missing from the per-type map
const DEFAULT_PROMPT_HINTS: ExercisePromptHints = {
  simple: [
    "Write a text on the topic of",
    "Generate focused practice for",
    "Create a short exercise about",
  ],
  advanced: [
    "Build a full paragraph with several gaps or items about",
    "Design a longer, richer task with varied vocabulary for",
  ],
};

/**
 * Per-exercise prompt chips for the “By description” tab — simple vs advanced
 * so teachers see what to ask for at a glance.
 */
const EXERCISE_PROMPT_HINTS: Record<string, ExercisePromptHints> = {
  drag_to_gap: {
    simple: [
      "3 gaps, topic:",
      "5 short lines with past tense, theme:",
      "Fill gaps: vocabulary about",
    ],
    advanced: [
      "A dialogue with 8 gaps, B1 level, about",
      "One longer news-style paragraph with 10 mixed gaps on",
    ],
  },
  type_word_in_gap: {
    simple: [
      "2 sentences, type the missing verb about",
      "Short text, type articles (il/lo/gli) in:",
      "4 gaps, learners type each word, topic:",
    ],
    advanced: [
      "A full paragraph: learners type every missing word (6–8 gaps) for",
      "Conversation lines with 10 gaps, keyboard input, context:",
    ],
  },
  select_word_form: {
    simple: [
      "Dropdown: correct verb form in 4 sentences about",
      "3 gaps, adjective vs adverb, theme:",
      "Mixed tenses, topic:",
    ],
    advanced: [
      "8 dropdowns, subjunctive/conditional, passage about",
      "Longer text, many form choices, advanced grammar on",
    ],
  },
  match_pairs: {
    simple: [
      "Match 5 Italian words to English for",
      "Pair idioms to meanings, theme:",
      "Connect food words to categories:",
    ],
    advanced: [
      "8 pairs: Italian phrases and English definitions about",
      "Cultural matching (tradition, region, saying) for",
    ],
  },
  build_sentence: {
    simple: [
      "Shuffle 4–6 words into one sentence about",
      "2 jumbled simple sentences, topic:",
      "Present tense word order practice:",
    ],
    advanced: [
      "5 shuffled medium sentences with subordinate clauses on",
      "Mix jumbled questions and statements for",
    ],
  },
  select_form_to_image: {
    simple: [
      "3 image cards, pick the correct adjective for each:",
      "Choose the word for each food picture, theme:",
      "2 cards, verb forms, illustrated topic:",
    ],
    advanced: [
      "6 cards: prepositions and room pictures; phrases about",
      "Larger set: adjective agreement with illustrated words for",
    ],
  },
  drag_word_to_image: {
    simple: [
      "Drag the label to 3 pictures:",
      "4 image cards, animals and Italian names:",
      "Match simple objects (table, chair) to words:",
    ],
    advanced: [
      "6 scene images, drag a short phrase to each, context:",
      "Workplace and profession images with vocabulary for",
    ],
  },
  type_word_to_image: {
    simple: [
      "Type the word for 3 pictures:",
      "4 image cards, learners type each missing label:",
      "A1 nouns: type the Italian word for each image:",
    ],
    advanced: [
      "6 images with typed answers, mixed vocabulary for",
      "Typing practice with image prompts and short hints about",
    ],
  },
  drag_to_image: {
    simple: [
      "Drag the label to 3 pictures:",
      "4 image cards, animals and Italian names:",
      "Match simple objects to Italian words:",
    ],
    advanced: [
      "6 scene images, drag a short phrase to each, context:",
      "Workplace and profession images with vocabulary for",
    ],
  },
  order_paragraphs: {
    simple: [
      "4 jumbled short paragraphs about",
      "Sequence 3 lines of a simple story on",
      "Put 4 text snippets in order, topic:",
    ],
    advanced: [
      "6 jumbled blocks forming a short article on",
      "A longer text split into 5 jumbled parts, connectors in",
    ],
  },
  test_without_timer: {
    simple: [
      "5 multiple-choice on vocabulary for",
      "4 questions on prepositions, theme:",
      "3 easy grammar items about",
    ],
    advanced: [
      "10 MCQ reading comprehension, passage idea:",
      "8 mixed questions: culture + grammar on",
    ],
  },
  test_with_timer: {
    simple: [
      "5 quick MCQ, vocabulary:",
      "4 timed questions, prepositions, topic:",
      "3 short grammar items about",
    ],
    advanced: [
      "10 MCQ, reading passage, theme:",
      "8 faster-paced mixed questions for",
    ],
  },
  true_false: {
    simple: [
      "4 true/false statements on",
      "Quick facts: 5 T/F about",
      "3 T/F for beginners, topic:",
    ],
    advanced: [
      "8 nuanced T/F for advanced learners on",
      "After a short text: 6 T/F about",
    ],
  },
  sort_into_columns: {
    simple: [
      "4 columns: food, drink, place, time — theme:",
      "3 columns: masculine, feminine, plural for",
      "Sort 12 items into 4 category columns about",
    ],
    advanced: [
      "4 column headers, 3 items per column, rich vocabulary for",
      "A sorting task with 4 themes and mixed difficulty on",
    ],
  },
  text: {
    simple: [
      "Write 2 short sentences about",
      "A brief note explaining",
      "Simple A2 explanation of",
    ],
    advanced: [
      "A short reading passage (5–6 sentences) with a title about",
      "Mini text with subheadings and key terms in bold on",
    ],
  },
  image: {
    simple: [
      "Simple flat illustration of",
      "Cartoon style, one subject:",
      "Icon-style picture for a lesson on",
    ],
    advanced: [
      "Detailed scene, warm colors, context:",
      "Educational diagram-style image explaining",
    ],
  },
  /** Several frames in one block — keep style consistent across the stack */
  image_stacked: {
    simple: [
      "2–3 simple panels, same art style, theme:",
      "A small sequence: step 1, step 2, step 3 for",
      "Icon row: morning, lunch, evening — topic:",
    ],
    advanced: [
      "4–5 panels that tell a short visual story, setting:",
      "6 matching illustrations, one cohesive sequence for a lesson on",
    ],
  },
};

// Merges registry with defaults for unknown types
function getPromptHintsForExerciseType(exerciseType: string): ExercisePromptHints {
  return EXERCISE_PROMPT_HINTS[exerciseType] ?? DEFAULT_PROMPT_HINTS;
}

// Textarea placeholder lines tailored to the block being generated
function getDescriptionPlaceholder(exerciseType: string): string {
  const byType: Record<string, string> = {
    text:
      "Example: Write 2 short sentences about ordering coffee in an Italian bar.\n" +
      "Or: a short grammar tip on agreement with collective nouns.",
    image:
      "Example: A friendly cartoon barista and two cups, soft pastel background.\n" +
      "Or: simple line-art icons for a lesson on public transport.",
    image_stacked:
      "Example: 3 stacked frames — order coffee, drink at the bar, pay; same flat style and palette.\n" +
      "Or: 4 panels, recipe or daily-routine steps, simple cartoon, consistent background.",
    sort_into_columns:
      "Example: 4 columns — breakfast, lunch, dinner, snack — with 12 food words in Italian to sort.\n" +
      "Or: 3 columns for ser/estar-style distinctions with vocabulary items…",
    order_paragraphs:
      "Example: 4 shuffled short paragraphs on how to make pasta, correct order: recipe steps.\n" +
      "Or: 3 jumbled intro sentences about a city tour.",
    match_pairs:
      "Example: Match 6 Italian phrasal verbs to their English meanings (travel theme).\n" +
      "Or: pair proverbs to their meanings for advanced learners.",
    build_sentence:
      "Example: One jumbled line for “Non ho ancora visto il film” about weekends.\n" +
      "Or: 2 simple sentences, present tense, topic shopping.",
    test_without_timer: "Example: 5 MCQ on irregular past participles, cooking theme.",
    test_with_timer:    "Example: 6 quick MCQ, 45 seconds, vocabulary on the office.",
    true_false:         "Example: 5 T/F on Italian geography; one subtle trick statement.",
    drag_word_to_image: "Example: 4 images — cat, dog, fish, bird — with Italian labels to drag.",
    type_word_to_image: "Example: 4 images — cat, dog, fish, bird — learners type the Italian labels.",
    drag_to_image:      "Example: 4 images — cat, dog, fish, bird — with Italian labels to drag.",
    select_form_to_image: "Example: 3 food photos, choose the correct adjective (gender/number) for each.",
    drag_to_gap:        "Example: 5 gaps, mixed vocabulary, a short text about a train journey.",
    type_word_in_gap:   "Example: 4 gaps; learners type missing verbs, past tense, day at school.",
    select_word_form:   "Example: 6 gaps with dropdowns, subjunctive in wishes and doubts.",
  };
  return (
    byType[exerciseType] ??
    "Example: Generate 10 engaging sentences for teenagers to practice Past Simple and Past Continuous."
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapLanguage(label: string): string {
  return label === "Detect automatically" ? "auto" : label.toLowerCase();
}

function mapCount(label: string): string {
  if (label.toLowerCase() === "auto") return "auto";
  const n = parseInt(label, 10);
  return isNaN(n) ? "auto" : String(n);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner({ size = 18, color = C.white }: { size?: number; color?: string }) {
  return (
    <span
      style={{
        display:         "inline-block",
        width:           size,
        height:          size,
        border:          `2px solid rgba(255,255,255,0.3)`,
        borderTopColor:  color,
        borderRadius:    "50%",
        animation:       "aeg-spin 0.65s linear infinite",
        flexShrink:      0,
      }}
    />
  );
}

function SelectField({
  label, value, options, onChange, helpText,
}: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void; helpText?: string;
}) {
  return (
    <div style={{ flex: 1 }}>
      <label
        style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12.5, fontWeight: 600, color: C.text,
          marginBottom: 7, letterSpacing: "-0.01em",
        }}
      >
        {label}
        {helpText && (
          <span
            title={helpText}
            style={{
              width: 15, height: 15, borderRadius: "50%",
              background: C.tint, border: `1px solid ${C.tintDeep}`,
              color: C.primary, fontSize: 9, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              cursor: "help",
            }}
          >
            ?
          </span>
        )}
      </label>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", padding: "9px 34px 9px 12px",
            border: `1.5px solid ${C.border}`, borderRadius: 10,
            fontSize: 13, color: C.text, background: "#FAFAFF",
            appearance: "none", WebkitAppearance: "none",
            cursor: "pointer", fontFamily: "inherit", outline: "none",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = C.primary;
            e.currentTarget.style.boxShadow   = `0 0 0 3px rgba(108,111,239,0.10)`;
            e.currentTarget.style.background   = C.white;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.boxShadow   = "none";
            e.currentTarget.style.background   = "#FAFAFF";
          }}
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown
          size={12} color={C.sub}
          style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}

// ── GenericReviewStep ─────────────────────────────────────────────────────────
/**
 * Generic review card — works for ALL exercise types.
 *
 * For drag_to_gap / type_word_in_gap it also renders the word-bank + gapped text
 * preview (same behaviour as v1).  For other types it shows a compact data
 * summary so teachers can confirm the AI output looks sensible before adding it.
 */
interface ReviewStepProps {
  block:              GeneratedBlock;
  warning?:           string | null;
  exerciseTypeConfig: ExerciseTypeConfig;
  rating:             "like" | "dislike" | null;
  onRate:             (r: "like" | "dislike") => void;
  correctionText:     string;
  onCorrectionChange: (v: string) => void;
  showCorrection:     boolean;
  onToggleCorrection: () => void;
  correctionSent:     boolean;
  onSendCorrection:   () => void;
  onAdd:              () => void;
  onBack:             () => void;
}

function ReviewStep({
  block, warning, exerciseTypeConfig, rating, onRate,
  correctionText, onCorrectionChange, showCorrection,
  onToggleCorrection, correctionSent, onSendCorrection,
  onAdd, onBack,
}: ReviewStepProps) {

  const isGapType = exerciseTypeConfig.showGaps;
  const data = block.data as Record<string, unknown> | null;

  // Word bank preview for gap-based types
  const [wordBank] = useState<string[]>(() => {
    if (!isGapType || !data) return [];
    const gaps = data.gaps as Record<string, unknown> | undefined;
    if (!gaps) return [];
    const words = Object.values(gaps).map((v) => {
      if (typeof v === "string") return v;
      if (typeof v === "object" && v !== null) {
        const g = v as { correctAnswers?: string[] };
        return g.correctAnswers?.[0] ?? "";
      }
      return "";
    }).filter(Boolean);
    const arr = [...words];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  });

  const segments = isGapType ? ((data?.segments ?? []) as Array<{ type: string; value?: string; id?: string }>) : [];
  const gaps = isGapType ? ((data?.gaps ?? {}) as Record<string, unknown>) : {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Back */}
      <button type="button" onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 12.5, color: C.sub, fontWeight: 500,
          cursor: "pointer", background: "none", border: "none",
          padding: "0 0 14px 0", fontFamily: "inherit",
          width: "fit-content", transition: "color 0.12s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = C.primary; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = C.sub; }}
      >
        <ArrowLeft size={13} strokeWidth={2.2} />
        Back to generator
      </button>

      {/* Warning */}
      {warning && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          background: "#FFFBEB", border: "1.5px solid #FDE68A",
          borderRadius: 10, padding: "10px 13px", marginBottom: 14,
          fontSize: 12.5, color: "#92400E", lineHeight: 1.5,
        }}>
          <span style={{ flexShrink: 0, fontSize: 15 }}>⚠️</span>
          <span>
            <strong style={{ display: "block", marginBottom: 2 }}>Fewer items than requested</strong>
            {warning}
          </span>
        </div>
      )}

      {/* Exercise type badge + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 9px", borderRadius: 20,
          background: C.tint, border: `1.5px solid ${C.tintDeep}`,
          color: C.primaryDk, fontSize: 11.5, fontWeight: 700,
        }}>
          {exerciseTypeConfig.icon} {exerciseTypeConfig.label}
        </span>
        {block.title && (
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: "-0.01em" }}>
            {block.title}
          </span>
        )}
      </div>

      {/* ── Gap-based preview (drag_to_gap, type_word_in_gap) ─────────────── */}
      {isGapType && (
        <>
          {/* Word bank */}
          <div style={{
            background: C.bg, border: `1.5px solid ${C.border}`,
            borderRadius: 12, padding: "10px 14px",
            display: "flex", flexWrap: "wrap", gap: 6,
            marginBottom: 14, minHeight: 44,
          }}>
            {wordBank.length === 0
              ? <span style={{ fontSize: 12, color: C.muted, alignSelf: "center" }}>No words</span>
              : wordBank.map((word, i) => (
                <span key={i} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 20,
                  border: `1.5px solid ${C.border}`, background: C.white,
                  fontSize: 12.5, fontWeight: 500, color: C.text,
                  userSelect: "none",
                  boxShadow: "0 1px 3px rgba(28,31,58,0.06)",
                }}>
                  {word}
                </span>
              ))
            }
          </div>

          {/* Gapped text */}
          <div style={{
            background: C.white, border: `1.5px solid ${C.border}`,
            borderRadius: 12, padding: "14px 16px",
            fontSize: 13.5, lineHeight: 1.8, color: C.text,
            marginBottom: 16,
          }}>
            {segments.map((seg, idx) => {
              if (seg.type === "text") {
                return <span key={idx}>{seg.value}</span>;
              }
              const gapId = seg.id!;
              const answer = (() => {
                const v = gaps[gapId];
                if (typeof v === "string") return v;
                if (Array.isArray(v)) return v[0] ?? "?";
                if (typeof v === "object" && v !== null) {
                  const g = v as { correctAnswers?: string[] };
                  return g.correctAnswers?.[0] ?? "?";
                }
                return "?";
              })();
              return (
                <span key={idx} style={{
                  display: "inline-block", minWidth: 60,
                  borderBottom: `2px solid ${C.primary}`,
                  color: C.primary, fontWeight: 600,
                  padding: "0 4px", margin: "0 2px",
                  background: C.tint, borderRadius: "4px 4px 0 0",
                  fontSize: 12.5,
                }}>
                  {answer}
                </span>
              );
            })}
          </div>
        </>
      )}

      {/* ── Generic preview for non-gap types ────────────────────────────── */}
      {!isGapType && (
        <div style={{
          background: C.successBg, border: `1.5px solid #A7F3D0`,
          borderRadius: 12, padding: "16px 18px", marginBottom: 16,
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <CheckCircle size={20} color={C.success} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#065F46", marginBottom: 4 }}>
              Exercise generated successfully
            </div>
            <div style={{ fontSize: 12.5, color: "#047857", lineHeight: 1.55 }}>
              {exerciseTypeConfig.description}. Click "Add to lesson" to insert it.
            </div>
            {/* Show a compact data preview */}
            <DataPreview data={data} exerciseType={exerciseTypeConfig.type} />
          </div>
        </div>
      )}

      {/* ── Add button ─────────────────────────────────────────────────────── */}
      <button type="button" onClick={onAdd}
        style={{
          width: "100%", padding: "12px", borderRadius: 12, border: "none",
          background: C.primary, color: C.white, fontSize: 14, fontWeight: 600,
          cursor: "pointer", letterSpacing: "-0.01em",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, marginBottom: 12, fontFamily: "inherit",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = C.primaryDk; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = C.primary; }}
      >
        <CheckCircle size={15} strokeWidth={2.2} />
        Add to lesson
      </button>

      {/* ── Rating row ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", background: C.bg,
        border: `1.5px solid ${C.borderSoft}`, borderRadius: 12,
        marginBottom: showCorrection ? 10 : 0,
      }}>
        <span style={{ fontSize: 12.5, color: C.sub, fontWeight: 500 }}>
          Was this result useful?
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {(["like", "dislike"] as const).map((r) => {
            const active = rating === r;
            return (
              <button key={r} type="button" onClick={() => { onRate(r); if (r === "dislike") onToggleCorrection(); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, borderRadius: 9,
                  border: `1.5px solid ${active ? C.primary : C.border}`,
                  background: active ? C.tint : C.white,
                  color: active ? C.primary : C.sub,
                  cursor: "pointer", transition: "all 0.14s", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.color = C.primary; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.sub; } }}
              >
                {r === "like" ? <ThumbsUp size={13} strokeWidth={2} /> : <ThumbsDown size={13} strokeWidth={2} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Correction textarea */}
      {showCorrection && (
        <div style={{ position: "relative", marginTop: 10 }}>
          {correctionSent ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: C.successBg, border: `1.5px solid #A7F3D0`,
              borderRadius: 12, padding: "12px 14px",
              fontSize: 13, color: C.success, fontWeight: 500,
            }}>
              <span style={{ fontSize: 16 }}>✓</span>
              Correction sent — AI will take it into account.
            </div>
          ) : (
            <>
              <textarea
                value={correctionText}
                onChange={(e) => onCorrectionChange(e.target.value)}
                placeholder="Describe your corrections…"
                rows={4}
                style={{
                  width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 12,
                  padding: "12px 14px", paddingBottom: 44,
                  fontSize: 13, color: C.text, background: "#FAFAFF",
                  resize: "none", fontFamily: "inherit", lineHeight: 1.65,
                  outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = C.primary;
                  e.currentTarget.style.boxShadow   = `0 0 0 3px rgba(108,111,239,0.10)`;
                  e.currentTarget.style.background   = C.white;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.boxShadow   = "none";
                  e.currentTarget.style.background   = "#FAFAFF";
                }}
              />
              <button type="button" onClick={onSendCorrection} disabled={!correctionText.trim()}
                style={{
                  position: "absolute", bottom: 10, right: 10,
                  width: 32, height: 32, borderRadius: 9, border: "none",
                  background: correctionText.trim() ? C.primary : C.muted,
                  color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: correctionText.trim() ? "pointer" : "default", transition: "background 0.15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (correctionText.trim()) e.currentTarget.style.background = C.primaryDk; }}
                onMouseLeave={(e) => { if (correctionText.trim()) e.currentTarget.style.background = C.primary; }}
              >
                <Send size={13} strokeWidth={2.2} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── DataPreview ───────────────────────────────────────────────────────────────
/** Compact summary of generated data for non-gap exercise types. */
function DataPreview({ data, exerciseType }: { data: Record<string, unknown> | null; exerciseType: string }) {
  if (!data) return null;

  if (exerciseType === "match_pairs") {
    const pairs = data.pairs as Array<{ left_id: string; right_id: string }> | undefined;
    const lefts = data.left_items as Array<{ id: string; text: string }> | undefined;
    const rights = data.right_items as Array<{ id: string; text: string }> | undefined;
    if (!pairs?.length || !lefts || !rights) return null;
    const rightMap = new Map(rights.map((r) => [r.id, r.text]));
    const leftMap  = new Map(lefts.map((l) => [l.id, l.text]));
    return (
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {pairs.slice(0, 4).map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{
              padding: "2px 8px", borderRadius: 6, background: C.tint,
              color: C.primaryDk, fontWeight: 500, maxWidth: 140, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{leftMap.get(p.left_id)}</span>
            <span style={{ color: C.muted }}>→</span>
            <span style={{
              padding: "2px 8px", borderRadius: 6, background: "#F0FDF4",
              color: "#065F46", fontWeight: 500, maxWidth: 140, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{rightMap.get(p.right_id)}</span>
          </div>
        ))}
        {pairs.length > 4 && (
          <span style={{ fontSize: 11.5, color: C.muted }}>+{pairs.length - 4} more pairs</span>
        )}
      </div>
    );
  }

  if (exerciseType === "build_sentence") {
    const sentences = data.sentences as Array<{ sentence: string }> | undefined;
    if (!sentences?.length) return null;
    return (
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {sentences.slice(0, 3).map((s, i) => (
          <div key={i} style={{
            fontSize: 12, color: "#047857", padding: "4px 8px",
            background: "rgba(16,185,129,0.06)", borderRadius: 6,
            borderLeft: `3px solid ${C.success}`,
          }}>
            {s.sentence}
          </div>
        ))}
        {sentences.length > 3 && (
          <span style={{ fontSize: 11.5, color: C.muted }}>+{sentences.length - 3} more sentences</span>
        )}
      </div>
    );
  }

  if (exerciseType === "order_paragraphs") {
    const items = data.items as Array<{ text: string }> | undefined;
    if (!items?.length) return null;
    return (
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {items.slice(0, 2).map((item, i) => (
          <div key={i} style={{
            fontSize: 12, color: "#047857", padding: "4px 8px",
            background: "rgba(16,185,129,0.06)", borderRadius: 6,
          }}>
            {item.text.slice(0, 80)}{item.text.length > 80 ? "…" : ""}
          </div>
        ))}
        {items.length > 2 && (
          <span style={{ fontSize: 11.5, color: C.muted }}>+{items.length - 2} more paragraphs</span>
        )}
      </div>
    );
  }

  // Markdown body for TextBlock — show a short excerpt in the review step.
  if (exerciseType === "text") {
    const body = typeof data.content === "string" ? data.content : "";
    if (!body.trim()) return null;
    const flat = body.trim().replace(/\s+/g, " ");
    const previewLen = 320;
    return (
      <div style={{
        marginTop: 10,
        fontSize: 12,
        color: C.sub,
        lineHeight: 1.55,
        maxHeight: 120,
        overflow: "hidden",
      }}>
        {flat.slice(0, previewLen)}
        {flat.length > previewLen ? "…" : ""}
      </div>
    );
  }

  // ImageStackedBlock — preview first two frames.
  if (exerciseType === "image_stacked") {
    const rawImages = data.images as unknown;
    if (!Array.isArray(rawImages)) return null;
    const thumbs = rawImages
      .filter((x): x is { src?: string } => Boolean(x) && typeof x === "object")
      .map((x) => String(x.src ?? ""))
      .filter((s) => s.length > 0)
      .slice(0, 3);
    if (thumbs.length === 0) return null;
    return (
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {thumbs.map((src, i) => (
          <div
            key={i}
            style={{
              width: 72,
              height: 72,
              borderRadius: 8,
              overflow: "hidden",
              border: `1.5px solid ${C.border}`,
              background: C.bg,
            }}
          >
            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ))}
        {rawImages.length > 3 ? (
          <span style={{ fontSize: 11.5, color: C.muted, alignSelf: "center" }}>
            +{rawImages.length - 3} more
          </span>
        ) : null}
      </div>
    );
  }

  // ImageBlock — data URI or URL from HF / SVG pipeline.
  if (exerciseType === "image") {
    const src = typeof data.src === "string" ? data.src : "";
    if (!src.trim()) return null;
    return (
      <div style={{
        marginTop: 10,
        borderRadius: 10,
        overflow: "hidden",
        maxHeight: 200,
        border: `1.5px solid ${C.border}`,
        background: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <img
          src={src}
          alt={typeof data.alt_text === "string" ? data.alt_text : "Generated illustration"}
          style={{ maxWidth: "100%", maxHeight: 200, display: "block", objectFit: "contain" }}
        />
      </div>
    );
  }

  if (exerciseType === "select_form_to_image") {
    const cards = data.cards as Array<{ answers: string[]; options?: string[] }> | undefined;
    if (!cards?.length) return null;
    return (
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
        {cards.slice(0, 4).map((card, i) => {
          const correct = card.answers?.[0] ?? "";
          const distractors = (card.options ?? []).filter((o) => o !== correct).slice(0, 2);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 12, fontWeight: 600, color: "#047857",
                padding: "2px 9px", borderRadius: 20,
                background: "rgba(16,185,129,0.08)", border: "1px solid #A7F3D0",
              }}>{correct}</span>
              {distractors.map((d, di) => (
                <span key={di} style={{
                  fontSize: 12, color: C.muted,
                  padding: "2px 8px", borderRadius: 20,
                  background: C.bg, border: `1px solid ${C.borderSoft}`,
                }}>{d}</span>
              ))}
            </div>
          );
        })}
        {cards.length > 4 && (
          <span style={{ fontSize: 11.5, color: C.muted }}>+{cards.length - 4} more cards</span>
        )}
      </div>
    );
  }

    if (exerciseType === "drag_word_to_image" || exerciseType === "drag_to_image" || exerciseType === "type_word_to_image") {
    const cards = data.cards as Array<{ answer: string; imageUrl?: string }> | undefined;
    if (!cards?.length) return null;
    return (
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {cards.slice(0, 6).map((card, i) => (
          <span key={i} style={{
            fontSize: 12, color: "#047857", padding: "3px 10px",
            background: "rgba(16,185,129,0.06)", borderRadius: 20,
            border: "1px solid #A7F3D0", fontWeight: 500,
          }}>
            {card.answer}
          </span>
        ))}
        {cards.length > 6 && (
          <span style={{ fontSize: 11.5, color: C.muted }}>+{cards.length - 6} more cards</span>
        )}
      </div>
    );
  }

  return null;
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function AIExerciseGeneratorModal({
  open, onClose, segmentId, onGenerated, apiBase = "",
  exerciseType: exerciseTypeProp = "drag_to_gap",
}: AIExerciseGeneratorModalProps) {

  // Stores the resolved exercise type from the opening editor for modal config routing.
  const exerciseType = resolveExerciseType(exerciseTypeProp);
  // Flags exercise types that must be generated only from textual description input.
  const isDescriptionOnlyType =
    exerciseType === "image" ||
    exerciseType === "image_stacked" ||
    exerciseType === "drag_word_to_image" ||
    exerciseType === "type_word_to_image" ||
    exerciseType === "select_form_to_image";
  // Stores the tab list visible in the tab switcher for the active exercise type.
  const availableTabs: Tab[] = isDescriptionOnlyType ? ["description"] : ["description", "materials"];

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("description");

  // ── Form — description tab ────────────────────────────────────────────────
  const [prompt,       setPrompt]       = useState("");
  const [language,     setLanguage]     = useState("Detect automatically");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [difficulty,   setDifficulty]   = useState("Intermediate (B1–B2)");
  const [gapCount,     setGapCount]     = useState("auto");
  const [pairCount,    setPairCount]    = useState("auto");

  // Derived: gap type default from selected exercise type
  const [gapType, setGapType] = useState(
    () => EXERCISE_TYPE_MAP.get(exerciseType)?.defaultGapType
      ?? EXERCISE_TYPE_MAP.get("drag_to_gap")?.defaultGapType
      ?? "Verbs only"
  );

  // ── Form — materials tab ──────────────────────────────────────────────────
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Generation state ──────────────────────────────────────────────────────
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Review step state ──────────────────────────────────────────────────────
  const [step,               setStep]               = useState<Step>("configure");
  const [generatedBlock,     setGeneratedBlock]     = useState<GeneratedBlock | null>(null);
  const [generationWarning,  setGenerationWarning]  = useState<string | null>(null);
  const [rating,             setRating]             = useState<"like" | "dislike" | null>(null);
  const [correctionText,     setCorrectionText]     = useState("");
  const [showCorrection,     setShowCorrection]     = useState(false);
  const [correctionSent,     setCorrectionSent]     = useState(false);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setError(null); setSuccessMsg(null); setLoading(false);
      setStep("configure"); setGeneratedBlock(null);
      setGenerationWarning(null); setRating(null);
      setCorrectionText(""); setShowCorrection(false); setCorrectionSent(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Keeps tab state valid when the active exercise type hides the materials tab.
  useEffect(() => {
    if (isDescriptionOnlyType && activeTab === "materials") {
      setActiveTab("description");
    }
  }, [isDescriptionOnlyType, activeTab]);

  // Fills the description from a hint chip (trailing space for continued typing)
  const setChipPrompt = useCallback((text: string) => { setPrompt(text + " "); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Stores the first selected file from the hidden file input.
    const selectedFile = e.target.files?.[0] ?? null;
    if (!selectedFile) {
      setUploadedFile(null);
      setError(null);
      return;
    }
    // Validates file extension so only PDF uploads are allowed for this generator flow.
    const isPdfExtension = selectedFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdfExtension) {
      setUploadedFile(null);
      setError("Only PDF files are allowed.");
      e.target.value = "";
      return;
    }
    // Prevents oversized uploads that exceed backend and UX expectations.
    const isWithinSizeLimit = selectedFile.size <= MAX_UPLOAD_SIZE_BYTES;
    if (!isWithinSizeLimit) {
      setUploadedFile(null);
      setError("File is too large. Maximum allowed size is 2 MB.");
      e.target.value = "";
      return;
    }
    setUploadedFile(selectedFile);
    setError(null);
  };

  // ── Generate ────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setError(null);
    setSuccessMsg(null);

    if (activeTab === "description" && !prompt.trim()) {
      setError("Please enter a description for your exercise.");
      return;
    }
    if (activeTab === "materials" && !uploadedFile) {
      setError("Please upload a file to generate from.");
      return;
    }
    if (!segmentId) {
      setError("No segment selected. Please open an exercise editor first.");
      return;
    }

    const cfg = EXERCISE_TYPE_MAP.get(exerciseType);
    if (!cfg) { setError("Unknown exercise type."); return; }

    setLoading(true);
    try {
      const root =
        apiBase && apiBase.length > 0
          ? apiBase.replace(/\/$/, "")
          : import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

      const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
      const baseEndpoint = `${root}/segments/${segmentId}/exercises/${cfg.endpoint}`;

      let res: Response;

      if (activeTab === "materials" && uploadedFile) {
        const form = new FormData();
        form.append("file", uploadedFile);
        // Sends gap_count only when it's explicitly numeric because from-file endpoint requires an int.
        const mappedGapCount = mapCount(gapCount);
        if (cfg.showGaps && mappedGapCount !== "auto") {
          form.append("gap_count", mappedGapCount);
        }
        form.append("content_language",     mapLanguage(language));
        form.append("instruction_language", "english");
        form.append("difficulty",           difficulty);
        if (prompt.trim()) form.append("block_title", prompt.trim());

        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        res = await fetch(`${baseEndpoint}/from-file`, { method: "POST", headers, body: form });
      } else {
        // Build body — include only params relevant to the selected exercise type
        const body: Record<string, unknown> = {
          content_language:     mapLanguage(language),
          instruction_language: "english",
          difficulty:           difficulty,
          topic_hint:           prompt.trim() || undefined,
          block_title:          prompt.trim() || undefined,
        };

        if (cfg.showGaps) {
          body.gap_count = mapCount(gapCount);
          body.gap_type  = gapType;
        }
        if (cfg.showPairs) {
          body.pair_count = mapCount(pairCount);
        }

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        res = await fetch(baseEndpoint, { method: "POST", headers, body: JSON.stringify(body) });
      }

      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        try { throw new Error(JSON.parse(msg)?.detail ?? msg); }
        catch { throw new Error(msg || `Server error ${res.status}`); }
      }

      const json = await res.json();
      const block: GeneratedBlock = json.block;
      setGeneratedBlock(block);
      setGenerationWarning(json.metadata?.warning ?? null);
      setStep("review");

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, prompt, uploadedFile, segmentId, exerciseType, language, difficulty, gapCount, pairCount, gapType, apiBase]);

  // ── Review actions ─────────────────────────────────────────────────────
  const handleAddToExercise = useCallback(() => {
    if (generatedBlock) onGenerated?.(generatedBlock);
    onClose();
  }, [generatedBlock, onGenerated, onClose]);

  const handleSendCorrection = useCallback(() => { setCorrectionSent(true); }, []);

  const handleBackFromReview = useCallback(() => {
    setStep("configure"); setGeneratedBlock(null); setGenerationWarning(null);
    setRating(null); setCorrectionText(""); setShowCorrection(false);
    setCorrectionSent(false); setError(null); setSuccessMsg(null);
  }, []);

  if (!open) return null;

  const activeCfg = EXERCISE_TYPE_MAP.get(exerciseType) ?? EXERCISE_TYPE_CONFIGS[0];
  // Quick vs richer prompt chips for the open exercise type
  const promptHintSet = getPromptHintsForExerciseType(exerciseType);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes aeg-spin { to { transform: rotate(360deg); } }
        @keyframes aeg-fade-in {
          from { opacity: 0; transform: scale(0.97) translateY(6px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        .aeg-scrollable::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Overlay */}
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(28,31,58,0.38)", backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, padding: "24px 16px",
        }}
      >
        {/* Modal card */}
        <div style={{
          background: C.white, borderRadius: 18,
          width: "100%", maxWidth: 572,
          boxShadow: "0 8px 48px rgba(28,31,58,0.20), 0 2px 8px rgba(28,31,58,0.08)",
          overflow: "hidden",
          animation: "aeg-fade-in 0.22s cubic-bezier(.22,.68,0,1.2) both",
          maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column",
        }}>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "18px 22px 14px", borderBottom: `1px solid ${C.borderSoft}`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: `linear-gradient(135deg, ${C.primary} 0%, #9333ea 100%)`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Wand2 size={15} color="#fff" strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "-0.025em" }}>
                AI Exercise Generator
              </span>
              {/* Show which exercise type will be generated */}
              {/* <span style={{
                fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
                background: C.tint, color: C.primaryDk,
                border: `1.5px solid ${C.tintDeep}`, letterSpacing: "0.01em",
              }}>
                {activeCfg.icon} {activeCfg.label}
              </span> */}
            </div>
            <button type="button" onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: 8,
                border: `1.5px solid ${C.border}`, background: C.white, color: C.sub,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", transition: "background 0.12s, border-color 0.12s", flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.bg; e.currentTarget.style.borderColor = "#C8CAEB"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.white; e.currentTarget.style.borderColor = C.border; }}
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>

          {/* ── Scrollable body ─────────────────────────────────────────────── */}
          <div style={{ overflowY: "auto", flex: 1 }}>

            {/* ── Tab bar (configure step only) ─────────────────────────────── */}
            {step === "configure" && (
              <div style={{ padding: "14px 22px 0" }}>
                <div style={{
                  display: "flex", background: C.bg, borderRadius: 10, padding: "3px", gap: 2,
                }}>
                  {availableTabs.map((tab) => {
                    const labels: Record<Tab, string> = { description: "By description", materials: "By materials" };
                    const active = activeTab === tab;
                    return (
                      <button key={tab} type="button"
                        onClick={() => { setActiveTab(tab); setError(null); setSuccessMsg(null); }}
                        style={{
                          flex: 1, padding: "8px 0", fontSize: 13,
                          fontWeight: active ? 600 : 500, borderRadius: 8, border: "none",
                          cursor: "pointer", color: active ? C.text : C.sub,
                          background: active ? C.white : "transparent",
                          boxShadow: active ? "0 1px 4px rgba(60,64,120,0.10)" : "none",
                          transition: "background 0.16s, color 0.16s, box-shadow 0.16s",
                          fontFamily: "inherit",
                        }}
                      >
                        {labels[tab]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Body ──────────────────────────────────────────────────────── */}
            <div style={{ padding: "18px 22px 22px" }}>

              {/* ══════════════ REVIEW STEP ══════════════ */}
              {step === "review" && generatedBlock && (
                <ReviewStep
                  block={generatedBlock}
                  warning={generationWarning}
                  exerciseTypeConfig={activeCfg}
                  rating={rating}
                  onRate={setRating}
                  correctionText={correctionText}
                  onCorrectionChange={setCorrectionText}
                  showCorrection={showCorrection}
                  onToggleCorrection={() => setShowCorrection((v) => !v)}
                  correctionSent={correctionSent}
                  onSendCorrection={handleSendCorrection}
                  onAdd={handleAddToExercise}
                  onBack={handleBackFromReview}
                />
              )}

              {/* ══════════════ CONFIGURE STEP ══════════════ */}
              {step === "configure" && (<>

                {/* Error / success banners */}
                {error && (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    background: C.errorBg, border: `1.5px solid #FECACA`,
                    borderRadius: 10, padding: "10px 13px", marginBottom: 14,
                    fontSize: 12.5, color: C.error, lineHeight: 1.5,
                  }}>
                    <span style={{ flexShrink: 0, fontSize: 14, marginTop: 1 }}>⚠</span>
                    {error}
                  </div>
                )}
                {successMsg && (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    background: C.successBg, border: `1.5px solid #A7F3D0`,
                    borderRadius: 10, padding: "10px 13px", marginBottom: 14,
                    fontSize: 12.5, color: C.success, lineHeight: 1.5,
                  }}>
                    <span style={{ flexShrink: 0, fontSize: 14, marginTop: 1 }}>✓</span>
                    {successMsg}
                  </div>
                )}

                {/* ── DESCRIPTION TAB ──────────────────────────────────── */}
                {activeTab === "description" && (
                  <div>
                    {/* Hint banner */}
                    {/* <div style={{
                      display: "flex", alignItems: "flex-start", gap: 9,
                      background: C.tint, borderRadius: 10, padding: "10px 13px", marginBottom: 14,
                    }}>
                      <Sparkles size={14} color={C.primary} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} /> */}
                      {/* <span style={{ fontSize: 12.5, color: C.primaryDk, lineHeight: 1.55 }}>
                        Enter a description — AI will generate a <strong>{activeCfg.label}</strong> exercise automatically.
                      </span> */}
                    {/* </div> */}

                    {/* Prompt hint chips: three quick, two richer (per exercise type) */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 6,
                        letterSpacing: "0.03em",
                      }}>
                        Quick ideas
                      </div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                        {promptHintSet.simple.map((chip) => (
                          <button key={chip} type="button" onClick={() => setChipPrompt(chip)}
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              fontSize: 11.5, padding: "4px 9px", borderRadius: 20,
                              background: C.tint, color: C.primaryDk,
                              border: `1.5px solid ${C.tintDeep}`,
                              cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap",
                              transition: "background 0.12s", fontFamily: "inherit",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = C.tintDeep; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = C.tint; }}
                          >
                            ✦ {chip}
                          </button>
                        ))}
                      </div>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 6,
                        letterSpacing: "0.03em",
                      }}>
                        Longer / richer
                        <span style={{ fontWeight: 500, color: C.muted, marginLeft: 6, letterSpacing: 0 }}>
                          (more model output, higher token use)
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {promptHintSet.advanced.map((chip) => (
                          <button key={chip} type="button" onClick={() => setChipPrompt(chip)}
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              fontSize: 11.5, padding: "4px 9px", borderRadius: 20,
                              background: "#FAFAFF", color: C.primaryDk,
                              border: `1.5px dashed ${C.tintDeep}`,
                              cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap",
                              transition: "background 0.12s, border-color 0.12s", fontFamily: "inherit",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = C.tint;
                              e.currentTarget.style.borderColor = C.primary;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#FAFAFF";
                              e.currentTarget.style.borderColor = C.tintDeep;
                            }}
                          >
                            ✦ {chip}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Textarea */}
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={getDescriptionPlaceholder(exerciseType)}
                      rows={5}
                      style={{
                        width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 12,
                        padding: "12px 14px", fontSize: 13, color: C.text,
                        background: "#FAFAFF", resize: "none", fontFamily: "inherit",
                        lineHeight: 1.65, outline: "none", boxSizing: "border-box",
                        transition: "border-color 0.15s, box-shadow 0.15s",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = C.primary;
                        e.currentTarget.style.boxShadow   = `0 0 0 3px rgba(108,111,239,0.10)`;
                        e.currentTarget.style.background   = C.white;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = C.border;
                        e.currentTarget.style.boxShadow   = "none";
                        e.currentTarget.style.background   = "#FAFAFF";
                      }}
                    />

                    {/* AI disclaimer */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6,
                      marginTop: 8, marginBottom: 4,
                      padding: "7px 10px", background: "#FFFBEB",
                      border: "1.5px solid #FDE68A", borderRadius: 9,
                    }}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M8 1.5L14.5 13H1.5L8 1.5Z" stroke="#D97706" strokeWidth="1.5" strokeLinejoin="round" fill="#FEF3C7"/>
                        <path d="M8 6v3.5" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="8" cy="11.5" r="0.75" fill="#D97706"/>
                      </svg>
                      <span style={{ fontSize: 11.5, color: "#92400E", lineHeight: 1.5 }}>
                        AI can make mistakes. Please double-check responses before using.
                      </span>
                    </div>

                    {/* Improve prompt */}
                    {/* <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7, marginBottom: 16 }}>
                      <button type="button"
                        style={{
                          fontSize: 12, color: C.primary, cursor: "pointer", fontWeight: 500,
                          display: "flex", alignItems: "center", gap: 4,
                          background: "none", border: "none", padding: 0, fontFamily: "inherit",
                        }}
                        onClick={() => {
                          if (prompt.trim()) {
                            setPrompt((p) => p.trimEnd() + ". Make it engaging and suitable for B1–B2 learners.");
                          }
                        }}
                      >
                        ✦ Improve prompt
                      </button>
                    </div> */}

                    {/* Divider */}
                    <div style={{ height: 1, background: C.borderSoft, margin: "0 0 16px" }} />

                    {/* Language */}
                    <SelectField
                      label="Language" value={language} options={LANGUAGE_OPTIONS}
                      onChange={setLanguage} helpText="Language of the source content"
                    />

                    {/* Advanced toggle */}
                    <button type="button" onClick={() => setShowAdvanced((v) => !v)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        gap: 5, width: "100%", padding: "9px", fontSize: 12.5,
                        color: C.sub, fontWeight: 500, cursor: "pointer",
                        margin: "12px 0 0", background: "none", border: "none",
                        borderRadius: 8, transition: "background 0.12s, color 0.12s",
                        fontFamily: "inherit",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.bg; e.currentTarget.style.color = C.text; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.sub; }}
                    >
                      {showAdvanced ? <ChevronUp size={12} strokeWidth={2} /> : <ChevronDown size={12} strokeWidth={2} />}
                      Advanced settings
                    </button>

                    {/* Advanced panel */}
                    {showAdvanced && (
                      <div style={{
                        marginTop: 12, borderTop: `1px solid ${C.borderSoft}`,
                        paddingTop: 14, display: "flex", flexDirection: "column", gap: 12,
                      }}>
                        <SelectField
                          label="Difficulty" value={difficulty}
                          options={DIFFICULTY_OPTIONS} onChange={setDifficulty}
                        />

                        {/* Gap-specific options */}
                        {activeCfg.showGaps && (
                          <>
                            <SelectField
                              label="Number of gaps" value={gapCount}
                              options={GAP_OPTIONS} onChange={setGapCount}
                            />
                            <SelectField
                              label="Gap type" value={gapType}
                              options={GAP_TYPE_OPTIONS} onChange={setGapType}
                            />
                          </>
                        )}

                        {/* Pair/sentence count for non-gap types */}
                        {activeCfg.showPairs && (
                          <SelectField
                            label={
                              exerciseType === "build_sentence" || exerciseType === "order_paragraphs"
                                ? "Number of sentences"
                                : exerciseType === "image_stacked"
                                ? "Number of images"
                                : "Number of pairs"
                            }
                            value={pairCount}
                            options={PAIR_OPTIONS}
                            onChange={setPairCount}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── MATERIALS TAB ─────────────────────────────────────── */}
                {activeTab === "materials" && (
                  <div>
                    {/* Hint */}
                    {/* <div style={{
                      display: "flex", alignItems: "flex-start", gap: 9,
                      background: C.tint, borderRadius: 10, padding: "10px 13px", marginBottom: 14,
                    }}> */}
                      {/* <Upload size={14} color={C.primary} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} /> */}
                      {/* <span style={{ fontSize: 12.5, color: C.primaryDk, lineHeight: 1.55 }}> */}
                        {/* Upload a PDF document — AI will generate a{" "} */}
                        {/* <strong>{activeCfg.label}</strong> exercise from its content. */}
                      {/* </span> */}
                    {/* </div> */}

                    {/* Drop zone */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: `2px dashed ${uploadedFile ? C.primary : C.border}`,
                        borderRadius: 14, padding: "28px 20px",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 8,
                        cursor: "pointer", background: uploadedFile ? C.tint : "#FAFAFE",
                        transition: "border-color 0.15s, background 0.15s", marginBottom: 14,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = C.primary;
                        e.currentTarget.style.background  = C.tint;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = uploadedFile ? C.primary : C.border;
                        e.currentTarget.style.background  = uploadedFile ? C.tint : "#FAFAFE";
                      }}
                    >
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: uploadedFile ? C.primary : C.tintDeep,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.15s",
                      }}>
                        <Upload size={17} color={uploadedFile ? "#fff" : C.primary} strokeWidth={2} />
                      </div>
                      <div style={{ textAlign: "center" }}>
                        {uploadedFile ? (
                          <>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.primaryDk, marginBottom: 2 }}>
                              {uploadedFile.name}
                            </div>
                            <div style={{ fontSize: 11.5, color: C.sub }}>
                              {(uploadedFile.size / 1024).toFixed(0)} KB — click to replace
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                              Click to upload
                            </div>
                            <div style={{ fontSize: 11.5, color: C.sub }}>
                              PDF only (.pdf) — max 2 MB
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      style={{ display: "none" }}
                    />
                  </div>
                )}

                {/* ── Generate button ──────────────────────────────────── */}
                <button type="button" onClick={handleGenerate} disabled={loading}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 12, border: "none",
                    background: loading ? C.primaryDk : C.primary,
                    color: C.white, fontSize: 14, fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                    letterSpacing: "-0.01em", transition: "background 0.15s, transform 0.1s",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 8, marginTop: 18, fontFamily: "inherit",
                    opacity: loading ? 0.85 : 1,
                  }}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = C.primaryDk; }}
                  onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = C.primary; }}
                  onMouseDown={(e) => { if (!loading) e.currentTarget.style.transform = "scale(0.99)"; }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                >
                  {loading ? (
                    <><Spinner size={16} color={C.white} />Generating…</>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                        <path d="M8 1.5l1.5 4h4l-3.2 2.5 1.2 4L8 9.5 4.5 12l1.2-4L2.5 5.5h4L8 1.5z"
                          fill="white" stroke="white" strokeWidth="0.5"/>
                      </svg>
                      Generate {activeCfg.label}
                    </>
                  )}
                </button>

              </>)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}