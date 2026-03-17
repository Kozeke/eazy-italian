/**
 * LoginPage.tsx
 *
 * Supports:
 *   - Password login
 *   - Magic code (passwordless) login
 *
 * After login:
 *   teacher → /admin/onboarding (if not completed) or /admin/dashboard
 *   student → /student/classes
 */

import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { AuthShell, StepHeader, AuthInput, PrimaryButton, ErrorMsg } from './RegisterPage';
import EmailVerification from './EmailVerification';
import { useAuth } from '../../hooks/useAuth';
import toast from 'react-hot-toast';

type LoginMode = 'password' | 'magic';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [mode, setMode] = useState<LoginMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicSent, setMagicSent] = useState(false);

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const nextFromQuery = params.get('next');
    const nextFromSession = sessionStorage.getItem('post_login_redirect');
    return nextFromQuery || nextFromSession || '';
  }, [location.search]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(email, password);
      toast.success('Successfully logged in!');
      
      // Check for redirect path first
      if (nextPath) {
        sessionStorage.removeItem('post_login_redirect');
        navigate(nextPath, { replace: true });
        return;
      }
      
      // Navigate based on role and onboarding status
      if (loggedInUser?.role === 'teacher') {
        if (!loggedInUser.onboarding_completed) {
          navigate('/admin/onboarding', { replace: true });
        } else {
          navigate('/admin/dashboard', { replace: true });
        }
      } else {
        navigate('/student/classes', { replace: true });
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Login failed.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMagicCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setError('Please enter a valid email.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/magic-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Failed to send code.');
      setMagicSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic code.');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicVerified = async () => {
    // After verification, fetch profile to determine role
    try {
      const res = await fetch('/api/v1/users/me', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch user profile');
      }
      const data = await res.json();
      
      // Check for redirect path first
      if (nextPath) {
        sessionStorage.removeItem('post_login_redirect');
        navigate(nextPath, { replace: true });
        return;
      }
      
      // Navigate based on role and onboarding status
      if (data.role === 'teacher') {
        if (!data.onboarding_completed) {
          navigate('/admin/onboarding', { replace: true });
        } else {
          navigate('/admin/dashboard', { replace: true });
        }
      } else {
        navigate('/student/classes', { replace: true });
      }
    } catch {
      // Fallback if profile fetch fails
      navigate('/student/classes', { replace: true });
    }
  };

  return (
    <AuthShell>
      {/* Magic code: show OTP entry */}
      {mode === 'magic' && magicSent ? (
        <EmailVerification email={email} onVerified={handleMagicVerified} />
      ) : (
        <div className="animate-fadein">
          <StepHeader
            eyebrow="Welcome back"
            title="Sign in to EZ Italian"
            subtitle="Enter your credentials to continue."
          />

          {/* Mode toggle */}
          <div className="mt-6 flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(['password', 'magic'] as LoginMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); setMagicSent(false); }}
                className={[
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all duration-200',
                  mode === m
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600',
                ].join(' ')}
              >
                {m === 'magic' && <Sparkles className="h-3 w-3" />}
                {m === 'password' ? 'Password' : 'Magic Code'}
              </button>
            ))}
          </div>

          {/* Password form */}
          {mode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="mt-6 space-y-4">
              <AuthInput label="Email address" type="email" placeholder="you@example.com" value={email} onChange={setEmail} autoFocus />
              <AuthInput label="Password" type="password" placeholder="Your password" value={password} onChange={setPassword} />
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryButton type="submit" loading={loading} icon={<ArrowRight className="h-4 w-4" />}>
                Sign in
              </PrimaryButton>
              <div className="text-center">
                <button type="button" className="text-xs text-slate-400 hover:text-primary-600 transition-colors">
                  Forgot your password?
                </button>
              </div>
            </form>
          )}

          {/* Magic code form */}
          {mode === 'magic' && (
            <form onSubmit={handleSendMagicCode} className="mt-6 space-y-4">
              <AuthInput label="Email address" type="email" placeholder="you@example.com" value={email} onChange={setEmail} autoFocus />
              <p className="text-xs text-slate-500">We'll send a one-time code to your inbox — no password needed.</p>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryButton type="submit" loading={loading} icon={<Sparkles className="h-4 w-4" />}>
                Send magic code
              </PrimaryButton>
            </form>
          )}

          <p className="mt-8 text-center text-sm text-slate-400">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="text-primary-600 font-semibold hover:underline"
            >
              Sign up
            </button>
          </p>
        </div>
      )}
    </AuthShell>
  );
}
