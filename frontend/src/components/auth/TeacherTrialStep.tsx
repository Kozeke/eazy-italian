/**
 * TeacherTrialStep.tsx
 *
 * Step 4: Welcome / trial confirmation screen.
 * Calm, spacious, celebratory without being flashy.
 * Auto-advances to NEXT after a short delay, or user clicks "Continue".
 */

import { useEffect, useState } from "react";
import { STEPS, WizardState } from "./TeacherRegisterFlow";

interface Props {
  wizard: WizardState;
  patch:  (partial: Partial<WizardState>) => void;
  goTo:   (step: number, dir?: "forward" | "back") => void;
}

const FEATURES = [
  { icon: "📚", label: "Unlimited courses" },
  { icon: "✨", label: "AI lesson generation" },
  { icon: "🎓", label: "Up to 30 students" },
  { icon: "📊", label: "Progress analytics" },
];

export default function TeacherTrialStep({ wizard, goTo }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // staggered reveal
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="tof-trial">
      {/* Check icon — animated pop */}
      <div className="tof-trial__check" style={{ opacity: visible ? 1 : 0, transition: "opacity .2s" }}>
        ✓
      </div>

      <h1 className="tof-trial__heading">
        Welcome, {wizard.firstName || "there"}!
      </h1>

      <p className="tof-trial__sub">
        Your teacher account is ready. You're on the <strong>Free plan</strong> — 
        everything you need to get started.
      </p>

      {/* Trial badge */}
      <div className="tof-trial__badge">
        🎉 &nbsp; Free plan activated
      </div>

      {/* Feature list */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: ".75rem",
          width: "100%",
          maxWidth: 340,
          marginBottom: "2.5rem",
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={f.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: ".5rem",
              background: "var(--t-bg)",
              borderRadius: "var(--t-radius)",
              padding: ".625rem .875rem",
              fontSize: ".875rem",
              color: "var(--t-sub)",
              fontWeight: 500,
              opacity: visible ? 1 : 0,
              transform: visible ? "none" : "translateY(8px)",
              transition: `opacity .3s ${i * 0.06 + 0.15}s, transform .3s ${i * 0.06 + 0.15}s`,
            }}
          >
            <span style={{ fontSize: "1rem" }}>{f.icon}</span>
            {f.label}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="tof-btn tof-btn--primary tof-btn--lg"
        onClick={() => goTo(STEPS.NEXT, "forward")}
        style={{ minWidth: 220 }}
      >
        Choose what to do next →
      </button>
    </div>
  );
}