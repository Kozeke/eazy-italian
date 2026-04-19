/**
 * TeacherRegisterFlow.tsx
 *
 * Orchestrates the full teacher registration + onboarding wizard.
 *
 * FLOW:
 *   register  → verify  → intro (3 slides)  → details  → trial  → next-action
 *
 * Step indices:
 *   0  REGISTER   – email, password, name fields → POST /auth/register
 *   1  VERIFY     – 6-digit OTP → POST /auth/verify-email  (returns tokens → store them)
 *   2  INTRO      – carousel with skip
 *   3  DETAILS    – first/last name, country, timezone  → PATCH /auth/me
 *   4  TRIAL      – success / welcome screen
 *   5  NEXT       – CTA: generate course  |  go to dashboard
 *
 * Auth notes:
 *   • POST /auth/register  payload: { email, password, first_name, last_name, role:"teacher", locale }
 *   • POST /auth/verify-email returns { access_token, refresh_token } → stored in localStorage
 *   • PATCH /auth/me/onboarding-complete → marks teacher as onboarded (called on step 5)
 *
 * Routing integration:
 *   This component is mounted at /register/teacher (or wherever RegisterPage routes for teacher role).
 *   LoginPage sends teachers with onboarding_completed=false to /admin/courses (course catalog).
 *   Legacy /admin/onboarding (TeacherOnboarding.legacy.jsx) is not mounted — see AdminRoutes.jsx.
 *   "Generate course" sends teachers to /admin/courses instead.
 *   "Dashboard" button → navigate('/admin/dashboard')
 */

import { useState, useCallback } from "react";
import TeacherRegisterStep from "./TeacherRegisterStep.tsx";
import TeacherVerifyStep from "./TeacherVerifyStep.tsx";
import TeacherOnboardingIntro from "./TeacherOnboardingIntro.tsx";
import TeacherAccountDetailsStep from "./TeacherAccountDetailsStep.tsx";
import TeacherTrialStep from "./TeacherTrialStep.tsx";
import TeacherNextActionStep from "./TeacherNextActionStep.tsx";
import "./teacher-onboarding.css";

/* ─── Step constants ─────────────────────────────────────────────────────── */
export const STEPS = {
  REGISTER: 0,
  VERIFY: 1,
  INTRO: 2,
  DETAILS: 3,
  TRIAL: 4,
  NEXT: 5,
} as const;

/* ─── Shared wizard state ────────────────────────────────────────────────── */
export interface WizardState {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  locale: string;
  country: string;
  timezone: string;
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function TeacherRegisterFlow() {
  const [step, setStep] = useState<number>(STEPS.REGISTER);
  const [wizard, setWizard] = useState<WizardState>({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    locale: "en",
    country: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });

  /* Directional flag for animation */
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const goTo = useCallback((next: number, dir: "forward" | "back" = "forward") => {
    setDirection(dir);
    // tiny RAF so CSS transition picks up the class change
    requestAnimationFrame(() => setStep(next));
  }, []);

  const patch = useCallback((partial: Partial<WizardState>) => {
    setWizard((prev) => ({ ...prev, ...partial }));
  }, []);

  /* ── Step rendering ── */
  const stepProps = { wizard, patch, goTo, step, direction };

  return (
    <div className="tof-root" data-direction={direction}>
      <div className={`tof-step tof-step--${step}`} key={step}>
        {step === STEPS.REGISTER && <TeacherRegisterStep {...stepProps} />}
        {step === STEPS.VERIFY   && <TeacherVerifyStep   {...stepProps} />}
        {step === STEPS.INTRO    && <TeacherOnboardingIntro {...stepProps} />}
        {step === STEPS.DETAILS  && <TeacherAccountDetailsStep {...stepProps} />}
        {step === STEPS.TRIAL    && <TeacherTrialStep    {...stepProps} />}
        {step === STEPS.NEXT     && <TeacherNextActionStep {...stepProps} />}
      </div>
    </div>
  );
}