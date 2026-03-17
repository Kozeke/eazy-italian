/**
 * TeacherRegisterStep.tsx
 *
 * Step 0: Teacher registration.
 * Calls POST /auth/register with role:"teacher".
 * Does NOT log in — just registers then moves to OTP verify step.
 */

import React, { useState } from "react";
import { STEPS, WizardState } from "./TeacherRegisterFlow";

interface Props {
  wizard: WizardState;
  patch: (partial: Partial<WizardState>) => void;
  goTo: (step: number, dir?: "forward" | "back") => void;
}

const API = import.meta.env.VITE_API_URL ?? "";

export default function TeacherRegisterStep({ wizard, patch, goTo }: Props) {
  const [form, setForm] = useState({
    firstName: wizard.firstName || "",
    lastName:  wizard.lastName  || "",
    email:     wizard.email     || "",
    password:  wizard.password  || "",
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [fieldErr, setFieldErr] = useState<Record<string,string>>({});

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((p) => ({ ...p, [k]: e.target.value }));
    setFieldErr((p) => ({ ...p, [k]: "" }));
    setError("");
  };

  const validate = () => {
    const errs: Record<string,string> = {};
    if (!form.firstName.trim())   errs.firstName = "First name is required";
    if (!form.lastName.trim())    errs.lastName  = "Last name is required";
    if (!form.email.trim())       errs.email     = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Enter a valid email address";
    if (!form.password)           errs.password  = "Password is required";
    else if (form.password.length < 8) errs.password = "Password must be at least 8 characters";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErr(errs); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.firstName.trim(),
          last_name:  form.lastName.trim(),
          email:      form.email.trim().toLowerCase(),
          password:   form.password,
          role:       "teacher",
          locale:     "en",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Registration failed. Please try again.");
      }

      // Store in wizard state
      patch({
        email:     form.email.trim().toLowerCase(),
        password:  form.password,
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
      });

      goTo(STEPS.VERIFY, "forward");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tof-auth-shell">
      {/* ── Left visual panel ── */}
      <div className="tof-panel">
        <div className="tof-panel__bg" />
        {/* decorative orbs */}
        <div className="tof-panel__orb" style={{ width:300, height:300, top:-80, left:-80, background:"#818cf8" }} />
        <div className="tof-panel__orb" style={{ width:200, height:200, bottom:80, right:-60, background:"#38bdf8" }} />
        <div className="tof-panel__orb" style={{ width:150, height:150, top:"45%", right:40, background:"#e879f9" }} />

        <div className="tof-panel__content">
          <span className="tof-panel__emoji">🇮🇹</span>
          <h2 className="tof-panel__heading">{"Teach Italian\nwith confidence"}</h2>
          <p className="tof-panel__sub">
            Build engaging courses, generate slides, tasks, and tests—all powered by AI.
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="tof-form-panel">
        <div className="tof-card">
          {/* Wordmark */}
          <a href="/" className="tof-wordmark">
            <span className="tof-wordmark__flag">🇮🇹</span>
            EZ Italian
          </a>

          {/* Header */}
          <div className="tof-step-header">
            <p className="tof-step-header__eyebrow">Teacher account</p>
            <h1 className="tof-step-header__title">Create your account</h1>
            <p className="tof-step-header__sub">Free to start — no credit card needed.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="tof-field-row">
              <div className="tof-field">
                <label className="tof-label" htmlFor="tf-firstName">First name</label>
                <input
                  id="tf-firstName"
                  className={`tof-input ${fieldErr.firstName ? "tof-input--error" : ""}`}
                  placeholder="Maria"
                  value={form.firstName}
                  onChange={set("firstName")}
                  autoComplete="given-name"
                  autoFocus
                />
                {fieldErr.firstName && <span className="tof-error">{fieldErr.firstName}</span>}
              </div>
              <div className="tof-field">
                <label className="tof-label" htmlFor="tf-lastName">Last name</label>
                <input
                  id="tf-lastName"
                  className={`tof-input ${fieldErr.lastName ? "tof-input--error" : ""}`}
                  placeholder="Rossi"
                  value={form.lastName}
                  onChange={set("lastName")}
                  autoComplete="family-name"
                />
                {fieldErr.lastName && <span className="tof-error">{fieldErr.lastName}</span>}
              </div>
            </div>

            <div className="tof-field">
              <label className="tof-label" htmlFor="tf-email">Work email</label>
              <input
                id="tf-email"
                type="email"
                className={`tof-input ${fieldErr.email ? "tof-input--error" : ""}`}
                placeholder="maria@school.it"
                value={form.email}
                onChange={set("email")}
                autoComplete="email"
                inputMode="email"
              />
              {fieldErr.email && <span className="tof-error">{fieldErr.email}</span>}
            </div>

            <div className="tof-field">
              <label className="tof-label" htmlFor="tf-password">Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="tf-password"
                  type={showPw ? "text" : "password"}
                  className={`tof-input ${fieldErr.password ? "tof-input--error" : ""}`}
                  placeholder="8+ characters"
                  value={form.password}
                  onChange={set("password")}
                  autoComplete="new-password"
                  style={{ paddingRight: "2.75rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  style={{
                    position: "absolute", right: ".75rem", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    color: "var(--t-light)", fontSize: "1.1rem", lineHeight: 1,
                  }}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
              {fieldErr.password && <span className="tof-error">{fieldErr.password}</span>}
            </div>

            {error && (
              <div className="tof-error" style={{ marginBottom: "1rem" }}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              className="tof-btn tof-btn--primary tof-btn--full"
              disabled={loading}
            >
              {loading ? <><span className="tof-spinner" /> Creating account…</> : "Create account →"}
            </button>
          </form>

          <p className="tof-footer-text">
            Already have an account?{" "}
            <a href="/login" className="tof-link">Sign in</a>
          </p>

          <p style={{ fontSize: ".75rem", color: "var(--t-light)", textAlign: "center", marginTop: "1.25rem", lineHeight: 1.5 }}>
            By creating an account you agree to our{" "}
            <a href="/terms" className="tof-link" style={{ fontWeight: 500 }}>Terms</a>
            {" "}and{" "}
            <a href="/privacy" className="tof-link" style={{ fontWeight: 500 }}>Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}