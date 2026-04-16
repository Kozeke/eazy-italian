/**
 * AITestGenerationWizard.jsx  —  Phase 2
 *
 * ── What's new vs Phase 1 ─────────────────────────────────────────────────────
 *   Phase 1 was a placeholder shell.
 *   Phase 2 is the full implementation:
 *     • Real wizard form (all backend fields, validated)
 *     • POST /units/{unit_id}/generate-test  (generateTestAI)
 *     • Polling GET /units/{unit_id}/generate-test/{test_id}/status
 *     • Progress screen with per-status copy + animated indicators
 *     • Retry: returns to form with prior values preserved
 *     • onDone(testId) callback hands off to Phase 3 builder hydration
 *
 * ── Props ─────────────────────────────────────────────────────────────────────
 *   open         boolean              — controls visibility
 *   onClose      () => void           — dismiss entire flow
 *   onBack       () => void           — return to CreateTestMethodPicker
 *   unitId       number | null        — required for API calls
 *   unitTitle    string | null        — display label only
 *   unitLevel    string | null        — pre-fills difficulty ("A1"…"C2")
 *   onDone       (testId: number) => void  — called when generation succeeds
 *
 * ── Internal screens ──────────────────────────────────────────────────────────
 *   "form"      — teacher configures generation options
 *   "progress"  — request submitted; polling in flight
 *
 * ── API helpers (also exported for reuse) ─────────────────────────────────────
 *   generateTestAI(unitId, payload)  → POST /units/{unit_id}/generate-test
 *   getTestGenerationStatus(unitId, testId)  → GET …/status
 *
 * ── Polling design ────────────────────────────────────────────────────────────
 *   • Uses setTimeout chains, not setInterval, to avoid overlapping requests.
 *   • Snapshot refs (pollingUnitRef / pollingTestRef) guard against stale polls
 *     after retry or unmount.
 *   • isMountedRef ensures no setState after unmount.
 *   • stopPolling() is called on: unmount, close, done, failed, retry.
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/* ─── Type definitions ──────────────────────────────────────────────────────── */
interface FormData {
  unit_id: number | null;
  title: string;
  mcq_count: number;
  answers_per_question: number;
  difficulty: string;
  time_limit_minutes: number;
  passing_score: number;
  content_language: string;
  question_language: string;
}

interface Job {
  testId: number;
  status: "pending" | "running" | "done" | "failed";
  questionCount: number | null;
  error: string | null;
}

interface GenerateTestPayload {
  mcq_count: number;
  answers_per_question: number;
  difficulty: string;
  time_limit_minutes: number;
  passing_score: number;
  content_language: string;
  question_language: string;
  title: string | null;
}

interface GenerateTestResponse {
  test_id: number;
  status: string;
  message?: string;
  poll_url?: string;
}

interface TestGenerationStatus {
  test_id: number;
  generation_status: "pending" | "running" | "done" | "failed";
  question_count: number | null;
  title: string | null;
  created_at: string | null;
  generation_error: string | null;
}

type StatusKey = "pending" | "running" | "done" | "failed";

/* ─── Design tokens — identical to TeacherOnboarding T ──────────────────── */
const T = {
  violet:  "#6C35DE", violetL: "#EDE9FF", violetD: "#4F23B0",
  pink:    "#F0447C", pinkL:   "#FDE8F0",
  lime:    "#0DB85E", limeL:   "#DCFCE7",
  sky:     "#0099E6", skyL:    "#DAEEFF",
  amber:   "#F5A623", amberL:  "#FEF3C7",
  orange:  "#F76D3C",
  teal:    "#00BCD4", tealL:   "#E0F7FA",
  white:   "#FFFFFF",
  bg:      "#F7F6FF",
  border:  "#E5DEFF",
  text:    "#1A1035",
  sub:     "#5C5490",
  muted:   "#9188C4",
  mutedL:  "#CFC9EE",
  green:   "#16A34A", greenL:  "#DCFCE7",
  red:     "#EF4444", redL:    "#FEE2E2",
  dFont:   "'Nunito', system-ui, sans-serif",
  bFont:   "'Inter', system-ui, sans-serif",
};

/* ─── Constants ──────────────────────────────────────────────────────────── */
const POLL_INTERVAL_MS = 3000;

const DIFFICULTY_OPTS = [
  { value: "A1", label: "A1" },
  { value: "A2", label: "A2" },
  { value: "B1", label: "B1" },
  { value: "B2", label: "B2" },
  { value: "C1", label: "C1" },
  { value: "C2", label: "C2" },
];

const LANGUAGE_OPTS = [
  { value: "auto", label: "Auto-detect" },
  { value: "en",   label: "English" },
  { value: "it",   label: "Italian" },
  { value: "es",   label: "Spanish" },
  { value: "fr",   label: "French" },
  { value: "de",   label: "German" },
  { value: "ru",   label: "Russian" },
  { value: "pt",   label: "Portuguese" },
  { value: "zh",   label: "Chinese" },
  { value: "ar",   label: "Arabic" },
  { value: "ja",   label: "Japanese" },
];

const STATUS_CFG = {
  pending: {
    icon:   "⏳",
    label:  "Preparing draft test…",
    color:  T.amber,
    grad:   `linear-gradient(135deg,${T.amber},${T.orange})`,
    active: true,
  },
  running: {
    icon:   "✨",
    label:  "Generating questions with AI…",
    color:  T.violet,
    grad:   `linear-gradient(135deg,${T.violet},${T.pink})`,
    active: true,
  },
  done: {
    icon:   "✅",
    label:  "Draft test ready.",
    color:  T.green,
    grad:   `linear-gradient(135deg,${T.lime},${T.teal})`,
    active: false,
  },
  failed: {
    icon:   "❌",
    label:  "Test generation failed.",
    color:  T.red,
    grad:   `linear-gradient(135deg,${T.red},${T.orange})`,
    active: false,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   API HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */
const API_BASE = "/api/v1";

function authHeaders() {
  const t = (localStorage.getItem("token") || "").trim();
  return {
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

/**
 * POST /units/{unit_id}/generate-test
 * Payload: { mcq_count, answers_per_question, difficulty, title?,
 *            time_limit_minutes?, passing_score?,
 *            content_language?, question_language? }
 * Returns:  { test_id, status, message, poll_url }
 */
export async function generateTestAI(unitId: number, payload: GenerateTestPayload): Promise<GenerateTestResponse> {
  const res = await fetch(`${API_BASE}/units/${unitId}/generate-test`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * GET /units/{unit_id}/generate-test/{test_id}/status
 * Returns: { test_id, generation_status, question_count, title,
 *            created_at, generation_error }
 */
export async function getTestGenerationStatus(unitId: number, testId: number): Promise<TestGenerationStatus> {
  const res = await fetch(
    `${API_BASE}/units/${unitId}/generate-test/${testId}/status`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES  (self-contained; keyframes fadeUp/fadeIn/spin already in GlobalStyles
   but redeclared here so the component works standalone)
   ═══════════════════════════════════════════════════════════════════════════ */
const WIZARD_CSS = `
  @keyframes atgwFadeIn  { from{opacity:0} to{opacity:1} }
  @keyframes atgwFadeUp  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:none} }
  @keyframes atgwSpin    { to{transform:rotate(360deg)} }
  @keyframes atgwDot     { 0%,80%,100%{transform:scale(0);opacity:.4} 40%{transform:scale(1);opacity:1} }
  @keyframes atgwBar     { 0%{width:10%} 50%{width:82%} 100%{width:10%} }
  @keyframes atgwSpinRing{ to{transform:rotate(360deg)} }

  /* ── Overlay ── */
  .atgw-overlay {
    position: fixed; inset: 0; z-index: 1300;
    background: rgba(26,16,53,.6); backdrop-filter: blur(5px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    animation: atgwFadeIn .22s ease both;
  }

  /* ── Sheet ── */
  .atgw-sheet {
    background: ${T.bg};
    border-radius: 28px;
    border: 1.5px solid ${T.border};
    box-shadow: 0 36px 90px rgba(108,53,222,.2), 0 8px 24px rgba(26,16,53,.12);
    width: 100%; max-width: 580px;
    max-height: calc(100vh - 32px);
    display: flex; flex-direction: column;
    overflow: hidden;
    animation: atgwFadeUp .38s cubic-bezier(.22,.68,0,1.2) both;
  }

  /* ── Header ── */
  .atgw-hdr {
    background: linear-gradient(135deg, ${T.violet} 0%, ${T.pink} 100%);
    padding: 26px 30px 22px; flex-shrink: 0;
  }
  .atgw-hdr-top {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: 12px; margin-bottom: 10px;
  }
  .atgw-hdr-emoji {
    width: 46px; height: 46px; border-radius: 15px;
    background: rgba(255,255,255,.22); font-size: 22px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .atgw-hdr-acts { display: flex; gap: 8px; }
  .atgw-hdr-btn {
    width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer;
    background: rgba(255,255,255,.2); color: #fff; font-size: 13px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    transition: background .18s, transform .18s; flex-shrink: 0;
  }
  .atgw-hdr-btn:hover { background: rgba(255,255,255,.38); transform: scale(1.1); }
  .atgw-hdr-title {
    font-family: ${T.dFont}; font-weight: 900; font-size: 21px;
    color: #fff; margin-bottom: 4px; line-height: 1.2;
  }
  .atgw-hdr-sub {
    font-family: ${T.bFont}; font-size: 13px; color: rgba(255,255,255,.8); line-height: 1.5;
  }
  .atgw-hdr-pill {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.28);
    border-radius: 20px; padding: 3px 12px; margin-top: 9px;
    font-size: 12px; font-weight: 700; color: #fff; font-family: ${T.bFont};
  }

  /* ── Scrollable body ── */
  .atgw-body {
    flex: 1; overflow-y: auto; padding: 24px 30px;
    display: flex; flex-direction: column;
  }
  .atgw-body::-webkit-scrollbar { width: 4px; }
  .atgw-body::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 999px; }

  /* ── Form section ── */
  .atgw-sec { margin-bottom: 22px; }
  .atgw-sec-lbl {
    font-family: ${T.bFont}; font-size: 11px; font-weight: 700;
    color: ${T.muted}; text-transform: uppercase; letter-spacing: .1em;
    margin-bottom: 14px;
  }

  /* ── Field ── */
  .atgw-fld { margin-bottom: 14px; }
  .atgw-fld-lbl {
    display: block; font-family: ${T.bFont}; font-size: 13px;
    font-weight: 600; color: ${T.sub}; margin-bottom: 6px;
  }
  .atgw-fld-lbl em { color: ${T.muted}; font-style: normal; font-weight: 400; margin-left: 4px; }

  /* ── Input / Select ── */
  .atgw-inp, .atgw-sel {
    width: 100%; border: 2px solid ${T.border}; border-radius: 13px;
    background: ${T.white}; color: ${T.text};
    font-family: ${T.bFont}; font-size: 14px;
    padding: 10px 13px; transition: border-color .18s, box-shadow .18s;
    outline: none; appearance: none;
  }
  .atgw-inp:focus, .atgw-sel:focus {
    border-color: ${T.violet}; box-shadow: 0 0 0 3px ${T.violetL};
  }
  .atgw-inp::placeholder { color: ${T.mutedL}; }
  .atgw-inp--err { border-color: ${T.red} !important; box-shadow: 0 0 0 3px ${T.redL} !important; }
  .atgw-err-txt {
    margin-top: 5px; font-size: 12px; color: ${T.red};
    font-family: ${T.bFont}; display: flex; align-items: center; gap: 4px;
  }

  /* ── 2-col grid ── */
  .atgw-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 480px) { .atgw-g2 { grid-template-columns: 1fr; } }

  /* ── Stepper ── */
  .atgw-step {
    display: flex; border: 2px solid ${T.border}; border-radius: 13px;
    background: ${T.white}; overflow: hidden;
  }
  .atgw-step:focus-within { border-color: ${T.violet}; box-shadow: 0 0 0 3px ${T.violetL}; }
  .atgw-step-btn {
    width: 38px; min-height: 42px; border: none; background: transparent; cursor: pointer;
    font-size: 17px; font-weight: 700; color: ${T.sub};
    display: flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s; flex-shrink: 0;
  }
  .atgw-step-btn:hover:not(:disabled) { background: ${T.violetL}; color: ${T.violet}; }
  .atgw-step-btn:disabled { opacity: .3; cursor: default; }
  .atgw-step-val {
    flex: 1; text-align: center; border: none; outline: none;
    font-family: ${T.dFont}; font-weight: 800; font-size: 16px;
    color: ${T.text}; background: transparent; padding: 0 2px;
  }
  .atgw-step-val::-webkit-inner-spin-button,
  .atgw-step-val::-webkit-outer-spin-button { appearance: none; }

  /* ── Difficulty chips ── */
  .atgw-chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .atgw-chip {
    cursor: pointer; border-radius: 10px; padding: 7px 13px;
    font-family: ${T.dFont}; font-size: 13px; font-weight: 800;
    border: 2px solid ${T.border}; background: ${T.white}; color: ${T.sub};
    transition: all .18s cubic-bezier(.22,.68,0,1.2); user-select: none;
  }
  .atgw-chip:hover { border-color: ${T.violet}; color: ${T.violet}; transform: translateY(-2px); }
  .atgw-chip--on {
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    border-color: transparent; color: #fff; transform: translateY(-2px);
    box-shadow: 0 5px 16px rgba(108,53,222,.28);
  }

  /* ── Submit error ── */
  .atgw-submit-err {
    background: ${T.redL}; border: 1.5px solid ${T.red}40;
    border-radius: 13px; padding: 12px 16px; margin-bottom: 18px;
    font-family: ${T.bFont}; font-size: 13px; color: ${T.red};
    display: flex; align-items: flex-start; gap: 8px; line-height: 1.5;
  }

  /* ── Footer ── */
  .atgw-foot {
    padding: 14px 30px 22px; flex-shrink: 0;
    display: flex; gap: 10px; align-items: center;
    border-top: 1.5px solid ${T.border};
  }
  .atgw-btn-back {
    flex-shrink: 0; padding: 11px 18px; border-radius: 13px;
    border: 2px solid ${T.border}; background: ${T.white}; color: ${T.sub};
    font-family: ${T.dFont}; font-weight: 800; font-size: 14px; cursor: pointer;
    display: flex; align-items: center; gap: 6px;
    transition: all .18s cubic-bezier(.22,.68,0,1.2);
  }
  .atgw-btn-back:hover { border-color: ${T.violet}; color: ${T.violet}; transform: translateY(-2px); }
  .atgw-btn-primary {
    flex: 1; padding: 13px; border-radius: 13px; border: none; cursor: pointer;
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    color: #fff; font-family: ${T.dFont}; font-weight: 900; font-size: 16px;
    box-shadow: 0 8px 24px rgba(108,53,222,.3);
    transition: all .2s cubic-bezier(.22,.68,0,1.2);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .atgw-btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(108,53,222,.42); }
  .atgw-btn-primary:disabled { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }
  .atgw-spinner {
    display: inline-block; width: 15px; height: 15px; flex-shrink: 0;
    border: 2.5px solid rgba(255,255,255,.35); border-top-color: #fff;
    border-radius: 50%; animation: atgwSpin .7s linear infinite;
  }

  /* ═══════════════════════════════════════════════════════════
     PROGRESS SCREEN
  ═══════════════════════════════════════════════════════════ */
  .atgw-prog {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 36px 30px 24px; text-align: center;
  }
  .atgw-prog-ico {
    width: 76px; height: 76px; border-radius: 26px;
    display: flex; align-items: center; justify-content: center;
    font-size: 34px; margin-bottom: 22px; position: relative;
  }
  .atgw-prog-ico--ring::after {
    content: ''; position: absolute; inset: -6px; border-radius: 32px;
    border: 3px solid rgba(255,255,255,.0);
    border-top-color: currentColor;
    animation: atgwSpinRing 1.2s linear infinite;
  }
  .atgw-prog-ttl {
    font-family: ${T.dFont}; font-weight: 900; font-size: 21px;
    color: ${T.text}; margin-bottom: 8px;
  }
  .atgw-prog-desc {
    font-family: ${T.bFont}; font-size: 13px; color: ${T.muted};
    line-height: 1.65; margin-bottom: 26px; max-width: 340px;
  }

  /* progress strip */
  .atgw-prog-track {
    width: 100%; max-width: 300px; height: 8px;
    border-radius: 999px; background: ${T.border};
    overflow: hidden; margin-bottom: 18px;
  }
  .atgw-prog-fill {
    height: 100%; border-radius: 999px;
  }
  .atgw-prog-fill--anim { animation: atgwBar 2.4s ease-in-out infinite; }
  .atgw-prog-fill--full { width: 100% !important; animation: none !important; }

  /* pulsing dots */
  .atgw-dot-row { display: flex; gap: 6px; margin-bottom: 20px; }
  .atgw-dot-row span {
    display: block; width: 8px; height: 8px; border-radius: 50%;
    animation: atgwDot 1.4s ease-in-out infinite;
  }
  .atgw-dot-row span:nth-child(2) { animation-delay: .2s; }
  .atgw-dot-row span:nth-child(3) { animation-delay: .4s; }

  /* result card */
  .atgw-res-card {
    border-radius: 16px; padding: 16px 20px;
    width: 100%; max-width: 360px; text-align: left;
    border: 1.5px solid transparent;
  }
  .atgw-res-card--ok  { background: ${T.greenL}; border-color: ${T.green}33; }
  .atgw-res-card--err { background: ${T.redL};   border-color: ${T.red}33; }
  .atgw-res-card-ttl  {
    font-family: ${T.dFont}; font-weight: 800; font-size: 14px; margin-bottom: 3px;
  }
  .atgw-res-card--ok  .atgw-res-card-ttl { color: ${T.green}; }
  .atgw-res-card--err .atgw-res-card-ttl { color: ${T.red}; }
  .atgw-res-card-body {
    font-family: ${T.bFont}; font-size: 13px; color: ${T.sub}; line-height: 1.5;
  }

  /* prog footer */
  .atgw-prog-foot {
    padding: 0 30px 24px; flex-shrink: 0;
    display: flex; gap: 10px; align-items: center;
  }
  .atgw-btn-done {
    flex: 1; padding: 13px; border-radius: 13px; border: none; cursor: pointer;
    background: linear-gradient(135deg, ${T.lime}, ${T.teal});
    color: #fff; font-family: ${T.dFont}; font-weight: 900; font-size: 16px;
    box-shadow: 0 8px 22px rgba(13,184,94,.28);
    transition: all .2s cubic-bezier(.22,.68,0,1.2);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .atgw-btn-done:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(13,184,94,.4); }
  .atgw-btn-retry {
    flex: 1; padding: 13px; border-radius: 13px;
    border: 2px solid ${T.violet}; background: ${T.violetL};
    color: ${T.violet}; font-family: ${T.dFont}; font-weight: 900; font-size: 16px;
    cursor: pointer; transition: all .18s cubic-bezier(.22,.68,0,1.2);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .atgw-btn-retry:hover { background: ${T.violet}; color: #fff; transform: translateY(-2px); }
`;

/* ═══════════════════════════════════════════════════════════════════════════
   DEFAULT FORM
   ═══════════════════════════════════════════════════════════════════════════ */
function defaultForm(unitId: number | null, unitLevel: string | null): FormData {
  return {
    unit_id:              unitId ?? null,
    title:                "",
    mcq_count:            5,
    answers_per_question: 4,
    difficulty:           unitLevel || "B1",
    time_limit_minutes:   15,
    passing_score:        70,
    content_language:     "auto",
    question_language:    "en",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDATION
   ═══════════════════════════════════════════════════════════════════════════ */
function validate(f: FormData): Partial<Record<keyof FormData, string>> {
  const e: Partial<Record<keyof FormData, string>> = {};
  if (!f.unit_id)                                          e.unit_id              = "Unit ID is required.";
  if (f.mcq_count < 1 || f.mcq_count > 50)                e.mcq_count            = "1–50 questions.";
  if (f.answers_per_question < 2 || f.answers_per_question > 6) e.answers_per_question = "2–6 choices.";
  if (!f.difficulty)                                       e.difficulty           = "Select difficulty.";
  if (f.time_limit_minutes < 1 || f.time_limit_minutes > 180)  e.time_limit_minutes   = "1–180 min.";
  if (f.passing_score < 1 || f.passing_score > 100)       e.passing_score        = "1–100 %.";
  return e;
}

/* ═══════════════════════════════════════════════════════════════════════════
   STEPPER — numeric ± control
   ═══════════════════════════════════════════════════════════════════════════ */
interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}

function Stepper({ value, onChange, min, max, step = 1 }: StepperProps) {
  return (
    <div className="atgw-step">
      <button
        type="button"
        className="atgw-step-btn"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label="Decrease"
      >−</button>
      <input
        type="number"
        className="atgw-step-val"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
      <button
        type="button"
        className="atgw-step-btn"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label="Increase"
      >+</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORM SCREEN
   ═══════════════════════════════════════════════════════════════════════════ */
interface FormScreenProps {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onBack: () => void;
  onSubmit: (form: FormData) => void;
  submitting: boolean;
  submitError: string | null;
}

function FormScreen({ form, setForm, onBack, onSubmit, submitting, submitError }: FormScreenProps) {
  const [touched, setTouched] = useState<Partial<Record<keyof FormData, boolean>>>({});
  const errs   = validate(form);
  const touch  = (f: keyof FormData) => setTouched((p) => ({ ...p, [f]: true }));
  const set    = (f: keyof FormData) => (v: FormData[keyof FormData]) => { setForm((p) => ({ ...p, [f]: v })); touch(f); };
  const setEvt = (f: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(f)(e.target.value);
  const fe     = (f: keyof FormData) => touched[f] && errs[f];   // field error

  const handleSubmit = () => {
    setTouched(Object.fromEntries(Object.keys(form).map((k) => [k, true])));
    if (Object.keys(errs).length) return;
    onSubmit(form);
  };

  return (
    <>
      <div className="atgw-body">
        {submitError && (
          <div className="atgw-submit-err">
            <span>⚠️</span><span>{submitError}</span>
          </div>
        )}

        {/* ── Test settings ── */}
        <div className="atgw-sec">
          <div className="atgw-sec-lbl">Test settings</div>

          <div className="atgw-fld">
            <label className="atgw-fld-lbl">
              Title <em>(optional — AI will name it if blank)</em>
            </label>
            <input
              className="atgw-inp"
              placeholder="e.g. Unit 3 Vocabulary Check"
              value={form.title}
              onChange={setEvt("title")}
              maxLength={120}
            />
          </div>

          <div className="atgw-g2">
            <div className="atgw-fld">
              <label className="atgw-fld-lbl">Time limit <em>(min)</em></label>
              <Stepper value={form.time_limit_minutes} onChange={set("time_limit_minutes")} min={1} max={180} />
              {fe("time_limit_minutes") && <div className="atgw-err-txt">⚠ {errs.time_limit_minutes}</div>}
            </div>
            <div className="atgw-fld">
              <label className="atgw-fld-lbl">Passing score <em>(%)</em></label>
              <Stepper value={form.passing_score} onChange={set("passing_score")} min={1} max={100} step={5} />
              {fe("passing_score") && <div className="atgw-err-txt">⚠ {errs.passing_score}</div>}
            </div>
          </div>
        </div>

        {/* ── Questions ── */}
        <div className="atgw-sec">
          <div className="atgw-sec-lbl">Questions</div>

          <div className="atgw-g2">
            <div className="atgw-fld">
              <label className="atgw-fld-lbl">Number of questions</label>
              <Stepper value={form.mcq_count} onChange={set("mcq_count")} min={1} max={50} />
              {fe("mcq_count") && <div className="atgw-err-txt">⚠ {errs.mcq_count}</div>}
            </div>
            <div className="atgw-fld">
              <label className="atgw-fld-lbl">Answer choices each</label>
              <Stepper value={form.answers_per_question} onChange={set("answers_per_question")} min={2} max={6} />
              {fe("answers_per_question") && <div className="atgw-err-txt">⚠ {errs.answers_per_question}</div>}
            </div>
          </div>

          <div className="atgw-fld">
            <label className="atgw-fld-lbl">Difficulty level</label>
            <div className="atgw-chips">
              {DIFFICULTY_OPTS.map((d) => (
                <div
                  key={d.value}
                  className={`atgw-chip${form.difficulty === d.value ? " atgw-chip--on" : ""}`}
                  onClick={() => set("difficulty")(d.value)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && set("difficulty")(d.value)}
                  aria-pressed={form.difficulty === d.value}
                >
                  {d.label}
                </div>
              ))}
            </div>
            {fe("difficulty") && <div className="atgw-err-txt">⚠ {errs.difficulty}</div>}
          </div>
        </div>

        {/* ── Language ── */}
        <div className="atgw-sec">
          <div className="atgw-sec-lbl">Language</div>
          <div className="atgw-g2">
            <div className="atgw-fld">
              <label className="atgw-fld-lbl">Content language</label>
              <select className="atgw-sel" value={form.content_language} onChange={setEvt("content_language")}>
                {LANGUAGE_OPTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="atgw-fld">
              <label className="atgw-fld-lbl">Question language</label>
              <select className="atgw-sel" value={form.question_language} onChange={setEvt("question_language")}>
                {LANGUAGE_OPTS.filter((l) => l.value !== "auto").map((l) =>
                  <option key={l.value} value={l.value}>{l.label}</option>
                )}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="atgw-foot">
        <button className="atgw-btn-back" onClick={onBack} type="button">← Back</button>
        <button
          className="atgw-btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
          type="button"
        >
          {submitting
            ? <><span className="atgw-spinner" /> Submitting…</>
            : <>✨ Generate Draft Test</>}
        </button>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROGRESS SCREEN
   ═══════════════════════════════════════════════════════════════════════════ */
interface ProgressScreenProps {
  job: Job | null;
  onRetry: () => void;
  onDone: (testId: number) => void;
  onClose: () => void;
}

function ProgressScreen({ job, onRetry, onDone, onClose }: ProgressScreenProps) {
  const status   = (job?.status ?? "pending") as StatusKey;
  const cfg      = STATUS_CFG[status] ?? STATUS_CFG.pending;
  const isActive = cfg.active;
  const isDone   = status === "done";
  const isFailed = status === "failed";

  const progDesc: Record<StatusKey, string> = {
    pending: "The server is queuing your request. This usually takes just a moment.",
    running: "AI is reading your unit content and crafting questions. Hang tight!",
    done:    "Your draft is ready. Open it in the builder to review, edit, and publish.",
    failed:  job?.error || "Something went wrong. You can retry with the same settings.",
  };

  return (
    <>
      <div className="atgw-prog">
        {/* Icon */}
        <div
          className={`atgw-prog-ico${isActive ? " atgw-prog-ico--ring" : ""}`}
          style={{ background: cfg.grad, color: "#fff" }}
        >
          {cfg.icon}
        </div>

        <div className="atgw-prog-ttl">{cfg.label}</div>
        <div className="atgw-prog-desc">{progDesc[status]}</div>

        {/* Progress track */}
        <div className="atgw-prog-track">
          <div
            className={`atgw-prog-fill${isActive ? " atgw-prog-fill--anim" : isDone ? " atgw-prog-fill--full" : ""}`}
            style={{ background: cfg.grad, width: isFailed ? "100%" : undefined }}
          />
        </div>

        {/* Animated dots while active */}
        {isActive && (
          <div className="atgw-dot-row" aria-hidden="true">
            <span style={{ background: cfg.color }} />
            <span style={{ background: cfg.color }} />
            <span style={{ background: cfg.color }} />
          </div>
        )}

        {/* Done result card */}
        {isDone && job && (
          <div className="atgw-res-card atgw-res-card--ok">
            <div className="atgw-res-card-ttl">✓ Draft ready</div>
            <div className="atgw-res-card-body">
              {job.questionCount != null
                ? `${job.questionCount} question${job.questionCount !== 1 ? "s" : ""} generated. `
                : ""}
              Review and edit in the test builder before publishing.
            </div>
          </div>
        )}

        {/* Failed error card */}
        {isFailed && (
          <div className="atgw-res-card atgw-res-card--err">
            <div className="atgw-res-card-ttl">Generation failed</div>
            <div className="atgw-res-card-body">
              {job?.error || "An unexpected error occurred."}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="atgw-prog-foot">
        {isActive && (
          <button className="atgw-btn-back" style={{ marginLeft: "auto" }} onClick={onClose} type="button">
            Cancel
          </button>
        )}
        {isDone && job && (
          <>
            <button className="atgw-btn-back" onClick={onClose} type="button">Close</button>
            <button 
              className="atgw-btn-done" 
              onClick={() => {
                if (job?.testId) {
                  onDone?.(job.testId);
                }
              }} 
              type="button"
            >
              Open in Builder →
            </button>
          </>
        )}
        {isFailed && (
          <>
            <button className="atgw-btn-back" onClick={onClose} type="button">Cancel</button>
            <button className="atgw-btn-retry" onClick={onRetry} type="button">↺ Retry</button>
          </>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT — AITestGenerationWizard
   ═══════════════════════════════════════════════════════════════════════════ */
interface AITestGenerationWizardProps {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  unitId?: number | null;
  unitTitle?: string | null;
  unitLevel?: string | null;   // "A1"…"C2" — pre-fills difficulty
  onDone?: (testId: number) => void;
}

export function AITestGenerationWizard({
  open,
  onClose,
  onBack,
  unitId    = null,
  unitTitle = null,
  unitLevel = null,   // "A1"…"C2" — pre-fills difficulty
  onDone,             // (testId: number) => void
}: AITestGenerationWizardProps) {
  /* ── Screens: "form" | "progress" ── */
  const [screen,      setScreen]      = useState<"form" | "progress">("form");
  const [form,        setForm]        = useState<FormData>(() => defaultForm(unitId, unitLevel));
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* job shape: { testId, status, questionCount, error } */
  const [job, setJob] = useState<Job | null>(null);

  /* ── Polling control refs ── */
  const isMountedRef   = useRef(false);
  const pollTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollUnitRef    = useRef<number | null>(null);  // snapshot of unitId for current poll chain
  const pollTestRef    = useRef<number | null>(null);  // snapshot of testId for current poll chain

  /* ── Sync unit_id when prop changes ── */
  useEffect(() => {
    if (unitId != null) setForm((p) => ({ ...p, unit_id: unitId }));
  }, [unitId]);

  /* ── Sync difficulty default from unitLevel ── */
  useEffect(() => {
    if (unitLevel) setForm((p) => ({ ...p, difficulty: unitLevel }));
  }, [unitLevel]);

  /* ── Mount/unmount tracking & cleanup ── */
  useEffect(() => {
    isMountedRef.current = open;
    if (!open) stopPolling();
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ── Escape key ── */
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ─────────────────────────────────────────────────────────────────────────
     POLLING
     Uses setTimeout chains — no setInterval — so we never queue two requests.
     Stale-guard: compare current ref snapshots before acting.
  ───────────────────────────────────────────────────────────────────────── */
  function stopPolling() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollUnitRef.current = null;
    pollTestRef.current = null;
  }

  async function pollOnce(snapUnit: number, snapTest: number) {
    // Stale guard
    if (
      !isMountedRef.current ||
      pollUnitRef.current !== snapUnit ||
      pollTestRef.current !== snapTest
    ) return;

    try {
      const data      = await getTestGenerationStatus(snapUnit, snapTest);
      const newStatus = data.generation_status;

      if (!isMountedRef.current || pollUnitRef.current !== snapUnit) return;

      setJob({
        testId:        data.test_id,
        status:        newStatus as StatusKey,
        questionCount: data.question_count ?? null,
        error:         data.generation_error ?? null,
      });

      // Terminal states — stop
      if (newStatus === "done" || newStatus === "failed") {
        stopPolling();
        return;
      }
    } catch {
      // Non-terminal fetch error — swallow and keep retrying
      if (!isMountedRef.current || pollUnitRef.current !== snapUnit) return;
    }

    // Schedule next tick
    if (isMountedRef.current && pollUnitRef.current === snapUnit) {
      pollTimerRef.current = setTimeout(
        () => pollOnce(snapUnit, snapTest),
        POLL_INTERVAL_MS
      );
    }
  }

  function startPolling(snapUnit: number, snapTest: number) {
    stopPolling();
    pollUnitRef.current  = snapUnit;
    pollTestRef.current  = snapTest;
    pollTimerRef.current = setTimeout(
      () => pollOnce(snapUnit, snapTest),
      POLL_INTERVAL_MS
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────
     HANDLERS
  ───────────────────────────────────────────────────────────────────────── */
  const handleClose = () => {
    stopPolling();
    onClose?.();
  };

  const handleSubmit = async (formValues: FormData) => {
    if (!formValues.unit_id) {
      setSubmitError("Unit ID is missing — please close and reopen from a unit page.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const payload: GenerateTestPayload = {
      mcq_count:            formValues.mcq_count,
      answers_per_question: formValues.answers_per_question,
      difficulty:           formValues.difficulty,
      time_limit_minutes:   formValues.time_limit_minutes,
      passing_score:        formValues.passing_score,
      content_language:     formValues.content_language,
      question_language:    formValues.question_language,
      title:                formValues.title?.trim() || null,
    };

    try {
      const resp = await generateTestAI(formValues.unit_id, payload);
      setJob({ testId: resp.test_id, status: "pending", questionCount: null, error: null });
      setScreen("progress");
      startPolling(formValues.unit_id, resp.test_id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start generation. Please try again.";
      setSubmitError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    stopPolling();
    setJob(null);
    setScreen("form");
    setSubmitError(null);
  };

  const handleDone = (testId: number) => {
    stopPolling();
    // Call onDone to navigate to the builder
    // Don't call onClose here because navigation will unmount this component
    // and the modal will be closed automatically
    if (onDone) {
      onDone(testId);
    } else {
      // Only close if no navigation handler is provided
      onClose?.();
    }
  };

  if (!open) return null;

  /* ── Header copy depends on active screen ── */
  const hdr = screen === "form"
    ? { title: "Generate Test with AI", sub: "Configure the draft — AI writes the questions." }
    : { title: "Generating Test…",      sub: "We'll update you as soon as it's ready."       };

  const content = (
    <>
      <style>{WIZARD_CSS}</style>

      <div
        className="atgw-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label={hdr.title}
      >
        <div className="atgw-sheet">

          {/* ── Header ── */}
          <div className="atgw-hdr">
            <div className="atgw-hdr-top">
              <div className="atgw-hdr-emoji">✨</div>
              <div className="atgw-hdr-acts">
                {screen === "form" && (
                  <button className="atgw-hdr-btn" onClick={onBack} aria-label="Back to method picker">←</button>
                )}
                <button className="atgw-hdr-btn" onClick={handleClose} aria-label="Close">✕</button>
              </div>
            </div>
            <div className="atgw-hdr-title">{hdr.title}</div>
            <div className="atgw-hdr-sub">{hdr.sub}</div>
            {unitTitle && (
              <div className="atgw-hdr-pill"><span>📘</span>{unitTitle}</div>
            )}
          </div>

          {/* ── Screen ── */}
          {screen === "form" && (
            <FormScreen
              form={form}
              setForm={setForm}
              onBack={onBack}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
            />
          )}
          {screen === "progress" && (
            <ProgressScreen
              job={job}
              onRetry={handleRetry}
              onDone={handleDone}
              onClose={handleClose}
            />
          )}

        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}

export default AITestGenerationWizard;