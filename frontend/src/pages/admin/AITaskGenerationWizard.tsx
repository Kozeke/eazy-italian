/**
 * AITaskGenerationWizard.tsx
 *
 * Route entry: /admin/tasks/new  (via AdminTaskCreatePage)
 *
 * Components exported:
 *   TaskGenerationMethodPicker  — modal: "Generate with AI" vs "Build manually"
 *   AITaskGenerationWizard      — full wizard shell (form → loading → done)
 *   generateTasksAI             — API helper: POST /units/{unit_id}/generate-tasks
 *
 * UX flow:
 *   1. Teacher clicks "Create Task" → TaskGenerationMethodPicker opens
 *   2a. Manual → existing AdminTaskCreatePage flow (unchanged)
 *   2b. AI → AITaskGenerationWizard opens
 *   3. Teacher fills form → clicks "Generate Draft Tasks"
 *   4. POST /units/{unit_id}/generate-tasks (synchronous)
 *   5. On success → navigate to Task Builder with generated IDs
 *      e.g. /admin/tasks/builder?generated=41,42,43
 *
 * Backend contract:
 *   POST /units/{unit_id}/generate-tasks
 *   Body: { task_count, difficulty, content_language, task_language }
 *   Response: { tasks_created, tasks: number[], message }
 *
 * Design language: identical to AITestGenerationWizard / CreateTestMethodPicker
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const T = {
  violet:  "#6C35DE", violetL: "#EDE9FF", violetD: "#4F23B0",
  pink:    "#F0447C", pinkL:   "#FDE8F0",
  lime:    "#0DB85E", limeL:   "#DCFCE7",
  sky:     "#0099E6", skyL:    "#DAEEFF",
  amber:   "#F5A623", amberL:  "#FEF3C7",
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

/* ─── Types ──────────────────────────────────────────────────────────────── */
export interface TaskGenFormData {
  unit_id:          number | null;
  task_count:       number;
  difficulty:       "easy" | "medium" | "hard";
  content_language: string;
  task_language:    string;
}

export interface GenerateTasksResponse {
  tasks_created: number;
  tasks:         number[];
  message:       string;
}

/* ─── API helper ─────────────────────────────────────────────────────────── */
const API_BASE = "/api/v1";

function authHeaders() {
  const t = (localStorage.getItem("token") || "").trim();
  return {
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

/**
 * POST /units/{unit_id}/generate-tasks
 * Synchronous — no polling needed.
 */
export async function generateTasksAI(
  unitId: number,
  payload: Omit<TaskGenFormData, "unit_id">
): Promise<GenerateTasksResponse> {
  const res = await fetch(`${API_BASE}/units/${unitId}/generate-tasks`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { detail?: string; message?: string }).detail ||
      (body as { detail?: string; message?: string }).message ||
      `HTTP ${res.status}`
    );
  }
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════════════ */
const CSS = `
  @keyframes atgTaskFadeIn  { from{opacity:0}              to{opacity:1}             }
  @keyframes atgTaskFadeUp  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:none} }
  @keyframes atgTaskSpin    { to{transform:rotate(360deg)} }
  @keyframes atgTaskPulse   { 0%,80%,100%{transform:scale(0);opacity:.4} 40%{transform:scale(1);opacity:1} }
  @keyframes atgTaskBar     { 0%{width:12%} 50%{width:84%} 100%{width:12%} }

  /* ── Method Picker overlay ── */
  .atgt-mpovl {
    position: fixed; inset: 0; z-index: 1200;
    background: rgba(26,16,53,.55); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    animation: atgTaskFadeIn .22s ease both;
  }
  .atgt-mpsheet {
    background: ${T.bg}; border-radius: 28px;
    border: 1.5px solid ${T.border};
    box-shadow: 0 32px 80px rgba(108,53,222,.18), 0 8px 24px rgba(26,16,53,.12);
    width: 100%; max-width: 520px; padding: 40px 36px 36px;
    position: relative;
    animation: atgTaskFadeUp .38s cubic-bezier(.22,.68,0,1.2) both;
  }
  @media (max-width: 560px) {
    .atgt-mpsheet { padding: 28px 20px 24px; border-radius: 20px; }
  }
  .atgt-mp-close {
    position: absolute; top: 18px; right: 18px;
    width: 34px; height: 34px; border-radius: 50%;
    background: ${T.violetL}; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: ${T.sub}; font-size: 16px; font-weight: 700;
    transition: background .18s, color .18s, transform .18s;
  }
  .atgt-mp-close:hover { background: ${T.border}; color: ${T.violet}; transform: scale(1.1); }
  .atgt-mp-title {
    font-family: ${T.dFont}; font-weight: 900; font-size: 26px;
    color: ${T.text}; margin-bottom: 6px; line-height: 1.2;
  }
  .atgt-mp-sub {
    font-family: ${T.bFont}; font-size: 14px; color: ${T.muted};
    margin-bottom: 28px; line-height: 1.5;
  }
  .atgt-mp-unit {
    display: inline-flex; align-items: center; gap: 6px;
    background: ${T.violetL}; color: ${T.violet};
    border-radius: 20px; padding: 3px 12px;
    font-size: 12px; font-weight: 700; font-family: ${T.bFont};
    margin-bottom: 20px;
  }
  .atgt-mp-cards { display: flex; flex-direction: column; gap: 14px; }
  .atgt-mp-card {
    cursor: pointer; border-radius: 22px; border: 3px solid ${T.border};
    background: ${T.white}; padding: 20px 22px;
    display: flex; align-items: flex-start; gap: 16px;
    transition: all .22s cubic-bezier(.22,.68,0,1.3);
    user-select: none; position: relative; overflow: hidden;
  }
  .atgt-mp-card:hover {
    transform: translateY(-5px) scale(1.015);
    border-color: ${T.violet};
    box-shadow: 0 12px 32px rgba(108,53,222,.13);
  }
  .atgt-mp-card--ai { background: linear-gradient(135deg, ${T.violetL} 0%, #fff 60%); }
  .atgt-mp-card--sel,
  .atgt-mp-card--sel:hover {
    border-color: transparent;
    transform: translateY(-5px) scale(1.015);
    background: linear-gradient(white, white) padding-box,
                linear-gradient(135deg, ${T.violet}, ${T.pink}) border-box;
    border: 3px solid transparent;
    box-shadow: 0 12px 36px rgba(108,53,222,.22);
  }
  .atgt-mp-icon {
    width: 48px; height: 48px; border-radius: 16px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 22px;
  }
  .atgt-mp-icon--ai     { background: linear-gradient(135deg, ${T.violet}, ${T.pink}); }
  .atgt-mp-icon--manual { background: linear-gradient(135deg, ${T.sky}, #0DB85E); }
  .atgt-mp-card-title {
    font-family: ${T.dFont}; font-weight: 800; font-size: 17px;
    color: ${T.text}; display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
  }
  .atgt-mp-card-desc {
    font-family: ${T.bFont}; font-size: 13px; color: ${T.sub}; line-height: 1.5;
  }
  .atgt-mp-badge {
    display: inline-flex; align-items: center; gap: 4px;
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    color: #fff; border-radius: 20px; padding: 2px 10px;
    font-size: 11px; font-weight: 700; font-family: ${T.bFont}; white-space: nowrap;
  }
  .atgt-mp-btn {
    margin-top: 28px; width: 100%; padding: 15px;
    border-radius: 16px; border: none; cursor: pointer;
    font-family: ${T.dFont}; font-weight: 900; font-size: 17px;
    transition: all .2s cubic-bezier(.22,.68,0,1.2);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .atgt-mp-btn--active {
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    color: #fff; box-shadow: 0 8px 24px rgba(108,53,222,.35);
  }
  .atgt-mp-btn--active:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(108,53,222,.45); }
  .atgt-mp-btn--inactive { background: ${T.violetL}; color: ${T.muted}; cursor: default; }

  /* ══ Wizard overlay / sheet ══ */
  .atgt-wovl {
    position: fixed; inset: 0; z-index: 1300;
    background: rgba(26,16,53,.6); backdrop-filter: blur(5px);
    display: flex; align-items: center; justify-content: center; padding: 16px;
    animation: atgTaskFadeIn .22s ease both;
  }
  .atgt-wsheet {
    background: ${T.bg}; border-radius: 28px; border: 1.5px solid ${T.border};
    box-shadow: 0 36px 90px rgba(108,53,222,.2), 0 8px 24px rgba(26,16,53,.12);
    width: 100%; max-width: 580px; max-height: calc(100vh - 32px);
    display: flex; flex-direction: column; overflow: hidden;
    animation: atgTaskFadeUp .38s cubic-bezier(.22,.68,0,1.2) both;
  }

  /* ── Wizard header ── */
  .atgt-whdr {
    background: linear-gradient(135deg, ${T.violet} 0%, ${T.pink} 100%);
    padding: 26px 30px 22px; flex-shrink: 0;
  }
  .atgt-whdr-top {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: 12px; margin-bottom: 10px;
  }
  .atgt-whdr-emoji {
    width: 46px; height: 46px; border-radius: 15px;
    background: rgba(255,255,255,.22); font-size: 22px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .atgt-whdr-acts { display: flex; gap: 8px; }
  .atgt-whdr-btn {
    width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer;
    background: rgba(255,255,255,.2); color: #fff; font-size: 13px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    transition: background .18s, transform .18s; flex-shrink: 0;
  }
  .atgt-whdr-btn:hover { background: rgba(255,255,255,.38); transform: scale(1.1); }
  .atgt-whdr-title {
    font-family: ${T.dFont}; font-weight: 900; font-size: 21px;
    color: #fff; margin-bottom: 4px; line-height: 1.2;
  }
  .atgt-whdr-sub {
    font-family: ${T.bFont}; font-size: 13px; color: rgba(255,255,255,.8); line-height: 1.5;
  }
  .atgt-whdr-pill {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.28);
    border-radius: 20px; padding: 3px 12px; margin-top: 9px;
    font-size: 12px; font-weight: 700; color: #fff; font-family: ${T.bFont};
  }

  /* ── Wizard body ── */
  .atgt-wbody {
    flex: 1; overflow-y: auto; padding: 24px 30px;
    display: flex; flex-direction: column;
  }
  .atgt-wbody::-webkit-scrollbar { width: 4px; }
  .atgt-wbody::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 999px; }

  /* ── Form sections ── */
  .atgt-sec { margin-bottom: 22px; }
  .atgt-sec-lbl {
    font-family: ${T.bFont}; font-size: 11px; font-weight: 700;
    color: ${T.muted}; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 14px;
  }
  .atgt-fld { margin-bottom: 14px; }
  .atgt-fld-lbl {
    display: block; font-family: ${T.bFont}; font-size: 13px;
    font-weight: 600; color: ${T.sub}; margin-bottom: 6px;
  }
  .atgt-fld-lbl em { color: ${T.muted}; font-style: normal; font-weight: 400; margin-left: 4px; }
  .atgt-sel {
    width: 100%; border: 2px solid ${T.border}; border-radius: 13px;
    background: ${T.white}; color: ${T.text};
    font-family: ${T.bFont}; font-size: 14px;
    padding: 10px 13px; transition: border-color .18s, box-shadow .18s;
    outline: none; appearance: none;
  }
  .atgt-sel:focus { border-color: ${T.violet}; box-shadow: 0 0 0 3px ${T.violetL}; }
  .atgt-sel--err  { border-color: ${T.red} !important; box-shadow: 0 0 0 3px ${T.redL} !important; }
  .atgt-err-txt {
    margin-top: 5px; font-size: 12px; color: ${T.red};
    font-family: ${T.bFont}; display: flex; align-items: center; gap: 4px;
  }
  .atgt-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 480px) { .atgt-g2 { grid-template-columns: 1fr; } }

  /* ── Stepper ── */
  .atgt-step {
    display: flex; border: 2px solid ${T.border}; border-radius: 13px;
    background: ${T.white}; overflow: hidden;
  }
  .atgt-step:focus-within { border-color: ${T.violet}; box-shadow: 0 0 0 3px ${T.violetL}; }
  .atgt-step-btn {
    width: 38px; min-height: 42px; border: none; background: transparent; cursor: pointer;
    font-size: 17px; font-weight: 700; color: ${T.sub};
    display: flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s; flex-shrink: 0;
  }
  .atgt-step-btn:hover:not(:disabled) { background: ${T.violetL}; color: ${T.violet}; }
  .atgt-step-btn:disabled { opacity: .3; cursor: default; }
  .atgt-step-val {
    flex: 1; text-align: center; border: none; outline: none;
    font-family: ${T.dFont}; font-weight: 800; font-size: 16px;
    color: ${T.text}; background: transparent; padding: 0 2px;
  }
  .atgt-step-val::-webkit-inner-spin-button,
  .atgt-step-val::-webkit-outer-spin-button { appearance: none; }

  /* ── Difficulty chips ── */
  .atgt-chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .atgt-chip {
    cursor: pointer; border-radius: 10px; padding: 8px 16px;
    font-family: ${T.dFont}; font-size: 13px; font-weight: 800;
    border: 2px solid ${T.border}; background: ${T.white}; color: ${T.sub};
    transition: all .18s cubic-bezier(.22,.68,0,1.2); user-select: none;
    display: flex; align-items: center; gap: 5px;
  }
  .atgt-chip:hover { border-color: ${T.violet}; color: ${T.violet}; transform: translateY(-2px); }
  .atgt-chip--on {
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    border-color: transparent; color: #fff; transform: translateY(-2px);
    box-shadow: 0 5px 16px rgba(108,53,222,.28);
  }

  /* ── Submit error ── */
  .atgt-submit-err {
    background: ${T.redL}; border: 1.5px solid ${T.red}40;
    border-radius: 13px; padding: 12px 16px; margin-bottom: 18px;
    font-family: ${T.bFont}; font-size: 13px; color: ${T.red};
    display: flex; align-items: flex-start; gap: 8px; line-height: 1.5;
  }

  /* ── Footer ── */
  .atgt-foot {
    padding: 14px 30px 22px; flex-shrink: 0;
    display: flex; gap: 10px; align-items: center;
    border-top: 1.5px solid ${T.border};
  }
  .atgt-btn-back {
    flex-shrink: 0; padding: 11px 18px; border-radius: 13px;
    border: 2px solid ${T.border}; background: ${T.white}; color: ${T.sub};
    font-family: ${T.dFont}; font-weight: 800; font-size: 14px; cursor: pointer;
    display: flex; align-items: center; gap: 6px;
    transition: all .18s cubic-bezier(.22,.68,0,1.2);
  }
  .atgt-btn-back:hover { border-color: ${T.violet}; color: ${T.violet}; transform: translateY(-2px); }
  .atgt-btn-primary {
    flex: 1; padding: 13px; border-radius: 13px; border: none; cursor: pointer;
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    color: #fff; font-family: ${T.dFont}; font-weight: 900; font-size: 16px;
    box-shadow: 0 8px 24px rgba(108,53,222,.3);
    transition: all .2s cubic-bezier(.22,.68,0,1.2);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .atgt-btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(108,53,222,.42); }
  .atgt-btn-primary:disabled { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }
  .atgt-spinner {
    display: inline-block; width: 15px; height: 15px; flex-shrink: 0;
    border: 2.5px solid rgba(255,255,255,.35); border-top-color: #fff;
    border-radius: 50%; animation: atgTaskSpin .7s linear infinite;
  }

  /* ── Loading screen ── */
  .atgt-loading {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 48px 30px 32px; text-align: center;
  }
  .atgt-loading-ring {
    width: 72px; height: 72px; border-radius: 50%;
    border: 5px solid ${T.violetL};
    border-top-color: ${T.violet};
    animation: atgTaskSpin 1s linear infinite;
    margin-bottom: 28px; flex-shrink: 0;
  }
  .atgt-loading-title {
    font-family: ${T.dFont}; font-weight: 900; font-size: 21px;
    color: ${T.text}; margin-bottom: 8px;
  }
  .atgt-loading-desc {
    font-family: ${T.bFont}; font-size: 13px; color: ${T.muted};
    line-height: 1.65; margin-bottom: 28px; max-width: 320px;
  }
  .atgt-dot-row { display: flex; gap: 6px; }
  .atgt-dot-row span {
    display: block; width: 8px; height: 8px; border-radius: 50%;
    background: ${T.violet}; animation: atgTaskPulse 1.4s ease-in-out infinite;
  }
  .atgt-dot-row span:nth-child(2) { animation-delay: .2s; }
  .atgt-dot-row span:nth-child(3) { animation-delay: .4s; }

  .atgt-prog-track {
    width: 100%; max-width: 280px; height: 8px;
    border-radius: 999px; background: ${T.border}; overflow: hidden; margin-bottom: 20px;
  }
  .atgt-prog-fill {
    height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, ${T.violet}, ${T.pink});
    animation: atgTaskBar 2.4s ease-in-out infinite;
  }
`;

/* ═══════════════════════════════════════════════════════════════════════════
   TASK GENERATION METHOD PICKER
   ═══════════════════════════════════════════════════════════════════════════ */
export interface TaskGenerationMethodPickerProps {
  open:       boolean;
  onClose:    () => void;
  unitId?:    number | null;
  unitTitle?: string | null;
  onManual:   () => void;
  onAI:       () => void;
}

export function TaskGenerationMethodPicker({
  open,
  onClose,
  unitTitle = null,
  onManual,
  onAI,
}: TaskGenerationMethodPickerProps) {
  const [selected, setSelected] = useState<"ai" | "manual" | null>(null);

  useEffect(() => { if (open) setSelected(null); }, [open]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); },
    [onClose]
  );
  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  const handleConfirm = () => {
    if (selected === "ai")     onAI?.();
    if (selected === "manual") onManual?.();
  };

  if (!open) return null;

  const content = (
    <>
      <style>{CSS}</style>
      <div
        className="atgt-mpovl"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        role="dialog"
        aria-modal="true"
        aria-label="Create Task — choose method"
      >
        <div className="atgt-mpsheet">
          <button className="atgt-mp-close" onClick={onClose} aria-label="Close">✕</button>

          <div className="atgt-mp-title">Create Task</div>
          <div className="atgt-mp-sub">Choose how you want to create your task.</div>

          {unitTitle && (
            <div className="atgt-mp-unit">
              <span>📘</span>{unitTitle}
            </div>
          )}

          <div className="atgt-mp-cards">
            {/* AI card */}
            <div
              className={`atgt-mp-card atgt-mp-card--ai${selected === "ai" ? " atgt-mp-card--sel" : ""}`}
              onClick={() => setSelected("ai")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelected("ai")}
              aria-pressed={selected === "ai"}
            >
              <div className="atgt-mp-icon atgt-mp-icon--ai">✨</div>
              <div>
                <div className="atgt-mp-card-title">
                  Generate with AI
                  <span className="atgt-mp-badge">⭐ Recommended</span>
                </div>
                <div className="atgt-mp-card-desc">
                  Create draft tasks automatically from the unit content, then review and edit before publishing.
                </div>
              </div>
            </div>

            {/* Manual card */}
            <div
              className={`atgt-mp-card${selected === "manual" ? " atgt-mp-card--sel" : ""}`}
              onClick={() => setSelected("manual")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelected("manual")}
              aria-pressed={selected === "manual"}
            >
              <div className="atgt-mp-icon atgt-mp-icon--manual">🛠</div>
              <div>
                <div className="atgt-mp-card-title">Build manually</div>
                <div className="atgt-mp-card-desc">
                  Start building the task manually in the task builder. Full control over every detail.
                </div>
              </div>
            </div>
          </div>

          <button
            className={`atgt-mp-btn ${selected ? "atgt-mp-btn--active" : "atgt-mp-btn--inactive"}`}
            onClick={handleConfirm}
            disabled={!selected}
            aria-disabled={!selected}
          >
            {!selected      && "Select a method above"}
            {selected === "ai"     && "✨ Continue with AI"}
            {selected === "manual" && "🛠 Open Task Builder"}
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}

/* ═══════════════════════════════════════════════════════════════════════════
   STEPPER
   ═══════════════════════════════════════════════════════════════════════════ */
interface StepperProps {
  value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number;
}
function Stepper({ value, onChange, min, max, step = 1 }: StepperProps) {
  return (
    <div className="atgt-step">
      <button type="button" className="atgt-step-btn"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min} aria-label="Decrease">−</button>
      <input type="number" className="atgt-step-val"
        value={value} min={min} max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
        }} />
      <button type="button" className="atgt-step-btn"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max} aria-label="Increase">+</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORM DATA DEFAULTS + VALIDATION
   ═══════════════════════════════════════════════════════════════════════════ */
function defaultForm(unitId: number | null): TaskGenFormData {
  return {
    unit_id:          unitId ?? null,
    task_count:       3,
    difficulty:       "medium",
    content_language: "auto",
    task_language:    "english",
  };
}

type FormErrors = Partial<Record<keyof TaskGenFormData, string>>;

function validate(f: TaskGenFormData): FormErrors {
  const e: FormErrors = {};
  if (!f.unit_id)                          e.unit_id    = "Unit ID is required.";
  if (f.task_count < 1 || f.task_count > 10) e.task_count = "Must be between 1 and 10.";
  if (!["easy","medium","hard"].includes(f.difficulty)) e.difficulty = "Select a difficulty.";
  return e;
}

const DIFFICULTY_OPTS = [
  { value: "easy",   label: "Easy",   emoji: "🌱" },
  { value: "medium", label: "Medium", emoji: "⚡" },
  { value: "hard",   label: "Hard",   emoji: "🔥" },
];

const CONTENT_LANGUAGE_OPTS = [
  { value: "auto", label: "Auto-detect" },
  { value: "en",   label: "English"     },
  { value: "it",   label: "Italian"     },
  { value: "es",   label: "Spanish"     },
  { value: "fr",   label: "French"      },
  { value: "de",   label: "German"      },
  { value: "ru",   label: "Russian"     },
  { value: "pt",   label: "Portuguese"  },
  { value: "zh",   label: "Chinese"     },
  { value: "ar",   label: "Arabic"      },
  { value: "ja",   label: "Japanese"    },
];

const TASK_LANGUAGE_OPTS = [
  { value: "english",    label: "English"    },
  { value: "italian",    label: "Italian"    },
  { value: "spanish",    label: "Spanish"    },
  { value: "french",     label: "French"     },
  { value: "german",     label: "German"     },
  { value: "russian",    label: "Russian"    },
  { value: "portuguese", label: "Portuguese" },
  { value: "chinese",    label: "Chinese"    },
  { value: "arabic",     label: "Arabic"     },
  { value: "japanese",   label: "Japanese"   },
];

/* ═══════════════════════════════════════════════════════════════════════════
   AI TASK GENERATION FORM  (inner screen)
   ═══════════════════════════════════════════════════════════════════════════ */
interface AITaskGenerationFormProps {
  form:        TaskGenFormData;
  setForm:     React.Dispatch<React.SetStateAction<TaskGenFormData>>;
  onBack:      () => void;
  onSubmit:    (form: TaskGenFormData) => void;
  submitting:  boolean;
  submitError: string | null;
}

export function AITaskGenerationForm({
  form, setForm, onBack, onSubmit, submitting, submitError,
}: AITaskGenerationFormProps) {
  const [touched, setTouched] = useState<Partial<Record<keyof TaskGenFormData, boolean>>>({});
  const errs  = validate(form);
  const touch = (f: keyof TaskGenFormData) => setTouched((p) => ({ ...p, [f]: true }));
  const set   = <K extends keyof TaskGenFormData>(f: K, v: TaskGenFormData[K]) => {
    setForm((p) => ({ ...p, [f]: v }));
    touch(f);
  };
  const fe = (f: keyof TaskGenFormData) => touched[f] && errs[f];

  const handleSubmit = () => {
    setTouched(Object.fromEntries(Object.keys(form).map((k) => [k, true])));
    if (Object.keys(errs).length) return;
    onSubmit(form);
  };

  return (
    <>
      <div className="atgt-wbody">
        {/* ── Task count ── */}
        <div className="atgt-sec">
          <div className="atgt-sec-lbl">Task Settings</div>
          <div className="atgt-fld">
            <label className="atgt-fld-lbl">
              Number of Tasks <em>1 – 10</em>
            </label>
            <Stepper value={form.task_count} min={1} max={10}
              onChange={(v) => set("task_count", v)} />
            {fe("task_count") && <div className="atgt-err-txt">⚠ {errs.task_count}</div>}
          </div>

          {/* ── Difficulty ── */}
          <div className="atgt-fld">
            <label className="atgt-fld-lbl">Difficulty</label>
            <div className="atgt-chips">
              {DIFFICULTY_OPTS.map(({ value, label, emoji }) => (
                <div
                  key={value}
                  className={`atgt-chip${form.difficulty === value ? " atgt-chip--on" : ""}`}
                  onClick={() => set("difficulty", value as TaskGenFormData["difficulty"])}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && set("difficulty", value as TaskGenFormData["difficulty"])}
                  aria-pressed={form.difficulty === value}
                >
                  {emoji} {label}
                </div>
              ))}
            </div>
            {fe("difficulty") && <div className="atgt-err-txt">⚠ {errs.difficulty}</div>}
          </div>
        </div>

        {/* ── Languages ── */}
        <div className="atgt-sec">
          <div className="atgt-sec-lbl">Language Settings</div>
          <div className="atgt-g2">
            <div className="atgt-fld">
              <label className="atgt-fld-lbl">
                Content Language <em>source</em>
              </label>
              <select
                className="atgt-sel"
                value={form.content_language}
                onChange={(e) => set("content_language", e.target.value)}
              >
                {CONTENT_LANGUAGE_OPTS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="atgt-fld">
              <label className="atgt-fld-lbl">
                Task Language <em>output</em>
              </label>
              <select
                className="atgt-sel"
                value={form.task_language}
                onChange={(e) => set("task_language", e.target.value)}
              >
                {TASK_LANGUAGE_OPTS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Draft notice ── */}
        <div style={{
          background: T.violetL, borderRadius: 13, padding: "12px 16px",
          border: `1.5px solid ${T.border}`, marginBottom: 8,
          fontFamily: T.bFont, fontSize: 13, color: T.sub, lineHeight: 1.5,
        }}>
          📝 Generated tasks will be saved as <strong>drafts</strong>. You can review and edit each one before publishing.
        </div>

        {/* ── Submit error ── */}
        {submitError && (
          <div className="atgt-submit-err">
            <span style={{ flexShrink: 0 }}>⚠</span>
            <span>{submitError}</span>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="atgt-foot">
        <button className="atgt-btn-back" onClick={onBack} disabled={submitting}>
          ← Back
        </button>
        <button
          className="atgt-btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <><div className="atgt-spinner" /> Generating tasks…</>
          ) : (
            <>✨ Generate Draft Tasks</>
          )}
        </button>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AI TASK GENERATION LOADING  (inner screen — shown while request in flight)
   ═══════════════════════════════════════════════════════════════════════════ */
export function AITaskGenerationLoading() {
  return (
    <div className="atgt-loading">
      <div className="atgt-loading-ring" />
      <div className="atgt-loading-title">Generating tasks…</div>
      <div className="atgt-loading-desc">
        This may take a few seconds.<br />
        We're drafting tasks from your unit content.
      </div>
      <div className="atgt-prog-track">
        <div className="atgt-prog-fill" />
      </div>
      <div className="atgt-dot-row">
        <span /><span /><span />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AI TASK GENERATION WIZARD  (main export)
   ═══════════════════════════════════════════════════════════════════════════ */
export interface AITaskGenerationWizardProps {
  open:       boolean;
  onClose:    () => void;
  onBack:     () => void;
  unitId:     number | null;
  unitTitle?: string | null;
  onDone:     (taskIds: number[]) => void;
}

export function AITaskGenerationWizard({
  open,
  onClose,
  onBack,
  unitId,
  unitTitle = null,
  onDone,
}: AITaskGenerationWizardProps) {
  type Screen = "form" | "loading";
  const [screen,      setScreen]      = useState<Screen>("form");
  const [form,        setForm]        = useState<TaskGenFormData>(() => defaultForm(unitId));
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isMountedRef = useRef(false);

  /* Sync unitId into form when prop changes */
  useEffect(() => {
    if (unitId != null) setForm((p) => ({ ...p, unit_id: unitId }));
  }, [unitId]);

  /* Reset to form screen each open */
  useEffect(() => {
    if (open) {
      setScreen("form");
      setSubmitError(null);
      setForm(defaultForm(unitId));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Mount/unmount */
  useEffect(() => {
    isMountedRef.current = open;
    return () => { isMountedRef.current = false; };
  }, [open]);

  /* Escape key */
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    if (submitting) return; // don't dismiss mid-request
    onClose?.();
  };

  const handleSubmit = async (formValues: TaskGenFormData) => {
    if (!formValues.unit_id) {
      setSubmitError("Unit ID is missing — please close and reopen from a unit page.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setScreen("loading");

    const payload = {
      task_count:       formValues.task_count,
      difficulty:       formValues.difficulty,
      content_language: formValues.content_language,
      task_language:    formValues.task_language,
    };

    try {
      const resp = await generateTasksAI(formValues.unit_id, payload);

      if (!isMountedRef.current) return;

      // Hand off to parent — parent navigates to Task Builder
      onDone(resp.tasks ?? []);
    } catch (err) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : "Failed to generate tasks. Please try again.";
      setSubmitError(msg);
      setScreen("form");
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  if (!open) return null;

  const content = (
    <>
      <style>{CSS}</style>
      <div
        className="atgt-wovl"
        onClick={(e) => { if (e.target === e.currentTarget && !submitting) handleClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label="Generate Tasks with AI"
      >
        <div className="atgt-wsheet">
          {/* ── Header ── */}
          <div className="atgt-whdr">
            <div className="atgt-whdr-top">
              <div className="atgt-whdr-emoji">✨</div>
              <div className="atgt-whdr-acts">
                {screen === "form" && !submitting && (
                  <button className="atgt-whdr-btn" onClick={onBack} aria-label="Back">←</button>
                )}
                {!submitting && (
                  <button className="atgt-whdr-btn" onClick={handleClose} aria-label="Close">✕</button>
                )}
              </div>
            </div>
            <div className="atgt-whdr-title">
              {screen === "form" ? "Generate Tasks with AI" : "Generating Tasks…"}
            </div>
            <div className="atgt-whdr-sub">
              {screen === "form"
                ? "Configure the draft — AI writes the tasks."
                : "We'll load them in the Task Builder once ready."}
            </div>
            {unitTitle && (
              <div className="atgt-whdr-pill"><span>📘</span>{unitTitle}</div>
            )}
          </div>

          {/* ── Screen ── */}
          {screen === "form" && (
            <AITaskGenerationForm
              form={form}
              setForm={setForm}
              onBack={onBack}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
            />
          )}

          {screen === "loading" && <AITaskGenerationLoading />}
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}

export default AITaskGenerationWizard;