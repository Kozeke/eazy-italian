/**
 * TeacherVerifyStep.tsx
 *
 * Step 1: Email OTP verification.
 * Calls POST /auth/verify-email → returns { access_token, refresh_token }.
 * Tokens are stored in localStorage so useAuth picks them up.
 * On success → goTo(STEPS.INTRO).
 */

import React, { useState, useRef, useEffect } from "react";
import { STEPS, WizardState } from "./TeacherRegisterFlow";
import { LinguAiLogo } from "../global/LinguAiLogo";

interface Props {
  wizard: WizardState;
  patch:  (partial: Partial<WizardState>) => void;
  goTo:   (step: number, dir?: "forward" | "back") => void;
}

const API = import.meta.env.VITE_API_URL ?? "";
const OTP_LEN = 6;

export default function TeacherVerifyStep({ wizard, goTo }: Props) {
  const [cells, setCells]     = useState<string[]>(Array(OTP_LEN).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const refs = Array.from({ length: OTP_LEN }, () => useRef<HTMLInputElement>(null));

  /* Focus first cell on mount */
  useEffect(() => { refs[0].current?.focus(); }, []);

  /* Cooldown countdown */
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const code = cells.join("");

  const focusCell = (idx: number) => {
    if (idx >= 0 && idx < OTP_LEN) refs[idx].current?.focus();
  };

  const handleCellChange = (idx: number, val: string) => {
    // Accept only digits; handle paste
    const digits = val.replace(/\D/g, "");
    if (!digits) return;

    if (digits.length > 1) {
      // Paste-style: fill from current position
      const next = [...cells];
      let cur = idx;
      for (const d of digits) {
        if (cur >= OTP_LEN) break;
        next[cur++] = d;
      }
      setCells(next);
      focusCell(Math.min(cur, OTP_LEN - 1));
      return;
    }

    const next = [...cells];
    next[idx] = digits[0];
    setCells(next);
    if (idx < OTP_LEN - 1) focusCell(idx + 1);
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (cells[idx]) {
        const next = [...cells]; next[idx] = "";
        setCells(next);
      } else {
        focusCell(idx - 1);
      }
    } else if (e.key === "ArrowLeft") {
      focusCell(idx - 1);
    } else if (e.key === "ArrowRight") {
      focusCell(idx + 1);
    }
  };

  const handleVerify = async (otp?: string) => {
    const finalCode = otp ?? code;
    if (finalCode.length < OTP_LEN) {
      setError("Please enter all 6 digits.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/v1/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: wizard.email, code: finalCode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Invalid code. Please try again.");
      }

      const { access_token, refresh_token } = await res.json();
      localStorage.setItem("token", access_token);
      if (refresh_token) localStorage.setItem("refresh_token", refresh_token);

      goTo(STEPS.INTRO, "forward");
    } catch (err: any) {
      setError(err.message ?? "Verification failed");
      setShakeKey((k) => k + 1);
      setCells(Array(OTP_LEN).fill(""));
      setTimeout(() => refs[0].current?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  /* Auto-submit when all cells filled */
  useEffect(() => {
    if (code.length === OTP_LEN && !loading) {
      handleVerify(code);
    }
  }, [code]);

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await fetch(`${API}/api/v1/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: wizard.email }),
      });
      setResendCooldown(60);
      setError("");
      setCells(Array(OTP_LEN).fill(""));
      setTimeout(() => refs[0].current?.focus(), 50);
    } catch {
      setError("Could not resend. Please try again.");
    }
  };

  return (
    <div className="tof-auth-shell">
      {/* Left panel */}
      <div className="tof-panel">
        <div className="tof-panel__bg" style={{
          background: "linear-gradient(145deg, #0c4a6e 0%, #0ea5e9 50%, #06b6d4 100%)"
        }} />
        <div className="tof-panel__orb" style={{ width:250, height:250, top:-60, left:-60, background:"#38bdf8" }} />
        <div className="tof-panel__orb" style={{ width:180, height:180, bottom:100, right:-40, background:"#818cf8" }} />

        <div className="tof-panel__content">
          <span className="tof-panel__emoji">📧</span>
          <h2 className="tof-panel__heading">{"Check your\nemail"}</h2>
          <p className="tof-panel__sub">
            We sent a 6-digit code to verify your address. It's valid for 30 minutes.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="tof-form-panel">
        <div className="tof-card">
          <a href="/" className="tof-wordmark" aria-label="LinguAI home">
            <LinguAiLogo height={42} showWordmark />
          </a>

          <div className="tof-step-header">
            <p className="tof-step-header__eyebrow">Step 1 of 2 — Verify email</p>
            <h1 className="tof-step-header__title">Enter your code</h1>
            <p className="tof-step-header__sub">
              We sent a 6-digit code to{" "}
              <strong style={{ color: "var(--t-sub)" }}>{wizard.email}</strong>.
            </p>
          </div>

          {/* OTP cells */}
          <div className="tof-otp-row" key={shakeKey}>
            {cells.map((val, idx) => (
              <input
                key={idx}
                ref={refs[idx]}
                className={`tof-otp-cell ${val ? "tof-otp-cell--filled" : ""} ${error && !loading ? "tof-otp-cell--error" : ""}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={val}
                onChange={(e) => handleCellChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={(e) => {
                  e.preventDefault();
                  handleCellChange(idx, e.clipboardData.getData("text"));
                }}
                autoComplete={idx === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${idx + 1} of 6`}
                disabled={loading}
              />
            ))}
          </div>

          {error && (
            <div className="tof-error" style={{ justifyContent: "center", marginBottom: "1rem" }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="button"
            className="tof-btn tof-btn--primary tof-btn--full"
            onClick={() => handleVerify()}
            disabled={loading || code.length < OTP_LEN}
          >
            {loading ? <><span className="tof-spinner" /> Verifying…</> : "Verify email →"}
          </button>

          <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
            <span style={{ fontSize: ".875rem", color: "var(--t-muted)" }}>
              Didn't receive it?{" "}
            </span>
            <button
              type="button"
              className="tof-link"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              style={{
                fontSize: ".875rem", background: "none", border: "none", cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
                color: resendCooldown > 0 ? "var(--t-light)" : "var(--t-indigo)",
                fontWeight: 600,
              }}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
            </button>
          </div>

          <p className="tof-footer-text" style={{ marginTop: ".875rem" }}>
            Wrong email?{" "}
            <button
              type="button"
              className="tof-link"
              onClick={() => goTo(STEPS.REGISTER, "back")}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              Go back
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}