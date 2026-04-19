/**
 * GenerateUnitModal.tsx
 *
 * Full-unit AI generation modal.
 * Tab 1 — "AI Generate":  POST /units/{unit_id}/generate  (topic + description)
 * Tab 2 — "From File":    POST /units/{unit_id}/generate/from-file  (multipart)
 *
 * Each generated segment now includes:
 *   • A text block  (grammar rules, vocabulary, examples — always)
 *   • Exercise blocks (interactive exercises)
 *   • An image block (SVG illustration — only when "Include Images" is toggled on)
 */

import { useState, useCallback, useRef } from "react";
import {
  X, Sparkles, Layers, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Upload, FileText, Trash2,
  Image as ImageIcon, BookOpen,
} from "lucide-react";

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

// ── Constants ──────────────────────────────────────────────────────────────────
interface ExerciseOption { value: string; label: string; icon: string; description: string; }

const EXERCISE_OPTIONS: ExerciseOption[] = [
  { value: "drag_to_gap",        label: "Drag to Gap",       icon: "✦",  description: "Drag word chips into gaps" },
  { value: "type_word_in_gap",   label: "Type in Gap",        icon: "⌨",  description: "Type the missing word" },
  { value: "select_word_form",   label: "Select Form",        icon: "▾",  description: "Pick the correct word form" },
  { value: "match_pairs",        label: "Match Pairs",        icon: "⇌",  description: "Match terms to definitions" },
  { value: "build_sentence",     label: "Build Sentence",     icon: "⬛", description: "Rearrange shuffled words" },
  { value: "order_paragraphs",   label: "Order Paragraphs",   icon: "↕",  description: "Sequence paragraphs correctly" },
  { value: "sort_into_columns",  label: "Sort into Columns",  icon: "⊞",  description: "Sort words into categories" },
  { value: "test_without_timer", label: "Test (no timer)",    icon: "📋", description: "Multiple-choice quiz" },
  { value: "test_with_timer",    label: "Test (timer)",       icon: "⏱",  description: "Timed multiple-choice quiz" },
  { value: "true_false",         label: "True / False",       icon: "✓✗", description: "True or false statements" },
];

const CEFR_LEVELS    = ["A1", "A2", "B1", "B2", "C1", "C2"];
const LANGUAGE_OPTIONS = [
  "English", "Spanish", "French", "German", "Italian",
  "Portuguese", "Russian", "Chinese", "Japanese", "Arabic",
];
const INSTRUCTION_LANGS = [
  { value: "english",    label: "English" },
  { value: "russian",    label: "Russian" },
  { value: "spanish",    label: "Spanish" },
  { value: "french",     label: "French" },
  { value: "german",     label: "German" },
  { value: "italian",    label: "Italian" },
  { value: "portuguese", label: "Portuguese" },
];

const ACCEPTED_EXT = ".pdf,.docx,.txt,.ppt,.pptx";

// ── Types ──────────────────────────────────────────────────────────────────────
interface GenerateResult {
  segments_created:  number;
  exercises_created: number;
  texts_created:     number;
  images_created:    number;
  segments: Array<{
    id:                number;
    title:             string;
    exercises_created: number;
    exercise_types:    string[];
    texts_created:     number;
    has_image:         boolean;
  }>;
}

interface Props {
  unitId:    number;
  unitTitle?: string;
  apiBase?:  string;
  onClose:   () => void;
  onSuccess?: (result: GenerateResult) => void;
}

type Tab = "ai" | "file";

async function parseJsonPayload<T>(response: Response, fallbackMessage: string): Promise<T> {
  const responseBodyText = await response.text();
  if (!responseBodyText || !responseBodyText.trim()) throw new Error(fallbackMessage);
  try {
    return JSON.parse(responseBodyText) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  const defaultErrorMessage = `Server error ${response.status}`;
  try {
    const errorBodyText = await response.text();
    if (!errorBodyText || !errorBodyText.trim()) return defaultErrorMessage;
    const parsedError = JSON.parse(errorBodyText) as { detail?: string; message?: string };
    return parsedError.detail || parsedError.message || defaultErrorMessage;
  } catch {
    return defaultErrorMessage;
  }
}

// ── Micro components ───────────────────────────────────────────────────────────
function Spinner({ size = 18, color = C.primary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 600, color: C.sub,
      letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function Select({ value, options, onChange }: {
  value: string;
  options: Array<{ value: string; label: string } | string>;
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: "100%", padding: "9px 12px", borderRadius: 10,
      border: `1.5px solid ${C.border}`, background: C.white,
      fontSize: 13.5, color: C.text, outline: "none",
      cursor: "pointer", appearance: "none", fontFamily: "inherit",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B6F8E' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 12px center",
      paddingRight: 32,
    }}>
      {options.map(opt => {
        const v = typeof opt === "string" ? opt : opt.value;
        const l = typeof opt === "string" ? opt : opt.label;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

// ── Toggle switch ──────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label, sublabel }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px", borderRadius: 12,
        border: `1.5px solid ${checked ? C.border : C.borderSoft}`,
        background: checked ? C.tint : C.white,
        cursor: "pointer", transition: "all 0.15s",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: checked ? C.primary : C.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s",
        }}>
          <ImageIcon size={15} color={checked ? C.white : C.muted} strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{label}</div>
          {sublabel && (
            <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>{sublabel}</div>
          )}
        </div>
      </div>
      {/* Pill switch */}
      <div style={{
        width: 40, height: 22, borderRadius: 11, flexShrink: 0,
        background: checked ? C.primary : C.muted,
        position: "relative", transition: "background 0.2s",
      }}>
        <div style={{
          position: "absolute", top: 3,
          left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: 8,
          background: C.white,
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
    </div>
  );
}

// ── What's always included info strip ─────────────────────────────────────────
function AlwaysIncludedStrip() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 13px", borderRadius: 10,
      background: C.bg, border: `1px solid ${C.borderSoft}`,
    }}>
      <BookOpen size={14} color={C.primary} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>
        Each segment always includes a <strong style={{ color: C.text }}>text block</strong> — grammar rules,
        vocabulary, and examples in Markdown.
      </span>
    </div>
  );
}

// ── Advanced Settings (shared between both tabs) ───────────────────────────────
function AdvancedSettings({
  level, setLevel,
  language, setLanguage,
  numSegments, setNumSegments,
  selectedTypes, toggleType,
  instructionLang, setInstructionLang,
}: {
  level: string; setLevel: (v: string) => void;
  language: string; setLanguage: (v: string) => void;
  numSegments: number; setNumSegments: (n: number) => void;
  selectedTypes: Set<string>; toggleType: (v: string) => void;
  instructionLang: string; setInstructionLang: (v: string) => void;
}) {
  return (
    <div style={{
      borderTop: `1px solid ${C.borderSoft}`,
      paddingTop: 16,
      display: "flex", flexDirection: "column", gap: 16,
    }}>
      {/* Level + Language */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <Label>CEFR Level</Label>
          <Select value={level} onChange={setLevel}
            options={CEFR_LEVELS.map(l => ({ value: l, label: l }))} />
        </div>
        <div>
          <Label>Language</Label>
          <Select value={language} onChange={setLanguage}
            options={LANGUAGE_OPTIONS.map(l => ({ value: l, label: l }))} />
        </div>
      </div>

      {/* Segments */}
      <div>
        <Label>Number of Segments</Label>
        <div style={{ display: "flex", gap: 7 }}>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <button key={n} onClick={() => setNumSegments(n)} style={{
              flex: 1, padding: "8px 0", borderRadius: 9, border: "1.5px solid",
              borderColor: numSegments === n ? C.primary : C.border,
              background: numSegments === n ? C.tint : C.white,
              color: numSegments === n ? C.primaryDk : C.sub,
              fontSize: 13.5, fontWeight: numSegments === n ? 700 : 500,
              cursor: "pointer", transition: "all 0.12s", fontFamily: "inherit",
            }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise types */}
      <div>
        <Label>Exercise Types</Label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {EXERCISE_OPTIONS.map(opt => {
            const active = selectedTypes.has(opt.value);
            return (
              <button key={opt.value} onClick={() => toggleType(opt.value)}
                title={opt.description} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 20, border: "1.5px solid",
                  borderColor: active ? C.primary : C.border,
                  background: active ? C.tint : C.white,
                  color: active ? C.primaryDk : C.sub,
                  fontSize: 12.5, fontWeight: active ? 600 : 500,
                  cursor: "pointer", transition: "all 0.12s", fontFamily: "inherit",
                }}>
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

      {/* Instruction language */}
      <div>
        <Label>Instruction Language</Label>
        <Select value={instructionLang} onChange={setInstructionLang}
          options={INSTRUCTION_LANGS} />
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5 }}>
          Language used for exercise titles and UI labels shown to students.
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function GenerateUnitModal({
  unitId, unitTitle, apiBase = "/api/v1", onClose, onSuccess,
}: Props) {
  // Tab
  const [activeTab, setActiveTab] = useState<Tab>("ai");

  // AI tab state
  const [topic,       setTopic]       = useState("");
  const [description, setDescription] = useState("");

  // File tab state
  const [file,        setFile]        = useState<File | null>(null);
  const [isDragging,  setIsDragging]  = useState(false);
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

  // Image toggle (opt-in — adds latency)
  const [includeImages, setIncludeImages] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<GenerateResult | null>(null);

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

  // ── Handlers ─────────────────────────────────────────────────────────────────
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
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          topic:                topic.trim(),
          description:          description.trim() || undefined,
          level,
          language,
          num_segments:         numSegments,
          exercise_types:       Array.from(selectedTypes),
          instruction_language: instructionLang,
          include_images:       includeImages,
        }),
      });
      if (!res.ok) throw new Error(await parseErrorMessage(res));
      const data = await parseJsonPayload<GenerateResult>(
        res, "Generation finished but the server returned an empty or invalid response.",
      );
      setResult(data);
      onSuccess?.(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFromFile = async () => {
    if (!file) {
      setError("Please upload a file before generating.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const token = localStorage.getItem("token") ?? "";
      const formData = new FormData();
      formData.append("file", file);
      formData.append("level", level);
      formData.append("language", language);
      formData.append("num_segments", String(numSegments));
      formData.append("exercise_types", Array.from(selectedTypes).join(","));
      formData.append("instruction_language", instructionLang);
      formData.append("include_images", String(includeImages));

      const res = await fetch(`${apiBase}/units/${unitId}/generate/from-file`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error(await parseErrorMessage(res));
      const data = await parseJsonPayload<GenerateResult>(
        res, "Generation finished but the server returned an empty or invalid response.",
      );
      setResult(data);
      onSuccess?.(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── File drag & drop ──────────────────────────────────────────────────────────
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) setFile(picked);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleClose = () => { if (!loading) onClose(); };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div onClick={handleClose} style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(15, 16, 40, 0.45)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }} />

      {/* Modal */}
      <div role="dialog" aria-modal="true" aria-label="Generate Unit Content"
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "20px",
          pointerEvents: "none",
        }}
      >
        <div style={{
          width: "100%", maxWidth: 560,
          maxHeight: "92vh", overflowY: "auto",
          background: C.white, borderRadius: 20,
          boxShadow: "0 24px 80px rgba(108,111,239,0.18), 0 4px 16px rgba(0,0,0,0.08)",
          pointerEvents: "all",
          display: "flex", flexDirection: "column",
        }}>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "22px 24px 0",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: C.tint,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Sparkles size={17} color={C.primary} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
                  Generate Unit Content
                </div>
                {unitTitle && (
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>{unitTitle}</div>
                )}
              </div>
            </div>
            <button onClick={handleClose} disabled={loading} style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: C.bg, cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: loading ? 0.4 : 1, transition: "background 0.12s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = C.tintDeep; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.bg; }}
            >
              <X size={15} color={C.sub} strokeWidth={2} />
            </button>
          </div>

          {/* ── Tabs ─────────────────────────────────────────────────────── */}
          <div style={{ padding: "18px 24px 0" }}>
            <div style={{
              display: "flex", gap: 4,
              background: C.bg, borderRadius: 12, padding: 4,
            }}>
              {(["ai", "file"] as Tab[]).map(tab => {
                const isActive = activeTab === tab;
                return (
                  <button key={tab} onClick={() => { setActiveTab(tab); setError(null); }}
                    style={{
                      flex: 1, padding: "8px 14px", borderRadius: 9, border: "none",
                      background: isActive ? C.white : "transparent",
                      color: isActive ? C.text : C.sub,
                      fontSize: 13, fontWeight: isActive ? 600 : 500,
                      cursor: "pointer", fontFamily: "inherit",
                      boxShadow: isActive ? "0 1px 4px rgba(108,111,239,0.12)" : "none",
                      transition: "all 0.15s",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    {tab === "ai"
                      ? <><Sparkles size={13} strokeWidth={2} />Generate with AI</>
                      : <><Upload size={13} strokeWidth={2} />From File</>
                    }
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Body ─────────────────────────────────────────────────────── */}
          <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 18 }}>

            {result ? (
              <SuccessView result={result} onClose={handleClose} onGenerateMore={() => setResult(null)} />
            ) : (
              <>
                {/* Error banner */}
                {error && (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    background: C.errorBg, border: `1px solid ${C.error}22`,
                    borderRadius: 12, padding: "11px 14px",
                  }}>
                    <AlertCircle size={15} color={C.error} strokeWidth={2}
                      style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, color: C.error, lineHeight: 1.5 }}>{error}</span>
                  </div>
                )}

                {/* ── AI TAB ──────────────────────────────────────────────── */}
                {activeTab === "ai" && (
                  <>
                    <div>
                      <input
                        type="text"
                        value={topic}
                        onChange={e => setTopic(e.target.value)}
                        placeholder="e.g. Present Simple tense, Vocabulary: Food & Drink…"
                        style={{
                          width: "100%", padding: "10px 13px", borderRadius: 10,
                          border: `1.5px solid ${topic ? C.primary : C.border}`,
                          fontSize: 13.5, color: C.text, outline: "none",
                          fontFamily: "inherit", boxSizing: "border-box",
                          transition: "border-color 0.15s",
                        }}
                        onFocus={e => { e.target.style.borderColor = C.primary; }}
                        onBlur={e => { e.target.style.borderColor = topic ? C.primary : C.border; }}
                      />
                    </div>

                    <div>
                      <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={4}
                        placeholder="Describe what you'd like the AI to focus on — learning goals, context, specific vocabulary, grammar points, or any other details to guide the generation…"
                        style={{
                          width: "100%", padding: "10px 13px", borderRadius: 10,
                          border: `1.5px solid ${description ? C.primary : C.border}`,
                          fontSize: 13.5, color: C.text, outline: "none",
                          fontFamily: "inherit", boxSizing: "border-box",
                          resize: "vertical", lineHeight: 1.6,
                          transition: "border-color 0.15s",
                          minHeight: 96,
                        }}
                        onFocus={e => { e.target.style.borderColor = C.primary; }}
                        onBlur={e => { e.target.style.borderColor = description ? C.primary : C.border; }}
                      />
                    </div>
                  </>
                )}

                {/* ── FILE TAB ─────────────────────────────────────────────── */}
                {activeTab === "file" && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_EXT}
                      style={{ display: "none" }}
                      onChange={handleFileChange}
                    />

                    {!file ? (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleFileDrop}
                        style={{
                          border: `2px dashed ${isDragging ? C.primary : C.border}`,
                          borderRadius: 14,
                          background: isDragging ? C.tint : C.bg,
                          padding: "36px 24px",
                          display: "flex", flexDirection: "column",
                          alignItems: "center", gap: 10,
                          cursor: "pointer",
                          transition: "all 0.15s",
                          textAlign: "center",
                        }}
                      >
                        <div style={{
                          width: 48, height: 48, borderRadius: 12,
                          background: isDragging ? C.tintDeep : C.white,
                          border: `1.5px solid ${isDragging ? C.primary : C.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s",
                        }}>
                          <Upload size={20} color={isDragging ? C.primary : C.sub} strokeWidth={1.75} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                            {isDragging ? "Drop it here!" : "Drop a file or click to browse"}
                          </div>
                          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
                            PDF, DOCX, TXT, PPT, PPTX · up to 20 MB
                          </div>
                        </div>
                        <div style={{
                          marginTop: 4, padding: "6px 16px", borderRadius: 8,
                          background: C.white, border: `1.5px solid ${C.border}`,
                          fontSize: 12.5, fontWeight: 600, color: C.sub,
                        }}>
                          Browse files
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "14px 16px", borderRadius: 12,
                        background: C.tint, border: `1.5px solid ${C.border}`,
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: C.white, border: `1px solid ${C.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          <FileText size={18} color={C.primary} strokeWidth={1.75} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13.5, fontWeight: 600, color: C.text,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {file.name}
                          </div>
                          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                            {formatBytes(file.size)}
                          </div>
                        </div>
                        <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                          style={{
                            width: 30, height: 30, borderRadius: 8, border: "none",
                            background: C.white, cursor: "pointer", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "background 0.12s",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = C.errorBg; }}
                          onMouseLeave={e => { e.currentTarget.style.background = C.white; }}
                        >
                          <Trash2 size={13} color={C.error} strokeWidth={2} />
                        </button>
                      </div>
                    )}

                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
                      The AI will extract content from your file and generate segment content based on it.
                    </div>
                  </div>
                )}

                {/* ── Always-included strip + Image toggle ────────────────── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <AlwaysIncludedStrip />
                  <Toggle
                    checked={includeImages}
                    onChange={setIncludeImages}
                    label="Include AI illustrations"
                    sublabel="Generate an SVG diagram for each segment (+30 s)"
                  />
                </div>

                {/* ── Advanced toggle ──────────────────────────────────────── */}
                <button type="button" onClick={() => setShowAdvanced(v => !v)} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 5, width: "100%", padding: "9px",
                  fontSize: 12.5, color: C.sub, fontWeight: 500,
                  cursor: "pointer", background: "none", border: "none",
                  borderRadius: 8, transition: "background 0.12s, color 0.12s",
                  fontFamily: "inherit", margin: "-4px 0 -4px",
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bg; e.currentTarget.style.color = C.text; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.sub; }}
                >
                  {showAdvanced
                    ? <ChevronUp size={12} strokeWidth={2} />
                    : <ChevronDown size={12} strokeWidth={2} />}
                  Advanced settings
                </button>

                {showAdvanced && (
                  <AdvancedSettings
                    level={level} setLevel={setLevel}
                    language={language} setLanguage={setLanguage}
                    numSegments={numSegments} setNumSegments={setNumSegments}
                    selectedTypes={selectedTypes} toggleType={toggleType}
                    instructionLang={instructionLang} setInstructionLang={setInstructionLang}
                  />
                )}

                {/* ── Cost estimate pill ───────────────────────────────────── */}
                {loading && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: C.tint, borderRadius: 10, padding: "10px 14px",
                  }}>
                    <Layers size={14} color={C.primary} strokeWidth={2} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: C.primaryDk, lineHeight: 1.5 }}>
                      Generating <strong>{numSegments} segment{numSegments > 1 ? "s" : ""}</strong>
                      {" "}with text blocks, exercises{includeImages ? ", and illustrations" : ""}.
                      {" "}This may take {includeImages ? "60–120" : "20–60"} seconds.
                    </span>
                  </div>
                )}

                {/* ── Generate button ──────────────────────────────────────── */}
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
                    gap: 8, fontFamily: "inherit", opacity: loading ? 0.88 : 1,
                  }}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.background = C.primaryDk; }}
                  onMouseLeave={e => { if (!loading) e.currentTarget.style.background = C.primary; }}
                  onMouseDown={e => { if (!loading) e.currentTarget.style.transform = "scale(0.99)"; }}
                  onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
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
                        : `Generate from File`
                      }
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Success view ───────────────────────────────────────────────────────────────
function SuccessView({
  result, onClose, onGenerateMore,
}: {
  result: GenerateResult;
  onClose: () => void;
  onGenerateMore: () => void;
}) {
  const totalBlocks = result.texts_created + result.exercises_created + result.images_created;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        textAlign: "center", gap: 10, padding: "8px 0 4px",
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: C.successBg,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CheckCircle size={26} color={C.success} strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Content generated!</div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>
            {result.segments_created} segment{result.segments_created > 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Summary pills */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {result.texts_created > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: C.tint, borderRadius: 20, padding: "5px 12px",
            fontSize: 12.5, color: C.primaryDk, fontWeight: 600,
          }}>
            <BookOpen size={12} strokeWidth={2} />
            {result.texts_created} text block{result.texts_created > 1 ? "s" : ""}
          </div>
        )}
        {result.exercises_created > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: C.successBg, borderRadius: 20, padding: "5px 12px",
            fontSize: 12.5, color: C.success, fontWeight: 600,
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5l1.5 4h4l-3.2 2.5 1.2 4L8 9.5 4.5 12l1.2-4L2.5 5.5h4L8 1.5z"
                fill={C.success} stroke={C.success} strokeWidth="0.5" />
            </svg>
            {result.exercises_created} exercise{result.exercises_created > 1 ? "s" : ""}
          </div>
        )}
        {result.images_created > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: C.amberBg, borderRadius: 20, padding: "5px 12px",
            fontSize: 12.5, color: C.amber, fontWeight: 600,
          }}>
            <ImageIcon size={12} strokeWidth={2} />
            {result.images_created} illustration{result.images_created > 1 ? "s" : ""}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {result.segments.map((seg, i) => (
          <div key={seg.id} style={{
            background: C.bg, borderRadius: 12, padding: "12px 14px",
            border: `1px solid ${C.borderSoft}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6,
                background: C.tint, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: C.primaryDk,
              }}>
                {i + 1}
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{seg.title}</span>
            </div>

            {/* Block badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingLeft: 30 }}>
              {/* Text block badge */}
              {(seg.texts_created ?? 0) > 0 && (
                <span style={{
                  fontSize: 11, color: C.primaryDk, background: C.tint,
                  borderRadius: 6, padding: "2px 8px", fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <BookOpen size={10} strokeWidth={2} />
                  {seg.texts_created} text
                </span>
              )}
              {/* Image badge */}
              {seg.has_image && (
                <span style={{
                  fontSize: 11, color: C.amber, background: C.amberBg,
                  borderRadius: 6, padding: "2px 8px", fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <ImageIcon size={10} strokeWidth={2} />
                  image
                </span>
              )}
              {/* Exercise type badges */}
              {seg.exercise_types.map(t => (
                <span key={t} style={{
                  fontSize: 11, color: C.sub, background: C.white,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 6, padding: "2px 8px", fontWeight: 500,
                }}>
                  {t.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onGenerateMore} style={{
          flex: 1, padding: "11px", borderRadius: 11,
          border: `1.5px solid ${C.border}`, background: C.white,
          color: C.text, fontSize: 13.5, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
          transition: "background 0.12s, border-color 0.12s",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bg; e.currentTarget.style.borderColor = C.primary; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.white; e.currentTarget.style.borderColor = C.border; }}
        >
          Generate more
        </button>
        <button onClick={onClose} style={{
          flex: 1, padding: "11px", borderRadius: 11,
          border: "none", background: C.primary,
          color: C.white, fontSize: 13.5, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
          transition: "background 0.12s",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = C.primaryDk; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.primary; }}
        >
          Done
        </button>
      </div>
    </div>
  );
}