/**
 * LoginPage.tsx
 *
 * Architecture role:
 * This page handles teacher/student authentication while preserving the existing
 * password and magic-code login logic, and applies the AdminCoursesCatalog visual style.
 */

import React, { useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Sparkles, Mail, Key, Eye, EyeOff, Loader2 } from 'lucide-react';
import EmailVerification from './EmailVerification';
import { useAuth } from '../../hooks/useAuth';
import toast from 'react-hot-toast';
import { LinguAiLogo } from '../global/LinguAiLogo';

/* ─── Types ──────────────────────────────────────────────────── */
type LoginMode = 'password' | 'magic';

/* ─── Design tokens ──────────────────────────────────────────── */
const c = {
  pageBg:            '#F7F7FA',
  pageCard:          '#FFFFFF',
  pageCardBorder:    '#E8E8F0',
  textMain:          '#18181B',
  textSub:           '#52525B',
  textMuted:         '#A1A1AA',
  textMutedLight:    '#D4D4D8',
  violet:            '#6C6FEF',
  violetDark:        '#4F52C2',
  violetLight:       '#EEF0FE',
  inputBg:           '#FFFFFF',
  inputBorder:       '#E8E8F0',
  inputBorderFocus:  '#6C6FEF',
  inputText:         '#18181B',
  inputIcon:         '#A1A1AA',
  inputPlaceholder:  '#D4D4D8',

  segBorder:         '#E8E8F0',
  segActiveBg:       '#EEF0FE',
  segActiveText:     '#4F52C2',
  segInactiveText:   '#A1A1AA',

  btnBg:             '#6C6FEF',
  btnHover:          '#4F52C2',
  btnText:           '#FFFFFF',
  btnDisabled:       '#C7CAFF',

  forgotColor:       '#A1A1AA',
  forgotHover:       '#52525B',
  linkColor:         '#6C6FEF',
  mutedText:         '#A1A1AA',

  errorText:         '#DC2626',
  errorBorder:       '#FCA5A5',
  errorBg:           '#FEF2F2',
  tipBg:             '#EEF0FE',
  tipBorder:         '#C7CAFF',
  tipText:           '#4F52C2',
} as const;

/* ─── Shell ──────────────────────────────────────────────────── */
function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: c.pageBg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 14px 40px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Logo keeps brand anchor while page adopts catalog shell style */}
      <div style={{ marginBottom: '12px' }}>
        <a href="/" style={{ display: 'inline-block' }} aria-label="LinguAI home">
          <LinguAiLogo height={46} showWordmark />
        </a>
      </div>

      {/* White container mirrors the AdminCoursesCatalog card shell */}
      <div style={{
        width: '100%',
        maxWidth: '360px',
        background: c.pageCard,
        borderRadius: '14px',
        border: `1px solid ${c.pageCardBorder}`,
        boxShadow: '0 1px 4px rgba(108,111,239,.04)',
        padding: '22px 18px 18px',
      }}>
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
      borderRadius: '8px',
      padding: '2px',
      marginBottom: '10px',
      gap: '2px',
      background: '#FFFFFF',
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
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              fontSize: '12px',
              fontWeight: active ? 700 : 500,
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
      border: `1.5px solid ${focused ? c.inputBorderFocus : c.inputBorder}`,
      borderRadius: '8px',
      height: '42px',
      padding: '0 10px',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      boxShadow: focused ? `0 0 0 3px ${c.violetLight}` : 'none',
    }}>
      <span style={{ display: 'flex', color: c.inputIcon, marginRight: '8px', flexShrink: 0 }}>
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
          fontSize: '13px',
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
      padding: '7px 10px',
      background: c.errorBg,
      border: `1px solid ${c.errorBorder}`,
      borderRadius: '7px',
      fontSize: '12px',
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
        height: '42px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        fontSize: '13px',
        fontWeight: 700,
        color: c.btnText,
        background: isDisabled ? c.btnDisabled : (hov ? c.btnHover : c.btnBg),
        border: 'none',
        borderRadius: '9px',
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
      // First-time teachers used to go to /admin/onboarding; they now land on the course catalog instead
      navigate(!user.onboarding_completed ? '/admin/courses' : '/admin/dashboard', { replace: true });
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
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pmSpin { to { transform: rotate(360deg); } }
        @keyframes pmFadeUp {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: ${c.inputPlaceholder}; }
      `}</style>

      <LoginShell>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <h1 style={{
            margin: 0,
            fontFamily: "'Nunito', system-ui, sans-serif",
            fontSize: '20px',
            fontWeight: 900,
            color: c.textMain,
          }}>
            Welcome back
          </h1>
          <p style={{
            margin: '4px 0 0',
            fontSize: '12px',
            color: c.textSub,
            lineHeight: 1.5,
          }}>
            Sign in to continue to your classroom workspace.
          </p>
        </div>

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
                style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}
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
                      fontSize: '12px', color: c.forgotColor, fontWeight: 600,
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
                  style={{ marginTop: '4px' }}
                >
                  Sign in
                </PrimaryBtn>
              </form>
            )}

            {/* Magic code form */}
            {mode === 'magic' && (
              <form
                onSubmit={handleSendMagicCode}
                style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}
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
                  padding: '7px 9px',
                  background: c.tipBg,
                  border: `1px solid ${c.tipBorder}`,
                  borderRadius: '7px',
                  fontSize: '12px',
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
                  style={{ marginTop: '4px' }}
                >
                  Send magic code
                </PrimaryBtn>
              </form>
            )}

            {/* Sign up link */}
            <p style={{
              marginTop: '14px',
              textAlign: 'center',
              fontSize: '12px',
              color: c.mutedText,
            }}>
              No account?{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600, color: c.linkColor, padding: 0,
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