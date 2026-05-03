/**
 * JoinClassroomPage.tsx  (v2 — Student Design System)
 *
 * Route: /join-classroom
 *
 * What changed from v1:
 * ─────────────────────
 * • Uses redesigned AuthShell for consistent first-impression branding.
 * • Code boxes: teal active state, auto-submit on last char entry.
 * • Auto-submit triggers when all 6 chars are entered (no extra button click).
 * • Join button becomes teal and un-dimmed as code completes (smooth transition).
 * • "Browse classes" secondary action styled as a ghost card with hover state.
 * • Tip callout uses teal instead of amber for brand alignment.
 * • Input boxes grow to fill width on mobile.
 * • Keyboard/paste handling preserved from v1.
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Hash, Sparkles, CheckCircle2 } from 'lucide-react';
import { API_V1_BASE } from '../../services/api';
import { AuthShell, PrimaryButton, ErrorMsg } from './RegisterPage';

// Extends the base AuthShell props with optional metadata fields for this page.
type ExtendedAuthShellProps = React.ComponentProps<typeof AuthShell> & {
  eyebrow?: string;
  headline?: string;
  sub?: string;
};

// Typed wrapper so we can safely pass eyebrow/headline/sub into the shell.
const ExtendedAuthShell = AuthShell as React.FC<ExtendedAuthShellProps>;

const CODE_LENGTH = 6;

export default function JoinClassroomPage() {
  const navigate = useNavigate();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join('').toUpperCase();
  const isComplete = code.length === CODE_LENGTH && !digits.includes('');

  const handleJoin = async (overrideCode?: string) => {
    const finalCode = overrideCode ?? code;
    if (finalCode.length < CODE_LENGTH) { setError('Please enter the full 6-character code.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_V1_BASE}/student/join-classroom`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        },
        body: JSON.stringify({ code: finalCode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Invalid code. Please check and try again.');
      }
      const data = await res.json();
      setSuccess(true);
      setTimeout(() => {
        const classroomId = data.classroom?.id ?? data.id;
        navigate(`/classroom/${classroomId}`);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join classroom.');
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (idx: number, val: string) => {
    const char = val.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase();
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    if (char) {
      if (idx < CODE_LENGTH - 1) {
        inputRefs.current[idx + 1]?.focus();
      } else {
        // Auto-submit when last box filled
        const fullCode = next.join('');
        if (!fullCode.includes('')) handleJoin(fullCode);
      }
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').slice(0, CODE_LENGTH).toUpperCase();
    if (pasted.length > 0) {
      const next = Array(CODE_LENGTH).fill('');
      pasted.split('').forEach((c, i) => { next[i] = c; });
      setDigits(next);
      inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
      if (pasted.length === CODE_LENGTH) handleJoin(pasted);
    }
  };

  // ── Success ─────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <ExtendedAuthShell eyebrow="Student Portal" headline="You're in!" sub="Setting up your classroom…">
        <div className="flex flex-col items-center gap-5 py-12 text-center" style={{ animation: 'authStepIn 0.3s ease-out' }}>
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-teal-100 animate-ping opacity-40" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-teal-50 ring-4 ring-teal-200">
              <CheckCircle2 className="h-9 w-9 text-teal-500" />
            </div>
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">Classroom joined!</p>
            <p className="mt-1 text-sm text-slate-500">Taking you there now…</p>
          </div>
        </div>
      </ExtendedAuthShell>
    );
  }

  return (
    <ExtendedAuthShell
      eyebrow="Student Portal"
      headline="Join a Classroom"
      sub="Enter the invite code your teacher gave you."
    >
      <div style={{ animation: 'authStepIn 0.22s ease-out' }}>
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg shadow-teal-200">
            <Hash className="h-8 w-8" />
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-white shadow">
              NEW
            </span>
          </div>
        </div>

        <div className="text-center mb-7">
          <h2 className="text-xl font-bold text-slate-900">Enter classroom code</h2>
          <p className="mt-1 text-sm text-slate-500">6 characters — letters and numbers</p>
        </div>

        {/* Code entry */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleJoin(); }}
        >
          <div className="flex justify-between gap-2 mb-5" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="text"
                maxLength={1}
                value={d}
                autoFocus={i === 0}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                placeholder="·"
                className={[
                  'h-14 flex-1 rounded-xl border-2 text-center text-lg font-bold uppercase text-slate-900 tracking-wider',
                  'transition-all duration-150 focus:outline-none focus:scale-105',
                  'placeholder:text-slate-300',
                  d
                    ? 'border-teal-400 bg-teal-50 text-teal-800 focus:ring-3 focus:ring-teal-100'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 focus:border-teal-400 focus:ring-3 focus:ring-teal-100',
                ].join(' ')}
              />
            ))}
          </div>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className={`mt-4 transition-opacity duration-300 ${isComplete ? 'opacity-100' : 'opacity-50'}`}>
            <PrimaryButton
              type="submit"
              loading={loading}
              icon={<ArrowRight className="h-4 w-4" />}
            >
              Join Classroom
            </PrimaryButton>
          </div>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs font-medium text-slate-400">or</span>
          </div>
        </div>

        {/* Browse classes */}
        <button
          type="button"
          onClick={() => navigate('/student/classes')}
          className="group flex w-full items-center justify-between gap-2 rounded-xl border-2 border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition-all hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-400 group-hover:bg-teal-100 group-hover:text-teal-600 transition-colors">
              <BookOpen className="h-3.5 w-3.5" />
            </span>
            Browse My Classes
          </div>
          <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-teal-400 transition-colors" />
        </button>

        {/* Tip */}
        <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-teal-50 border border-teal-100 px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-teal-500 mt-0.5" />
          <p className="text-xs text-teal-700">
            <span className="font-semibold">No code?</span> Ask your teacher to share the classroom invite code with you.
          </p>
        </div>
      </div>
    </ExtendedAuthShell>
  );
}
