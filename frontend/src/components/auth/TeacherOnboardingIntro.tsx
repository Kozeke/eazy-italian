/**
 * TeacherOnboardingIntro.tsx
 *
 * Step 2: Intro carousel — 4 slides showcasing the platform.
 * Has skip, back/next controls, and progress dots.
 * After last slide → goTo(STEPS.DETAILS).
 */

import { useState } from "react";
import { STEPS, WizardState } from "./TeacherRegisterFlow";
import { LinguAiLogo } from "../global/LinguAiLogo";

interface Props {
  wizard: WizardState;
  patch:  (partial: Partial<WizardState>) => void;
  goTo:   (step: number, dir?: "forward" | "back") => void;
}

interface Slide {
  emoji:   string;
  bg:      string;          // soft background colour for the icon circle
  heading: string;
  body:    string;
}

const SLIDES: Slide[] = [
  {
    emoji:   "📚",
    bg:      "#eef2ff",
    heading: "Build structured Italian courses",
    body:    "Organise your teaching into courses, units, and lessons. Your students always know what comes next.",
  },
  {
    emoji:   "✨",
    bg:      "#fef3c7",
    heading: "Generate slides, tasks & tests with AI",
    body:    "Describe a topic and let AI produce a full lesson deck with exercises and a graded test — in minutes.",
  },
  {
    emoji:   "🎓",
    bg:      "#dcfce7",
    heading: "Teach students step by step",
    body:    "Assign lessons to classrooms. Students follow their own pace through slides, tasks, and tests.",
  },
  {
    emoji:   "📊",
    bg:      "#e0f2fe",
    heading: "Track progress and grades",
    body:    "See every student's completion, scores, and time spent at a glance. Spend less time on admin.",
  },
];

export default function TeacherOnboardingIntro({ goTo }: Props) {
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [animKey, setAnimKey] = useState(0);
  const total = SLIDES.length;

  const go = (next: number, d: "fwd" | "back") => {
    setDir(d);
    setAnimKey((k) => k + 1);
    setIdx(next);
  };

  const handleNext = () => {
    if (idx < total - 1) {
      go(idx + 1, "fwd");
    } else {
      goTo(STEPS.DETAILS, "forward");
    }
  };

  const handleBack = () => {
    if (idx > 0) go(idx - 1, "back");
  };

  const handleSkip = () => goTo(STEPS.DETAILS, "forward");

  const slide = SLIDES[idx];
  const isLast = idx === total - 1;

  return (
    <div className="tof-intro">
      {/* Top bar */}
      <div className="tof-intro__top">
        <a href="/" className="tof-wordmark" style={{ marginBottom: 0 }} aria-label="LinguAI home">
          <LinguAiLogo height={42} showWordmark />
        </a>

        <button
          type="button"
          className="tof-btn tof-btn--ghost"
          onClick={handleSkip}
          style={{ height: 36, padding: "0 .875rem", fontSize: ".875rem" }}
        >
          Skip intro
        </button>
      </div>

      {/* Slide content */}
      <div
        className="tof-intro__slide"
        key={animKey}
        data-dir={dir}
        style={{
          animation: `${dir === "fwd" ? "tof-slide-in" : "tof-slide-in-back"} .3s cubic-bezier(.22,1,.36,1) both`,
        }}
      >
        {/* Illustration circle */}
        <div
          className="tof-intro__illus"
          style={{ background: slide.bg }}
        >
          {slide.emoji}
        </div>

        {/* Text */}
        <div>
          <h2 className="tof-intro__heading">{slide.heading}</h2>
          <p className="tof-intro__body" style={{ marginTop: ".75rem" }}>{slide.body}</p>
        </div>
      </div>

      {/* Navigation row */}
      <div className="tof-intro__nav">
        {/* Back */}
        <button
          type="button"
          className="tof-btn tof-btn--ghost"
          onClick={handleBack}
          disabled={idx === 0}
          style={{ visibility: idx === 0 ? "hidden" : "visible" }}
          aria-label="Previous slide"
        >
          ← Back
        </button>

        {/* Progress dots */}
        <div className="tof-dots">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`tof-dot ${i === idx ? "tof-dot--active" : i < idx ? "tof-dot--done" : ""}`}
              onClick={() => go(i, i > idx ? "fwd" : "back")}
              aria-label={`Go to slide ${i + 1}`}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
            />
          ))}
        </div>

        {/* Next / Get started */}
        <button
          type="button"
          className="tof-btn tof-btn--primary"
          onClick={handleNext}
          style={{ minWidth: 120 }}
        >
          {isLast ? "Get started →" : "Next →"}
        </button>
      </div>
    </div>
  );
}