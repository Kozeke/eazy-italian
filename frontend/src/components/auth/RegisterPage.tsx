/**
 * RegisterPage.tsx
 *
 * Steps:
 *   1. email        — enter email
 *   2. account-type — choose Student / Teacher cards
 *   3. activation   — OTP: mail icon + "Check your inbox" + single input + inline arrow btn
 *   4. greeting     — welcome splash
 *   5. details      — first name / last name / password (side-label layout)
 *   6. trial        — green check + trial message → login new user → role-based home
 *
 * Both Teacher and Student go through the same activation flow
 * Student registration POST → /api/v1/auth/register [unchanged payload]
 *
 * Architecture role:
 * This page drives the multi-step student registration journey and now uses the
 * same visual language as the admin catalog while preserving existing flow logic.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, ArrowRight, ArrowLeft, Eye, EyeOff, Lock, User, Pencil, RotateCcw,
} from 'lucide-react';
import { LinguAiLogo } from '../global/LinguAiLogo';
import { API_V1_BASE } from '../../services/api';
import { useTranslation } from 'react-i18next';
import i18n, { normalizeInterfaceLanguage } from '../../i18n';
import { useAuth } from '../../hooks/useAuth';
import type { User as AuthUser } from '../../types';
import { trackSignUp } from '../../utils/analytics';
import GoogleSignInButton, { AuthDivider } from './GoogleSignInButton';
import { isGoogleAuthEnabled } from './GoogleAuthProvider';

// ─── Tokens ───────────────────────────────────────────────────────────────────

const c = {
  pageBg:           '#F7F7FA',
  pageCard:         '#FFFFFF',
  pageCardBorder:   '#E8E8F0',
  violet:           '#6C6FEF',
  violetDark:       '#4F52C2',
  violetLight:      '#EEF0FE',
  inputBg:          '#FFFFFF',
  inputBorder:      '#E8E8F0',
  inputBorderFocus: '#6C6FEF',
  inputText:        '#18181B',
  inputIcon:        '#A1A1AA',
  inputPlaceholder: '#D4D4D8',
  btnBg:            '#6C6FEF',
  btnHover:         '#4F52C2',
  btnText:          '#FFFFFF',
  btnDisabled:      '#C7CAFF',
  headingText:      '#18181B',
  bodyText:         '#52525B',
  mutedText:        '#A1A1AA',
  linkColor:        '#6C6FEF',
  cardBorder:       '#E8E8F0',
  cardBorderActive: '#6C6FEF',
  cardBg:           '#FFFFFF',
  errorText:        '#DC2626',
  errorBorder:      '#FCA5A5',
  errorBg:          '#FEF2F2',
} as const;

// Shared sizing tokens keep inputs/buttons on-brand and mobile-safe.
// radius: 12px corner radius design token for inputs and buttons.
const radius = '12px';
// controlHeight: comfortable 48px touch target for inputs and primary buttons.
const controlHeight = '48px';
// inputFontSize: 16px minimum prevents iOS Safari from zooming in on focus.
const inputFontSize = '16px';

type Step = 'email' | 'account-type' | 'student-info' | 'activation' | 'greeting' | 'details' | 'trial';

// ─── RegisterPage ─────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login, loginWithGoogle } = useAuth();

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
  // Holds the user returned after post-registration login so trial CTA routes to the correct home.
  const [newUser,   setNewUser]   = useState<AuthUser | null>(null);
  // Holds the Google ID token between role selection and teacher account creation.
  const [googleCredential, setGoogleCredential] = useState<string | null>(null);
  // Prevents duplicate send-registration-code calls (e.g. React Strict Mode double-invoke).
  const sendCodeInFlightRef = useRef(false);

  // Defines which registration step should open when the top-left back icon is clicked.
  const previousStepByStep: Partial<Record<Step, Step>> = {
    'account-type': 'email',
    'student-info': 'account-type',
    activation: 'account-type',
    greeting: 'activation',
    details: 'greeting',
  };

  // Stores whether the current step should render the top-left back icon.
  const shouldShowTopBackButton =
    step !== 'email' &&
    step !== 'trial' &&
    step !== 'account-type';

  // Navigates backward in the wizard using explicit step mapping, with browser fallback.
  const handleTopBackClick = () => {
    // Stores the mapped previous step for the current wizard step if one exists.
    const previousStep = previousStepByStep[step];
    if (previousStep) {
      setStep(previousStep);
      setError('');
      setOtpError('');
      return;
    }
    navigate(-1);
  };

  // countdown
  useEffect(() => {
    if (!timerOn) return;
    if (resendSecs <= 0) { setTimerOn(false); return; }
    const t = setTimeout(() => setResendSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerOn, resendSecs]);

  const startTimer = () => { setResendSecs(60); setTimerOn(true); };

  const sendRegistrationCode = async (
    reportError: (msg: string) => void = setError,
  ): Promise<boolean> => {
    if (sendCodeInFlightRef.current) return false;
    sendCodeInFlightRef.current = true;
    try {
      const res = await fetch(`${API_V1_BASE}/auth/send-registration-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : t('auth.couldNotSendRegistrationCode'),
        );
      }
      reportError('');
      startTimer();
      return true;
    } catch (err) {
      reportError(
        err instanceof Error ? err.message : t('auth.couldNotSendRegistrationCode'),
      );
      return false;
    } finally {
      sendCodeInFlightRef.current = false;
    }
  };

  // ── step handlers ──────────────────────────────────────────────────────────

  // Step 1 — validate format then check if email is already registered
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError(t('auth.validEmailRequired')); return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_V1_BASE}/auth/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(t('auth.couldNotCheckEmail'));
      const data = await res.json();
      if (data.exists) {
        setError(t('auth.emailAlreadyRegistered'));
        return;
      }
      setStep('account-type');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.couldNotCheckEmail'));
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — for teacher: send OTP and proceed to activation; for student: show teacher-required info screen
  const handleRoleSelect = async (selected: 'teacher' | 'student') => {
    setRole(selected);
    setError('');
    if (selected === 'student') {
      setStep('student-info');
      return;
    }
    if (googleCredential) {
      setLoading(true);
      try {
        const result = await loginWithGoogle(googleCredential, { role: 'teacher' });
        if (result.needsRole) {
          throw new Error(t('auth.registrationFailedError'));
        }
        setNewUser(result.user);
        trackSignUp('teacher');
        setStep('trial');
      } catch (err) {
        setError(err instanceof Error ? err.message : t('auth.registrationFailedError'));
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    const sent = await sendRegistrationCode();
    setLoading(false);
    if (sent) setStep('activation');
  };

  // Completes Google sign-in on the email step (login or role selection).
  const handleGoogleSuccess = async (credential: string) => {
    setError('');
    setLoading(true);
    try {
      const result = await loginWithGoogle(credential);
      if (result.needsRole) {
        setGoogleCredential(credential);
        setEmail(result.email);
        setFullName(`${result.firstName} ${result.lastName}`.trim());
        setStep('account-type');
        return;
      }
      setNewUser(result.user);
      if (result.isNewUser) {
        trackSignUp(result.user.role);
      }
      if (result.isNewUser) {
        setStep('trial');
        return;
      }
      if (result.user.role === 'teacher') {
        navigate(
          !result.user.onboarding_completed ? '/admin/courses' : '/admin/dashboard',
          { replace: true },
        );
        return;
      }
      navigate('/student/classes', { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || t('auth.googleSignInFailed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Step 3 — verify the pre-registration OTP (user doesn't exist yet)
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) { setOtpError(t('auth.pleaseEnterCode')); return; }
    setOtpError('');
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_V1_BASE}/auth/verify-registration-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || t('auth.invalidCodeError'));
      }
      setStep('greeting');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : t('auth.invalidCodeError'));
    } finally {
      setOtpLoading(false);
    }
  };

  // Step 5 — create the account with the selected role
  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !password.trim()) {
      setError(t('auth.fillAllFieldsError')); return;
    }
    if (password.length < 8) {
      setError(t('auth.passwordMin8Error')); return;
    }
    setError('');
    setLoading(true);
    const parts = fullName.trim().split(/\s+/);
    const first_name = parts[0];
    const last_name = parts.slice(1).join(' ') || parts[0];
    try {
      const res = await fetch(`${API_V1_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, password,
          first_name, last_name,
          role,
          // Persist UI language so post-login sync does not revert to backend default (ru).
          locale: normalizeInterfaceLanguage(i18n.language),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.message || `HTTP ${res.status}`);
      }
      // Replace any existing session so the dashboard shows this account, not a prior login.
      const user = await login(email, password);
      setNewUser(user);
      trackSignUp(role);
      setStep('trial');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.registrationFailedError'));
    } finally {
      setLoading(false);
    }
  };

  // Sends the newly registered user to the same home route used after password login.
  const handleTrialContinue = () => {
    if (newUser?.role === 'teacher') {
      navigate(
        !newUser.onboarding_completed ? '/admin/courses' : '/admin/dashboard',
        { replace: true },
      );
      return;
    }
    navigate('/student/classes', { replace: true });
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <Shell hideLogo={step === 'trial'}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes regIn  { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pmSpin { to{transform:rotate(360deg)} }
        @keyframes checkPop {
          0%  { opacity:0; transform:scale(.4) }
          70% { transform:scale(1.12) }
          100%{ opacity:1; transform:scale(1) }
        }
        input::placeholder { color:${c.inputPlaceholder}; }
        /* Prevent iOS Safari from auto-zooming/reflowing when a form control gains focus. */
        html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
        /* Guard against any single element forcing a horizontal scrollbar on small screens. */
        html, body { overflow-x: hidden; }
        /* Fallback floor: even if an inline style is missed, keep inputs at the no-zoom threshold on phones. */
        @media (max-width: 480px) { input, select, textarea { font-size: 16px; } }
      `}</style>

      <div key={step} style={{ animation: 'regIn 0.2s ease-out', position:'relative' }}>
        {shouldShowTopBackButton && <TopLeftBackIcon onClick={handleTopBackClick} />}

        {/* ── 1. Email ──────────────────────────────────────────────────────── */}
        {step === 'email' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            <Title>{t('auth.createYourAccount')}</Title>
            <Sub>{t('auth.startWithEmail')}</Sub>
            {isGoogleAuthEnabled() && (
              <>
                <div style={{ marginTop: '10px' }}>
                  <GoogleSignInButton
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError(t('auth.googleSignInFailed'))}
                    disabled={loading}
                  />
                </div>
                <AuthDivider />
              </>
            )}
            <form
              onSubmit={handleEmailSubmit}
              style={{ display:'flex', flexDirection:'column', gap:'12px', marginTop:'12px' }}
            >
              <InputRow
                icon={<Mail style={{ width:16, height:16 }} />}
                type="email"
                placeholder={t('auth.email')}
                value={email}
                onChange={setEmail}
                autoFocus
              />
              {error && <Err>{error}</Err>}
              <BigBtn type="submit" loading={loading} icon={<ArrowRight style={{ width:15, height:15 }} />}>
                {t('auth.continueBtn')}
              </BigBtn>
            </form>
            <p style={{ textAlign:'center', fontSize:'12px', color:c.mutedText, marginTop:'8px' }}>
              {t('auth.alreadyHaveAccountHint')}{' '}
              <LinkBtn onClick={() => navigate('/login')}>{t('auth.signInLink')}</LinkBtn>
            </p>
          </div>
        )}

        {/* ── 2. Account type ───────────────────────────────────────────────── */}
        {step === 'account-type' && (
          <div>
            <BackRow onClick={() => { setStep('email'); setError(''); }} />
            <Title>{t('auth.chooseAccountType')}</Title>
            <Sub style={{ marginBottom:'14px' }}>
              {t('auth.switchTypeInfo')}
            </Sub>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <RoleCard
                emoji="👩‍🏫"
                label={t('auth.forTeaching')}
                description={t('auth.teacherCardDesc')}
                onSelect={() => handleRoleSelect('teacher')}
              />
              <RoleCard
                emoji="🙋"
                label={t('auth.forLearning')}
                description={t('auth.studentCardDesc')}
                onSelect={() => handleRoleSelect('student')}
              />
            </div>
          </div>
        )}

        {/* ── 2b. Student info — no self-registration, must be added by teacher ── */}
        {step === 'student-info' && (
          <div>
            <BackRow onClick={() => { setStep('account-type'); setError(''); }} />
            <Title>{t('auth.studentActivationTitle')}</Title>
            <p style={{ fontSize:'13px', color:c.bodyText, lineHeight:1.65, marginTop:'8px' }}>
              {t('auth.studentActivationText')}
            </p>
            <p style={{
              marginTop:'14px', padding:'10px 12px',
              background:'#F0F9FF', border:'1px solid #BAE6FD',
              borderRadius:'8px', fontSize:'13px', color:'#0369A1',
              wordBreak:'break-all',
            }}>
              {email}
            </p>
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
            onResend={() => void sendRegistrationCode(setOtpError)}
            onEditEmail={() => setStep('email')}
          />
        )}

        {/* ── 4. Greeting ───────────────────────────────────────────────────── */}
        {step === 'greeting' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>
            <Title style={{ fontSize:'19px', marginBottom:'8px' }}>{t('auth.welcomeTitle')}</Title>
            <p style={{
              fontSize:'12px', color:c.bodyText, lineHeight:1.6,
              maxWidth:'260px', margin:'0 auto 16px',
            }}>
              {t('auth.welcomeBody')}
            </p>
            <BigBtn onClick={() => setStep('details')} icon={<ArrowRight style={{ width:15, height:15 }} />}>
              {t('auth.nextBtn')}
            </BigBtn>
          </div>
        )}

        {/* ── 5. Details ────────────────────────────────────────────────────── */}
        {step === 'details' && (
          <div>
            <Title style={{ marginBottom:'14px' }}>{t('auth.completeRegistration')}</Title>
            <form
              onSubmit={handleDetailsSubmit}
              style={{ display:'flex', flexDirection:'column', gap:'14px' }}
            >
              <SideLabelRow label={t('auth.fullNameLabel')}>
                <InputRow
                  icon={<User style={{ width:16, height:16 }} />}
                  placeholder={t('auth.fullNamePlaceholder')}
                  value={fullName}
                  onChange={setFullName}
                  autoFocus
                />
              </SideLabelRow>
              <SideLabelRow label={t('auth.passwordFieldLabel')}>
                <PwInput
                  placeholder={t('auth.passwordMinCharsHint')}
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
                {t('auth.continueBtn')}
              </BigBtn>
            </form>
          </div>
        )}

        {/* ── 6. Trial ──────────────────────────────────────────────────────── */}
        {step === 'trial' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>
            <div style={{
              width:80, height:80, borderRadius:'50%',
              background:'linear-gradient(135deg,#4ADE80,#22C55E)',
              display:'flex', alignItems:'center', justifyContent:'center',
              marginBottom:'14px',
              animation:'checkPop 0.55s cubic-bezier(.22,.68,0,1.25) both',
              boxShadow:'0 6px 20px rgba(74,222,128,0.22)',
            }}>
              <svg width="34" height="34" viewBox="0 0 44 44" fill="none">
                <path d="M10 23L18 31L34 14" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <Title style={{ fontSize:'18px', marginBottom:'8px' }}>{t('auth.trialPeriodTitle')}</Title>
            <p style={{
              fontSize:'12px', color:c.bodyText, lineHeight:1.6,
              maxWidth:'260px', margin:'0 auto 16px',
            }}>
              {t('auth.trialPeriodBody')}
            </p>
            <BigBtn
              onClick={handleTrialContinue}
              icon={<ArrowRight style={{ width:15, height:15 }} />}
            >
              {t('auth.letsGoBtn')}
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
  onResend: () => void | Promise<void>;
  onEditEmail: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:0 }}>

      {/* Heading */}
      <Title style={{ marginBottom:'6px' }}>{t('auth.accountActivationTitle')}</Title>
      <p style={{ fontSize:'12px', color:c.bodyText, lineHeight:1.55, marginBottom:'10px', maxWidth:'240px' }}>
        {t('auth.enterCodeEmailHint')}
      </p>

      {/* Email + edit */}
      <div style={{
        display:'flex', alignItems:'center', gap:'6px', marginBottom:'14px',
        fontSize:'13px', fontWeight:700, color:c.headingText,
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
      <p style={{ fontSize:'14px', fontWeight:700, color:c.headingText, marginBottom:'2px' }}>
        {t('auth.checkYourInbox')}
      </p>
      <p style={{ fontSize:'12px', color:c.mutedText, marginBottom:'12px' }}>
        {t('auth.weSentCodeTo')} <strong style={{ color:c.headingText }}>{email}</strong>
      </p>

      {/* Input row — single text input + inline arrow button */}
      <form onSubmit={onSubmit} style={{ width:'100%', maxWidth:'300px' }}>
        <div style={{
          display:'flex', gap:'6px', alignItems:'center', marginBottom:'9px',
        }}>
          <div style={{
            flex:1,
            display:'flex', alignItems:'center',
            background: c.inputBg,
            border:`1.5px solid ${focused ? c.inputBorderFocus : c.inputBorder}`,
            borderRadius:radius, height:controlHeight, padding:'0 12px',
            transition:'border-color 0.15s, box-shadow 0.15s',
            boxShadow: focused ? `0 0 0 3px ${c.violetLight}` : 'none',
          }}>
            {/* key icon */}
            <svg style={{ width:14, height:14, color:c.inputIcon, marginRight:'8px', flexShrink:0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l2 2"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              placeholder={t('auth.enterCodePlaceholder')}
              value={otp}
              onChange={e => onOtpChange(e.target.value.replace(/\D/g,'').slice(0,6))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                flex:1, background:'transparent', border:'none', outline:'none',
                fontSize:inputFontSize, color:c.inputText, letterSpacing:'0.08em', minWidth:0,
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
              border:'none', borderRadius:radius, cursor: loading ? 'not-allowed' : 'pointer',
              transition:'background 0.15s',
            }}
          >
            {loading
              ? <svg style={{ width:16,height:16,animation:'pmSpin 0.8s linear infinite' }} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2.5" strokeOpacity="0.25"/>
                  <path d="M12 3a9 9 0 0 1 9 9" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              : <ArrowRight style={{ width:15, height:15, color:'white' }} />
            }
          </button>
        </div>

        {error && <Err style={{ marginTop:'10px' }}>{error}</Err>}
      </form>

      {/* Resend row */}
      <div style={{ marginTop:'10px', display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
        {timerOn ? (
          <p style={{ fontSize:'12px', color:c.mutedText, display:'flex', alignItems:'center', gap:'4px' }}>
            <RotateCcw style={{ width:12, height:12 }} />
            {t('auth.resendCodeIn', { secs: resendSecs })}
          </p>
        ) : (
          <button
            type="button"
            onClick={onResend}
            style={{
              background:'none', border:'none', cursor:'pointer',
              fontSize:'12px', fontWeight:500, color:c.linkColor, padding:0,
            }}
          >
            {t('auth.resendCodeBtn')}
          </button>
        )}
        {timerOn && (
          <p style={{ fontSize:'11px', color:c.mutedText }}>
            {t('auth.resendAvailableIn', { secs: resendSecs })}
          </p>
        )}
      </div>

      {/* Support link */}
      <p style={{ fontSize:'11px', color:c.mutedText, marginTop:'12px' }}>
        {t('auth.havingTrouble')}{' '}
        <a
          href="mailto:kozykorpesh.tolep@gmail.com"
          style={{ color:c.linkColor, textDecoration:'underline' }}
        >
          {t('auth.contactSupport')}
        </a>
      </p>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function Shell({ children, hideLogo }: { children: React.ReactNode; hideLogo?: boolean }) {
  return (
    <div style={{
      minHeight:'100dvh', background:c.pageBg,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'20px 14px 40px',
      fontFamily:"'Inter', system-ui, sans-serif",
    }}>
      {/* Logo centered above the card — hidden on the trial/success step */}
      {!hideLogo && (
        <div style={{
          width:'100%',
          maxWidth:'360px',
          display:'flex',
          justifyContent:'center',
          marginBottom:'14px',
        }}>
          <a href="/" style={{ display:'flex' }} aria-label="LinguAI home">
            <LinguAiLogo height={46} showWordmark style={{ display: 'block' }} />
          </a>
        </div>
      )}
      <div style={{
        width:'100%',
        maxWidth:'360px',
        background:c.pageCard,
        border:`1px solid ${c.pageCardBorder}`,
        borderRadius:'16px',
        boxShadow:'0 1px 4px rgba(108,111,239,.04)',
        padding:'26px 20px 22px',
        boxSizing:'border-box',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── RoleCard ─────────────────────────────────────────────────────────────────

function RoleCard({ emoji, label, description, onSelect }: {
  emoji: string; label: string; description: string; onSelect: () => void;
}) {
  const { t } = useTranslation();
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onSelect}
      style={{
        background: hov ? c.violetLight : c.cardBg,
        border:`1.5px solid ${hov ? c.cardBorderActive : c.cardBorder}`,
        borderRadius:'14px', padding:'14px 10px 12px',
        display:'flex', flexDirection:'column', alignItems:'center', gap:'10px',
        boxShadow: hov ? '0 4px 14px rgba(108,111,239,.12)' : '0 1px 4px rgba(108,111,239,.04)',
        transition:'all 0.18s ease', cursor:'pointer',
      }}
    >
      <div style={{
        width:44, height:44, borderRadius:'50%', background:c.violetLight,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:'22px', lineHeight:1,
      }}>
        {emoji}
      </div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'12.5px', fontWeight:700, color:c.headingText, marginBottom:'2px' }}>{label}</div>
        <div style={{ fontSize:'11px', color:c.mutedText, lineHeight:1.4 }}>{description}</div>
      </div>
      <button type="button" style={{
        marginTop:'2px', width:'100%', height:'40px',
        background: hov ? c.btnHover : c.btnBg,
        color:c.btnText, border:'none', borderRadius:radius,
        fontSize:'13px', fontWeight:700, cursor:'pointer',
        transition:'background 0.15s',
      }}>
        {t('auth.selectCard')}
      </button>
    </div>
  );
}

// ─── SideLabelRow ─────────────────────────────────────────────────────────────

function SideLabelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'96px 1fr', alignItems:'center', gap:'8px' }}>
      <label style={{ fontSize:'12px', fontWeight:500, color:c.bodyText }}>{label}</label>
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
      background: c.inputBg,
      border:`1.5px solid ${focused ? c.inputBorderFocus : c.inputBorder}`,
      borderRadius:radius, height:controlHeight, padding:'0 12px',
      transition:'border-color 0.15s, box-shadow 0.15s',
      boxShadow: focused ? `0 0 0 3px ${c.violetLight}` : 'none',
    }}>
      {icon && <span style={{ display:'flex', color:c.inputIcon, marginRight:'8px', flexShrink:0 }}>{icon}</span>}
      <input
        type={type} placeholder={placeholder} value={value}
        onChange={e => onChange(e.target.value)} autoFocus={autoFocus}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:inputFontSize, color:c.inputText, minWidth:0 }}
      />
    </div>
  );
}

// ─── PwInput ──────────────────────────────────────────────────────────────────

export function PwInput({ placeholder, value, onChange }: {
  placeholder?: string; value: string; onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [show, setShow]     = useState(false);
  const [focused, setFocused] = useState(false);
  const s = !value ? 0 : value.length < 6 ? 1 : value.length < 10 && !/[A-Z]/.test(value) ? 2
    : value.length >= 10 && /[A-Z]/.test(value) && /[0-9]/.test(value) ? 4 : 3;
  const fill  = ['','#EF4444','#F59E0B','#94A3B8','#4B5563'];
  const label = ['', t('auth.pwTooShort'), t('auth.pwWeak'), t('auth.pwGood'), t('auth.pwStrong')];
  return (
    <div>
      <div style={{
        display:'flex', alignItems:'center',
        background: c.inputBg,
        border:`1.5px solid ${focused ? c.inputBorderFocus : c.inputBorder}`,
        borderRadius:radius, height:controlHeight, padding:'0 12px',
        transition:'border-color 0.15s, box-shadow 0.15s',
        boxShadow: focused ? `0 0 0 3px ${c.violetLight}` : 'none',
      }}>
        <span style={{ display:'flex', color:c.inputIcon, marginRight:'9px', flexShrink:0 }}>
          <Lock style={{ width:16, height:16 }} />
        </span>
        <input
          type={show ? 'text' : 'password'} placeholder={placeholder ?? 'Password'} value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:inputFontSize, color:c.inputText, minWidth:0 }}
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
        width:'100%', height:controlHeight,
        display:'flex', alignItems:'center', justifyContent:'center', gap:'7px',
        background: loading ? c.btnDisabled : hov ? c.btnHover : c.btnBg,
        color:c.btnText, border:'none', borderRadius:radius,
        fontSize:'15px', fontWeight:700,
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
    <h2 style={{ margin:0, fontFamily:"'Nunito', system-ui, sans-serif", fontSize:'19px', fontWeight:900, color:c.headingText,
      letterSpacing:'-0.01em', lineHeight:1.3, textAlign:'center', ...style }}>
      {children}
    </h2>
  );
}

function Sub({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ margin:'4px 0 0', fontSize:'12px', color:c.mutedText,
      lineHeight:1.5, textAlign:'center', ...style }}>
      {children}
    </p>
  );
}

function Err({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding:'7px 10px', background:c.errorBg,
      border:`1px solid ${c.errorBorder}`, borderRadius:'7px',
      fontSize:'12px', color:c.errorText, lineHeight:1.4, ...style }}>
      {children}
    </div>
  );
}

function BackRow({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  const [hov, setHov] = useState(false);
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background:'none', border:'none', cursor:'pointer',
        display:'flex', alignItems:'center', gap:'5px',
        fontSize:'12px', fontWeight:500, color: hov ? '#4B5563' : c.mutedText,
        marginBottom:'10px', padding:0, transition:'color 0.15s',
      }}>
      <ArrowLeft style={{ width:14, height:14 }} />{t('auth.backBtn')}
    </button>
  );
}

function TopLeftBackIcon({ onClick }: { onClick: () => void }) {
  // Stores hover state for subtle icon background feedback.
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Go back"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position:'absolute',
        top:'-2px',
        left:'-2px',
        width:'30px',
        height:'30px',
        borderRadius:'999px',
        border:'none',
        background: hov ? c.violetLight : 'transparent',
        color: hov ? c.violetDark : c.mutedText,
        display:'flex',
        alignItems:'center',
        justifyContent:'center',
        cursor:'pointer',
        transition:'background 0.15s, color 0.15s',
      }}
    >
      <ArrowLeft style={{ width:16, height:16 }} />
    </button>
  );
}

function LinkBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ background:'none', border:'none', cursor:'pointer',
        fontSize:'12px', fontWeight:600, color:c.linkColor, padding:0 }}>
      {children}
    </button>
  );
}

// Renders a simple step header used by legacy auth screens.
export function StepHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6 text-center">
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 mb-1">
          {eyebrow}
        </p>
      )}
      <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-xs text-slate-500">
          {subtitle}
        </p>
      )}
    </div>
  );
}

// Renders a labeled input with RegisterPage visual language for legacy auth.
export function AuthInput({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none ring-0 transition-colors placeholder:text-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  );
}

// ─── Exports (backward compat) ────────────────────────────────────────────────
export { Shell as AuthShell, Shell as MinimalAuthShell, Err as ErrorMsg, BackRow as BackButton, BigBtn as PrimaryButton };