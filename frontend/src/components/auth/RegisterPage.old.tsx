/**
 * RegisterPage.tsx
 * Email-first, multi-step registration flow.
 * Steps: email → role → (teacher: email verify → onboarding) | (student: create account → join classroom)
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, GraduationCap } from 'lucide-react';
import RoleSelection from './RoleSelection';
import EmailVerification from './EmailVerification';

type Step = 'email' | 'role' | 'details' | 'verify';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'teacher' | 'student' | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setStep('role');
  };

  const handleRoleSelect = (selected: 'teacher' | 'student') => {
    setRole(selected);
    setStep('details');
  };

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName, role }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      // Teacher: needs email verification; student: go to join classroom
      if (role === 'teacher') {
        setStep('verify');
      } else {
        navigate('/join-classroom');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerified = () => {
    navigate('/admin/dashboard');
  };

  const stepIndex = { email: 0, role: 1, details: 2, verify: 3 }[step];

  return (
    <AuthShell>
      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i <= stepIndex ? 'bg-primary-500 w-6' : 'bg-slate-200 w-1.5'
            }`}
          />
        ))}
      </div>

      {/* ── Step: Email ── */}
      {step === 'email' && (
        <div className="animate-fadein">
          <StepHeader
            eyebrow="Welcome"
            title="Let's get you started"
            subtitle="Enter your email to create an account."
          />
          <form onSubmit={handleEmailSubmit} className="mt-8 space-y-4">
            <AuthInput
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={setEmail}
              autoFocus
            />
            {error && <ErrorMsg>{error}</ErrorMsg>}
            <PrimaryButton type="submit" icon={<ArrowRight className="h-4 w-4" />}>
              Continue
            </PrimaryButton>
          </form>
          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="text-primary-600 font-semibold hover:underline">
              Sign in
            </button>
          </p>
        </div>
      )}

      {/* ── Step: Role ── */}
      {step === 'role' && (
        <div className="animate-fadein">
          <BackButton onClick={() => setStep('email')} />
          <StepHeader
            eyebrow={email}
            title="How will you use EZ Italian?"
            subtitle="Choose your account type to get started."
          />
          <div className="mt-8">
            <RoleSelection onSelect={handleRoleSelect} />
          </div>
        </div>
      )}

      {/* ── Step: Details ── */}
      {step === 'details' && (
        <div className="animate-fadein">
          <BackButton onClick={() => setStep('role')} />
          <StepHeader
            eyebrow={role === 'teacher' ? 'Teacher Account' : 'Student Account'}
            title="Tell us about yourself"
            subtitle="Just a few more details to set up your account."
          />
          <form onSubmit={handleDetailsSubmit} className="mt-8 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <AuthInput label="First name" placeholder="Maria" value={firstName} onChange={setFirstName} autoFocus />
              <AuthInput label="Last name" placeholder="Rossi" value={lastName} onChange={setLastName} />
            </div>
            <AuthInput label="Password" type="password" placeholder="Create a password" value={password} onChange={setPassword} />
            {error && <ErrorMsg>{error}</ErrorMsg>}
            <PrimaryButton type="submit" loading={loading} icon={<ArrowRight className="h-4 w-4" />}>
              {role === 'teacher' ? 'Create Teacher Account' : 'Create Student Account'}
            </PrimaryButton>
          </form>
        </div>
      )}

      {/* ── Step: Verify (teacher only) ── */}
      {step === 'verify' && (
        <div className="animate-fadein">
          <EmailVerification email={email} onVerified={handleVerified} />
        </div>
      )}
    </AuthShell>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50/30 to-slate-100 flex items-center justify-center p-4">
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary-200/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-violet-200/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-400 text-white shadow-lg shadow-primary-200">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 leading-tight">EZ Italian</p>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-500">Learning Platform</p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 backdrop-blur-sm shadow-xl shadow-slate-200/50 px-8 py-10">
          {children}
        </div>
      </div>
    </div>
  );
}

export function StepHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div>
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-primary-500 mb-1">{eyebrow}</p>}
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

export function AuthInput({
  label, type = 'text', placeholder, value, onChange, autoFocus,
}: {
  label: string; type?: string; placeholder?: string;
  value: string; onChange: (v: string) => void; autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-3 focus:ring-primary-100"
      />
    </div>
  );
}

export function PrimaryButton({
  children, type = 'button', loading, icon, onClick,
}: {
  children: React.ReactNode; type?: 'button' | 'submit';
  loading?: boolean; icon?: React.ReactNode; onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-primary-200 transition-all hover:bg-primary-700 hover:shadow-md disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      ) : (
        <>
          {children}
          {icon}
        </>
      )}
    </button>
  );
}

export function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-2.5 text-sm text-red-600 font-medium">
      {children}
    </p>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mb-6 flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}
