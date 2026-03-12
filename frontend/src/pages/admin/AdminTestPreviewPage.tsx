/**
 * AdminTestPreviewPage.tsx — Teacher Test Preview  (read-only student view)
 *
 * ── Route ────────────────────────────────────────────────────────────────────
 *   /admin/tests/:testId/preview
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   Preview → opens Test Preview page (this page)
 *     Route: /admin/tests/:testId/preview
 *     Read-only simulation of the student view.
 *
 *   Open / Edit → opens Test Builder
 *     Route: /admin/tests/:testId/builder
 *     Used to edit metadata and questions.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *   TestPreviewPage                  ← page entry point
 *     TestPreviewHeader              ← topbar: title + badge + back button
 *     TestPreviewContainer           ← scrollable question list
 *       PreviewQuestionRenderer      ← switches on question.type
 *         MCQPreview                 ← multiple_choice
 *         OpenAnswerPreview          ← open_answer
 *         ClozePreview               ← cloze / fill-in-gaps
 *         VisualPreview              ← visual (image + flexible answer type)
 *
 * ── Data flow ─────────────────────────────────────────────────────────────────
 *   GET /api/v1/tests/:testId              → test metadata
 *   GET /api/v1/tests/:testId/questions    → ordered question list
 *   All answer state is local – nothing is ever submitted or stored.
 *
 * ── Design system ─────────────────────────────────────────────────────────────
 *   Imports the same T tokens from TeacherOnboarding.
 *   Follows identical card / typography / spacing conventions.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";

/* ─── Design tokens (same as TeacherOnboarding / AdminTestBuilder) ─────────── */
const T = {
  violet:  "#6C35DE", violetL: "#EDE9FF", violetD: "#4F23B0",
  pink:    "#F0447C", pinkL:   "#FDE8F0",
  lime:    "#0DB85E", limeL:   "#DCFCE7",
  sky:     "#0099E6", skyL:    "#DAEEFF",
  amber:   "#F5A623", amberL:  "#FEF3C7",
  orange:  "#F76D3C", orangeL: "#FFECE5",
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

/* ─── Question type meta ────────────────────────────────────────────────────── */
const QTYPE = {
  multiple_choice: { label: "Multiple Choice", color: T.violet, colorL: T.violetL, icon: "☑" },
  open_answer:     { label: "Open Answer",     color: T.sky,    colorL: T.skyL,    icon: "✍" },
  cloze:           { label: "Fill in Gaps",    color: T.amber,  colorL: T.amberL,  icon: "📝" },
  visual:          { label: "Visual",          color: T.pink,   colorL: T.pinkL,   icon: "🖼" },
};

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface Question {
  id?: string | number;
  question_id?: string | number;
  test_question_id?: string | number;
  type?: string;
  prompt?: string;
  prompt_rich?: string;
  question_text?: string;
  text?: string;
  options?: Array<{ id?: string; text?: string } | string>;
  correct_option_ids?: string[];
  gaps_config?: Array<{ id?: string; placeholder?: string; answer?: string }>;
  expected_answer_config?: Record<string, any>;
  answer_type?: string;
  media?: Array<{ type?: string; url?: string; path?: string }>;
  score?: number;
  points?: number;
  level?: string;
  order_index?: number;
  question?: Question;
  question_type?: string;
}

interface Test {
  id?: number;
  title?: string;
  description?: string;
  instructions?: string;
  time_limit_minutes?: number;
  passing_score?: number;
  status?: string;
  publish_at?: string;
  order_index?: number;
  settings?: Record<string, any>;
  unit_id?: number;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

interface AnswerDict {
  [key: string]: any;
}

/* ─── API ───────────────────────────────────────────────────────────────────── */
const API = "/api/v1";

const getToken = (): string => {
  const t = localStorage.getItem("token") || (window as any).__authToken || "";
  return t.trim() || "";
};

async function apiFetch(path: string): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ─── Normalise questions (same logic as AdminTestBuilder) ──────────────────── */
function normaliseQuestions(raw: any): Question[] {
  return (Array.isArray(raw) ? raw : raw?.questions || []).map((q: any): Question => {
    const inner = q.question || {};
    return {
      ...q,
      id: q.question_id || inner.id || q.id,
      test_question_id: q.id,
      type:   inner.type  || q.type  || q.question_type || "multiple_choice",
      prompt: inner.prompt_rich || inner.prompt || q.prompt || q.question_text || q.text || "",
      options:             inner.options             || q.options             || [],
      correct_option_ids:  inner.correct_answer?.correct_option_ids || q.correct_option_ids || [],
      gaps_config:         inner.gaps_config         || q.gaps_config         || [],
      expected_answer_config: inner.expected_answer_config || q.expected_answer_config || {},
      answer_type:         inner.answer_type         || q.answer_type         || "multiple_choice",
      media:               inner.media               || q.media               || [],
      score:               q.points ?? inner.points  ?? q.score ?? 1,
      level:               inner.level               || q.level               || "B1",
      order_index:         q.order_index             ?? 0,
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════════════════ */
function PreviewStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { height: 100%; }
      body { background: ${T.bg}; color: ${T.text}; font-family: ${T.bFont}; }

      @keyframes fadeUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
      @keyframes spin    { to{transform:rotate(360deg)} }
      @keyframes pulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }

      /* ── Page root ── */
      .tp-root {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        background: ${T.bg};
        font-family: ${T.bFont};
      }

      /* ── Topbar ── */
      .tp-topbar {
        position: sticky; top: 0; z-index: 50;
        display: flex; align-items: center; gap: 12px;
        padding: 0 24px; height: 56px; flex-shrink: 0;
        background: linear-gradient(135deg,#1A1035 0%,#0F2D45 100%);
        border-bottom: 1px solid rgba(255,255,255,.07);
        box-shadow: 0 2px 24px rgba(0,0,0,.3);
      }
      .tp-topbar-icon {
        width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
        background: linear-gradient(135deg,${T.violet},${T.pink});
        display: flex; align-items: center; justify-content: center; font-size: 16px;
      }
      .tp-topbar-titles { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
      .tp-topbar-title {
        font-family: ${T.dFont}; font-size: 14px; font-weight: 900; color: #fff;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .tp-topbar-sub { font-size: 11px; color: rgba(255,255,255,.42); white-space: nowrap; }
      .tp-preview-badge {
        padding: 3px 11px; border-radius: 999px; font-size: 10px; font-weight: 800;
        letter-spacing: .09em; text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
        background: rgba(108,53,222,.35); border: 1.5px solid rgba(108,53,222,.65); color: #C4B5FD;
        animation: pulse 2.4s ease-in-out infinite;
      }
      .tp-topbar-divider { width: 1px; height: 20px; background: rgba(255,255,255,.12); flex-shrink: 0; }
      .tp-spacer { flex: 1; }
      .tp-back-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 14px; border-radius: 9px; border: none;
        background: rgba(255,255,255,.10); color: rgba(255,255,255,.82);
        font-family: ${T.dFont}; font-size: 12px; font-weight: 800;
        cursor: pointer; transition: all .16s; flex-shrink: 0;
      }
      .tp-back-btn:hover { background: rgba(255,255,255,.18); color: #fff; transform: translateX(-2px); }

      /* ── Page body ── */
      .tp-body {
        flex: 1;
        max-width: 780px;
        width: 100%;
        margin: 0 auto;
        padding: 32px 24px 80px;
      }
      @media (max-width: 600px) { .tp-body { padding: 20px 16px 60px; } }

      /* ── Test header card ── */
      .tp-test-header {
        background: #fff;
        border: 2px solid ${T.border};
        border-radius: 22px;
        padding: 26px 28px;
        margin-bottom: 24px;
        animation: fadeUp .35s cubic-bezier(.22,.68,0,1.15) both;
        position: relative;
        overflow: hidden;
      }
      .tp-test-header::before {
        content: '';
        position: absolute; inset: 0; bottom: auto; height: 4px;
        background: linear-gradient(90deg,${T.violet},${T.pink});
      }
      .tp-test-title {
        font-family: ${T.dFont}; font-size: 26px; font-weight: 900;
        color: ${T.text}; margin-bottom: 8px; line-height: 1.2;
      }
      .tp-test-desc {
        font-size: 14px; color: ${T.sub}; line-height: 1.65; margin-bottom: 14px;
      }
      .tp-test-meta {
        display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      }
      .tp-meta-chip {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 11px; border-radius: 999px;
        font-size: 11px; font-weight: 700;
        background: ${T.violetL}; color: ${T.violet};
        border: 1.5px solid rgba(108,53,222,.2);
      }
      .tp-instructions-box {
        margin-top: 14px;
        background: ${T.skyL};
        border: 1.5px solid rgba(0,153,230,.2);
        border-radius: 13px;
        padding: 13px 16px;
        font-size: 13px; color: ${T.sub}; line-height: 1.65;
        display: flex; gap: 10px;
      }
      .tp-instructions-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }

      /* ── Question cards ── */
      .tp-q-list { display: flex; flex-direction: column; gap: 16px; }

      .tp-q-card {
        background: #fff;
        border: 2px solid ${T.border};
        border-radius: 20px;
        overflow: hidden;
        animation: fadeUp .35s cubic-bezier(.22,.68,0,1.15) both;
      }
      .tp-q-card-header {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 18px 20px 14px;
        border-bottom: 2px solid ${T.bg};
      }
      .tp-q-num {
        width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-family: ${T.dFont}; font-size: 13px; font-weight: 900; color: #fff;
        background: linear-gradient(135deg,${T.violet},${T.pink});
      }
      .tp-q-meta { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
      .tp-q-type-badge {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px; border-radius: 999px;
        font-size: 9px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase;
        align-self: flex-start;
      }
      .tp-q-prompt {
        font-size: 15px; font-weight: 600; color: ${T.text};
        line-height: 1.55; word-break: break-word;
      }
      .tp-q-score-pill {
        padding: 2px 8px; border-radius: 999px; flex-shrink: 0; align-self: flex-start;
        font-size: 9px; font-weight: 900;
        background: ${T.amberL}; color: ${T.amber}; border: 1.5px solid rgba(245,166,35,.3);
      }
      .tp-q-body { padding: 18px 20px 20px; }

      /* ── MCQ options ── */
      .tp-mcq-options { display: flex; flex-direction: column; gap: 10px; }
      .tp-mcq-opt {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 16px; border-radius: 13px;
        border: 2px solid ${T.border};
        cursor: pointer; transition: all .16s cubic-bezier(.22,.68,0,1.2);
        user-select: none;
        background: ${T.bg};
      }
      .tp-mcq-opt:hover { border-color: ${T.violet}; background: ${T.violetL}; transform: translateX(2px); }
      .tp-mcq-opt--selected {
        border-color: ${T.violet} !important;
        background: ${T.violetL} !important;
        box-shadow: 0 0 0 3px rgba(108,53,222,.12);
      }
      .tp-mcq-radio {
        width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
        border: 2px solid ${T.border}; background: #fff;
        display: flex; align-items: center; justify-content: center;
        transition: all .15s;
      }
      .tp-mcq-opt--selected .tp-mcq-radio {
        border-color: ${T.violet}; background: ${T.violet};
      }
      .tp-mcq-radio-dot {
        width: 8px; height: 8px; border-radius: 50%; background: #fff;
        transform: scale(0); transition: transform .15s cubic-bezier(.22,.68,0,1.4);
      }
      .tp-mcq-opt--selected .tp-mcq-radio-dot { transform: scale(1); }
      .tp-mcq-key {
        width: 24px; height: 24px; border-radius: 7px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-family: ${T.dFont}; font-size: 11px; font-weight: 900;
        background: ${T.border}; color: ${T.muted};
        transition: all .15s;
      }
      .tp-mcq-opt--selected .tp-mcq-key { background: ${T.violet}; color: #fff; }
      .tp-mcq-text { font-size: 14px; color: ${T.text}; font-weight: 500; flex: 1; }

      /* ── Open answer ── */
      .tp-open-ta {
        width: 100%; min-height: 110px;
        border: 2px solid ${T.border}; border-radius: 13px;
        padding: 12px 15px; font-family: ${T.bFont}; font-size: 14px;
        color: ${T.text}; background: ${T.bg}; outline: none; resize: vertical;
        line-height: 1.65; transition: border-color .15s, box-shadow .15s;
      }
      .tp-open-ta:focus { border-color: ${T.sky}; box-shadow: 0 0 0 3px ${T.skyL}; background: #fff; }
      .tp-open-ta::placeholder { color: ${T.mutedL}; }

      /* ── Cloze ── */
      .tp-cloze-text {
        font-size: 15px; color: ${T.text}; line-height: 2.0;
        word-break: break-word;
      }
      .tp-cloze-input {
        display: inline-block;
        border: none; border-bottom: 2.5px solid ${T.amber};
        background: ${T.amberL}; border-radius: 6px 6px 0 0;
        padding: 1px 8px; font-family: ${T.bFont}; font-size: 15px;
        color: ${T.text}; outline: none;
        min-width: 80px; max-width: 180px;
        text-align: center; transition: border-color .15s, box-shadow .15s;
        vertical-align: middle; margin: 0 2px;
      }
      .tp-cloze-input:focus { border-bottom-color: ${T.orange}; box-shadow: 0 2px 0 ${T.orange}; background: #fff5e0; }

      /* ── Visual ── */
      .tp-visual-img-wrap {
        border-radius: 14px; overflow: hidden;
        border: 2px solid ${T.border}; margin-bottom: 18px;
        background: ${T.bg};
        max-height: 360px; display: flex; align-items: center; justify-content: center;
      }
      .tp-visual-img { max-width: 100%; max-height: 360px; display: block; object-fit: contain; }
      .tp-visual-img-placeholder {
        width: 100%; height: 180px;
        display: flex; align-items: center; justify-content: center;
        flex-direction: column; gap: 10px;
        color: ${T.muted}; font-size: 13px;
      }
      .tp-tf-options { display: flex; gap: 12px; }
      .tp-tf-btn {
        flex: 1; padding: 12px; border-radius: 13px;
        border: 2px solid ${T.border}; background: ${T.bg};
        font-family: ${T.dFont}; font-size: 15px; font-weight: 900;
        cursor: pointer; transition: all .16s cubic-bezier(.22,.68,0,1.2);
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .tp-tf-btn:hover { transform: translateY(-2px); }
      .tp-tf-btn--true:hover, .tp-tf-btn--true-sel {
        border-color: ${T.lime}; background: ${T.limeL}; color: ${T.lime};
        box-shadow: 0 4px 14px rgba(13,184,94,.18);
      }
      .tp-tf-btn--false:hover, .tp-tf-btn--false-sel {
        border-color: ${T.red}; background: ${T.redL}; color: ${T.red};
        box-shadow: 0 4px 14px rgba(239,68,68,.18);
      }
      .tp-tf-btn--true-sel { border-color: ${T.lime}; background: ${T.limeL}; color: ${T.lime}; }
      .tp-tf-btn--false-sel { border-color: ${T.red}; background: ${T.redL}; color: ${T.red}; }

      /* ── Loading spinner ── */
      .tp-loading {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 18px; min-height: 320px; color: ${T.muted};
      }
      .tp-spinner {
        width: 40px; height: 40px; border-radius: 50%;
        border: 3px solid ${T.border};
        border-top-color: ${T.violet};
        animation: spin .8s linear infinite;
      }
      .tp-loading-text { font-family: ${T.dFont}; font-size: 15px; font-weight: 700; color: ${T.muted}; }

      /* ── Empty state ── */
      .tp-empty {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 14px; padding: 60px 24px;
        background: #fff; border: 2px solid ${T.border}; border-radius: 20px;
        animation: fadeUp .35s both;
      }
      .tp-empty-icon { font-size: 44px; }
      .tp-empty-title { font-family: ${T.dFont}; font-size: 18px; font-weight: 900; color: ${T.text}; }
      .tp-empty-sub { font-size: 14px; color: ${T.muted}; text-align: center; line-height: 1.6; max-width: 340px; }

      /* ── Error state ── */
      .tp-error-box {
        background: ${T.redL}; border: 2px solid rgba(239,68,68,.25);
        border-radius: 16px; padding: 20px 24px;
        display: flex; align-items: flex-start; gap: 12px;
        animation: fadeIn .3s both;
      }
      .tp-error-icon { font-size: 20px; flex-shrink: 0; margin-top: 2px; }
      .tp-error-title { font-family: ${T.dFont}; font-size: 14px; font-weight: 900; color: ${T.red}; margin-bottom: 4px; }
      .tp-error-msg { font-size: 13px; color: ${T.red}; }

      /* ── Footer ── */
      .tp-footer {
        border-top: 2px solid ${T.border};
        background: #fff; padding: 18px 24px;
        display: flex; align-items: center; justify-content: center;
      }
      .tp-footer-back {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 10px 22px; border-radius: 12px; border: none;
        background: ${T.violetL}; color: ${T.violet};
        font-family: ${T.dFont}; font-size: 13px; font-weight: 900;
        cursor: pointer; transition: all .18s cubic-bezier(.22,.68,0,1.2);
      }
      .tp-footer-back:hover {
        background: ${T.violet}; color: #fff;
        transform: translateY(-2px);
        box-shadow: 0 6px 18px rgba(108,53,222,.32);
      }

      /* stagger cards */
      .tp-q-card:nth-child(1)  { animation-delay: .04s; }
      .tp-q-card:nth-child(2)  { animation-delay: .08s; }
      .tp-q-card:nth-child(3)  { animation-delay: .12s; }
      .tp-q-card:nth-child(4)  { animation-delay: .16s; }
      .tp-q-card:nth-child(5)  { animation-delay: .20s; }
      .tp-q-card:nth-child(6)  { animation-delay: .24s; }
      .tp-q-card:nth-child(7)  { animation-delay: .28s; }
      .tp-q-card:nth-child(8)  { animation-delay: .32s; }
      .tp-q-card:nth-child(9)  { animation-delay: .36s; }
      .tp-q-card:nth-child(10) { animation-delay: .40s; }
    `}</style>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MCQPreview
   ═══════════════════════════════════════════════════════════════════════════════ */
function MCQPreview({ question, answer, onChange }: { question: Question; answer: string | null; onChange: (value: string | null) => void }) {
  const options = question.options || [];
  return (
    <div className="tp-mcq-options">
      {options.map((opt: any, i: number) => {
        const id     = opt.id || String(i);
        const text   = typeof opt === "string" ? opt : opt.text || "";
        const key    = ["A", "B", "C", "D", "E", "F"][i] || String(i + 1);
        const sel    = answer === id;
        return (
          <div
            key={id}
            className={`tp-mcq-opt${sel ? " tp-mcq-opt--selected" : ""}`}
            role="radio"
            aria-checked={sel}
            tabIndex={0}
            onClick={() => onChange(sel ? null : id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(sel ? null : id)}
          >
            <div className="tp-mcq-radio">
              <div className="tp-mcq-radio-dot" />
            </div>
            <div className="tp-mcq-key">{key}</div>
            <div className="tp-mcq-text">{text}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   OpenAnswerPreview
   ═══════════════════════════════════════════════════════════════════════════════ */
function OpenAnswerPreview({ answer, onChange }: { answer: string; onChange: (value: string) => void }) {
  return (
    <textarea
      className="tp-open-ta"
      value={answer || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your answer here…"
      rows={4}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ClozePreview  — parses prompt for ___ gaps and replaces with inputs
   ═══════════════════════════════════════════════════════════════════════════════ */
function ClozePreview({ question, answer = {}, onChange }: { question: Question; answer?: AnswerDict; onChange: (value: AnswerDict) => void }) {
  // Support both gaps_config (structured) and ___-delimited prompts
  const prompt    = question.prompt || "";
  const gapConfig = question.gaps_config || [];

  // Split on ___ patterns (1–5 underscores treated as a gap)
  const parts = prompt.split(/_{1,5}/g);
  const gapCount = parts.length - 1;

  if (gapCount === 0) {
    // Fallback: use gaps_config count if no underscores in prompt
    const count = gapConfig.length || 1;
    return (
      <div className="tp-cloze-text">
        {prompt}
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {Array.from({ length: count }).map((_, gi) => (
            <input
              key={gi}
              type="text"
              className="tp-cloze-input"
              value={(answer as AnswerDict)[gi] || ""}
              onChange={(e) => onChange({ ...answer, [gi]: e.target.value })}
              placeholder={`Gap ${gi + 1}`}
              style={{ minWidth: 100 }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="tp-cloze-text">
      {parts.map((part: string, i: number) => (
        <span key={i}>
          {part}
          {i < gapCount && (
            <input
              type="text"
              className="tp-cloze-input"
              value={(answer as AnswerDict)[i] || ""}
              onChange={(e) => onChange({ ...answer, [i]: e.target.value })}
              placeholder={gapConfig[i]?.placeholder || "…"}
              style={{ minWidth: Math.max(80, (gapConfig[i]?.placeholder?.length || 4) * 10) }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   VisualPreview  — image + flexible answer input
   ═══════════════════════════════════════════════════════════════════════════════ */
function VisualPreview({ question, answer, onChange }: { question: Question; answer: string | null; onChange: (value: string | null) => void }) {
  const media      = question.media || [];
  const answerType = question.answer_type || "multiple_choice";
  const options    = question.options || [];

  // Find first image from media array
  const imgMedia = media.find((m: any) => m.type === "image" || m.url || m.path);
  const imgSrc   = imgMedia?.url || imgMedia?.path || null;

  const renderAnswer = () => {
    switch (answerType) {
      case "multiple_choice":
        return <MCQPreview question={question} answer={answer} onChange={onChange} />;

      case "single_choice":
        return (
          <div className="tp-mcq-options">
            {options.map((opt: any, i: number) => {
              const id  = opt.id || String(i);
              const text = typeof opt === "string" ? opt : opt.text || "";
              const key = ["A", "B", "C", "D", "E"][i] || String(i + 1);
              const sel = answer === id;
              return (
                <div
                  key={id}
                  className={`tp-mcq-opt${sel ? " tp-mcq-opt--selected" : ""}`}
                  role="radio" aria-checked={sel} tabIndex={0}
                  onClick={() => onChange(sel ? null : id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(sel ? null : id)}
                >
                  <div className="tp-mcq-radio"><div className="tp-mcq-radio-dot" /></div>
                  <div className="tp-mcq-key">{key}</div>
                  <div className="tp-mcq-text">{text}</div>
                </div>
              );
            })}
          </div>
        );

      case "true_false":
        return (
          <div className="tp-tf-options">
            <button
              className={`tp-tf-btn tp-tf-btn--true${answer === "true" ? " tp-tf-btn--true-sel" : ""}`}
              onClick={() => onChange(answer === "true" ? null : "true")}
            >
              ✓ True
            </button>
            <button
              className={`tp-tf-btn tp-tf-btn--false${answer === "false" ? " tp-tf-btn--false-sel" : ""}`}
              onClick={() => onChange(answer === "false" ? null : "false")}
            >
              ✕ False
            </button>
          </div>
        );

      case "open_answer":
      default:
        return <OpenAnswerPreview answer={answer || ""} onChange={onChange} />;
    }
  };

  return (
    <div>
      {/* Image */}
      <div className="tp-visual-img-wrap">
        {imgSrc ? (
          <img src={imgSrc} alt="Question visual" className="tp-visual-img" />
        ) : (
          <div className="tp-visual-img-placeholder">
            <span style={{ fontSize: 36 }}>🖼</span>
            <span>No image attached</span>
          </div>
        )}
      </div>

      {/* Answer input */}
      {renderAnswer()}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PreviewQuestionRenderer  — dispatch by type
   ═══════════════════════════════════════════════════════════════════════════════ */
function PreviewQuestionRenderer({ question, index, answer, onChange }: { question: Question; index: number; answer: any; onChange: (value: any) => void }) {
  const meta = QTYPE[question.type as keyof typeof QTYPE] || QTYPE.multiple_choice;

  const renderBody = () => {
    switch (question.type) {
      case "multiple_choice":
        return <MCQPreview question={question} answer={answer} onChange={onChange} />;
      case "open_answer":
        return <OpenAnswerPreview answer={answer} onChange={onChange} />;
      case "cloze":
        return <ClozePreview question={question} answer={answer || {}} onChange={onChange} />;
      case "visual":
        return <VisualPreview question={question} answer={answer} onChange={onChange} />;
      default:
        return (
          <p style={{ fontSize: 13, color: T.muted }}>
            Question type <strong>{question.type}</strong> preview not yet supported.
          </p>
        );
    }
  };

  return (
    <div className="tp-q-card" role="group" aria-label={`Question ${index + 1}`}>
      <div className="tp-q-card-header">
        <div className="tp-q-num">{index + 1}</div>
        <div className="tp-q-meta">
          <div
            className="tp-q-type-badge"
            style={{ background: meta.colorL, color: meta.color, border: `1.5px solid ${meta.color}33` }}
          >
            {meta.icon} {meta.label}
          </div>
          <div className="tp-q-prompt">{question.prompt || "No prompt provided."}</div>
        </div>
        {(question.score ?? 0) > 0 && (
          <div className="tp-q-score-pill">{question.score} pt{question.score !== 1 ? "s" : ""}</div>
        )}
      </div>
      <div className="tp-q-body">{renderBody()}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TestPreviewHeader  — sticky topbar
   ═══════════════════════════════════════════════════════════════════════════════ */
function TestPreviewHeader({ title, onBack }: { title?: string; onBack: () => void }) {
  return (
    <div className="tp-topbar" role="banner">
      <div className="tp-topbar-icon" aria-hidden="true">👁</div>
      <div className="tp-topbar-titles">
        <div className="tp-topbar-title">{title || "Test Preview"}</div>
        <div className="tp-topbar-sub">Read-only student view</div>
      </div>
      <div className="tp-preview-badge">Preview Mode</div>
      <div className="tp-topbar-divider" />
      <button className="tp-back-btn" onClick={onBack} aria-label="Back to builder">
        ← Back to Builder
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TestPreviewContainer  — scrollable list of questions
   ═══════════════════════════════════════════════════════════════════════════════ */
function TestPreviewContainer({ test, questions, answers, onAnswerChange }: { test: Test; questions: Question[]; answers: AnswerDict; onAnswerChange: (qId: string | number, value: any) => void }) {
  const totalPoints = questions.reduce((s: number, q: Question) => s + (q.score || 1), 0);

  return (
    <div className="tp-body">
      {/* Test metadata card */}
      <div className="tp-test-header">
        <h1 className="tp-test-title">{test.title || "Untitled Test"}</h1>

        {test.description && (
          <p className="tp-test-desc">{test.description}</p>
        )}

        <div className="tp-test-meta">
          <span className="tp-meta-chip">
            📝 {questions.length} question{questions.length !== 1 ? "s" : ""}
          </span>
          {totalPoints > 0 && (
            <span className="tp-meta-chip">⭐ {totalPoints} pts total</span>
          )}
          {(test.time_limit_minutes ?? 0) > 0 && (
            <span className="tp-meta-chip">⏱ {test.time_limit_minutes} min</span>
          )}
          {(test.passing_score ?? 0) > 0 && (
            <span className="tp-meta-chip">🎯 Pass: {test.passing_score}%</span>
          )}
          {test.status && (
            <span
              className="tp-meta-chip"
              style={
                test.status === "published"
                  ? { background: T.limeL, color: T.lime, border: `1.5px solid rgba(13,184,94,.25)` }
                  : { background: T.amberL, color: T.amber, border: `1.5px solid rgba(245,166,35,.25)` }
              }
            >
              {test.status === "published" ? "✓ Published" : "◉ Draft"}
            </span>
          )}
        </div>

        {test.instructions && (
          <div className="tp-instructions-box">
            <span className="tp-instructions-icon">ℹ️</span>
            <span>{test.instructions}</span>
          </div>
        )}
      </div>

      {/* Questions */}
      {questions.length === 0 ? (
        <div className="tp-empty">
          <div className="tp-empty-icon">📭</div>
          <div className="tp-empty-title">No questions yet</div>
          <div className="tp-empty-sub">
            This test has no questions yet.{" "}
            Return to the builder to add questions.
          </div>
        </div>
      ) : (
        <div className="tp-q-list" role="list">
          {questions.map((q: Question, i: number) => (
            <PreviewQuestionRenderer
              key={q.id || i}
              question={q}
              index={i}
              answer={answers[String(q.id)]}
              onChange={(val: any) => onAnswerChange(q.id!, val)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TestPreviewPage  — top-level entry point
   Route: /admin/tests/:testId/preview
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function TestPreviewPage() {
  const { testId } = useParams();
  const navigate   = useNavigate();

  const [test,      setTest]      = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers,   setAnswers]   = useState<AnswerDict>({});   // { questionId: value }
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  /* ── Fetch test + questions on mount ── */
  const loadPreview = useCallback(async () => {
    if (!testId) return;
    setLoading(true);
    setError(null);
    try {
      const [testData, questionsData] = await Promise.all([
        apiFetch(`/tests/${testId}`),
        apiFetch(`/tests/${testId}/questions`),
      ]);
      setTest(testData);
      const normalised = normaliseQuestions(questionsData);
      // Sort by order_index
      normalised.sort((a: Question, b: Question) => (a.order_index ?? 0) - (b.order_index ?? 0));
      setQuestions(normalised);
    } catch (e: any) {
      setError(e?.message || "Failed to load test preview.");
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  /* ── Handlers ── */
  const handleAnswerChange = useCallback((qId: string | number, value: any) => {
    setAnswers((prev) => ({ ...prev, [String(qId)]: value }));
  }, []);

  const handleBack = useCallback(() => {
    // Navigate back to unit details page if we came from there, otherwise to test builder
    const referrer = document.referrer;
    if (referrer.includes('/admin/units/')) {
      const unitMatch = referrer.match(/\/admin\/units\/(\d+)/);
      if (unitMatch) {
        navigate(`/admin/units/${unitMatch[1]}`);
        return;
      }
    }
    // Default: go to test builder (edit page)
    navigate(`/admin/tests/${testId}/builder`);
  }, [navigate, testId]);

  /* ── Render ── */
  return (
    <>
      <PreviewStyles />
      <div className="tp-root">

        {/* Topbar */}
        <TestPreviewHeader
          title={test?.title}
          onBack={handleBack}
        />

        {/* Body */}
        {loading ? (
          <div className="tp-loading" role="status" aria-live="polite">
            <div className="tp-spinner" aria-hidden="true" />
            <div className="tp-loading-text">Loading preview…</div>
          </div>
        ) : error ? (
          <div className="tp-body">
            <div className="tp-error-box" role="alert">
              <span className="tp-error-icon">⚠️</span>
              <div>
                <div className="tp-error-title">Could not load test</div>
                <div className="tp-error-msg">{error}</div>
              </div>
            </div>
          </div>
        ) : test ? (
          <TestPreviewContainer
            test={test}
            questions={questions}
            answers={answers}
            onAnswerChange={handleAnswerChange}
          />
        ) : null}

        {/* Footer */}
        {!loading && !error && (
          <footer className="tp-footer">
            <button className="tp-footer-back" onClick={handleBack}>
              ← Back to Builder
            </button>
          </footer>
        )}

      </div>
    </>
  );
}