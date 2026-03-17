/**
 * RegisterPage.tsx  (v5 — ProgressMe faithful)
 *
 * Steps:
 *   1. email        — enter email
 *   2. account-type — choose Student / Teacher cards
 *   3. activation   — OTP: mail icon + "Check your inbox" + single input + inline arrow btn
 *   4. greeting     — welcome splash
 *   5. details      — first name / last name / password (side-label layout)
 *   6. trial        — green check + trial message → /admin/dashboard
 *
 * Both Teacher and Student go through the same activation flow
 * Student registration POST → /api/v1/auth/register [unchanged payload]
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, ArrowRight, ArrowLeft, Eye, EyeOff, Lock, User, Pencil, RotateCcw,
} from 'lucide-react';

// ─── Tokens ───────────────────────────────────────────────────────────────────

const c = {
  page:             '#FFFFFF',
  inputBg:          '#F4F5F7',
  inputBorderFocus: '#29B6F6',
  inputText:        '#1A1D23',
  inputIcon:        '#B0B7C3',
  inputPlaceholder: '#B0B7C3',
  btnBg:            '#29B6F6',
  btnHover:         '#039BE5',
  btnText:          '#FFFFFF',
  btnDisabled:      '#A5D8F3',
  headingText:      '#1F2937',
  bodyText:         '#374151',
  mutedText:        '#9CA3AF',
  linkColor:        '#29B6F6',
  cardBorder:       '#E5E7EB',
  cardBorderActive: '#29B6F6',
  cardBg:           '#FFFFFF',
  errorText:        '#DC2626',
  errorBorder:      '#FCA5A5',
  errorBg:          '#FEF2F2',
} as const;

type Step = 'email' | 'account-type' | 'activation' | 'greeting' | 'details' | 'trial';

// ─── RegisterPage ─────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();

  const [step,      setStep]      = useState<Step>('email');
  const [email,     setEmail]     = useState('');
  const [role,      setRole]      = useState<'teacher' | 'student'>('student');
  const [otp,       setOtp]       = useState('');
  const [otpError,  setOtpError]  = useState('');
  const [otpLoading,setOtpLoading]= useState(false);
  const [fullName,   setFullName]  = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [resendSecs,setResendSecs]= useState(60);
  const [timerOn,   setTimerOn]   = useState(false);

  // countdown
  useEffect(() => {
    if (!timerOn) return;
    if (resendSecs <= 0) { setTimerOn(false); return; }
    const t = setTimeout(() => setResendSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerOn, resendSecs]);

  const startTimer = () => { setResendSecs(60); setTimerOn(true); };

  const sendRegistrationCode = async () => {
    try {
      await fetch('/api/v1/auth/send-registration-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch { /* best-effort */ }
    startTimer();
    setStep('activation');
  };

  // ── step handlers ──────────────────────────────────────────────────────────

  // Step 1 — validate format then check if email is already registered
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.'); return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Could not check email. Please try again.');
      const data = await res.json();
      if (data.exists) {
        setError('This email is already registered. Sign in instead.');
        return;
      }
      setStep('account-type');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — store selected role, then send OTP to the new email
  const handleRoleSelect = (selected: 'teacher' | 'student') => {
    setRole(selected);
    sendRegistrationCode();
  };

  // Step 3 — verify the pre-registration OTP (user doesn't exist yet)
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) { setOtpError('Please enter the code.'); return; }
    setOtpError('');
    setOtpLoading(true);
    try {
      const res = await fetch('/api/v1/auth/verify-registration-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Invalid code. Please try again.');
      }
      setStep('greeting');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setOtpLoading(false);
    }
  };

  // Step 5 — create the account with the selected role
  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !password.trim()) {
      setError('Please fill in all fields.'); return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    setError('');
    setLoading(true);
    const parts = fullName.trim().split(/\s+/);
    const first_name = parts[0];
    const last_name = parts.slice(1).join(' ') || parts[0];
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, password,
          first_name, last_name,
          role,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.message || `HTTP ${res.status}`);
      }
      setStep('trial');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <Shell hideLogo={step === 'trial'}>
      <style>{`
        @keyframes regIn  { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pmSpin { to{transform:rotate(360deg)} }
        @keyframes checkPop {
          0%  { opacity:0; transform:scale(.4) }
          70% { transform:scale(1.12) }
          100%{ opacity:1; transform:scale(1) }
        }
        input::placeholder { color:${c.inputPlaceholder}; }
      `}</style>

      <div key={step} style={{ animation: 'regIn 0.2s ease-out' }}>

        {/* ── 1. Email ──────────────────────────────────────────────────────── */}
        {step === 'email' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            <Title>Create your account</Title>
            <Sub>Start with your email address.</Sub>
            <form
              onSubmit={handleEmailSubmit}
              style={{ display:'flex', flexDirection:'column', gap:'8px', marginTop:'12px' }}
            >
              <InputRow
                icon={<Mail style={{ width:16, height:16 }} />}
                type="email"
                placeholder="Email"
                value={email}
                onChange={setEmail}
                autoFocus
              />
              {error && <Err>{error}</Err>}
              <BigBtn type="submit" loading={loading} icon={<ArrowRight style={{ width:15, height:15 }} />}>
                Continue
              </BigBtn>
            </form>
            <p style={{ textAlign:'center', fontSize:'13px', color:c.mutedText, marginTop:'10px' }}>
              Already have an account?{' '}
              <LinkBtn onClick={() => navigate('/login')}>Sign in</LinkBtn>
            </p>
          </div>
        )}

        {/* ── 2. Account type ───────────────────────────────────────────────── */}
        {step === 'account-type' && (
          <div>
            <BackRow onClick={() => { setStep('email'); setError(''); }} />
            <Title>Choose account type</Title>
            <Sub style={{ marginBottom:'22px' }}>
              You can switch between types later from your profile.
            </Sub>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <RoleCard
                emoji="👩‍🏫"
                label="For teaching"
                description="You're a teacher or school admin"
                onSelect={() => handleRoleSelect('teacher')}
              />
              <RoleCard
                emoji="🙋"
                label="For learning"
                description="You're a student taking classes"
                onSelect={() => handleRoleSelect('student')}
              />
            </div>
          </div>
        )}

        {/* ── 3. Activation — ProgressMe Image 2 style ─────────────────────── */}
        {step === 'activation' && (
          <ActivationStep
            email={email}
            otp={otp}
            onOtpChange={setOtp}
            onSubmit={handleOtpSubmit}
            loading={otpLoading}
            error={otpError}
            timerOn={timerOn}
            resendSecs={resendSecs}
            onResend={sendRegistrationCode}
            onEditEmail={() => setStep('email')}
          />
        )}

        {/* ── 4. Greeting ───────────────────────────────────────────────────── */}
        {step === 'greeting' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>
            <Title style={{ fontSize:'22px', marginBottom:'12px' }}>Welcome!</Title>
            <p style={{
              fontSize:'14px', color:c.bodyText, lineHeight:1.7,
              maxWidth:'280px', margin:'0 auto 28px',
            }}>
              Thousands of teachers and online schools use EZ Italian daily to build engaging, modern lessons.
            </p>
            <BigBtn onClick={() => setStep('details')} icon={<ArrowRight style={{ width:15, height:15 }} />}>
              Next
            </BigBtn>
          </div>
        )}

        {/* ── 5. Details ────────────────────────────────────────────────────── */}
        {step === 'details' && (
          <div>
            <Title style={{ marginBottom:'22px' }}>Complete registration</Title>
            <form
              onSubmit={handleDetailsSubmit}
              style={{ display:'flex', flexDirection:'column', gap:'12px' }}
            >
              <SideLabelRow label="Full name *">
                <InputRow
                  icon={<User style={{ width:16, height:16 }} />}
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={setFullName}
                  autoFocus
                />
              </SideLabelRow>
              <SideLabelRow label="Password *">
                <PwInput
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={setPassword}
                />
              </SideLabelRow>
              {error && <Err>{error}</Err>}
              <BigBtn
                type="submit"
                loading={loading}
                icon={<ArrowRight style={{ width:15, height:15 }} />}
                style={{ marginTop:'4px' }}
              >
                Continue
              </BigBtn>
            </form>
          </div>
        )}

        {/* ── 6. Trial ──────────────────────────────────────────────────────── */}
        {step === 'trial' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>
            <div style={{
              width:100, height:100, borderRadius:'50%',
              background:'linear-gradient(135deg,#4ADE80,#22C55E)',
              display:'flex', alignItems:'center', justifyContent:'center',
              marginBottom:'24px',
              animation:'checkPop 0.55s cubic-bezier(.22,.68,0,1.25) both',
              boxShadow:'0 10px 36px rgba(74,222,128,0.3)',
            }}>
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <path d="M10 23L18 31L34 14" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <Title style={{ fontSize:'20px', marginBottom:'10px' }}>Trial period</Title>
            <p style={{
              fontSize:'14px', color:c.bodyText, lineHeight:1.7,
              maxWidth:'280px', margin:'0 auto 28px',
            }}>
              We've activated a free 7-day trial so you can explore everything the platform has to offer.
            </p>
            <BigBtn
              onClick={() => navigate('/admin/dashboard')}
              icon={<ArrowRight style={{ width:15, height:15 }} />}
            >
              Let's go!
            </BigBtn>
          </div>
        )}

      </div>
    </Shell>
  );
}

// ─── ActivationStep ───────────────────────────────────────────────────────────
// Self-contained. Matches ProgressMe Image 2 exactly:
//   • "Account activation" heading
//   • description copy
//   • bold email + pencil edit icon
//   • teal rounded-square mail icon
//   • "Check your inbox" sub-heading
//   • single text input + inline square arrow button (no OTP boxes)
//   • "Verify email" full-width button
//   • resend countdown / resend link
//   • "Contact support" link

function ActivationStep({
  email, otp, onOtpChange, onSubmit, loading, error,
  timerOn, resendSecs, onResend, onEditEmail,
}: {
  email: string;
  otp: string;
  onOtpChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  error: string;
  timerOn: boolean;
  resendSecs: number;
  onResend: () => void;
  onEditEmail: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:0 }}>

      {/* Heading */}
      <Title style={{ marginBottom:'8px' }}>Account activation</Title>
      <p style={{ fontSize:'14px', color:c.bodyText, lineHeight:1.65, marginBottom:'14px', maxWidth:'260px' }}>
        Enter the 4-digit code we sent to your email:
      </p>

      {/* Email + edit */}
      <div style={{
        display:'flex', alignItems:'center', gap:'7px', marginBottom:'22px',
        fontSize:'15px', fontWeight:700, color:c.headingText,
      }}>
        {email}
        <button
          type="button"
          onClick={onEditEmail}
          aria-label="Edit email"
          style={{ background:'none', border:'none', cursor:'pointer', display:'flex', color:c.linkColor, padding:0 }}
        >
          <Pencil style={{ width:14, height:14 }} />
        </button>
      </div>

      {/* Sub-heading */}
      <p style={{ fontSize:'16px', fontWeight:700, color:c.headingText, marginBottom:'4px' }}>
        Check your inbox
      </p>
      <p style={{ fontSize:'13px', color:c.mutedText, marginBottom:'18px' }}>
        We sent a 6-digit code to <strong style={{ color:c.headingText }}>{email}</strong>
      </p>

      {/* Input row — single text input + inline arrow button */}
      <form onSubmit={onSubmit} style={{ width:'100%', maxWidth:'320px' }}>
        <div style={{
          display:'flex', gap:'8px', alignItems:'center', marginBottom:'12px',
        }}>
          <div style={{
            flex:1,
            display:'flex', alignItems:'center',
            background: focused ? '#fff' : c.inputBg,
            border:`1.5px solid ${focused ? c.inputBorderFocus : 'transparent'}`,
            borderRadius:'10px', height:'48px', padding:'0 14px',
            transition:'border-color 0.15s, background 0.15s',
          }}>
            {/* key icon */}
            <svg style={{ width:16, height:16, color:c.inputIcon, marginRight:'10px', flexShrink:0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l2 2"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              placeholder="Enter code"
              value={otp}
              onChange={e => onOtpChange(e.target.value.replace(/\D/g,'').slice(0,6))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                flex:1, background:'transparent', border:'none', outline:'none',
                fontSize:'15px', color:c.inputText, letterSpacing:'0.1em',
              }}
            />
          </div>
          {/* Inline square arrow button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width:48, height:48, flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              background: loading ? c.btnDisabled : c.btnBg,
              border:'none', borderRadius:'10px', cursor: loading ? 'not-allowed' : 'pointer',
              transition:'background 0.15s',
            }}
          >
            {loading
              ? <svg style={{ width:16,height:16,animation:'pmSpin 0.8s linear infinite' }} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2.5" strokeOpacity="0.25"/>
                  <path d="M12 3a9 9 0 0 1 9 9" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              : <ArrowRight style={{ width:18, height:18, color:'white' }} />
            }
          </button>
        </div>

        {error && <Err style={{ marginTop:'10px' }}>{error}</Err>}
      </form>

      {/* Resend row */}
      <div style={{ marginTop:'14px', display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
        {timerOn ? (
          <p style={{ fontSize:'13px', color:c.mutedText, display:'flex', alignItems:'center', gap:'5px' }}>
            <RotateCcw style={{ width:13, height:13 }} />
            Resend code in {resendSecs}s
          </p>
        ) : (
          <button
            type="button"
            onClick={onResend}
            style={{
              background:'none', border:'none', cursor:'pointer',
              fontSize:'13px', fontWeight:500, color:c.linkColor, padding:0,
            }}
          >
            Resend code
          </button>
        )}
        {timerOn && (
          <p style={{ fontSize:'12.5px', color:c.mutedText }}>
            Resend available in {resendSecs} seconds
          </p>
        )}
      </div>

      {/* Support link */}
      <p style={{ fontSize:'12.5px', color:c.mutedText, marginTop:'18px' }}>
        Having trouble?{' '}
        <a
          href="mailto:support@ezitalian.com"
          style={{ color:c.linkColor, textDecoration:'underline' }}
        >
          Contact support
        </a>
      </p>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function Shell({ children, hideLogo }: { children: React.ReactNode; hideLogo?: boolean }) {
  return (
    <div style={{
      minHeight:'100dvh', background:c.page,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'24px 16px 60px',
      fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Logo — hidden on the trial/success step */}
      {!hideLogo && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', marginBottom:'32px' }}>
          <svg width="72" height="72" viewBox="0 0 34 34" fill="none">
            <rect width="34" height="34" rx="9" fill="#EFF9FF"/>
            <path d="M17 7C12.3 7 8.5 10.8 8.5 15.5V25.5C8.5 26.3 9.2 27 10 27H17V7Z" fill="#29B6F6"/>
            <path d="M17 7C21.7 7 25.5 10.8 25.5 15.5V25.5C25.5 26.3 24.8 27 24 27H17V7Z" fill="#F97316" opacity="0.9"/>
            <rect x="15.75" y="7" width="2.5" height="20" rx="1" fill="white" opacity="0.55"/>
          </svg>
          <span style={{ fontSize:'19px', fontWeight:700, color:'#1A1D23', letterSpacing:'-0.025em' }}>
            EZ Italian
          </span>
        </div>
      )}
      <div style={{ width:'100%', maxWidth:'360px' }}>{children}</div>
    </div>
  );
}

// ─── RoleCard ─────────────────────────────────────────────────────────────────

function RoleCard({ emoji, label, description, onSelect }: {
  emoji: string; label: string; description: string; onSelect: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onSelect}
      style={{
        background: hov ? '#F0FBFF' : c.cardBg,
        border:`1.5px solid ${hov ? c.cardBorderActive : c.cardBorder}`,
        borderRadius:'16px', padding:'20px 14px 16px',
        display:'flex', flexDirection:'column', alignItems:'center', gap:'10px',
        boxShadow: hov ? '0 4px 20px rgba(41,182,246,0.12)' : '0 2px 12px rgba(0,0,0,0.05)',
        transition:'all 0.18s ease', cursor:'pointer',
      }}
    >
      <div style={{
        width:56, height:56, borderRadius:'50%', background:'#F0FBFF',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:'28px', lineHeight:1,
      }}>
        {emoji}
      </div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'13.5px', fontWeight:700, color:c.headingText, marginBottom:'3px' }}>{label}</div>
        <div style={{ fontSize:'12px', color:c.mutedText, lineHeight:1.5 }}>{description}</div>
      </div>
      <button type="button" style={{
        marginTop:'4px', width:'100%', height:'36px',
        background: hov ? c.btnHover : c.btnBg,
        color:c.btnText, border:'none', borderRadius:'8px',
        fontSize:'13px', fontWeight:700, cursor:'pointer',
        transition:'background 0.15s',
      }}>
        Select
      </button>
    </div>
  );
}

// ─── SideLabelRow ─────────────────────────────────────────────────────────────

function SideLabelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'108px 1fr', alignItems:'center', gap:'10px' }}>
      <label style={{ fontSize:'13.5px', fontWeight:500, color:c.bodyText }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}

// ─── InputRow ─────────────────────────────────────────────────────────────────

export function InputRow({
  icon, type = 'text', placeholder, value, onChange, autoFocus,
}: {
  icon?: React.ReactNode; type?: string; placeholder?: string;
  value: string; onChange: (v: string) => void; autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display:'flex', alignItems:'center',
      background: focused ? '#fff' : c.inputBg,
      border:`1.5px solid ${focused ? c.inputBorderFocus : 'transparent'}`,
      borderRadius:'9px', height:'44px', padding:'0 12px',
      transition:'border-color 0.15s, background 0.15s',
    }}>
      {icon && <span style={{ display:'flex', color:c.inputIcon, marginRight:'9px', flexShrink:0 }}>{icon}</span>}
      <input
        type={type} placeholder={placeholder} value={value}
        onChange={e => onChange(e.target.value)} autoFocus={autoFocus}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:'14px', color:c.inputText, minWidth:0 }}
      />
    </div>
  );
}

// ─── PwInput ──────────────────────────────────────────────────────────────────

export function PwInput({ placeholder, value, onChange }: {
  placeholder?: string; value: string; onChange: (v: string) => void;
}) {
  const [show, setShow]     = useState(false);
  const [focused, setFocused] = useState(false);
  const s = !value ? 0 : value.length < 6 ? 1 : value.length < 10 && !/[A-Z]/.test(value) ? 2
    : value.length >= 10 && /[A-Z]/.test(value) && /[0-9]/.test(value) ? 4 : 3;
  const fill  = ['','#EF4444','#F59E0B','#94A3B8','#4B5563'];
  const label = ['','Too short','Weak','Good','Strong'];
  return (
    <div>
      <div style={{
        display:'flex', alignItems:'center',
        background: focused ? '#fff' : c.inputBg,
        border:`1.5px solid ${focused ? c.inputBorderFocus : 'transparent'}`,
        borderRadius:'9px', height:'44px', padding:'0 12px',
        transition:'border-color 0.15s, background 0.15s',
      }}>
        <span style={{ display:'flex', color:c.inputIcon, marginRight:'9px', flexShrink:0 }}>
          <Lock style={{ width:16, height:16 }} />
        </span>
        <input
          type={show ? 'text' : 'password'} placeholder={placeholder ?? 'Password'} value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:'14px', color:c.inputText, minWidth:0 }}
        />
        <button type="button" onClick={() => setShow(!show)}
          style={{ background:'none', border:'none', cursor:'pointer', display:'flex', color:c.inputIcon, padding:0, marginLeft:'8px' }}>
          {show ? <EyeOff style={{ width:15, height:15 }} /> : <Eye style={{ width:15, height:15 }} />}
        </button>
      </div>
      {value.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:'7px', marginTop:'5px' }}>
          <div style={{ display:'flex', flex:1, gap:'3px' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ flex:1, height:'3px', borderRadius:'99px',
                background: i <= s ? fill[s] : '#E5E7EB', transition:'background 0.25s' }} />
            ))}
          </div>
          <span style={{ fontSize:'11px', fontWeight:500, whiteSpace:'nowrap',
            color: s >= 3 ? '#4B5563' : s === 2 ? '#B45309' : '#DC2626' }}>{label[s]}</span>
        </div>
      )}
    </div>
  );
}

// ─── BigBtn ───────────────────────────────────────────────────────────────────

export function BigBtn({
  children, type = 'button', loading, icon, onClick, style: extra,
}: {
  children: React.ReactNode; type?: 'button' | 'submit';
  loading?: boolean; icon?: React.ReactNode;
  onClick?: () => void; style?: React.CSSProperties;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type={type} onClick={onClick} disabled={loading}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width:'100%', height:'46px',
        display:'flex', alignItems:'center', justifyContent:'center', gap:'7px',
        background: loading ? c.btnDisabled : hov ? c.btnHover : c.btnBg,
        color:c.btnText, border:'none', borderRadius:'10px',
        fontSize:'14px', fontWeight:700,
        cursor: loading ? 'not-allowed' : 'pointer',
        transition:'background 0.15s', letterSpacing:'0.01em',
        ...extra,
      }}
    >
      {loading
        ? <svg style={{ width:16,height:16,animation:'pmSpin 0.8s linear infinite' }} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2.5" strokeOpacity="0.25"/>
            <path d="M12 3a9 9 0 0 1 9 9" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        : <>{children}{icon}</>
      }
    </button>
  );
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function Title({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h2 style={{ margin:0, fontSize:'20px', fontWeight:700, color:c.headingText,
      letterSpacing:'-0.01em', lineHeight:1.3, textAlign:'center', ...style }}>
      {children}
    </h2>
  );
}

function Sub({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ margin:'6px 0 0', fontSize:'13.5px', color:c.mutedText,
      lineHeight:1.5, textAlign:'center', ...style }}>
      {children}
    </p>
  );
}

function Err({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding:'8px 12px', background:c.errorBg,
      border:`1px solid ${c.errorBorder}`, borderRadius:'7px',
      fontSize:'13px', color:c.errorText, lineHeight:1.4, ...style }}>
      {children}
    </div>
  );
}

function BackRow({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background:'none', border:'none', cursor:'pointer',
        display:'flex', alignItems:'center', gap:'5px',
        fontSize:'13px', fontWeight:500, color: hov ? '#4B5563' : c.mutedText,
        marginBottom:'14px', padding:0, transition:'color 0.15s',
      }}>
      <ArrowLeft style={{ width:14, height:14 }} />Back
    </button>
  );
}

function LinkBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ background:'none', border:'none', cursor:'pointer',
        fontSize:'13px', fontWeight:600, color:c.linkColor, padding:0 }}>
      {children}
    </button>
  );
}

// ─── Exports (backward compat) ────────────────────────────────────────────────
export { Shell as AuthShell, Shell as MinimalAuthShell, Err as ErrorMsg, BackRow as BackButton, BigBtn as PrimaryButton };