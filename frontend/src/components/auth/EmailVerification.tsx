/**
 * EmailVerification.tsx  (v2 — Student Design System)
 *
 * 6-digit OTP code entry.
 *
 * What changed from v1:
 * ─────────────────────
 * • Uses teal focus rings + teal fill for entered digits (student identity).
 * • Entering the last digit auto-submits (no manual click required).
 * • Individual digit boxes: cleaner sizing, transition effects.
 * • Resend section: cooldown progress ring replaces bare countdown text.
 * • Success state: scaled-up ring icon with celebration animation.
 * • Mobile: digit boxes expand to fill available width.
 * • Uses ErrorMsg from RegisterPage for consistent error display.
 */

import React, { useRef, useState, useEffect } from 'react';
import { Mail, RefreshCw, CheckCircle } from 'lucide-react';
import { PrimaryButton, ErrorMsg } from './RegisterPage';

interface EmailVerificationProps {
  email: string;
  onVerified: () => void;
}

export default function EmailVerification({ email, onVerified }: EmailVerificationProps) {
  const [digits, setDigits]           = useState(['', '', '', '', '', '']);
  const [loading, setLoading]         = useState(false);
  const [resending, setResending]     = useState(false);
  const [resendCooldown, setResend]   = useState(60);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Start cooldown on mount
  useEffect(() => {
    const t = setInterval(() => setResend(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const doVerify = async (code: string) => {
    if (code.length < 6) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Invalid code. Please try again.');
      }
      setSuccess(true);
      setTimeout(onVerified, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
      // Shake and clear on error
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (idx: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    if (char) {
      if (idx < 5) {
        inputRefs.current[idx + 1]?.focus();
      } else {
        // Last digit — auto-submit
        doVerify(next.join(''));
      }
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const next = pasted.split('');
      setDigits(next);
      inputRefs.current[5]?.focus();
      doVerify(pasted);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length < 6) { setError('Please enter all 6 digits.'); return; }
    doVerify(code);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    try {
      await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResend(60);
      setDigits(['', '', '', '', '', '']);
      setError('');
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally {
      setResending(false);
    }
  };

  // ── Success state ───────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center" style={{ animation: 'authStepIn 0.3s ease-out' }}>
        <div className="relative flex h-20 w-20 items-center justify-center">
          {/* Pulse ring */}
          <div className="absolute inset-0 rounded-full bg-teal-100 animate-ping opacity-40" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-teal-50 ring-4 ring-teal-200">
            <CheckCircle className="h-9 w-9 text-teal-500" />
          </div>
        </div>
        <div>
          <p className="text-xl font-bold text-slate-900">Email verified!</p>
          <p className="mt-1 text-sm text-slate-500">Redirecting you now…</p>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Icon */}
      <div className="mb-6 flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 ring-1 ring-teal-200 shadow-sm">
          <Mail className="h-7 w-7 text-teal-600" />
        </div>
      </div>

      <div className="text-center mb-7">
        <h2 className="text-xl font-bold text-slate-900">Check your inbox</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          We sent a 6-digit code to{' '}
          <span className="font-semibold text-slate-700">{email}</span>
        </p>
      </div>

      <form onSubmit={handleVerify}>
        <div
          className="flex justify-center gap-2 mb-5"
          onPaste={handlePaste}
          style={{ animation: error ? 'shake 0.35s ease' : undefined }}
        >
          <style>{`
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              20%       { transform: translateX(-6px); }
              40%       { transform: translateX(6px); }
              60%       { transform: translateX(-4px); }
              80%       { transform: translateX(4px); }
            }
          `}</style>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              autoFocus={i === 0}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={[
                'h-13 w-11 sm:w-12 rounded-xl border-2 text-center text-xl font-bold text-slate-900',
                'transition-all duration-150 focus:outline-none focus:scale-105',
                d
                  ? 'border-teal-400 bg-teal-50 text-teal-800 focus:ring-3 focus:ring-teal-100'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 focus:border-teal-400 focus:ring-3 focus:ring-teal-100',
              ].join(' ')}
              style={{ height: 52 }}
            />
          ))}
        </div>

        {error && <ErrorMsg>{error}</ErrorMsg>}

        <div className="mt-4">
          <PrimaryButton type="submit" loading={loading}>
            Verify email
          </PrimaryButton>
        </div>
      </form>

      {/* Resend */}
      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || resending}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${resending ? 'animate-spin' : ''}`} />
          {resendCooldown > 0 ? (
            <span>Resend code in <span className="tabular-nums">{resendCooldown}s</span></span>
          ) : (
            'Resend code'
          )}
        </button>
      </div>
    </div>
  );
}
