/**
 * EmailVerification.tsx
 *
 * 6-digit OTP code entry.
 * Used for teacher email verification during registration.
 * Also usable as a standalone magic-code login step.
 */

import React, { useRef, useState, useEffect } from 'react';
import { Mail, RefreshCw, CheckCircle } from 'lucide-react';
import { PrimaryButton, ErrorMsg } from './RegisterPage';

interface EmailVerificationProps {
  email: string;
  /** Called after successful verification */
  onVerified: () => void;
}

export default function EmailVerification({ email, onVerified }: EmailVerificationProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Start cooldown on mount (code just got sent)
  useEffect(() => {
    const timer = setInterval(() => {
      setResendCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDigitChange = (idx: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    if (char && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length < 6) { setError('Please enter all 6 digits.'); return; }
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
      setTimeout(onVerified, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
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
      setResendCooldown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setResending(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8 text-center animate-fadein">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 ring-4 ring-emerald-100">
          <CheckCircle className="h-8 w-8" />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">Email verified!</p>
          <p className="mt-1 text-sm text-slate-500">Redirecting you now…</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Icon */}
      <div className="mb-6 flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500 ring-1 ring-primary-100 shadow-sm">
          <Mail className="h-7 w-7" />
        </div>
      </div>

      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Check your inbox</h2>
        <p className="mt-2 text-sm text-slate-500">
          We sent a 6-digit code to{' '}
          <span className="font-semibold text-slate-700">{email}</span>
        </p>
      </div>

      <form onSubmit={handleVerify}>
        {/* OTP input */}
        <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
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
                'h-13 w-11 rounded-xl border-2 bg-slate-50 text-center text-xl font-bold text-slate-900 transition-all',
                'focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-3 focus:ring-primary-100',
                d ? 'border-primary-300' : 'border-slate-200',
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
          className="flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${resending ? 'animate-spin' : ''}`} />
          {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
        </button>
      </div>
    </div>
  );
}
