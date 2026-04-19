/**
 * CreateTestMethodPicker.legacy.tsx
 *
 * ── Purpose ───────────────────────────────────────────────────────────────────
 *   Intercepts every "Create Test" entry-point in the teacher flow.
 *   Instead of jumping straight into the manual builder, the teacher first
 *   picks a creation method:
 *
 *     [ Generate with AI ]  ⭐ Recommended
 *     [ Build manually    ]
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   Drop it as an overlay from UnitTestSection (AdminTestBuilder.legacy.jsx) or from
 *   the "Add test" button in AdminUnitDetailPage.legacy.jsx.
 *
 *   Props:
 *     open        boolean         — controls visibility
 *     onClose     () => void      — dismiss without choosing
 *     unitId      number | null   — forwarded to both branches
 *     unitTitle   string | null   — display label only
 *     onManual    () => void      — caller runs the existing manual-builder flow
 *     onAI        () => void      — caller opens AITestGenerationWizard
 *
 * ── Styling language ──────────────────────────────────────────────────────────
 *   Matches TeacherOnboarding.jsx exactly:
 *     • Design tokens from T (violet, pink, sky, border, bg, text, sub, muted)
 *     • Nunito for display headings, Inter for body
 *     • Card hover: translateY(-6px) + scale(1.03), 22px border-radius
 *     • Selected state: violet/pink gradient border, box-shadow
 *     • Animations: fadeUp, fadeIn (already declared in GlobalStyles)
 *     • Overlay backdrop: rgba(26,16,53,.55) blur(4px) — consistent with
 *       other portalled modals in the workspace
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

/* ─── Re-use the design tokens exported from TeacherOnboarding ───────────────
   If the bundle splits these files, just inline the same values here.         */
const T = {
  violet:  "#6C35DE", violetL: "#EDE9FF", violetD: "#4F23B0",
  pink:    "#F0447C", pinkL:   "#FDE8F0",
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
  dFont:   "'Nunito', system-ui, sans-serif",
  bFont:   "'Inter', system-ui, sans-serif",
};

/* ─── Minimal style block (keyframes already exist via GlobalStyles, but we   ─
   define the card + overlay styles here so the component is self-contained)   */
const PICKER_STYLES = `
  .ctmp-overlay {
    position: fixed; inset: 0; z-index: 1200;
    background: rgba(26,16,53,.55);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    animation: fadeIn .22s ease both;
  }
  .ctmp-sheet {
    background: ${T.bg};
    border-radius: 28px;
    border: 1.5px solid ${T.border};
    box-shadow: 0 32px 80px rgba(108,53,222,.18), 0 8px 24px rgba(26,16,53,.12);
    width: 100%; max-width: 520px;
    padding: 40px 36px 36px;
    position: relative;
    animation: fadeUp .38s cubic-bezier(.22,.68,0,1.2) both;
  }
  @media (max-width: 560px) {
    .ctmp-sheet { padding: 28px 20px 24px; border-radius: 20px; }
  }

  /* ── close button ── */
  .ctmp-close {
    position: absolute; top: 18px; right: 18px;
    width: 34px; height: 34px; border-radius: 50%;
    background: ${T.violetL}; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: ${T.sub}; font-size: 16px; font-weight: 700;
    transition: background .18s, color .18s, transform .18s;
  }
  .ctmp-close:hover { background: ${T.border}; color: ${T.violet}; transform: scale(1.1); }

  /* ── heading ── */
  .ctmp-title {
    font-family: ${T.dFont}; font-weight: 900; font-size: 26px;
    color: ${T.text}; margin-bottom: 6px; line-height: 1.2;
  }
  .ctmp-sub {
    font-family: ${T.bFont}; font-size: 14px; color: ${T.muted};
    margin-bottom: 28px; line-height: 1.5;
  }
  .ctmp-unit-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: ${T.violetL}; color: ${T.violet};
    border-radius: 20px; padding: 3px 12px;
    font-size: 12px; font-weight: 700;
    font-family: ${T.bFont};
    margin-bottom: 20px;
  }

  /* ── method cards ── */
  .ctmp-cards { display: flex; flex-direction: column; gap: 14px; }

  .ctmp-card {
    cursor: pointer;
    border-radius: 22px;
    border: 3px solid ${T.border};
    background: ${T.white};
    padding: 20px 22px;
    display: flex; align-items: flex-start; gap: 16px;
    transition: all .22s cubic-bezier(.22,.68,0,1.3);
    user-select: none; position: relative; overflow: hidden;
  }
  .ctmp-card:hover {
    transform: translateY(-5px) scale(1.015);
    border-color: ${T.violet};
    box-shadow: 0 12px 32px rgba(108,53,222,.13);
  }
  .ctmp-card--selected,
  .ctmp-card--selected:hover {
    border-color: transparent;
    transform: translateY(-5px) scale(1.015);
    background: linear-gradient(white, white) padding-box,
                linear-gradient(135deg, ${T.violet}, ${T.pink}) border-box;
    border: 3px solid transparent;
    box-shadow: 0 12px 36px rgba(108,53,222,.22);
  }
  .ctmp-card--ai {
    background: linear-gradient(135deg, ${T.violetL} 0%, #fff 60%);
  }
  .ctmp-card--ai:hover,
  .ctmp-card--ai.ctmp-card--selected {
    background: linear-gradient(
      135deg,
      rgba(237,233,255,.7) 0%,
      #fff 60%
    ) padding-box,
    linear-gradient(135deg, ${T.violet}, ${T.pink}) border-box;
    border: 3px solid transparent;
  }

  /* icon circle */
  .ctmp-icon {
    width: 48px; height: 48px; border-radius: 16px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
  }
  .ctmp-icon--ai     { background: linear-gradient(135deg, ${T.violet}, ${T.pink}); }
  .ctmp-icon--manual { background: linear-gradient(135deg, ${T.sky}, #0DB85E); }

  /* card text */
  .ctmp-card-body { flex: 1; min-width: 0; }
  .ctmp-card-title {
    font-family: ${T.dFont}; font-weight: 800; font-size: 17px;
    color: ${T.text}; display: flex; align-items: center; gap: 8px;
    margin-bottom: 4px;
  }
  .ctmp-card-desc {
    font-family: ${T.bFont}; font-size: 13px; color: ${T.sub}; line-height: 1.5;
  }

  /* recommended badge */
  .ctmp-badge {
    display: inline-flex; align-items: center; gap: 4px;
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    color: #fff; border-radius: 20px; padding: 2px 10px;
    font-size: 11px; font-weight: 700; font-family: ${T.bFont};
    white-space: nowrap;
  }

  /* ── CTA button ── */
  .ctmp-btn {
    margin-top: 28px; width: 100%;
    padding: 15px; border-radius: 16px; border: none; cursor: pointer;
    font-family: ${T.dFont}; font-weight: 900; font-size: 17px;
    transition: all .2s cubic-bezier(.22,.68,0,1.2);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .ctmp-btn--active {
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    color: #fff;
    box-shadow: 0 8px 24px rgba(108,53,222,.35);
  }
  .ctmp-btn--active:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(108,53,222,.45); }
  .ctmp-btn--inactive {
    background: ${T.violetL}; color: ${T.muted}; cursor: default;
  }
`;

/* ═══════════════════════════════════════════════════════════════════════════
   CreateTestMethodPicker
   ─────────────────────────────────────────────────────────────────────────── */
interface CreateTestMethodPickerProps {
  open: boolean;
  onClose: () => void;
  unitId?: number | null;  // Forwarded for potential future use
  unitTitle?: string | null;
  onManual: () => void;   // () => void — caller does existing manual builder navigation
  onAI: () => void;       // () => void — caller opens AITestGenerationWizard
}

export function CreateTestMethodPicker({
  open,
  onClose,
  unitId: _unitId = null,  // Forwarded for potential future use
  unitTitle = null,
  onManual,   // () => void — caller does existing manual builder navigation
  onAI,       // () => void — caller opens AITestGenerationWizard
}: CreateTestMethodPickerProps) {
  const [selected, setSelected] = useState<"ai" | "manual" | null>(null);

  // Reset selection each time the picker opens
  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  // Keyboard: Escape → close
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
    if (!selected) return;
    if (selected === "ai")     onAI?.();
    if (selected === "manual") onManual?.();
  };

  if (!open) return null;

  const picker = (
    <>
      <style>{PICKER_STYLES}</style>

      {/* Overlay — click outside to dismiss */}
      <div
        className="ctmp-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        role="dialog"
        aria-modal="true"
        aria-label="Create Test — choose method"
      >
        <div className="ctmp-sheet">

          {/* Close */}
          <button className="ctmp-close" onClick={onClose} aria-label="Close">✕</button>

          {/* Heading */}
          <div className="ctmp-title">Create Test</div>
          <div className="ctmp-sub">Choose how you want to build this test.</div>

          {/* Unit badge (contextual) */}
          {unitTitle && (
            <div className="ctmp-unit-badge">
              <span>📘</span>
              {unitTitle}
            </div>
          )}

          {/* Method cards */}
          <div className="ctmp-cards">

            {/* ── AI ── */}
            <div
              className={`ctmp-card ctmp-card--ai${selected === "ai" ? " ctmp-card--selected" : ""}`}
              onClick={() => setSelected("ai")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelected("ai")}
              aria-pressed={selected === "ai"}
            >
              <div className="ctmp-icon ctmp-icon--ai">✨</div>
              <div className="ctmp-card-body">
                <div className="ctmp-card-title">
                  Generate with AI
                  <span className="ctmp-badge">⭐ Recommended</span>
                </div>
                <div className="ctmp-card-desc">
                  Create a draft test automatically from the unit content, then review and edit before publishing.
                </div>
              </div>
            </div>

            {/* ── Manual ── */}
            <div
              className={`ctmp-card${selected === "manual" ? " ctmp-card--selected" : ""}`}
              onClick={() => setSelected("manual")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelected("manual")}
              aria-pressed={selected === "manual"}
            >
              <div className="ctmp-icon ctmp-icon--manual">🛠</div>
              <div className="ctmp-card-body">
                <div className="ctmp-card-title">Build manually</div>
                <div className="ctmp-card-desc">
                  Start building questions manually in the test builder. Full control over every question type.
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <button
            className={`ctmp-btn ${selected ? "ctmp-btn--active" : "ctmp-btn--inactive"}`}
            onClick={handleConfirm}
            disabled={!selected}
            aria-disabled={!selected}
          >
            {!selected && "Select a method above"}
            {selected === "ai"     && "✨ Continue with AI"}
            {selected === "manual" && "🛠 Open Test Builder"}
          </button>

        </div>
      </div>
    </>
  );

  // Portal to body so it escapes any stacking context (same pattern as slide editor)
  return createPortal(picker, document.body);
}

export default CreateTestMethodPicker;