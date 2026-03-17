/**
 * LoginPage.tsx  (v4 — ProgressMe-faithful)
 *
 * Visual direction from ProgressMe reference screenshot:
 * ──────────────────────────────────────────────────────
 * • Pure white page background — no tint
 * • Logo + wordmark centered above the form area
 * • No card box / no outer shadow — form floats on white
 * • Segmented tab switcher: single rounded-rect border container,
 *   two equal-width options, active = darker text + subtle fill,
 *   inactive = muted gray text
 * • Inputs: light gray bg (#F4F5F7), transparent border at rest,
 *   subtle border on focus; left-side icon in muted gray
 * • "Forgot password?" sits inline below inputs as small muted underline link
 * • CTA: full-width, solid vivid sky-blue (#29B6F6), white text
 * • No gradients, no shadows, no decorative panels
 *
 * All auth logic is unchanged:
 *   password login · magic-code send · EmailVerification reuse ·
 *   role-based redirects · next-path handling
 */

import React, { useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Sparkles, Mail, Key, Eye, EyeOff, Loader2 } from 'lucide-react';
import EmailVerification from './EmailVerification';
import { useAuth } from '../../hooks/useAuth';
import toast from 'react-hot-toast';

/* ─── Types ──────────────────────────────────────────────────── */
type LoginMode = 'password' | 'magic';

/* ─── Design tokens ──────────────────────────────────────────── */
const c = {
  page:             '#FFFFFF',
  inputBg:          '#F4F5F7',
  inputBorderFocus: '#C5CAD3',
  inputText:        '#1A1D23',
  inputIcon:        '#B0B7C3',
  inputPlaceholder: '#B0B7C3',

  segBorder:        '#E0E3EB',
  segActiveBg:      '#F0F2F5',
  segActiveText:    '#1A1D23',
  segInactiveText:  '#9CA3AF',

  btnBg:            '#29B6F6',
  btnHover:         '#039BE5',
  btnText:          '#FFFFFF',
  btnDisabled:      '#A5D8F3',

  forgotColor:      '#9CA3AF',
  forgotHover:      '#4B5563',
  linkColor:        '#29B6F6',
  mutedText:        '#9CA3AF',

  errorText:        '#DC2626',
  errorBorder:      '#FCA5A5',
  errorBg:          '#FEF2F2',
  tipBg:            '#EFF9FF',
  tipBorder:        '#BAE6FD',
  tipText:          '#0369A1',
} as const;

/* ─── Shell ──────────────────────────────────────────────────── */
function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: c.page,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px 56px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '28px',
      }}>
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
          <rect width="34" height="34" rx="9" fill="#EFF9FF"/>
          <path d="M17 7C12.3 7 8.5 10.8 8.5 15.5V25.5C8.5 26.3 9.2 27 10 27H17V7Z" fill="#29B6F6"/>
          <path d="M17 7C21.7 7 25.5 10.8 25.5 15.5V25.5C25.5 26.3 24.8 27 24 27H17V7Z" fill="#F97316" opacity="0.9"/>
          <rect x="15.75" y="7" width="2.5" height="20" rx="1" fill="white" opacity="0.55"/>
        </svg>
        <span style={{
          fontSize: '19px',
          fontWeight: 700,
          color: '#1A1D23',
          letterSpacing: '-0.025em',
        }}>
          EZ Italian
        </span>
      </div>

      {/* Form area */}
      <div style={{ width: '100%', maxWidth: '300px' }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Segmented tabs ─────────────────────────────────────────── */
function SegTabs({ mode, onChange }: { mode: LoginMode; onChange: (m: LoginMode) => void }) {
  return (
    <div style={{
      display: 'flex',
      border: `1.5px solid ${c.segBorder}`,
      borderRadius: '9px',
      padding: '3px',
      marginBottom: '16px',
      gap: '2px',
    }}>
      {(['password', 'magic'] as LoginMode[]).map(m => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={{
              flex: 1,
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              fontSize: '13px',
              fontWeight: active ? 600 : 400,
              color: active ? c.segActiveText : c.segInactiveText,
              background: active ? c.segActiveBg : 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {m === 'magic' && (
              <Sparkles style={{ width: 11, height: 11, opacity: active ? 0.75 : 0.45 }} />
            )}
            {m === 'password' ? 'Password' : 'Magic code'}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Input field ────────────────────────────────────────────── */
interface FieldProps {
  icon: React.ReactNode;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  rightSlot?: React.ReactNode;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}
function Field({ icon, type = 'text', placeholder, value, onChange, rightSlot, autoFocus, inputRef }: FieldProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: c.inputBg,
      border: `1.5px solid ${focused ? c.inputBorderFocus : 'transparent'}`,
      borderRadius: '8px',
      height: '44px',
      padding: '0 12px',
      transition: 'border-color 0.15s',
    }}>
      <span style={{ display: 'flex', color: c.inputIcon, marginRight: '9px', flexShrink: 0 }}>
        {icon}
      </span>
      <input
        ref={inputRef}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: '14px',
          color: c.inputText,
          minWidth: 0,
        }}
      />
      {rightSlot && (
        <span style={{ display: 'flex', color: c.inputIcon, marginLeft: '8px', flexShrink: 0 }}>
          {rightSlot}
        </span>
      )}
    </div>
  );
}

/* ─── Error ──────────────────────────────────────────────────── */
function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 12px',
      background: c.errorBg,
      border: `1px solid ${c.errorBorder}`,
      borderRadius: '7px',
      fontSize: '13px',
      color: c.errorText,
      lineHeight: 1.4,
    }}>
      {children}
    </div>
  );
}

/* ─── Primary button ─────────────────────────────────────────── */
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  icon?: React.ReactNode;
}
function PrimaryBtn({ loading, icon, children, disabled, style, ...rest }: BtnProps) {
  const [hov, setHov] = React.useState(false);
  const isDisabled = disabled || loading;
  return (
    <button
      {...rest}
      disabled={isDisabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        fontSize: '14px',
        fontWeight: 600,
        color: c.btnText,
        background: isDisabled ? c.btnDisabled : (hov ? c.btnHover : c.btnBg),
        border: 'none',
        borderRadius: '8px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
        letterSpacing: '0.005em',
        ...style,
      }}
    >
      {loading
        ? <Loader2 style={{ width: 16, height: 16, animation: 'pmSpin 0.8s linear infinite' }} />
        : <>{children}{icon && <span style={{ display: 'flex', opacity: 0.8 }}>{icon}</span>}</>
      }
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function LoginPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { login } = useAuth();

  const [mode, setMode]           = useState<LoginMode>('password');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [magicSent, setMagicSent] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  /* Unchanged redirect logic */
  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('next') || sessionStorage.getItem('post_login_redirect') || '';
  }, [location.search]);

  const handleAfterLogin = (user: any) => {
    // toast.success('Welcome back!');
    if (nextPath) {
      sessionStorage.removeItem('post_login_redirect');
      navigate(nextPath, { replace: true });
      return;
    }
    if (user?.role === 'teacher') {
      navigate(!user.onboarding_completed ? '/admin/onboarding' : '/admin/dashboard', { replace: true });
    } else {
      navigate('/student/classes', { replace: true });
    }
  };

  /* Unchanged password login */
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      handleAfterLogin(user);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Login failed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  /* Magic code send — only proceeds if the email exists in the system */
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 404 means no account with this email
        if (res.status === 404) {
          throw new Error('No account found with this email. Please register first.');
        }
        throw new Error(data.detail || data.message || 'Failed to send code.');
      }
      setMagicSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic code.');
    } finally {
      setLoading(false);
    }
  };

  /* Unchanged magic-verified handler */
  const handleMagicVerified = async () => {
    try {
      const res = await fetch('/api/v1/users/me', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      handleAfterLogin(data);
    } catch {
      navigate('/student/classes', { replace: true });
    }
  };

  const switchMode = (m: LoginMode) => {
    setMode(m);
    setError('');
    setMagicSent(false);
    setTimeout(() => emailRef.current?.focus(), 50);
  };

  return (
    <>
      <style>{`
        @keyframes pmSpin { to { transform: rotate(360deg); } }
        @keyframes pmFadeUp {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: ${c.inputPlaceholder}; }
      `}</style>

      <LoginShell>
        {/* Magic OTP step — EmailVerification reused unchanged */}
        {mode === 'magic' && magicSent ? (
          <div style={{ animation: 'pmFadeUp 0.2s ease-out' }}>
            <EmailVerification email={email} onVerified={handleMagicVerified} />
          </div>
        ) : (
          <div style={{ animation: 'pmFadeUp 0.2s ease-out' }}>

            <SegTabs mode={mode} onChange={switchMode} />

            {/* Password form */}
            {mode === 'password' && (
              <form
                onSubmit={handlePasswordLogin}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <Field
                  icon={<Mail style={{ width: 16, height: 16 }} />}
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={setEmail}
                  autoFocus
                  inputRef={emailRef}
                />
                <Field
                  icon={<Key style={{ width: 16, height: 16 }} />}
                  type={showPw ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={setPassword}
                  rightSlot={
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw
                        ? <EyeOff style={{ width: 15, height: 15 }} />
                        : <Eye    style={{ width: 15, height: 15 }} />}
                    </button>
                  }
                />

                {/* Forgot password — inline below fields, matches ProgressMe */}
                <div style={{ marginTop: '2px' }}>
                  <button
                    type="button"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontSize: '12.5px', color: c.forgotColor,
                      textDecoration: 'underline', transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = c.forgotHover)}
                    onMouseLeave={e => (e.currentTarget.style.color = c.forgotColor)}
                  >
                    Forgot password?
                  </button>
                </div>

                {error && <ErrorMsg>{error}</ErrorMsg>}

                <PrimaryBtn
                  type="submit"
                  loading={loading}
                  icon={<ArrowRight style={{ width: 15, height: 15 }} />}
                  style={{ marginTop: '6px' }}
                >
                  Sign in
                </PrimaryBtn>
              </form>
            )}

            {/* Magic code form */}
            {mode === 'magic' && (
              <form
                onSubmit={handleSendMagicCode}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <Field
                  icon={<Mail style={{ width: 16, height: 16 }} />}
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={setEmail}
                  autoFocus
                  inputRef={emailRef}
                />

                <p style={{
                  margin: 0,
                  padding: '8px 11px',
                  background: c.tipBg,
                  border: `1px solid ${c.tipBorder}`,
                  borderRadius: '7px',
                  fontSize: '12.5px',
                  color: c.tipText,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '7px',
                  lineHeight: 1.5,
                }}>
                  <Sparkles style={{ width: 13, height: 13, flexShrink: 0, marginTop: '1px' }} />
                  We'll send a one-time code to your inbox — no password needed.
                </p>

                {error && <ErrorMsg>{error}</ErrorMsg>}

                <PrimaryBtn
                  type="submit"
                  loading={loading}
                  icon={<Sparkles style={{ width: 13, height: 13 }} />}
                  style={{ marginTop: '6px' }}
                >
                  Send magic code
                </PrimaryBtn>
              </form>
            )}

            {/* Sign up link */}
            <p style={{
              marginTop: '20px',
              textAlign: 'center',
              fontSize: '13px',
              color: c.mutedText,
            }}>
              No account?{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600, color: c.linkColor, padding: 0,
                }}
              >
                Sign up free
              </button>
            </p>
          </div>
        )}
      </LoginShell>
    </>
  );
}