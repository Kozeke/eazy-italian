/**
 * TeacherNextActionStep.tsx
 *
 * Step 5: Final action — two strong CTAs.
 *   1. Generate my first course with AI → /admin/onboarding
 *   2. Go to dashboard                  → /admin/dashboard
 *
 * Before navigating, marks onboarding as complete:
 * PATCH /auth/me/onboarding-complete
 */

import { useState } from "react";
import { WizardState } from "./TeacherRegisterFlow";

interface Props {
  wizard: WizardState;
  patch:  (partial: Partial<WizardState>) => void;
  goTo:   (step: number, dir?: "forward" | "back") => void;
}

const API = import.meta.env.VITE_API_URL ?? "";

async function markOnboardingComplete() {
  const token = localStorage.getItem("token");
  try {
    await fetch(`${API}/api/v1/auth/me/onboarding-complete`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (err) {
    console.error("Could not mark onboarding complete:", err);
  }
}

export default function TeacherNextActionStep({ wizard }: Props) {
  const [loading, setLoading] = useState<"ai" | "dashboard" | null>(null);

  const handleAI = async () => {
    setLoading("ai");
    await markOnboardingComplete();
    // Use window.location to force full page reload and refresh auth context
    window.location.href = "/admin/onboarding";
  };

  const handleDashboard = async () => {
    setLoading("dashboard");
    await markOnboardingComplete();
    // Use window.location to force full page reload and refresh auth context
    window.location.href = "/admin/dashboard";
  };

  return (
    <div className="tof-next">
      <div className="tof-next__inner">
        <p className="tof-next__eyebrow">You're all set</p>
        <h1 className="tof-next__heading">What would you like to do first?</h1>
        <p className="tof-next__sub">
          You can always change course later. Pick wherever you'd like to start.
        </p>

        <div className="tof-next__actions">
          {/* Primary: AI course */}
          <button
            type="button"
            className="tof-cta-card tof-cta-card--primary"
            onClick={handleAI}
            disabled={!!loading}
          >
            <div className="tof-cta-card__icon">
              {loading === "ai"
                ? <span className="tof-spinner tof-spinner--dark" />
                : "✨"}
            </div>
            <div style={{ flex: 1 }}>
              <div className="tof-cta-card__title">Generate my first course with AI</div>
              <div className="tof-cta-card__desc">
                Tell us your topic and let AI build an outline, slides, tasks, and a test.
              </div>
            </div>
            <span className="tof-cta-card__arrow">→</span>
          </button>

          {/* Secondary: dashboard */}
          <button
            type="button"
            className="tof-cta-card"
            onClick={handleDashboard}
            disabled={!!loading}
          >
            <div className="tof-cta-card__icon">
              {loading === "dashboard"
                ? <span className="tof-spinner tof-spinner--dark" />
                : "🏠"}
            </div>
            <div style={{ flex: 1 }}>
              <div className="tof-cta-card__title">Go to dashboard</div>
              <div className="tof-cta-card__desc">
                Explore the admin panel, create a classroom, or import existing materials.
              </div>
            </div>
            <span className="tof-cta-card__arrow">→</span>
          </button>
        </div>

        <p className="tof-footer-text" style={{ marginTop: "2rem" }}>
          Need help? Check out our{" "}
          <a href="/docs" className="tof-link">getting started guide</a>.
        </p>
      </div>
    </div>
  );
}