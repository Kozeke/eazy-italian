/**
 * EmailVerification.tsx
 *
 * 6-digit OTP code entry.
 *
 * Architecture role:
 * This component handles OTP verification for magic login/email verification and
 * shares auth primitives with register/login while following the catalog style palette.
 */

import React, { useRef, useState, useEffect } from 'react';
import { Mail, RefreshCw, CheckCircle } from 'lucide-react';
import { API_V1_BASE } from '../../services/api';
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
      const res = await fetch(`${API_V1_BASE}/auth/verify-email`, {
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
      await fetch(`${API_V1_BASE}/auth/resend-verification`, {
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
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center" style={{ animation: 'authStepIn 0.3s ease-out' }}>
        <div className="relative flex h-16 w-16 items-center justify-center">
          {/* Pulse ring */}
          <div className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: '#EEF0FE' }} />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full ring-4" style={{ background: '#EEF0FE', borderColor: '#C7CAFF' }}>
            <CheckCircle className="h-7 w-7" style={{ color: '#6C6FEF' }} />
          </div>
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">Email verified!</p>
          <p className="mt-1 text-xs text-slate-500">Redirecting you now…</p>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Icon */}
      <div className="mb-4 flex justify-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl ring-1 shadow-sm" style={{ background: '#EEF0FE', borderColor: '#C7CAFF' }}>
          <Mail className="h-5 w-5" style={{ color: '#4F52C2' }} />
        </div>
      </div>

      <div className="text-center mb-5">
        <h2 className="text-lg font-bold text-slate-900">Check your inbox</h2>
        <p className="mt-1 text-xs text-slate-500">
          We sent a 6-digit code to{' '}
          <span className="font-semibold text-slate-700">{email}</span>
        </p>
      </div>

      <form onSubmit={handleVerify}>
        <div
          className="flex justify-center gap-1.5 mb-4"
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
                'rounded-lg border-2 text-center text-lg font-bold text-slate-900',
                'transition-all duration-150 focus:outline-none focus:scale-105',
                d
                  ? 'text-indigo-900 focus:ring-3'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 focus:ring-3',
              ].join(' ')}
              style={{
                height: 44,
                width: 38,
                borderColor: d ? '#6C6FEF' : undefined,
                background: d ? '#EEF0FE' : undefined,
                boxShadow: 'none',
              }}
            />
          ))}
        </div>

        {error && <ErrorMsg>{error}</ErrorMsg>}

        <div className="mt-3">
          <PrimaryButton type="submit" loading={loading}>
            Verify email
          </PrimaryButton>
        </div>
      </form>

      {/* Resend */}
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || resending}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: resendCooldown > 0 ? '#A1A1AA' : '#6C6FEF' }}
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
