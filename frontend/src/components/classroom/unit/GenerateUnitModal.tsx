/**
 * GenerateUnitModal.tsx
 *
 * Full-unit AI generation modal.
 * Tab 1 — "AI Generate":  POST /units/{unit_id}/generate  (topic + description)
 * Tab 2 — "From File":    POST /units/{unit_id}/generate/from-file  (multipart)
 *
 * Phase 3 addition: unit-generation quota badge.
 * - Fetches GET /admin/tariffs/me once when the modal opens.
 * - Shows "X of Y unit generations used this month".
 * - If used >= limit: disables generate button and shows "Monthly limit reached · Upgrade".
 * - If plan is Pro (limit === null): shows "Unlimited" and keeps button enabled.
 * - Upgrade click opens ConnectPaymentModal (imported below).
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  X, Sparkles, Layers, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Upload, FileText, Trash2,
  Image as ImageIcon, BookOpen, Zap,
} from "lucide-react";
import ConnectPaymentModal from "../../../pages/admin/components/ConnectPaymentModal";

// ── Design tokens ──────────────────────────────────────────────────────────────
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
  error:      "#EF4444",
  errorBg:    "#FEF2F2",
  success:    "#10B981",
  successBg:  "#ECFDF5",
  amber:      "#F59E0B",
  amberBg:    "#FFFBEB",
};

// ── Constants (unchanged) ──────────────────────────────────────────────────────
interface ExerciseOption { value: string; label: string; icon: string; description: string; }

const EXERCISE_OPTIONS: ExerciseOption[] = [
  { value: "drag_to_gap",      label: "Drag to Gap",    icon: "✦", description: "Drag word chips into gaps" },
  { value: "type_word_in_gap", label: "Type in Gap",    icon: "⌨", description: "Type the missing word"    },
  { value: "select_word_form", label: "Select Form",    icon: "▾", description: "Pick the correct word form" },
  { value: "match_pairs",      label: "Match Pairs",    icon: "⇌", description: "Match terms to definitions" },
  { value: "build_sentence",   label: "Build Sentence", icon: "⬛", description: "Rearrange shuffled words"  },
  { value: "order_paragraphs", label: "Order Paragraphs", icon: "↕", description: "Sort scrambled paragraphs" },
  { value: "sort_into_columns", label: "Sort Columns",  icon: "⊞", description: "Sort items into categories" },
  { value: "true_false",       label: "True/False",     icon: "✓✗", description: "Mark statements"         },
];

const LEVEL_OPTIONS       = ["A1", "A2", "B1", "B2", "C1", "C2"];
const LANGUAGE_OPTIONS    = ["English", "Russian", "German", "French", "Spanish"];
const INSTRUCTION_LANGS   = [{ value: "english", label: "English" }, { value: "russian", label: "Russian" }];
const SEGMENT_OPTIONS     = [1, 2, 3, 4, 5, 6];

// ── Quota types ───────────────────────────────────────────────────────────────
interface TariffStatus {
  plan: string;
  ai_limits: {
    exercise_generations: number | null;
    unit_generations:     number | null;
    course_generations:   number | null;
  };
  ai_usage: {
    exercise_generations: number;
    unit_generations:     number;
    course_generations:   number;
  };
}

// ── GenerateResult (unchanged) ────────────────────────────────────────────────
interface SegmentResult {
  id:            number;
  title:         string;
  order_index:   number;
  blocks_created: number;
}
interface GenerateResult {
  unit_id:           number;
  segments_created:  number;
  segments:          SegmentResult[];
  images_generated?: number;
  warning?:          string;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  unitId:     number;
  unitTitle?: string;
  apiBase?:   string;
  onClose:    () => void;
  onSuccess?: (result: GenerateResult) => void;
}

type Tab = "ai" | "file";

// ── Helpers (unchanged from original) ────────────────────────────────────────
async function parseJsonPayload<T>(response: Response, fallbackMessage: string): Promise<T> {
  const responseBodyText = await response.text();
  if (!responseBodyText || !responseBodyText.trim()) throw new Error(fallbackMessage);
  try { return JSON.parse(responseBodyText) as T; }
  catch { throw new Error(responseBodyText || fallbackMessage); }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Spinner({ size = 20, color = C.primary }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `2px solid ${color}33`, borderTopColor: color,
      animation: "gu-spin 0.7s linear infinite", flexShrink: 0,
    }} aria-hidden />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 7, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
      {children}
    </div>
  );
}

function Select({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[] | Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "9px 28px 9px 11px", borderRadius: 9,
          border: `1.5px solid ${C.border}`, background: C.white,
          fontSize: 13, color: C.text, outline: "none", appearance: "none",
          fontFamily: "inherit", cursor: "pointer",
        }}
      >
        {options.map((o) => {
          const val   = typeof o === "string" ? o : o.value;
          const label = typeof o === "string" ? o : o.label;
          return <option key={val} value={val}>{label}</option>;
        })}
      </select>
      <ChevronDown size={13} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.muted }} />
    </div>
  );
}

// ── Phase 3: Unit QuotaBadge ──────────────────────────────────────────────────
function UnitQuotaBadge({
  used, limit, onUpgrade,
}: {
  used: number;
  limit: number | null;
  onUpgrade: () => void;
}) {
  const isUnlimited = limit === null;
  const isAtLimit   = !isUnlimited && used >= limit!;
  const pct         = isUnlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit!)) * 100));
  const isWarning   = !isUnlimited && pct >= 70 && pct < 90;
  const isDanger    = !isUnlimited && pct >= 90;

  const bgColor     = isDanger ? "#FEF2F2" : isWarning ? "#FFFBEB" : C.tint;
  const textColor   = isDanger ? C.error   : isWarning ? C.amber   : C.primary;
  const barColor    = isDanger ? "#EF4444" : isWarning ? "#F59E0B" : C.primary;
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
              ? "Unlimited unit generations"
              : isAtLimit
                ? "Monthly limit reached"
                : `${used} of ${limit} unit generations used this month`
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
              onMouseLeave={(e) => { e.currentTarget.style.background = C.primary;   }}
            >
              Upgrade →
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

// ── AdvancedPanel (extracted sub-component, unchanged logic) ──────────────────
function AdvancedPanel({
  level, setLevel, language, setLanguage,
  numSegments, setNumSegments,
  selectedTypes, toggleType,
  instructionLang, setInstructionLang,
  includeImages, setIncludeImages,
}: {
  level: string; setLevel: (v: string) => void;
  language: string; setLanguage: (v: string) => void;
  numSegments: number; setNumSegments: (v: number) => void;
  selectedTypes: Set<string>; toggleType: (v: string) => void;
  instructionLang: string; setInstructionLang: (v: string) => void;
  includeImages: boolean; setIncludeImages: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 16, marginTop: 4 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Label>Level</Label>
          <Select value={level} onChange={setLevel} options={LEVEL_OPTIONS} />
        </div>
        <div style={{ flex: 1 }}>
          <Label>Language</Label>
          <Select value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} />
        </div>
        <div style={{ flex: 1 }}>
          <Label>Segments</Label>
          <Select value={String(numSegments)} onChange={(v) => setNumSegments(Number(v))} options={SEGMENT_OPTIONS.map(String)} />
        </div>
      </div>

      <div>
        <Label>Exercise types</Label>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 7 }}>
          {EXERCISE_OPTIONS.map((opt) => {
            const sel = selectedTypes.has(opt.value);
            return (
              <button key={opt.value} type="button" onClick={() => toggleType(opt.value)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${sel ? C.primary : C.border}`,
                  background: sel ? C.tint : C.white, color: sel ? C.primaryDk : C.sub,
                  fontSize: 12, fontWeight: sel ? 600 : 500,
                  cursor: "pointer", transition: "all 0.12s", fontFamily: "inherit",
                }}
              >
                <span style={{ fontSize: 13 }}>{opt.icon}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5 }}>
          All selected types will be distributed across segments.
          {selectedTypes.size > 0 && (
            <span style={{ color: C.sub, fontWeight: 600 }}>
              {" "}({selectedTypes.size} type{selectedTypes.size > 1 ? "s" : ""} × {numSegments} segment{numSegments > 1 ? "s" : ""})
            </span>
          )}
        </div>
      </div>

      <div>
        <Label>Instruction Language</Label>
        <Select value={instructionLang} onChange={setInstructionLang} options={INSTRUCTION_LANGS} />
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5 }}>
          Language used for exercise titles and UI labels shown to students.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Include Images</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Adds SVG illustrations (+30–60 s)</div>
        </div>
        <button type="button" role="switch" aria-checked={includeImages}
          onClick={() => setIncludeImages(!includeImages)}
          style={{
            width: 40, height: 22, borderRadius: 11, border: "none",
            background: includeImages ? C.primary : C.border,
            cursor: "pointer", position: "relative", flexShrink: 0,
            transition: "background 0.16s",
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: includeImages ? 20 : 3,
            width: 16, height: 16, borderRadius: "50%", background: C.white,
            transition: "left 0.16s", boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
          }} />
        </button>
      </div>
    </div>
  );
}

// ── Success view (unchanged) ──────────────────────────────────────────────────
function SuccessView({
  result, onClose, onGenerateMore,
}: {
  result: GenerateResult;
  onClose: () => void;
  onGenerateMore: () => void;
}) {
  return (
    <div style={{ padding: "24px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: C.successBg, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CheckCircle size={20} color={C.success} strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Generation complete!</div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 1 }}>
            {result.segments_created} segment{result.segments_created !== 1 ? "s" : ""} created
            {result.images_generated ? ` · ${result.images_generated} image${result.images_generated !== 1 ? "s" : ""}` : ""}
          </div>
        </div>
      </div>

      {result.warning && (
        <div style={{
          display: "flex", gap: 8, background: C.amberBg,
          border: `1.5px solid #FDE68A`, borderRadius: 10,
          padding: "9px 12px", marginBottom: 14, fontSize: 12.5, color: "#92400E",
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {result.warning}
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        {result.segments.map((seg, idx) => (
          <div key={seg.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
            borderRadius: 9, background: idx % 2 === 0 ? C.bg : C.white,
            border: `1px solid ${C.borderSoft}`, marginBottom: 5,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              background: C.tint, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: C.primary, flexShrink: 0,
            }}>
              {idx + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {seg.title}
              </div>
              <div style={{ fontSize: 11.5, color: C.muted }}>
                {seg.blocks_created} block{seg.blocks_created !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onGenerateMore} style={{
          flex: 1, padding: "11px", borderRadius: 10,
          border: `1.5px solid ${C.border}`, background: C.white,
          color: C.sub, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>
          Generate more
        </button>
        <button onClick={onClose} style={{
          flex: 2, padding: "11px", borderRadius: 10, border: "none",
          background: C.primary, color: C.white, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>
          Done
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
// Resolve the API base from the build-time env var so that production static
// deployments (where Vite's dev-server proxy is not running) reach the real
// backend instead of hitting the static host's catch-all rewrite.
const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE_URL || "/api/v1";

export default function GenerateUnitModal({
  unitId, unitTitle, apiBase = DEFAULT_API_BASE, onClose, onSuccess,
}: Props) {
  // Tab
  const [activeTab, setActiveTab] = useState<Tab>("ai");

  // AI tab state
  const [topic,       setTopic]       = useState("");
  const [description, setDescription] = useState("");

  // File tab state
  const [file,       setFile]       = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared advanced state
  const [level,           setLevel]           = useState("A2");
  const [language,        setLanguage]        = useState("English");
  const [numSegments,     setNumSegments]     = useState(3);
  const [selectedTypes,   setSelectedTypes]   = useState<Set<string>>(
    new Set(["drag_to_gap", "match_pairs"])
  );
  const [instructionLang, setInstructionLang] = useState("english");
  const [showAdvanced,    setShowAdvanced]    = useState(false);
  const [includeImages,   setIncludeImages]   = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<GenerateResult | null>(null);

  // ── Phase 3: quota state ──────────────────────────────────────────────────
  const [quotaStatus, setQuotaStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [tariffData,  setTariffData]  = useState<TariffStatus | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const toggleType = useCallback((value: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(value)) {
        if (next.size === 1) return prev;
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }, []);

  // ── Phase 3: fetch quota once on open ────────────────────────────────────
  useEffect(() => {
    if (quotaStatus === "ok" || quotaStatus === "loading") return;
    let mounted = true;
    setQuotaStatus("loading");
    const doFetch = async () => {
      try {
        const token = localStorage.getItem("token") ?? "";
        const res = await fetch(`${apiBase}/admin/tariffs/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
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
  }, []);

  // ── Derived quota values ──────────────────────────────────────────────────
  const unitLimit  = tariffData?.ai_limits?.unit_generations ?? null;
  const unitUsed   = tariffData?.ai_usage?.unit_generations  ?? 0;
  const isAtLimit  = unitLimit !== null && unitUsed >= unitLimit;
  const showQuota  = quotaStatus === "ok" && tariffData !== null;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic before generating.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(`${apiBase}/units/${unitId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          topic: topic.trim(),
          description: description.trim() || undefined,
          level, language, num_segments: numSegments,
          exercise_types: Array.from(selectedTypes),
          instruction_language: instructionLang,
          include_images: includeImages,
        }),
      });
      if (res.status === 402) { setShowUpgrade(true); return; }
      if (!res.ok) {
        const data = await parseJsonPayload<{ detail?: string }>(res, "Generation failed.");
        throw new Error(data.detail ?? "Generation failed.");
      }
      const data = await parseJsonPayload<GenerateResult>(res, "Unexpected empty response.");
      setResult(data);
      onSuccess?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFromFile = async () => {
    if (!file) { setError("Please select a file."); return; }
    setError(null);
    setLoading(true);
    try {
      const token = localStorage.getItem("token") ?? "";
      const form  = new FormData();
      form.append("file", file);
      form.append("level", level);
      form.append("language", language);
      form.append("num_segments", String(numSegments));
      form.append("exercise_types", JSON.stringify(Array.from(selectedTypes)));
      form.append("instruction_language", instructionLang);
      form.append("include_images", String(includeImages));

      const res = await fetch(`${apiBase}/units/${unitId}/generate/from-file`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.status === 402) { setShowUpgrade(true); return; }
      if (!res.ok) {
        const data = await parseJsonPayload<{ detail?: string }>(res, "Generation failed.");
        throw new Error(data.detail ?? "Generation failed.");
      }
      const data = await parseJsonPayload<GenerateResult>(res, "Unexpected empty response.");
      setResult(data);
      onSuccess?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { setResult(null); onClose(); };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`@keyframes gu-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Overlay */}
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(28,31,58,0.40)", backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9998, padding: "20px 16px",
        }}
      >
        {/* Modal card */}
        <div style={{
          background: C.white, borderRadius: 18, width: "100%", maxWidth: 560,
          boxShadow: "0 12px 60px rgba(28,31,58,0.22)",
          maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "18px 22px 14px", borderBottom: `1px solid ${C.borderSoft}`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: `linear-gradient(135deg, ${C.primary} 0%, #9333ea 100%)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Sparkles size={17} color="#fff" strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>
                  Generate Unit
                </div>
                {unitTitle && (
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
                    {unitTitle}
                  </div>
                )}
              </div>
            </div>
            <button type="button" onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: 8, border: "none",
                background: C.bg, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.sub,
              }}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>

          {/* ── Scrollable content ─────────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>

            {/* ── Success view ───────────────────────────────────────────── */}
            {result ? (
              <SuccessView result={result} onClose={handleClose} onGenerateMore={() => setResult(null)} />
            ) : (
              <div style={{ padding: "18px 22px 22px" }}>

                {/* Tab switcher */}
                <div style={{
                  display: "flex", gap: 2, background: C.bg,
                  borderRadius: 10, padding: 3, marginBottom: 18,
                }}>
                  {(["ai", "file"] as const).map((tab) => {
                    const labels: Record<typeof tab, string> = { ai: "AI Generate", file: "From File" };
                    const active = activeTab === tab;
                    return (
                      <button key={tab} type="button" onClick={() => { setActiveTab(tab); setError(null); }}
                        style={{
                          flex: 1, padding: "8px 0", fontSize: 13,
                          fontWeight: active ? 600 : 500, borderRadius: 8, border: "none",
                          cursor: "pointer", color: active ? C.text : C.sub,
                          background: active ? C.white : "transparent",
                          boxShadow: active ? "0 1px 4px rgba(60,64,120,0.10)" : "none",
                          transition: "background 0.16s, color 0.16s",
                          fontFamily: "inherit",
                        }}
                      >
                        {labels[tab]}
                      </button>
                    );
                  })}
                </div>

                {/* ── Phase 3: Unit quota badge ─────────────────────────── */}
                {showQuota && (
                  <UnitQuotaBadge
                    used={unitUsed}
                    limit={unitLimit}
                    onUpgrade={() => setShowUpgrade(true)}
                  />
                )}

                {/* Error banner */}
                {error && (
                  <div style={{
                    display: "flex", gap: 8,
                    background: C.errorBg, border: `1.5px solid #FECACA`,
                    borderRadius: 10, padding: "10px 13px", marginBottom: 14,
                    fontSize: 12.5, color: C.error,
                  }}>
                    <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    {error}
                  </div>
                )}

                {/* ── AI tab ─────────────────────────────────────────────── */}
                {activeTab === "ai" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                      <Label>Topic *</Label>
                      <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="e.g. Present Perfect Tense, Vocabulary: Travel"
                        style={{
                          width: "100%", padding: "10px 12px", borderRadius: 10,
                          border: `1.5px solid ${C.border}`, background: C.white,
                          fontSize: 13, color: C.text, outline: "none",
                          fontFamily: "inherit", boxSizing: "border-box",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
                        onBlur={(e)  => { e.currentTarget.style.borderColor = C.border;  }}
                      />
                    </div>
                    <div>
                      <Label>Description (optional)</Label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Extra context, focus areas, student level details…"
                        rows={2}
                        style={{
                          width: "100%", padding: "10px 12px", borderRadius: 10,
                          border: `1.5px solid ${C.border}`, background: C.white,
                          fontSize: 13, color: C.text, outline: "none", resize: "vertical",
                          fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
                        onBlur={(e)  => { e.currentTarget.style.borderColor = C.border;  }}
                      />
                    </div>
                  </div>
                )}

                {/* ── File tab ───────────────────────────────────────────── */}
                {activeTab === "file" && (
                  <div>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault(); setIsDragging(false);
                        setFile(e.dataTransfer.files?.[0] ?? null);
                      }}
                      style={{
                        border: `2px dashed ${isDragging ? C.primary : C.border}`,
                        borderRadius: 12, padding: "24px 16px", textAlign: "center",
                        background: isDragging ? C.tint : C.bg, cursor: "pointer",
                        transition: "all 0.16s",
                      }}
                    >
                      {file ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          <FileText size={16} color={C.primary} />
                          <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{file.name}</span>
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); setFile(null); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 2 }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload size={22} color={C.muted} strokeWidth={1.8} />
                          <p style={{ marginTop: 8, fontSize: 13, color: C.sub }}>
                            Drop a PDF or Word document, or click to browse
                          </p>
                          <p style={{ marginTop: 3, fontSize: 11.5, color: C.muted }}>
                            .pdf, .docx — max 20 MB
                          </p>
                        </>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept=".pdf,.docx"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      style={{ display: "none" }}
                    />
                  </div>
                )}

                {/* ── Advanced settings ──────────────────────────────────── */}
                <div style={{ marginTop: 16 }}>
                  <button type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: "none", border: "none", cursor: "pointer",
                      color: C.sub, fontSize: 12.5, fontWeight: 500, padding: 0,
                      fontFamily: "inherit",
                    }}
                  >
                    {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    Advanced settings
                  </button>

                  {showAdvanced && (
                    <div style={{
                      marginTop: 10, background: C.bg, borderRadius: 10,
                      padding: "14px 13px", border: `1px solid ${C.borderSoft}`,
                    }}>
                      <AdvancedPanel
                        level={level} setLevel={setLevel}
                        language={language} setLanguage={setLanguage}
                        numSegments={numSegments} setNumSegments={setNumSegments}
                        selectedTypes={selectedTypes} toggleType={toggleType}
                        instructionLang={instructionLang} setInstructionLang={setInstructionLang}
                        includeImages={includeImages} setIncludeImages={setIncludeImages}
                      />
                    </div>
                  )}
                </div>

                {loading && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: C.tint, borderRadius: 10, padding: "10px 14px",
                    marginTop: 14,
                  }}>
                    <Layers size={14} color={C.primary} strokeWidth={2} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: C.primaryDk, lineHeight: 1.5 }}>
                      Generating <strong>{numSegments} segment{numSegments > 1 ? "s" : ""}</strong>
                      {" "}with text blocks, exercises{includeImages ? ", and illustrations" : ""}.
                      {" "}This may take {includeImages ? "60–120" : "20–60"} seconds.
                    </span>
                  </div>
                )}

                {/* ── Phase 3: Generate button (plan-aware) ────────────── */}
                {isAtLimit ? (
                  /* Limit reached → upgrade CTA */
                  <button
                    type="button"
                    onClick={() => setShowUpgrade(true)}
                    style={{
                      width: "100%", padding: "13px", borderRadius: 12, border: "none",
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
                    Monthly limit reached · Upgrade
                  </button>
                ) : (
                  /* Normal generate button */
                  <button
                    onClick={activeTab === "ai" ? handleGenerate : handleGenerateFromFile}
                    disabled={loading}
                    style={{
                      width: "100%", padding: "13px", borderRadius: 12, border: "none",
                      background: loading ? C.primaryDk : C.primary,
                      color: C.white, fontSize: 14, fontWeight: 600,
                      cursor: loading ? "not-allowed" : "pointer",
                      letterSpacing: "-0.01em", transition: "background 0.15s, transform 0.1s",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      gap: 8, marginTop: 18, fontFamily: "inherit", opacity: loading ? 0.88 : 1,
                    }}
                    onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = C.primaryDk; }}
                    onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = C.primary;   }}
                    onMouseDown={(e)  => { if (!loading) e.currentTarget.style.transform = "scale(0.99)"; }}
                    onMouseUp={(e)    => { e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    {loading ? (
                      <>
                        <Spinner size={16} color={C.white} />
                        Generating content…
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                          <path d="M8 1.5l1.5 4h4l-3.2 2.5 1.2 4L8 9.5 4.5 12l1.2-4L2.5 5.5h4L8 1.5z"
                            fill="white" stroke="white" strokeWidth="0.5" />
                        </svg>
                        {activeTab === "ai"
                          ? `Generate ${numSegments} Segment${numSegments > 1 ? "s" : ""}`
                          : "Generate from File"
                        }
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Phase 3: ConnectPaymentModal for upgrade flow ─────────────────── */}
      {showUpgrade && (
        <ConnectPaymentModal
          key="unit-upgrade"
          open
          onClose={() => setShowUpgrade(false)}
          durationLabel="1 mo"
          planName="Standard"
          priceLabel="12.00 USD"
          planTagLabels={[
            "AI unit generations: 20 / mo",
            "AI exercise generations: 100 / mo",
            "Publish to students: ✓",
          ]}
          yearSavingsLabel="If you pay for 1 year you could save: 27 USD"
          onPay={async () => {
            setShowUpgrade(false);
          }}
        />
      )}
    </>
  );
}