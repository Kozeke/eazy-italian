/**
 * TeacherAccountDetailsStep.tsx
 *
 * Step 3: Complete your account.
 * Fields: first name, last name, country, timezone.
 * Calls PATCH /auth/me (with bearer token) to persist the details.
 *
 * Country/timezone lists are lightweight inline lists — no extra libraries.
 */

import React, { useState } from "react";
import { STEPS, WizardState } from "./TeacherRegisterFlow";
import { LinguAiLogo } from "../global/LinguAiLogo";

interface Props {
  wizard: WizardState;
  patch:  (partial: Partial<WizardState>) => void;
  goTo:   (step: number, dir?: "forward" | "back") => void;
}

const API = import.meta.env.VITE_API_URL ?? "";

/* ── Helpers ── */
const COUNTRIES = [
  "Italy", "United Kingdom", "United States", "Australia", "Canada",
  "Germany", "France", "Spain", "Portugal", "Netherlands", "Sweden",
  "Norway", "Denmark", "Switzerland", "Austria", "Belgium", "Poland",
  "Brazil", "Argentina", "Mexico", "Japan", "South Korea", "China",
  "India", "Singapore", "New Zealand", "South Africa", "Nigeria",
  "Kenya", "Egypt", "UAE", "Other",
];

const TIMEZONES = [
  "Europe/Rome", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Europe/Madrid", "Europe/Amsterdam", "Europe/Stockholm",
  "Europe/Warsaw", "Europe/Lisbon", "Europe/Zurich",
  "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo",
  "America/Buenos_Aires", "America/Mexico_City",
  "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore",
  "Asia/Kolkata", "Asia/Dubai",
  "Australia/Sydney", "Australia/Melbourne",
  "Pacific/Auckland",
  "Africa/Johannesburg", "Africa/Lagos",
  "UTC",
];

function tzLabel(tz: string) {
  try {
    const d = new Date();
    const fmt = new Intl.DateTimeFormat("en", {
      timeZone: tz, timeZoneName: "short"
    });
    const parts = fmt.formatToParts(d);
    const abbr  = parts.find(p => p.type === "timeZoneName")?.value ?? "";
    return `${tz.replace(/_/g, " ")} (${abbr})`;
  } catch {
    return tz;
  }
}

export default function TeacherAccountDetailsStep({ wizard, patch, goTo }: Props) {
  const [form, setForm] = useState({
    firstName: wizard.firstName || "",
    lastName:  wizard.lastName  || "",
    country:   wizard.country   || "",
    timezone:  wizard.timezone  || (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
  });
  const [fieldErr, setFieldErr] = useState<Record<string,string>>({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((p) => ({ ...p, [k]: e.target.value }));
      setFieldErr((p) => ({ ...p, [k]: "" }));
      setError("");
    };

  const validate = () => {
    const errs: Record<string,string> = {};
    if (!form.firstName.trim()) errs.firstName = "Required";
    if (!form.lastName.trim())  errs.lastName  = "Required";
    if (!form.country)          errs.country   = "Please select your country";
    if (!form.timezone)         errs.timezone  = "Please select your timezone";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErr(errs); return; }

    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/api/v1/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          first_name: form.firstName.trim(),
          last_name:  form.lastName.trim(),
          locale:     form.timezone,   // reuse locale field or extend; adjust to your backend
        }),
      });

      // Non-200 is okay here — we proceed anyway (PATCH /me is best-effort during onboarding)
      if (!res.ok) console.warn("PATCH /auth/me failed:", await res.text().catch(() => ""));

      patch({
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        country:   form.country,
        timezone:  form.timezone,
      });

      goTo(STEPS.TRIAL, "forward");
    } catch (err: any) {
      // Still proceed — data will be saveable later in settings
      console.error("Details save error:", err);
      patch({
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        country:   form.country,
        timezone:  form.timezone,
      });
      goTo(STEPS.TRIAL, "forward");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tof-auth-shell">
      {/* Left panel */}
      <div className="tof-panel">
        <div className="tof-panel__bg" style={{
          background: "linear-gradient(145deg, #065f46 0%, #0d9488 50%, #0ea5e9 100%)"
        }} />
        <div className="tof-panel__orb" style={{ width:260, height:260, top:-80, left:-60, background:"#34d399" }} />
        <div className="tof-panel__orb" style={{ width:200, height:200, bottom:60, right:-40, background:"#38bdf8" }} />

        <div className="tof-panel__content">
          <span className="tof-panel__emoji">👤</span>
          <h2 className="tof-panel__heading">{"Almost\nthere"}</h2>
          <p className="tof-panel__sub">
            A few details help us personalise your experience and match you with the right resources.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="tof-form-panel">
        <div className="tof-card">
          <a href="/" className="tof-wordmark" aria-label="LinguAI home">
            <LinguAiLogo height={42} showWordmark />
          </a>

          {/* Progress dots */}
          <div className="tof-dots" style={{ marginBottom: "1.5rem" }}>
            {[0,1,2].map((i) => (
              <span key={i} className={`tof-dot ${i === 2 ? "tof-dot--active" : "tof-dot--done"}`} />
            ))}
          </div>

          <div className="tof-step-header">
            <p className="tof-step-header__eyebrow">Step 3 of 3 — Account details</p>
            <h1 className="tof-step-header__title">Complete your profile</h1>
            <p className="tof-step-header__sub">You can update these later in Settings.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="tof-field-row">
              <div className="tof-field">
                <label className="tof-label" htmlFor="tad-first">First name</label>
                <input
                  id="tad-first"
                  className={`tof-input ${fieldErr.firstName ? "tof-input--error" : ""}`}
                  value={form.firstName}
                  onChange={set("firstName")}
                  placeholder="Maria"
                  autoFocus
                />
                {fieldErr.firstName && <span className="tof-error">{fieldErr.firstName}</span>}
              </div>
              <div className="tof-field">
                <label className="tof-label" htmlFor="tad-last">Last name</label>
                <input
                  id="tad-last"
                  className={`tof-input ${fieldErr.lastName ? "tof-input--error" : ""}`}
                  value={form.lastName}
                  onChange={set("lastName")}
                  placeholder="Rossi"
                />
                {fieldErr.lastName && <span className="tof-error">{fieldErr.lastName}</span>}
              </div>
            </div>

            <div className="tof-field">
              <label className="tof-label" htmlFor="tad-country">Country</label>
              <select
                id="tad-country"
                className={`tof-select ${fieldErr.country ? "tof-input--error" : ""}`}
                value={form.country}
                onChange={set("country")}
              >
                <option value="">Select country…</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {fieldErr.country && <span className="tof-error">{fieldErr.country}</span>}
            </div>

            <div className="tof-field">
              <label className="tof-label" htmlFor="tad-tz">Timezone</label>
              <select
                id="tad-tz"
                className={`tof-select ${fieldErr.timezone ? "tof-input--error" : ""}`}
                value={form.timezone}
                onChange={set("timezone")}
              >
                <option value="">Select timezone…</option>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tzLabel(tz)}</option>
                ))}
              </select>
              {fieldErr.timezone && <span className="tof-error">{fieldErr.timezone}</span>}
            </div>

            {error && <div className="tof-error">⚠️ {error}</div>}

            <div style={{ display: "flex", gap: ".75rem", marginTop: ".5rem" }}>
              <button
                type="button"
                className="tof-btn tof-btn--secondary"
                onClick={() => goTo(STEPS.INTRO, "back")}
                style={{ minWidth: 90 }}
              >
                ← Back
              </button>
              <button
                type="submit"
                className="tof-btn tof-btn--primary tof-btn--full"
                disabled={loading}
              >
                {loading ? <><span className="tof-spinner" /> Saving…</> : "Continue →"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}