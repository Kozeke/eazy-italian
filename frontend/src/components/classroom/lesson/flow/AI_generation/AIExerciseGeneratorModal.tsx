/**
 * AIExerciseGeneratorModal.tsx  (v2 — multi-type)
 *
 * UI copy is loaded via react-i18next (keys under `aiExerciseGenerator` in
 * `locales/en.json` and `locales/ru.json`).
 *
 * Phase 3 addition: quota badge at the top of the configure step.
 * - Fetches GET /admin/tariffs/me once when the modal opens.
 * - Shows "X of Y exercise generations used this month".
 * - If used >= limit: disables generate button and shows "Monthly limit reached · Upgrade".
 * - If plan is Pro (limit === null): shows "Unlimited" and keeps button enabled.
 * - Upgrade click opens ConnectPaymentModal (imported below).
 *
 * All other behaviour is unchanged from v2.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Sparkles, Wand2, Upload, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown, ArrowLeft, Send, CheckCircle,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import ConnectPaymentModal from "../../../../../pages/admin/components/ConnectPaymentModal";
import { aiLimitFromMe } from "../../../../../utils/teacherTariffMe";
import { fetchWithAuth } from "../../../../../services/apiClient";
import { API_BASE_URL } from "../../../../../services/api";
import { SOMETHING_WENT_WRONG_PATH } from "../../../../../pages/SomethingWentWrongPage";

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
  amber:      "#F59E0B",
  amberBg:    "#FFFBEB",
};

// ── Exercise type registry ────────────────────────────────────────────────────
interface ExerciseTypeConfig {
  type:           string;
  icon:           string;
  endpoint:       string;
  showGaps:       boolean;
  showPairs:      boolean;
  defaultGapType: string;
}

// Registry of exercise types (labels come from i18n: aiExerciseGenerator.types.<type>).
const EXERCISE_TYPE_CONFIGS: ExerciseTypeConfig[] = [
  {
    type: "drag_to_gap", icon: "✦", endpoint: "drag-to-gap",
    showGaps: true, showPairs: false, defaultGapType: "Verbs only",
  },
  {
    type: "type_word_in_gap", icon: "⌨", endpoint: "type-word-in-gap",
    showGaps: true, showPairs: false, defaultGapType: "Verbs only",
  },
  {
    type: "select_word_form", icon: "▾", endpoint: "select-word-form",
    showGaps: false, showPairs: true, defaultGapType: "Mixed (verbs + nouns)",
  },
  {
    type: "match_pairs", icon: "⇌", endpoint: "match-pairs",
    showGaps: false, showPairs: true, defaultGapType: "Mixed (verbs + nouns)",
  },
  {
    type: "build_sentence", icon: "⬛", endpoint: "build-sentence",
    showGaps: false, showPairs: false, defaultGapType: "Mixed (verbs + nouns)",
  },
  {
    type: "order_paragraphs", icon: "↕", endpoint: "order-paragraphs",
    showGaps: false, showPairs: false, defaultGapType: "Mixed (verbs + nouns)",
  },
  {
    type: "sort_into_columns", icon: "⊞", endpoint: "sort-into-columns",
    showGaps: false, showPairs: false, defaultGapType: "Mixed (verbs + nouns)",
  },
  {
    type: "true_false", icon: "✓✗", endpoint: "true-false",
    showGaps: false, showPairs: false, defaultGapType: "Mixed (verbs + nouns)",
  },
  {
    type: "select_form_to_image", icon: "🖼", endpoint: "select-form-to-image",
    showGaps: false, showPairs: false, defaultGapType: "Mixed (verbs + nouns)",
  },
  {
    type: "type_word_to_image", icon: "🖼⌨", endpoint: "type-word-to-image",
    showGaps: false, showPairs: false, defaultGapType: "Mixed (verbs + nouns)",
  },
  // Markdown reading / grammar block — POST .../exercises/text; TextEditorPage passes exerciseType="text".
  {
    type: "text", icon: "¶", endpoint: "text",
    showGaps: false, showPairs: false, defaultGapType: "Mixed (verbs + nouns)",
  },
];

// Maps API gap_type strings (English, backend contract) to i18n keys under aiExerciseGenerator.gapType.
const GAP_TYPE_I18N_KEY: Record<string, string> = {
  "Verbs only": "verbsOnly",
  "Nouns only": "nounsOnly",
  "Adjectives only": "adjectivesOnly",
  "Mixed (verbs + nouns)": "mixed",
  "Prepositions only": "prepositionsOnly",
  "Irregular verbs": "irregularVerbs",
  "Phrasal verbs": "phrasalVerbs",
};

// Canonical gap_type values sent to the API (must stay aligned with backend / prompts).
const GAP_TYPE_OPTIONS: string[] = [
  "Verbs only", "Nouns only", "Adjectives only", "Mixed (verbs + nouns)",
  "Prepositions only", "Irregular verbs", "Phrasal verbs",
];

/** Returns translated label + description for an exercise type slug. */
function exerciseTypeStrings(t: TFunction, typeKey: string) {
  const base = `aiExerciseGenerator.types.${typeKey}`;
  return { label: t(`${base}.label`), description: t(`${base}.description`) };
}

const EXERCISE_TYPE_MAP = new Map(EXERCISE_TYPE_CONFIGS.map((c) => [c.type, c]));

// ── Quota types ───────────────────────────────────────────────────────────────
interface TariffStatus {
  plan: string;
  ai_limits: Record<string, number | null | undefined>;
  ai_usage: {
    exercise_generations: number;
    unit_generations: number;
    course_generations: number;
  };
}

// ── Sub-components (unchanged from v2) ────────────────────────────────────────
// ... existing code — Spinner, ReviewStep, and all other sub-components unchanged ...

function Spinner({ size = 20, color = C.primary }: { size?: number; color?: string }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        border: `2px solid ${color}33`,
        borderTopColor: color,
        animation: "aeg-spin 0.7s linear infinite",
        flexShrink: 0,
      }}
      aria-hidden
    />
  );
}

// ── QuotaBadge — shown at the top of the configure step ──────────────────────
function QuotaBadge({
  used, limit, onUpgrade,
}: {
  used: number;
  limit: number | null;
  onUpgrade: () => void;
}) {
  const { t } = useTranslation();
  const isUnlimited = limit === null;
  const isAtLimit   = !isUnlimited && used >= limit!;
  const pct         = isUnlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit!)) * 100));
  const isWarning   = !isUnlimited && pct >= 70 && pct < 90;
  const isDanger    = !isUnlimited && pct >= 90;

  const bgColor    = isDanger ? "#FEF2F2" : isWarning ? "#FFFBEB" : C.tint;
  const textColor  = isDanger ? C.error   : isWarning ? C.amber   : C.primary;
  const barColor   = isDanger ? "#EF4444" : isWarning ? "#F59E0B" : C.primary;
  const borderColor = isDanger ? "#FECACA" : isWarning ? "#FDE68A" : C.border;

  return (
    <div style={{
      background: bgColor, border: `1.5px solid ${borderColor}`,
      borderRadius: 10, padding: "9px 13px", marginBottom: 14,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <Zap size={14} color={textColor} strokeWidth={2.2} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: textColor }}>
            {isUnlimited
              ? t("aiExerciseGenerator.quota.unlimited")
              : isAtLimit
                ? t("aiExerciseGenerator.quota.atLimit")
                : t("aiExerciseGenerator.quota.usedThisMonth", { used, limit })
            }
          </span>
          {isAtLimit && (
            <button
              type="button"
              onClick={onUpgrade}
              style={{
                flexShrink: 0, fontSize: 11.5, fontWeight: 700,
                color: C.white, background: C.primary,
                border: "none", borderRadius: 7, padding: "3px 9px",
                cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
                transition: "background 0.14s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.primaryDk; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.primary; }}
            >
              {t("aiExerciseGenerator.quota.upgrade")}
            </button>
          )}
        </div>
        {!isUnlimited && !isAtLimit && (
          <div style={{
            marginTop: 5, height: 4, borderRadius: 99,
            background: `${barColor}22`, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: barColor,
              width: `${pct}%`,
              transition: "width 0.4s cubic-bezier(.22,.68,0,1.2)",
            }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Prop types ────────────────────────────────────────────────────────────────
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
  exerciseType?: string;
}

type Tab  = "description" | "materials";
type Step = "configure"   | "review";

// Content-language values stored in form state (labels are translated in the UI).
const LANGUAGE_PREF_VALUES = ["Detect automatically", "English"] as const;

const GAP_COUNT_OPTIONS    = ["Auto", "3", "5", "8", "10", "15"] as const;
const PAIR_COUNT_OPTIONS   = ["Auto", "4", "6", "8", "10"] as const;

// Difficulty strings forwarded to the API (stable English tokens).
const DIFFICULTY_VALUES = [
  "Beginner (A1–A2)", "Intermediate (B1–B2)", "Advanced (C1–C2)",
] as const;

// Parallel i18n keys for DIFFICULTY_VALUES (aiExerciseGenerator.difficulty.*).
const DIFFICULTY_LABEL_KEYS = ["beginner", "intermediate", "advanced"] as const;

/**
 * True when segmentId is safe to embed in POST /segments/{id}/exercises/...
 * (avoids literal "null" in the URL from missing React state).
 */
function isValidSegmentId(segmentId: string | number | null | undefined): boolean {
  if (segmentId == null) return false;
  const trimmed = String(segmentId).trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined") return false;
  const asNum = Number(trimmed);
  return Number.isInteger(asNum) && asNum > 0;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIExerciseGeneratorModal({
  open, onClose, segmentId, onGenerated, apiBase = API_BASE_URL,
  exerciseType: exerciseTypeProp = "drag_to_gap",
}: AIExerciseGeneratorModalProps) {

  const { t, i18n } = useTranslation();
  // Sends the user to the full-page error state when the segment is missing or the API returns 422.
  const navigate = useNavigate();
  const exerciseType = EXERCISE_TYPE_MAP.has(exerciseTypeProp) ? exerciseTypeProp : "drag_to_gap";

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("description");

  // ── Form — description tab ────────────────────────────────────────────────
  const [prompt,       setPrompt]       = useState("");
  const [language,     setLanguage]     = useState<string>(LANGUAGE_PREF_VALUES[0]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [difficulty,   setDifficulty]   = useState<string>(DIFFICULTY_VALUES[1]);
  const [gapCount,     setGapCount]     = useState("auto");
  const [pairCount,    setPairCount]    = useState("auto");
  const [gapType, setGapType] = useState(
    () => EXERCISE_TYPE_MAP.get(exerciseTypeProp)?.defaultGapType
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
  const [step,              setStep]              = useState<Step>("configure");
  const [generatedBlock,    setGeneratedBlock]    = useState<GeneratedBlock | null>(null);
  const [generationWarning, setGenerationWarning] = useState<string | null>(null);
  const [rating, setRating] = useState<"like" | "dislike" | null>(null);
  // Review-step correction UI state — only setters run on reset (values unused until wired to UI).
  const [, setCorrectionText] = useState("");
  const [, setShowCorrection] = useState(false);
  const [, setCorrectionSent] = useState(false);

  // ── Phase 3: quota state ──────────────────────────────────────────────────
  /** "idle" | "loading" | "ok" | "error" */
  const [quotaStatus, setQuotaStatus]   = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [tariffData,  setTariffData]    = useState<TariffStatus | null>(null);
  /** Opens the ConnectPaymentModal from the limit-reached state */
  const [showUpgrade, setShowUpgrade]   = useState(false);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setError(null); setSuccessMsg(null); setLoading(false);
      setStep("configure"); setGeneratedBlock(null);
      setGenerationWarning(null); setRating(null);
      setCorrectionText(""); setShowCorrection(false); setCorrectionSent(false);
      setShowUpgrade(false);
    }
  }, [open]);

  // ── Phase 3: fetch quota once when modal opens ────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (quotaStatus === "ok" || quotaStatus === "loading") return; // already loaded

    let mounted = true;
    setQuotaStatus("loading");

    const doFetch = async () => {
      try {
        const base = apiBase || API_BASE_URL;
        // fetchWithAuth automatically refreshes the access token on 401
        // so this request never fails silently due to an expired token.
        const res = await fetchWithAuth(`${base}/admin/tariffs/me`);
        if (!res.ok) throw new Error("quota fetch failed");
        const data: TariffStatus = await res.json();
        if (mounted) { setTariffData(data); setQuotaStatus("ok"); }
      } catch {
        if (mounted) setQuotaStatus("error");
      }
    };
    void doFetch();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadedFile(e.target.files?.[0] ?? null);
    setError(null);
  };

  // ── Derived quota values ──────────────────────────────────────────────────
  const exerciseLimit = aiLimitFromMe(tariffData?.ai_limits, "exercise_generation", "exercise_generations");
  const exerciseUsed  = tariffData?.ai_usage?.exercise_generations  ?? 0;
  const isAtLimit     = exerciseLimit !== null && exerciseUsed >= exerciseLimit;

  // ── Generate ────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setError(null);
    setSuccessMsg(null);

    if (activeTab === "description" && !prompt.trim()) {
      setError(t("aiExerciseGenerator.errors.descriptionRequired"));
      return;
    }

    if (!isValidSegmentId(segmentId)) {
      onClose();
      navigate(SOMETHING_WENT_WRONG_PATH, { replace: true });
      return;
    }

    setLoading(true);
    try {
      const cfg  = EXERCISE_TYPE_MAP.get(exerciseType) ?? EXERCISE_TYPE_CONFIGS[0];
      const base = apiBase || API_BASE_URL;
      const url   = `${base}/segments/${segmentId}/exercises/${cfg.endpoint}`;

      // Aligns exercise titles/UI language with the teacher's interface language (e.g. Russian).
      const instructionLang = i18n.language?.toLowerCase().startsWith("ru") ? "russian" : "english";
      const contentLang     = language === "Detect automatically" ? "auto" : "english";

      const body: Record<string, unknown> = {
        topic_hint: prompt.trim() || undefined,
        content_language: contentLang,
        instruction_language: instructionLang,
        difficulty,
        gap_count:  gapCount  === "auto" ? "auto" : parseInt(gapCount,  10),
        pair_count: pairCount === "auto" ? "auto" : parseInt(pairCount, 10),
        gap_type:   cfg.showGaps ? gapType : undefined,
      };

      // fetchWithAuth automatically refreshes the access token on 401 and retries,
      // so a mid-session token expiry is handled transparently without user action.
      const res = await fetchWithAuth(url, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (res.status === 402) { setShowUpgrade(true); setLoading(false); return; }
      if (res.status === 422) {
        onClose();
        navigate(SOMETHING_WENT_WRONG_PATH, { replace: true });
        return;
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setError((errBody as { detail?: string }).detail ?? t("aiExerciseGenerator.errors.generationFailed"));
        return;
      }

      const data = await res.json();
      setGeneratedBlock(data.block ?? data);
      setStep("review");
    } catch (e) {
      setError(t("aiExerciseGenerator.errors.network"));
    } finally {
      setLoading(false);
    }
  }, [activeTab, prompt, language, difficulty, gapCount, pairCount, gapType, exerciseType, apiBase, segmentId, t, i18n.language, navigate, onClose]);

  const handleAddToExercise = useCallback(() => {
    if (generatedBlock) onGenerated?.(generatedBlock);
    onClose();
  }, [generatedBlock, onGenerated, onClose]);

  const handleBackFromReview = useCallback(() => {
    setStep("configure"); setGeneratedBlock(null); setGenerationWarning(null);
    setRating(null); setCorrectionText(""); setShowCorrection(false);
    setCorrectionSent(false); setError(null); setSuccessMsg(null);
  }, []);

  if (!open) return null;

  const activeCfg = EXERCISE_TYPE_MAP.get(exerciseType) ?? EXERCISE_TYPE_CONFIGS[0];
  const activeTypeStrings = exerciseTypeStrings(t, activeCfg.type);
  const showQuotaBadge = quotaStatus === "ok" && tariffData !== null;

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
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Sparkles size={16} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>
                  {t("aiExerciseGenerator.title")}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
                  {activeTypeStrings.label} · {activeTypeStrings.description}
                </div>
              </div>
            </div>
            <button
              type="button" onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: 8, border: "none",
                background: C.bg, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                color: C.sub, transition: "background 0.14s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.tint; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.bg; }}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>

          {/* ── Scrollable body ───────────────────────────────────────────── */}
          <div
            className="aeg-scrollable"
            style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}
          >
            {/* Tab switcher (only in configure step) */}
            {step === "configure" && (
              <div style={{ padding: "14px 22px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
                <div style={{
                  display: "flex", gap: 2, background: C.bg,
                  borderRadius: 10, padding: 3,
                }}>
                  {(["description", "materials"] as const).map((tab) => {
                    const labels = {
                      description: t("aiExerciseGenerator.tabs.describe"),
                      materials: t("aiExerciseGenerator.tabs.materials"),
                    };
                    const active = activeTab === tab;
                    return (
                      <button
                        key={tab} type="button"
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
                // ... existing code — ReviewStep unchanged ...
                <div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: C.successBg, borderRadius: 10, padding: "10px 13px",
                    marginBottom: 14, fontSize: 13, color: C.success,
                  }}>
                    <CheckCircle size={15} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                    {t("aiExerciseGenerator.review.success")}
                  </div>
                  <div style={{
                    background: C.bg, borderRadius: 12, padding: "14px",
                    border: `1px solid ${C.border}`, marginBottom: 14,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {activeCfg.icon} {activeTypeStrings.label}
                    </div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
                      {generatedBlock.title || t("aiExerciseGenerator.review.generatedFallback")}
                    </div>
                  </div>
                  {generationWarning && (
                    <div style={{
                      display: "flex", gap: 8, background: C.amberBg,
                      border: `1.5px solid #FDE68A`, borderRadius: 10,
                      padding: "9px 12px", marginBottom: 12, fontSize: 12.5, color: "#92400E",
                    }}>
                      <span style={{ flexShrink: 0 }}>⚠</span>
                      {generationWarning}
                    </div>
                  )}
                  {/* Rating */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                  }}>
                    <span style={{ fontSize: 12, color: C.sub }}>{t("aiExerciseGenerator.review.ratePrompt")}</span>
                    {(["like", "dislike"] as const).map((r) => (
                      <button key={r} type="button" onClick={() => setRating(r)}
                        style={{
                          width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${rating === r ? C.primary : C.border}`,
                          background: rating === r ? C.tint : C.white, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: rating === r ? C.primary : C.muted, transition: "all 0.14s",
                        }}
                      >
                        {r === "like" ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                      </button>
                    ))}
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={handleBackFromReview}
                      style={{
                        flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${C.border}`,
                        background: C.white, color: C.sub, fontSize: 13, fontWeight: 600,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        gap: 6, fontFamily: "inherit",
                      }}
                    >
                      <ArrowLeft size={14} /> {t("aiExerciseGenerator.review.regenerate")}
                    </button>
                    <button type="button" onClick={handleAddToExercise}
                      style={{
                        flex: 2, padding: "10px", borderRadius: 10, border: "none",
                        background: C.primary, color: C.white, fontSize: 13, fontWeight: 600,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        gap: 6, fontFamily: "inherit",
                      }}
                    >
                      <Send size={14} /> {t("aiExerciseGenerator.review.addToExercise")}
                    </button>
                  </div>
                </div>
              )}

              {/* ══════════════ CONFIGURE STEP ══════════════ */}
              {step === "configure" && (<>

                {/* ── Phase 3: Quota badge ─────────────────────────────── */}
                {showQuotaBadge && (
                  <QuotaBadge
                    used={exerciseUsed}
                    limit={exerciseLimit}
                    onUpgrade={() => setShowUpgrade(true)}
                  />
                )}

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
                    fontSize: 12.5, color: C.success,
                  }}>
                    <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    {successMsg}
                  </div>
                )}

                {/* ── Description tab body ─────────────────────────────── */}
                {activeTab === "description" && (
                  <div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {t("aiExerciseGenerator.topicLabel")}
                      </label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={t("aiExerciseGenerator.topicPlaceholder")}
                        rows={3}
                        style={{
                          width: "100%", borderRadius: 10, border: `1.5px solid ${C.border}`,
                          background: C.white, padding: "10px 13px", fontSize: 13,
                          color: C.text, resize: "vertical", outline: "none",
                          fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
                          transition: "border-color 0.14s",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
                        onBlur={(e)  => { e.currentTarget.style.borderColor = C.border;  }}
                      />
                    </div>

                    {/* Language + difficulty */}
                    <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.sub, marginBottom: 5 }}>
                          {t("aiExerciseGenerator.languageField")}
                        </label>
                        <div style={{ position: "relative" }}>
                          <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            style={{
                              width: "100%", padding: "8px 28px 8px 10px", borderRadius: 9,
                              border: `1.5px solid ${C.border}`, background: C.white,
                              fontSize: 12.5, color: C.text, outline: "none", appearance: "none",
                              fontFamily: "inherit", cursor: "pointer",
                            }}
                          >
                            {LANGUAGE_PREF_VALUES.map((v) => (
                              <option key={v} value={v}>
                                {v === "Detect automatically"
                                  ? t("aiExerciseGenerator.contentLanguage.detectAuto")
                                  : t("aiExerciseGenerator.contentLanguage.english")}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={13} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.muted }} />
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.sub, marginBottom: 5 }}>
                          {t("aiExerciseGenerator.difficultyField")}
                        </label>
                        <div style={{ position: "relative" }}>
                          <select
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value)}
                            style={{
                              width: "100%", padding: "8px 28px 8px 10px", borderRadius: 9,
                              border: `1.5px solid ${C.border}`, background: C.white,
                              fontSize: 12.5, color: C.text, outline: "none", appearance: "none",
                              fontFamily: "inherit", cursor: "pointer",
                            }}
                          >
                            {DIFFICULTY_VALUES.map((v, idx) => (
                              <option key={v} value={v}>
                                {t(`aiExerciseGenerator.difficulty.${DIFFICULTY_LABEL_KEYS[idx]}`)}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={13} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.muted }} />
                        </div>
                      </div>
                    </div>

                    {/* Advanced toggle */}
                    <button type="button"
                      onClick={() => setShowAdvanced((v) => !v)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: "none", border: "none", cursor: "pointer",
                        color: C.sub, fontSize: 12.5, fontWeight: 500, padding: 0,
                        fontFamily: "inherit", marginBottom: showAdvanced ? 10 : 0,
                      }}
                    >
                      {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {t("aiExerciseGenerator.advancedSettings")}
                    </button>

                    {showAdvanced && (
                      <div style={{
                        background: C.bg, borderRadius: 10, padding: "12px 13px",
                        border: `1px solid ${C.borderSoft}`, display: "flex", gap: 10, flexWrap: "wrap",
                      }}>
                        {activeCfg.showGaps && (
                          <>
                            <div style={{ flex: "1 1 120px" }}>
                              <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.sub, marginBottom: 5 }}>{t("aiExerciseGenerator.gapsLabel")}</label>
                              <div style={{ position: "relative" }}>
                                <select value={gapCount} onChange={(e) => setGapCount(e.target.value)}
                                  style={{ width: "100%", padding: "7px 24px 7px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.white, fontSize: 12, color: C.text, outline: "none", appearance: "none", fontFamily: "inherit", cursor: "pointer" }}
                                >
                                  {GAP_COUNT_OPTIONS.map((o) => (
                                    <option key={o} value={o.toLowerCase()}>
                                      {o === "Auto" ? t("aiExerciseGenerator.countAuto") : o}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={11} style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.muted }} />
                              </div>
                            </div>
                            <div style={{ flex: "1 1 160px" }}>
                              <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.sub, marginBottom: 5 }}>{t("aiExerciseGenerator.gapTypeLabel")}</label>
                              <div style={{ position: "relative" }}>
                                <select value={gapType} onChange={(e) => setGapType(e.target.value)}
                                  style={{ width: "100%", padding: "7px 24px 7px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.white, fontSize: 12, color: C.text, outline: "none", appearance: "none", fontFamily: "inherit", cursor: "pointer" }}
                                >
                                  {GAP_TYPE_OPTIONS.map((o) => (
                                    <option key={o} value={o}>
                                      {t(`aiExerciseGenerator.gapType.${GAP_TYPE_I18N_KEY[o]}`)}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={11} style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.muted }} />
                              </div>
                            </div>
                          </>
                        )}
                        {activeCfg.showPairs && (
                          <div style={{ flex: "1 1 120px" }}>
                            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.sub, marginBottom: 5 }}>{t("aiExerciseGenerator.pairsLabel")}</label>
                            <div style={{ position: "relative" }}>
                              <select value={pairCount} onChange={(e) => setPairCount(e.target.value)}
                                style={{ width: "100%", padding: "7px 24px 7px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.white, fontSize: 12, color: C.text, outline: "none", appearance: "none", fontFamily: "inherit", cursor: "pointer" }}
                              >
                                {PAIR_COUNT_OPTIONS.map((o) => (
                                  <option key={o} value={o.toLowerCase()}>
                                    {o === "Auto" ? t("aiExerciseGenerator.countAuto") : o}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={11} style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.muted }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Materials tab body ───────────────────────────────── */}
                {activeTab === "materials" && (
                  <div>
                    <div style={{
                      border: `2px dashed ${C.border}`, borderRadius: 12,
                      padding: "20px 16px", textAlign: "center",
                      background: C.bg, cursor: "pointer",
                    }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadedFile ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          <Wand2 size={16} color={C.primary} />
                          <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{uploadedFile.name}</span>
                        </div>
                      ) : (
                        <>
                          <Upload size={22} color={C.muted} strokeWidth={1.8} />
                          <p style={{ marginTop: 8, fontSize: 13, color: C.sub }}>
                            {t("aiExerciseGenerator.materials.dropHint")}
                          </p>
                          <p style={{ marginTop: 4, fontSize: 11.5, color: C.muted }}>
                            {t("aiExerciseGenerator.materials.fileTypes")}
                          </p>
                        </>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx"
                      onChange={handleFileChange}
                      style={{ display: "none" }}
                    />
                  </div>
                )}

                {/* ── Phase 3: Generate button (plan-aware) ────────────── */}
                {isAtLimit ? (
                  /* Limit reached → upgrade CTA replaces generate button */
                  <button
                    type="button"
                    onClick={() => setShowUpgrade(true)}
                    style={{
                      width: "100%", padding: "12px", borderRadius: 12, border: "none",
                      background: "#F3F4F6", color: C.sub, fontSize: 14, fontWeight: 600,
                      cursor: "pointer", letterSpacing: "-0.01em",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      gap: 8, marginTop: 18, fontFamily: "inherit",
                      transition: "background 0.14s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.tint; e.currentTarget.style.color = C.primary; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = C.sub; }}
                  >
                    <Zap size={15} strokeWidth={2.2} />
                    {t("aiExerciseGenerator.limitCta")}
                  </button>
                ) : (
                  /* Normal generate button */
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
                    onMouseDown={(e)  => { if (!loading) e.currentTarget.style.transform = "scale(0.99)"; }}
                    onMouseUp={(e)    => { e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    {loading ? (
                      <><Spinner size={16} color={C.white} />{t("aiExerciseGenerator.generating")}</>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                          <path d="M8 1.5l1.5 4h4l-3.2 2.5 1.2 4L8 9.5 4.5 12l1.2-4L2.5 5.5h4L8 1.5z"
                            fill="white" stroke="white" strokeWidth="0.5"/>
                        </svg>
                        {t("aiExerciseGenerator.generate", { label: activeTypeStrings.label })}
                      </>
                    )}
                  </button>
                )}

              </>)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Phase 3: ConnectPaymentModal for upgrade flow ─────────────────── */}
      {showUpgrade && (
        <ConnectPaymentModal
          key="exercise-upgrade"
          open
          onClose={() => setShowUpgrade(false)}
          durationLabel={t("aiExerciseGenerator.upgradeModal.durationLabel")}
          planName={t("aiExerciseGenerator.upgradeModal.planName")}
          priceLabel={t("aiExerciseGenerator.upgradeModal.priceLabel")}
          planTagLabels={[
            t("aiExerciseGenerator.upgradeModal.planTag1"),
            t("aiExerciseGenerator.upgradeModal.planTag2"),
            t("aiExerciseGenerator.upgradeModal.planTag3"),
          ]}
          yearSavingsLabel={t("aiExerciseGenerator.upgradeModal.yearSavings")}
          amountUsd={12}
          planCode="standard"
          billingPeriod="1m"
          onPay={async () => {
            setShowUpgrade(false);
          }}
        />
      )}
    </>
  );
}