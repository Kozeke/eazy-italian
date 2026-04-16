/**
 * JoinClassroomPage.tsx
 *
 * Route: /join-classroom
 *
 * Shown to students right after registration (and accessible any time).
 * Two paths:
 *   1. Enter invite code → POST /api/v1/student/join-classroom → redirect to /classroom/:id
 *   2. Browse my classes → /student/classes
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Hash, Sparkles } from 'lucide-react';
import { AuthShell, StepHeader, PrimaryButton, ErrorMsg } from './RegisterPage';

const CODE_LENGTH = 6;

export default function JoinClassroomPage() {
  const navigate = useNavigate();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join('').toUpperCase();
  const isComplete = code.length === CODE_LENGTH && !digits.includes('');

  const handleChange = (idx: number, val: string) => {
    const char = val.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase();
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    if (char && idx < CODE_LENGTH - 1) inputRefs.current[idx + 1]?.focus();
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
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComplete) { setError('Please enter the full 6-character code.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/student/join-classroom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Invalid code. Please check and try again.');
      }
      const data = await res.json();
      // Redirect to the classroom the student just joined
      const classroomId = data.classroom?.id ?? data.id;
      navigate(`/classroom/${classroomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join classroom.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="animate-fadein">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-violet-500 text-white shadow-lg shadow-primary-200">
            <Hash className="h-8 w-8" />
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-white shadow">
              NEW
            </span>
          </div>
        </div>

        <StepHeader
          eyebrow="Student Portal"
          title="Join a Classroom"
          subtitle="Enter the invite code your teacher gave you."
        />

        {/* Code entry */}
        <form onSubmit={handleJoin} className="mt-8">
          <label className="block text-sm font-semibold text-slate-700 mb-3">
            Classroom code
          </label>
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
                  'h-14 flex-1 rounded-xl border-2 bg-slate-50 text-center text-lg font-bold uppercase text-slate-900 tracking-wider transition-all',
                  'focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-3 focus:ring-primary-100',
                  'placeholder:text-slate-300',
                  d ? 'border-primary-300 bg-primary-50/50' : 'border-slate-200',
                ].join(' ')}
              />
            ))}
          </div>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className={`mt-4 transition-opacity duration-300 ${isComplete ? 'opacity-100' : 'opacity-60'}`}>
            <PrimaryButton type="submit" loading={loading} icon={<ArrowRight className="h-4 w-4" />}>
              Join Classroom
            </PrimaryButton>
          </div>
        </form>

        {/* Divider */}
        <div className="relative my-7">
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
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          <BookOpen className="h-4 w-4 text-slate-400" />
          Browse My Classes
          <ArrowRight className="h-4 w-4 text-slate-400 ml-auto" />
        </button>

        {/* Tip */}
        <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">No code?</span> Ask your teacher to share the classroom invite code with you.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
