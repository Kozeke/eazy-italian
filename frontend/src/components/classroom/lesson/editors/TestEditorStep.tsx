/**
 * TestEditorStep.tsx
 *
 * Local test setup editor for the teacher classroom builder.
 * Covers the test metadata shell — the question builder is out of scope
 * for this step and will be implemented separately.
 *
 * Fields (mirrors the backend test model)
 * ───────────────────────────────────────
 * • title               — required
 * • description         — shown to students before they start
 * • instructions        — shown on the test intro screen
 * • time_limit_minutes  — 0 = no limit
 * • passing_score       — 0–100 (percentage)
 *
 * API wiring notes (for next step):
 *   onSave(draft) → POST /api/v1/units/:unitId/tests
 *   Expected body: { title, description, instructions,
 *                    time_limit_minutes, passing_score, unit_id }
 */

import React, { useState, useCallback } from 'react';
import {
  Clock, Award, ClipboardList, Info,
  CheckCircle2, AlertCircle, Plus,
} from 'lucide-react';

// ─── Local draft type ─────────────────────────────────────────────────────────

export interface TestDraft {
  title:                string;
  description:          string;
  instructions:         string;
  time_limit_minutes:   number;   // 0 = unlimited
  passing_score:        number;   // 0–100 %
}

export const EMPTY_TEST_DRAFT: TestDraft = {
  title:                '',
  description:          '',
  instructions:         '',
  time_limit_minutes:   0,
  passing_score:        60,
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TestEditorStepProps {
  draft?:    TestDraft;
  onChange?: (draft: TestDraft) => void;
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function FieldLabel({
  children,
  htmlFor,
  optional,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  optional?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 mb-1.5"
    >
      {children}
      {optional && (
        <span className="normal-case font-normal text-slate-300 text-[11px]">optional</span>
      )}
    </label>
  );
}

function TextInput({
  id, value, onChange, placeholder,
}: {
  id?: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[
        'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5',
        'text-[14px] text-slate-800 placeholder-slate-300',
        'focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100',
        'transition-colors',
      ].join(' ')}
    />
  );
}

function TextArea({
  id, value, onChange, placeholder, rows = 3,
}: {
  id?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={[
        'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5',
        'text-[14px] text-slate-800 placeholder-slate-300 resize-none',
        'focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100',
        'transition-colors',
      ].join(' ')}
    />
  );
}

// ─── Numeric stepper ──────────────────────────────────────────────────────────

function NumericStepper({
  id,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unit,
  zeroLabel,
}: {
  id?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  zeroLabel?: string;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(max !== undefined ? Math.min(max, value + step) : value + step);

  const display = value === 0 && zeroLabel ? zeroLabel : `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <div className="flex items-center gap-0 rounded-xl border border-slate-200 bg-white overflow-hidden w-fit">
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        className={[
          'px-3 py-2.5 text-slate-500 transition-colors',
          'hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400',
        ].join(' ')}
        aria-label="Decrease"
      >
        −
      </button>
      <span
        id={id}
        className="min-w-[80px] px-3 py-2.5 text-center text-[14px] font-semibold text-slate-800 border-x border-slate-200"
      >
        {display}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={max !== undefined && value >= max}
        className={[
          'px-3 py-2.5 text-slate-500 transition-colors',
          'hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400',
        ].join(' ')}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

// ─── Score ring mini visualisation ───────────────────────────────────────────

function PassScoreRing({ score }: { score: number }) {
  const r         = 24;
  const circ      = 2 * Math.PI * r;
  const fillRatio = score / 100;
  const dash      = fillRatio * circ;
  const gap       = circ - dash;
  const isHigh    = score >= 70;
  const isMid     = score >= 40 && score < 70;

  return (
    <div className="flex items-center gap-3">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
        <circle
          cx="28" cy="28" r={r} fill="none"
          stroke={isHigh ? '#059669' : isMid ? '#f59e0b' : '#ef4444'}
          strokeWidth="5"
          strokeDasharray={`${dash} ${gap}`}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="32" textAnchor="middle"
          fontSize="11" fontWeight="700"
          fill={isHigh ? '#065f46' : isMid ? '#92400e' : '#7f1d1d'}
        >
          {score}%
        </text>
      </svg>
      <div>
        <p className={[
          'text-[13px] font-semibold',
          isHigh ? 'text-emerald-700' : isMid ? 'text-amber-700' : 'text-red-700',
        ].join(' ')}>
          {isHigh ? 'High standard' : isMid ? 'Moderate standard' : 'Low threshold'}
        </p>
        <p className="text-[11px] text-slate-400">
          Students need {score}% to pass
        </p>
      </div>
    </div>
  );
}

// ─── Preview card ─────────────────────────────────────────────────────────────

function TestPreviewCard({ draft }: { draft: TestDraft }) {
  const isEmpty = !draft.title && !draft.description;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="h-[3px] w-full bg-gradient-to-r from-emerald-600 to-emerald-400" />
      <div className="p-5">
        <div className="mb-4 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
            <ClipboardList className="h-3 w-3" />
            Test
          </span>
        </div>

        {isEmpty ? (
          <p className="text-sm italic text-slate-300 py-6 text-center">
            Preview appears here as you fill in the fields.
          </p>
        ) : (
          <div className="space-y-4">
            {draft.title && (
              <h3 className="text-[17px] font-bold text-slate-900 leading-snug">
                {draft.title}
              </h3>
            )}
            {draft.description && (
              <p className="text-[13px] leading-relaxed text-slate-500">{draft.description}</p>
            )}
            {draft.instructions && (
              <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Instructions</p>
                <p className="text-[13px] leading-relaxed text-slate-700 line-clamp-4">
                  {draft.instructions}
                </p>
              </div>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap gap-3 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-600">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                {draft.time_limit_minutes === 0
                  ? 'No time limit'
                  : `${draft.time_limit_minutes} min`}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
                <Award className="h-3.5 w-3.5" />
                Pass: {draft.passing_score}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TestEditorStep({
  draft: initialDraft,
  onChange,
}: TestEditorStepProps) {
  const [draft, setDraft] = useState<TestDraft>(initialDraft ?? { ...EMPTY_TEST_DRAFT });

  const update = useCallback(<K extends keyof TestDraft>(key: K, value: TestDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  return (
    <div className="flex flex-col gap-5">

      <p className="text-[12px] text-slate-400">
        Set up the test details below. You'll be able to add questions after saving.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* ── Left: form ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* Title */}
          <div>
            <FieldLabel htmlFor="test-title">Test title</FieldLabel>
            <TextInput
              id="test-title"
              value={draft.title}
              onChange={(v) => update('title', v)}
              placeholder="e.g. Unit 3 end-of-lesson test"
            />
          </div>

          {/* Description */}
          <div>
            <FieldLabel htmlFor="test-desc" optional>Description</FieldLabel>
            <TextArea
              id="test-desc"
              value={draft.description}
              onChange={(v) => update('description', v)}
              placeholder="Short summary shown to students before they start."
              rows={2}
            />
          </div>

          {/* Instructions */}
          <div>
            <FieldLabel htmlFor="test-instructions" optional>Instructions</FieldLabel>
            <TextArea
              id="test-instructions"
              value={draft.instructions}
              onChange={(v) => update('instructions', v)}
              placeholder="e.g. Answer all questions. You may not use your notes."
              rows={3}
            />
          </div>

          {/* Time limit */}
          <div>
            <FieldLabel htmlFor="test-time">Time limit</FieldLabel>
            <NumericStepper
              id="test-time"
              value={draft.time_limit_minutes}
              onChange={(v) => update('time_limit_minutes', v)}
              min={0}
              max={180}
              step={5}
              unit="min"
              zeroLabel="No limit"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">
              Set to 0 for untimed tests.
            </p>
          </div>

          {/* Passing score */}
          <div>
            <FieldLabel htmlFor="test-pass">Passing score</FieldLabel>
            <NumericStepper
              id="test-pass"
              value={draft.passing_score}
              onChange={(v) => update('passing_score', v)}
              min={0}
              max={100}
              step={5}
              unit="%"
            />
            <div className="mt-3">
              <PassScoreRing score={draft.passing_score} />
            </div>
          </div>

          {/* Questions note */}
          <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <p className="text-[12px] leading-relaxed text-emerald-700">
              After saving, you'll be taken to the question builder where you can add
              multiple-choice and open-answer questions.
            </p>
          </div>

        </div>

        {/* ── Right: preview ─────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-2">
            Preview
          </p>
          <TestPreviewCard draft={draft} />
        </div>

      </div>
    </div>
  );
}