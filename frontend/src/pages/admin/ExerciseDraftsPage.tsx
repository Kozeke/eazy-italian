/**
 * ExerciseDraftsPage.tsx  (v4 — custom editor routing)
 *
 * Gallery + inline editor. All template data lives in exerciseTemplateRegistry.tsx
 * (same folder). This file only contains UI components and the page state machine.
 *
 * Changes from v3:
 *   • Added `customEditor` field support to TemplateConfig routing.
 *   • When templateId routes to a custom editor (`drag_to_gap`,
 *     `type_word_in_gap`, `select_word_form`), renders the dedicated gap editor instead of
 *     ExerciseEditorWorkspace.
 *   • On save from a custom gap editor, wraps the data into the
 *     standard `onSave(title, payloads, drafts)` contract so callers don't care.
 *
 * Adding a new exercise to the gallery = one line in exerciseTemplateRegistry.tsx.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  X,
  Search,
  LayoutGrid,
  List,
  Sparkles,
  Wand2,
  Heart,
  ChevronRight,
} from "lucide-react";
import ExerciseEditorWorkspace from "../../components/classroom/lesson/exercise/ExerciseEditorWorkspace";
import type { MediaBlock, MediaBlockType } from "../../components/classroom/lesson/exercise/ExerciseEditorWorkspace";
import {
  emptyDraftFor,
  QuestionDraft,
  type MatchItemDraft,
  type MatchingPairsDraft,
  type OrderingSentencesDraft,
  type OrderingWordsDraft,
  type PairDraft,
} from "../../components/classroom/lesson/editors/QuestionEditorRenderer";
import {
  EMPTY_TEST_DRAFT,
  type TestDraft,
  type TestQuestion,
} from "../../components/classroom/lesson/editors/TestEditorStep";
import {
  TEMPLATE_REGISTRY,
  GALLERY_SECTIONS,
  findTemplate,
  templateIdForSegmentExerciseKind,
  type TemplateConfig,
} from "./exerciseTemplateRegistry.tsx";
import DragToGapEditorPage, {
  type DragToGapData,
} from "../../components/classroom/lesson/flow/DragToGapEditorPage";
import DragWordToImageEditorPage, {
  type DragToImageData,
} from "../../components/classroom/lesson/flow/DragWordToImageEditorPage";
import TypeWordToImageEditorPage, {
  type TypeWordToImageData,
} from "../../components/classroom/lesson/flow/TypeWordToImageEditorPage";
import SelectFormToImageEditorPage, {
  type SelectFormToImageData,
} from "../../components/classroom/lesson/flow/SelectFormToImageEditorPage";
import TypeWordInGapEditorPage, {
  type TypeWordInGapData,
} from "../../components/classroom/lesson/flow/TypeWordInGapEditorPage";
import SelectWordFormEditorPage, {
  type SelectWordFormData,
} from "../../components/classroom/lesson/flow/SelectWordFormEditorPage";
import BuildSentenceEditorPage from "../../components/classroom/lesson/flow/BuildSentenceEditorPage";
import MatchPairsEditorPage from "../../components/classroom/lesson/flow/MatchPairsEditorPage";
import OrderParagraphsEditorPage from "../../components/classroom/lesson/flow/OrderParagraphsEditorPage";
import SortIntoColumnsEditorPage from "../../components/classroom/lesson/flow/SortIntoColumnsEditorPage";
import TestWithoutTimerEditorPage from "../../components/classroom/lesson/flow/TestWithoutTimerEditorPage";
import TestWithTimerEditorPage from "../../components/classroom/lesson/flow/TestWithTimerEditorPage";
import TrueFalseEditorPage from "../../components/classroom/lesson/flow/TrueFalseEditorPage";
import TextEditorPage, {
  type TextBlockData,
} from "../../components/classroom/lesson/flow/TextEditorPage";
import ImageEditorPage, {
  type ImageBlockData,
} from "../../components/classroom/lesson/flow/ImageEditorPage";
import "../../components/classroom/lesson/flow/DragToGap.css";
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from "../../components/classroom/lesson/flow/AI_generation/AIExerciseGeneratorModal";

// ─── Lesson segment "edit exercise" → drafts page routing ─────────────────────

/** Discriminates which full-screen custom editor is active. */
type PageMode =
  | "gallery"
  | "editor"
  | "text_block_editor"
  | "image_block_editor"
  | "drag_to_gap_editor"
  | "drag_to_image_editor"
  | "type_word_to_image_editor"
  | "select_form_to_image_editor"
  | "type_word_in_gap_editor"
  | "select_word_form_editor"
  | "build_sentence_editor"
  | "match_pairs_editor"
  | "order_paragraphs_editor"
  | "sort_into_columns_editor"
  | "test_without_timer_editor"
  | "test_with_timer_editor"
  | "true_false_editor";

/** Maps gallery `customEditor` tag to the drafts page view switch. */
function pageModeForTemplateCustomEditor(
  customEditor: NonNullable<TemplateConfig["customEditor"]>,
): PageMode {
  switch (customEditor) {
    case "text_block":
      return "text_block_editor";
    case "image_block":
      return "image_block_editor";
    case "drag_to_gap":
      return "drag_to_gap_editor";
    case "drag_to_image":
      return "drag_to_image_editor";
    case "type_word_to_image":
      return "type_word_to_image_editor";
    case "select_form_to_image":
      return "select_form_to_image_editor";
    case "type_word_in_gap":
      return "type_word_in_gap_editor";
    case "select_word_form":
      return "select_word_form_editor";
    case "build_sentence":
      return "build_sentence_editor";
    case "match_pairs":
      return "match_pairs_editor";
    case "order_paragraphs":
      return "order_paragraphs_editor";
    case "sort_into_columns":
      return "sort_into_columns_editor";
    case "test_without_timer":
      return "test_without_timer_editor";
    case "test_with_timer":
      return "test_with_timer_editor";
    case "true_false":
      return "true_false_editor";
    default:
      return "gallery";
  }
}

/**
 * Rebuilds a TestEditorStep draft from persisted segment `media_blocks[].data`
 * for test_without_timer / test_with_timer blocks.
 */
function buildTestDraftFromSegmentData(
  data: Record<string, unknown>,
  fallbackTitle: string,
): TestDraft {
  const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
  const questions: TestQuestion[] = rawQuestions
    .filter((q): q is QuestionDraft => Boolean(q) && typeof q === "object")
    .map((typedDraft, idx) => ({
      id: `seg_${idx}_${Math.random().toString(36).slice(2, 9)}`,
      prompt: String(typedDraft.prompt ?? ""),
      answers: [],
      typedDraft,
    }));
  const timeLimit =
    typeof data.time_limit_minutes === "number" && Number.isFinite(data.time_limit_minutes)
      ? data.time_limit_minutes
      : 0;
  return {
    ...EMPTY_TEST_DRAFT,
    title: String(data.title ?? fallbackTitle),
    time_limit_minutes: timeLimit,
    questions: questions.length > 0 ? questions : [...EMPTY_TEST_DRAFT.questions],
  };
}

// ─── Design tokens ────────────────────────────────────────────────────────────

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
  cardShadow: "0 1px 3px rgba(60,64,120,0.07), 0 4px 18px rgba(60,64,120,0.05)",
  hoverShadow: "0 8px 24px rgba(108,111,239,0.14), 0 2px 8px rgba(108,111,239,0.06)",
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ExerciseDraftsPageProps {
  onClose?: () => void;
  onGenerateAI?: () => void;
  onSave?: (
    title: string,
    payloads: Record<string, unknown>[],
    drafts: QuestionDraft[]
  ) => Promise<void> | void;
  onSelectMediaDirect?: (kind: "image" | "video" | "audio", templateId?: string) => void;
  /** @deprecated Use onSave instead */
  onCreateAndOpen?: (type: string) => void | Promise<void>;
  /** Segment / unit id passed to the AI generator endpoint */
  segmentId?: string | number | null;
  /** Called after successful AI generation so the parent can refresh state */
  onAIGenerated?: (block: GeneratedBlock) => void;
  /** When set, skip the gallery and open the matching custom editor with this payload */
  initialEditContext?: {
    blockId: string;
    kind: string;
    title: string;
    data: Record<string, unknown>;
  } | null;
}

/**
 * Produces the editor draft for "match_pairs" when reopening from a lesson segment.
 * Manual saves nest under `data.question`; AI / course-gen often store a flat
 * `left_items` + `right_items` + `pairs` shape (same as MatchPairsBlock hydration).
 */
function matchingPairsDraftFromSegmentEditData(
  data: Record<string, unknown>,
  blockTitle: string,
): MatchingPairsDraft | undefined {
  const nestedQuestion = data.question;
  if (nestedQuestion && typeof nestedQuestion === "object" && !Array.isArray(nestedQuestion)) {
    const partial = nestedQuestion as Partial<MatchingPairsDraft>;
    const leftItems = partial.left_items;
    if (Array.isArray(leftItems) && leftItems.length > 0) {
      return {
        type: "matching_pairs",
        prompt: partial.prompt ?? "",
        left_items: leftItems as MatchItemDraft[],
        right_items: (partial.right_items ?? []) as MatchItemDraft[],
        pairs: (partial.pairs ?? []) as PairDraft[],
        shuffle_right: partial.shuffle_right ?? true,
        score: typeof partial.score === "number" ? partial.score : 1,
      };
    }
  }

  const leftRaw = data.left_items;
  const rightRaw = data.right_items;
  const pairsRaw = data.pairs;
  const titleFromData = typeof data.title === "string" ? data.title : "";
  if (
    Array.isArray(leftRaw) &&
    leftRaw.length > 0 &&
    Array.isArray(rightRaw) &&
    rightRaw.length > 0 &&
    Array.isArray(pairsRaw)
  ) {
    return {
      type: "matching_pairs",
      prompt: titleFromData.trim() || blockTitle.trim() || "",
      left_items: leftRaw as MatchItemDraft[],
      right_items: rightRaw as MatchItemDraft[],
      pairs: pairsRaw as PairDraft[],
      shuffle_right: typeof data.shuffle_right === "boolean" ? data.shuffle_right : true,
      score: typeof data.score === "number" ? data.score : 1,
    };
  }

  return undefined;
}

function makeMediaBlock(type: MediaBlockType): MediaBlock {
  return {
    id: Math.random().toString(36).slice(2, 10),
    kind: "media",
    mediaType: type,
    url: "",
    caption: "",
  };
}

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
      {creating && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.78)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
          <div style={{ width: 22, height: 22, border: `2.5px solid ${C.tint}`, borderTopColor: C.primary, borderRadius: "50%", animation: "pm-spin 0.7s linear infinite" }} />
        </div>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setLiked((l) => !l); }}
        style={{ position: "absolute", top: 10, right: 10, zIndex: 2, width: 28, height: 28, borderRadius: 8, background: C.white, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: liked ? "#EF4444" : C.muted, transition: "color 120ms, border-color 120ms, opacity 120ms", opacity: hovered || liked ? 1 : 0 }}
      >
        <Heart size={13} strokeWidth={2} fill={liked ? "#EF4444" : "none"} />
      </button>
      <div style={{ height: 130, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 8, borderBottom: `1px solid ${C.borderSoft}` }}>
        <div style={{ transform: "scale(0.72)", transformOrigin: "center", pointerEvents: "none", maxWidth: "100%", maxHeight: "100%" }}>
          {template.preview}
        </div>
      </div>
      <div style={{ padding: "10px 12px 12px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: C.text, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
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
      style={{ display: "flex", alignItems: "center", gap: 14, background: C.white, borderRadius: 12, border: `1.5px solid ${hovered ? C.primary : C.cardBorder}`, padding: "12px 16px", cursor: "pointer", boxShadow: hovered ? C.hoverShadow : C.cardShadow, transform: hovered ? "translateY(-1px)" : "none", transition: "all 0.15s", position: "relative", userSelect: "none" }}
    >
      {creating && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.7)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
          <div style={{ width: 20, height: 20, border: `2.5px solid ${C.tint}`, borderTopColor: C.primary, borderRadius: "50%", animation: "pm-spin 0.7s linear infinite" }} />
        </div>
      )}
      <div style={{ flexShrink: 0, width: 52, height: 36, borderRadius: 8, overflow: "hidden", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: "scale(0.28)", transformOrigin: "center", pointerEvents: "none" }}>
          {template.preview}
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{template.label}</span>
      <ChevronRight size={14} color={C.muted} strokeWidth={2} />
    </div>
  );
}

// ─── GallerySectionGroup ──────────────────────────────────────────────────────

function GallerySectionGroup({
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
      <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>
        {sectionName}
      </p>
      {view === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} creating={creating === t.id} onClick={() => onSelect(t.id)} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((t) => (
            <ListRow key={t.id} template={t} creating={creating === t.id} onClick={() => onSelect(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AIBanner ─────────────────────────────────────────────────────────────────

function AIBanner({ onGenerateAI }: { onGenerateAI?: () => void }) {
  if (!onGenerateAI) return null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onGenerateAI}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onGenerateAI?.()}
      style={{ display: "flex", alignItems: "center", gap: 14, background: `linear-gradient(135deg, ${C.tint} 0%, #F3F0FF 100%)`, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", cursor: "pointer", marginBottom: 24, userSelect: "none" }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary} 0%, #9333ea 100%)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Wand2 size={18} color="#fff" strokeWidth={2} />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: C.text }}>Generate with AI</p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: C.sub }}>Describe your exercise and let AI build it for you</p>
      </div>
      <ChevronRight size={16} color={C.muted} strokeWidth={2} style={{ marginLeft: "auto" }} />
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
  const [view, setView]     = useState<"grid" | "list">("grid");
  const [creating, setCreating] = useState<string | null>(null);
  const q = search.toLowerCase().trim();

  const filtered = useMemo(
    () =>
      q
        ? TEMPLATE_REGISTRY.filter(
            (t) => t.label.toLowerCase().includes(q) || t.section.toLowerCase().includes(q),
          )
        : TEMPLATE_REGISTRY,
    [q],
  );

  const bySection = useMemo(() => {
    const acc: Record<string, TemplateConfig[]> = {};
    for (const sec of GALLERY_SECTIONS) {
      const items = filtered.filter((t) => t.section === sec);
      if (items.length) acc[sec] = items;
    }
    return acc;
  }, [filtered]);

  const handleSelect = useCallback(
    (id: string) => { setCreating(id); onSelect(id); },
    [onSelect],
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 0 80px" }}>
      <style>{`@keyframes pm-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "36px 0 0" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: C.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={15} color={C.primary} strokeWidth={2} />
            </div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>
              Choose exercise template
            </h1>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
              <X size={16} strokeWidth={2} />
            </button>
          )}
        </div>

        <AIBanner onGenerateAI={onGenerateAI} />

        {/* Search + view toggle */}
        <div style={{ display: "flex", gap: 10, paddingBottom: 8, marginBottom: 4 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: C.white, border: `1.5px solid ${C.cardBorder}`, borderRadius: 10, padding: "9px 14px" }}>
            <Search size={14} color={C.muted} strokeWidth={2} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              style={{ border: "none", background: "transparent", outline: "none", fontSize: 13, color: C.text, flex: 1, fontFamily: "inherit" }}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0, display: "flex" }}>
                <X size={13} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", background: C.white, border: `1.5px solid ${C.cardBorder}`, borderRadius: 10, overflow: "hidden" }}>
            {(["grid", "list"] as const).map((m) => {
              const Icon = m === "grid" ? LayoutGrid : List;
              return (
                <button key={m} type="button" onClick={() => setView(m)} style={{ width: 38, height: "100%", border: "none", cursor: "pointer", background: view === m ? C.tint : "transparent", color: view === m ? C.primary : C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={14} strokeWidth={2} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Template sections */}
        <div style={{ paddingBottom: 40 }}>
          {Object.keys(bySection).length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontSize: 13 }}>
              No templates match "{search}"
            </div>
          ) : (
            Object.entries(bySection).map(([sec, items]) => (
              <GallerySectionGroup
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

// ─── Main page ────────────────────────────────────────────────────────────────

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
  segmentId,
  onAIGenerated,
  initialEditContext = null,
}: ExerciseDraftsPageProps) {
  const [pageMode, setPageMode] = useState<PageMode>("gallery");
  const [selected, setSelected] = useState<SelectedTemplate | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);

  // Holds segment exercise snapshot while a custom editor is open (from lesson "edit")
  const [inlineEditSeed, setInlineEditSeed] = useState<
    NonNullable<ExerciseDraftsPageProps["initialEditContext"]> | null
  >(null);

  // Prevents StrictMode double-invocation from mounting the editor twice
  const initialEditConsumedRef = useRef(false);

  // Auto-open the correct editor when arriving from LessonWorkspace.handleEditBlock
  useEffect(() => {
    if (!initialEditContext || initialEditConsumedRef.current) return;
    const templateId = templateIdForSegmentExerciseKind(initialEditContext.kind);
    if (!templateId) return;
    const tmpl = findTemplate(templateId);
    if (!tmpl?.customEditor) return;
    initialEditConsumedRef.current = true;
    setInlineEditSeed(initialEditContext);
    const label =
      initialEditContext.title?.trim() ||
      tmpl.label ||
      "Exercise";
    setSelected({
      typeId: templateId,
      label,
      initialQuestions: [],
      initialMediaBlocks: [],
    });
    setPageMode(pageModeForTemplateCustomEditor(tmpl.customEditor));
  }, [initialEditContext]);

  // If the parent passes onGenerateAI, respect that; otherwise open our modal.
  const handleOpenAI = useCallback(() => {
    if (onGenerateAI) {
      onGenerateAI();
      return;
    }
    setShowAIModal(true);
  }, [onGenerateAI]);

  const routerLocation = useLocation();
  const navigate = useNavigate();
  const routerState = routerLocation.state as
    | {
        returnTo?: string;
        targetSectionId?: string | number | null;
        targetSegmentId?: string | number | null;
        /** Set to true when navigating from the HomeworkPlayer */
        homeworkMode?: boolean;
      }
    | null
    | undefined;

  const effectiveSegmentId =
    segmentId ?? routerState?.targetSegmentId ?? null;

  /** Store exercise data in sessionStorage and navigate back to the classroom. */
  const storeHomeworkExercise = useCallback(
    (exerciseType: string, title: string, data?: unknown, payloads?: Record<string, unknown>[]) => {
      sessionStorage.setItem(
        'homeworkPendingExercise',
        JSON.stringify({ exerciseType, title, data, payloads }),
      );
      const returnTo = routerState?.returnTo;
      if (returnTo) {
        navigate(returnTo, { replace: true, state: { fromHomeworkExercise: true } });
      } else {
        navigate(-1);
      }
    },
    [routerState, navigate],
  );

  const handleCreate = useCallback(
    async (templateId: string) => {
      const tmpl = findTemplate(templateId);
      const label = tmpl?.label ?? "Exercise";

      // ── Custom editor override (e.g. gap-based custom blocks) ─────────────
      if (
        tmpl?.customEditor === "text_block" ||
        tmpl?.customEditor === "image_block" ||
        tmpl?.customEditor === "drag_to_gap" ||
        tmpl?.customEditor === "drag_to_image" ||
        tmpl?.customEditor === "type_word_to_image" ||
        tmpl?.customEditor === "select_form_to_image" ||
        tmpl?.customEditor === "type_word_in_gap" ||
        tmpl?.customEditor === "select_word_form" ||
        tmpl?.customEditor === "build_sentence" ||
        tmpl?.customEditor === "match_pairs" ||
        tmpl?.customEditor === "order_paragraphs" ||
        tmpl?.customEditor === "sort_into_columns" ||
        tmpl?.customEditor === "test_without_timer" ||
        tmpl?.customEditor === "test_with_timer" ||
        tmpl?.customEditor === "true_false"
      ) {
        setSelected({ typeId: templateId, label, initialQuestions: [], initialMediaBlocks: [] });
        setPageMode(
          tmpl.customEditor === "text_block"
            ? "text_block_editor"
            : tmpl.customEditor === "image_block"
            ? "image_block_editor"
            : tmpl.customEditor === "drag_to_gap"
            ? "drag_to_gap_editor"
            : tmpl.customEditor === "drag_to_image"
              ? "drag_to_image_editor"
            : tmpl.customEditor === "type_word_to_image"
              ? "type_word_to_image_editor"
            : tmpl.customEditor === "select_form_to_image"
              ? "select_form_to_image_editor"
            : tmpl.customEditor === "type_word_in_gap"
              ? "type_word_in_gap_editor"
              : tmpl.customEditor === "select_word_form"
                ? "select_word_form_editor"
                : tmpl.customEditor === "build_sentence"
                  ? "build_sentence_editor"
                : tmpl.customEditor === "match_pairs"
                  ? "match_pairs_editor"
                : tmpl.customEditor === "order_paragraphs"
                  ? "order_paragraphs_editor"
                : tmpl.customEditor === "sort_into_columns"
                  ? "sort_into_columns_editor"
                : tmpl.customEditor === "test_without_timer"
                  ? "test_without_timer_editor"
                  : tmpl.customEditor === "test_with_timer"
                    ? "test_with_timer_editor"
                    : "true_false_editor",
        );
        return;
      }

      // ── Pure media → skip editor ──────────────────────────────────────────
      if (tmpl?.mediaKind) {
        const kind = tmpl.mediaKind;

        // Homework mode via router state must be checked FIRST.
        // onSelectMediaDirect is a lesson-only prop — if we let it run here
        // it bypasses homeworkMode entirely and writes to lessonPendingInlineMedia.
        if (routerState?.homeworkMode && routerState?.returnTo) {
          const mediaBlock = { id: Math.random().toString(36).slice(2, 10), kind, url: "", caption: "" };
          console.log('[ExerciseDrafts] homework media → writing homeworkPendingInlineMedia', { kind, templateId });
          sessionStorage.setItem(
            'homeworkPendingInlineMedia',
            JSON.stringify({ mediaBlock, targetSectionId: routerState.targetSectionId ?? null, templateId }),
          );
          navigate(routerState.returnTo, { replace: true });
          return;
        }

        // Lesson context: prefer the direct callback if provided by the parent.
        if (onSelectMediaDirect) {
          console.log('[ExerciseDrafts] lesson media → onSelectMediaDirect', { kind, templateId });
          onSelectMediaDirect(kind, templateId);
          return;
        }

        // Lesson context via router state (no direct callback available).
        if (routerState?.returnTo) {
          const mediaBlock = { id: Math.random().toString(36).slice(2, 10), kind, url: "", caption: "" };
          console.log('[ExerciseDrafts] lesson media → writing lessonPendingInlineMedia', { kind, templateId });
          sessionStorage.setItem(
            'lessonPendingInlineMedia',
            JSON.stringify({ mediaBlock, targetSectionId: routerState.targetSectionId ?? null, templateId }),
          );
          navigate(routerState.returnTo, { replace: true });
          return;
        }

        setSelected({ typeId: templateId, label, initialQuestions: [], initialMediaBlocks: [makeMediaBlock(kind)] });
        setPageMode("editor");
        return;
      }

      // ── Combo: media block + question draft ───────────────────────────────
      if (tmpl?.combo) {
        const { mediaKind, draftType } = tmpl.combo;
        setSelected({ typeId: templateId, label, initialQuestions: [emptyDraftFor(draftType)], initialMediaBlocks: [makeMediaBlock(mediaKind)] });
        setPageMode("editor");
        return;
      }

      // ── Question only ─────────────────────────────────────────────────────
      const draftType = tmpl?.draftType ?? "multiple_choice";
      setSelected({ typeId: templateId, label, initialQuestions: [emptyDraftFor(draftType)], initialMediaBlocks: [] });
      setPageMode("editor");
    },
    [onSelectMediaDirect, routerState, navigate],
  );

  // Return URL when the teacher came from the lesson (Add content / Edit exercise)
  const lessonReturnTo =
    typeof routerState?.returnTo === "string" && routerState.returnTo.length > 0
      ? routerState.returnTo
      : null;

  const handleCancelEditor = useCallback(() => {
    // Opened straight into an editor from lesson "Edit" (skipped gallery) — go back to the vertical player
    if (inlineEditSeed != null) {
      if (onClose) {
        onClose();
        return;
      }
      if (lessonReturnTo) {
        navigate(lessonReturnTo, { replace: true });
        return;
      }
    }
    setPageMode("gallery");
    setSelected(null);
    setInlineEditSeed(null);
  }, [inlineEditSeed, lessonReturnTo, navigate, onClose]);

  const handleSave = useCallback(
    async (title: string, payloads: Record<string, unknown>[], drafts: QuestionDraft[]) => {
      if (routerState?.homeworkMode) {
        const exerciseType = (payloads[0] as any)?.type ?? 'custom';
        storeHomeworkExercise(exerciseType, title, undefined, payloads);
        return;
      }
      if (onSave) await onSave(title, payloads, drafts);
    },
    [onSave, routerState, storeHomeworkExercise],
  );

  /**
   * Callback from ImageEditorPage.
   * Wraps ImageBlockData into the standard onSave(title, payloads, drafts)
   * contract so the lesson workspace can persist it like any other block.
   *
   * When a lessonReturnTo is present we write the customBlock directly to
   * lessonPendingInlineMedia sessionStorage (alreadyPersisted: false) and
   * navigate back ourselves.  This ensures LessonWorkspace calls
   * upsertInlineMediaBlock with data.src intact — the optimistic local state
   * keeps the image visible immediately while the autosave writes to the server.
   * Without this path the block arrived with an empty src because AdminRoutes
   * handleExerciseSave set alreadyPersisted:true and LessonWorkspace skipped the
   * local upsert, relying on a server GET that may not yet carry data.src.
   */
  const handleImageBlockSave = useCallback(
    async (data: ImageBlockData) => {
      // Resolved title used for the block label.
      const title = data.title || selected?.label || "Image block";

      // Homework-mode path: store in a separate key and navigate back.
      if (routerState?.homeworkMode) {
        storeHomeworkExercise("image", title, data);
        return;
      }

      // Lesson-context path: write optimistically to lessonPendingInlineMedia so
      // LessonWorkspace can call upsertInlineMediaBlock with the full data.src.
      if (lessonReturnTo) {
        // Unique id for the new block (or re-use the existing one when editing).
        const blockId =
          inlineEditSeed?.blockId && inlineEditSeed.blockId.length > 0
            ? inlineEditSeed.blockId
            : Math.random().toString(36).slice(2, 10);

        // Inline media block shape consumed by LessonWorkspace / SectionBlock.
        const customBlock = {
          id: blockId,
          kind: "image" as const,
          title,
          data,
        };

        sessionStorage.setItem(
          "lessonPendingInlineMedia",
          JSON.stringify({
            customBlock,
            // targetSectionId tells LessonWorkspace which section to scroll to.
            targetSectionId: routerState?.targetSectionId ?? null,
            // alreadyPersisted is intentionally omitted (false) so LessonWorkspace
            // calls upsertInlineMediaBlock and its autosave handles the server write.
          }),
        );

        navigate(lessonReturnTo, { replace: true });
        return;
      }

      // Fallback: let the parent onSave handle everything (e.g. non-lesson contexts).
      if (onSave) {
        await onSave(title, [{ type: "image", data }], []);
      }
    },
    [onSave, selected, routerState, storeHomeworkExercise, lessonReturnTo, inlineEditSeed, navigate],
  );

  /**
   * Callback from DragToGapEditorPage.
   * Wraps the DragToGapData into the standard onSave(title, payloads, drafts)
   * contract so the lesson workspace doesn't need to know about this type.
   */
  const handleDragToGapSave = useCallback(
    async (data: DragToGapData) => {
      const title = data.title || selected?.label || "Drag word to gap";
      if (routerState?.homeworkMode) {
        storeHomeworkExercise("drag_to_gap", title, data);
        return;
      }
      if (onSave) {
        await onSave(title, [{ type: "drag_to_gap", data }], []);
      }
    },
    [onSave, selected, routerState, storeHomeworkExercise],
  );

  const handleTypeWordInGapSave = useCallback(
    async (data: TypeWordInGapData) => {
      const title = data.title || selected?.label || "Type word in gap";
      if (routerState?.homeworkMode) {
        storeHomeworkExercise("type_word_in_gap", title, data);
        return;
      }
      if (onSave) {
        await onSave(title, [{ type: "type_word_in_gap", data }], []);
      }
    },
    [onSave, selected, routerState, storeHomeworkExercise],
  );

  const handleTypeWordToImageSave = useCallback(
    async (data: TypeWordToImageData) => {
      const title = data.title || selected?.label || "Type word to image";
      if (routerState?.homeworkMode) {
        storeHomeworkExercise("type_word_to_image", title, data);
        return;
      }
      if (onSave) {
        await onSave(title, [{ type: "type_word_to_image", data }], []);
      }
    },
    [onSave, selected, routerState, storeHomeworkExercise],
  );

  const handleSelectFormToImageSave = useCallback(
    async (data: SelectFormToImageData) => {
      const title = data.title || selected?.label || "Select form to image";
      if (routerState?.homeworkMode) {
        storeHomeworkExercise("select_form_to_image", title, data);
        return;
      }
      if (onSave) {
        await onSave(title, [{ type: "select_form_to_image", data }], []);
      }
    },
    [onSave, selected, routerState, storeHomeworkExercise],
  );

  const handleDragToImageSave = useCallback(
    async (data: DragToImageData) => {
      const title = data.title || selected?.label || "Drag word to image";
      if (routerState?.homeworkMode) {
        storeHomeworkExercise("drag_to_image", title, data);
        return;
      }
      if (onSave) {
        await onSave(title, [{ type: "drag_to_image", data }], []);
      }
    },
    [onSave, selected, routerState, storeHomeworkExercise],
  );

  const handleSelectWordFormSave = useCallback(
    async (data: SelectWordFormData) => {
      const title = data.title || selected?.label || "Select word form";
      if (routerState?.homeworkMode) {
        storeHomeworkExercise("select_word_form", title, data);
        return;
      }
      if (onSave) {
        await onSave(title, [{ type: "select_word_form", data }], []);
      }
    },
    [onSave, selected, routerState, storeHomeworkExercise],
  );

  /**
   * Callback from TextEditorPage.
   * Wraps TextBlockData into the standard onSave(title, payloads, drafts)
   * contract so the lesson workspace can persist it like any other block.
   */
  const handleTextBlockSave = useCallback(
    async (data: TextBlockData) => {
      const title = data.title || selected?.label || "Text block";
      if (routerState?.homeworkMode) {
        storeHomeworkExercise("text", title, data);
        return;
      }
      if (onSave) {
        await onSave(title, [{ type: "text", data }], []);
      }
    },
    [onSave, selected, routerState, storeHomeworkExercise],
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F7F7FA", fontFamily: "'Inter','Helvetica Neue',system-ui,sans-serif", display: "flex", flexDirection: "column" }}>

      {/* ── Standard ExerciseEditorWorkspace ─────────────────────────────── */}
      {pageMode === "editor" && selected && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px 32px", overflow: "hidden", minHeight: "100vh", boxSizing: "border-box" }}>
          <div style={{ maxWidth: 1100, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
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

      {/* ── TextBlock custom editor ──────────────────────────────────────── */}
      {pageMode === "text_block_editor" && (
        <TextEditorPage
          initialTitle={
            inlineEditSeed?.kind === "text" ? inlineEditSeed.title : (selected?.label ?? "")
          }
          initialData={
            inlineEditSeed?.kind === "text"
              ? (inlineEditSeed.data as unknown as TextBlockData)
              : undefined
          }
          label={selected?.label}
          onCancel={handleCancelEditor}
          onSave={handleTextBlockSave}
        />
      )}

      {/* ── ImageBlock custom editor ─────────────────────────────────────── */}
      {pageMode === "image_block_editor" && (
        <ImageEditorPage
          initialTitle={
            inlineEditSeed?.kind === "image" ? inlineEditSeed.title : (selected?.label ?? "")
          }
          initialData={
            inlineEditSeed?.kind === "image"
              ? (inlineEditSeed.data as unknown as ImageBlockData)
              : undefined
          }
          label={selected?.label}
          onCancel={handleCancelEditor}
          onSave={handleImageBlockSave}
        />
      )}

      {/* ── DragToGap custom editor ───────────────────────────────────────── */}
      {pageMode === "drag_to_gap_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 680, width: "100%", margin: "0 auto" }}>
            <DragToGapEditorPage
              initialTitle={inlineEditSeed?.kind === "drag_to_gap" ? inlineEditSeed.title : ""}
              initialData={
                inlineEditSeed?.kind === "drag_to_gap"
                  ? (inlineEditSeed.data as unknown as DragToGapData)
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleDragToGapSave}    
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "drag_to_image_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <DragWordToImageEditorPage
              initialTitle={
                inlineEditSeed?.kind === "drag_to_image" ||
                inlineEditSeed?.kind === "drag_word_to_image"
                  ? inlineEditSeed.title
                  : ""
              }
              initialData={
                inlineEditSeed?.kind === "drag_to_image" ||
                inlineEditSeed?.kind === "drag_word_to_image"
                  ? (inlineEditSeed.data as unknown as DragToImageData)
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleDragToImageSave}
              segmentId={effectiveSegmentId}
              exerciseType="drag_to_image"
            />
          </div>
        </div>
      )}

      {pageMode === "type_word_to_image_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <TypeWordToImageEditorPage
              initialTitle={
                inlineEditSeed?.kind === "type_word_to_image" ? inlineEditSeed.title : ""
              }
              initialData={
                inlineEditSeed?.kind === "type_word_to_image"
                  ? (inlineEditSeed.data as unknown as TypeWordToImageData)
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleTypeWordToImageSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "select_form_to_image_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <SelectFormToImageEditorPage
              initialTitle={
                inlineEditSeed?.kind === "select_form_to_image" ? inlineEditSeed.title : ""
              }
              initialData={
                inlineEditSeed?.kind === "select_form_to_image"
                  ? (inlineEditSeed.data as unknown as SelectFormToImageData)
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleSelectFormToImageSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "type_word_in_gap_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 680, width: "100%", margin: "0 auto" }}>
            <TypeWordInGapEditorPage
              initialTitle={
                inlineEditSeed?.kind === "type_word_in_gap" ? inlineEditSeed.title : ""
              }
              initialData={
                inlineEditSeed?.kind === "type_word_in_gap"
                  ? (inlineEditSeed.data as unknown as TypeWordInGapData)
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleTypeWordInGapSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "select_word_form_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 680, width: "100%", margin: "0 auto" }}>
            <SelectWordFormEditorPage
              initialTitle={
                inlineEditSeed?.kind === "select_word_form" ? inlineEditSeed.title : ""
              }
              initialData={
                inlineEditSeed?.kind === "select_word_form"
                  ? (inlineEditSeed.data as unknown as SelectWordFormData)
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleSelectWordFormSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "build_sentence_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <BuildSentenceEditorPage
              initialTitle={
                inlineEditSeed?.kind === "build_sentence" ? inlineEditSeed.title : ""
              }
              initialDraft={
                inlineEditSeed?.kind === "build_sentence" &&
                inlineEditSeed.data.question &&
                typeof inlineEditSeed.data.question === "object"
                  ? (inlineEditSeed.data.question as OrderingWordsDraft)
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "match_pairs_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <MatchPairsEditorPage
              initialTitle={inlineEditSeed?.kind === "match_pairs" ? inlineEditSeed.title : ""}
              initialDraft={
                inlineEditSeed?.kind === "match_pairs"
                  ? matchingPairsDraftFromSegmentEditData(
                      inlineEditSeed.data,
                      inlineEditSeed.title ?? "",
                    )
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "order_paragraphs_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <OrderParagraphsEditorPage
              initialTitle={
                inlineEditSeed?.kind === "order_paragraphs" ? inlineEditSeed.title : ""
              }
              initialDraft={
                inlineEditSeed?.kind === "order_paragraphs" &&
                inlineEditSeed.data.question &&
                typeof inlineEditSeed.data.question === "object"
                  ? (inlineEditSeed.data.question as OrderingSentencesDraft)
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "sort_into_columns_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <SortIntoColumnsEditorPage
              initialTitle={
                inlineEditSeed?.kind === "sort_into_columns" ? inlineEditSeed.title : ""
              }
              initialDraft={
                inlineEditSeed?.kind === "sort_into_columns" &&
                inlineEditSeed.data.question &&
                typeof inlineEditSeed.data.question === "object"
                  ? (inlineEditSeed.data.question as OrderingWordsDraft)
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "test_without_timer_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <TestWithoutTimerEditorPage
              initialTitle={
                inlineEditSeed?.kind === "test_without_timer" ? inlineEditSeed.title : ""
              }
              initialDraft={
                inlineEditSeed?.kind === "test_without_timer"
                  ? buildTestDraftFromSegmentData(
                      inlineEditSeed.data,
                      inlineEditSeed.title,
                    )
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "test_with_timer_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <TestWithTimerEditorPage
              initialTitle={
                inlineEditSeed?.kind === "test_with_timer" ? inlineEditSeed.title : ""
              }
              initialDraft={
                inlineEditSeed?.kind === "test_with_timer"
                  ? buildTestDraftFromSegmentData(
                      inlineEditSeed.data,
                      inlineEditSeed.title,
                    )
                  : undefined
              }
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {pageMode === "true_false_editor" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}>
          <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <TrueFalseEditorPage
              initialTitle=""
              label={selected?.label}
              onCancel={handleCancelEditor}
              onSave={handleSave}
              segmentId={effectiveSegmentId}
            />
          </div>
        </div>
      )}

      {/* ── Gallery ───────────────────────────────────────────────────────── */}
      {pageMode === "gallery" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 48px" }}>
          <Gallery onClose={onClose} onGenerateAI={handleOpenAI} onSelect={handleCreate} />
        </div>
      )}

      <AIExerciseGeneratorModal
        open={showAIModal}
        onClose={() => setShowAIModal(false)}
        segmentId={effectiveSegmentId}
        onGenerated={(block) => {
          onAIGenerated?.(block);
          setShowAIModal(false);
        }}
      />
    </div>
  );
}