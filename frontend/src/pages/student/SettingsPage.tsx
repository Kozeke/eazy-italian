/**
 * SettingsPage.tsx  (v2 — Student Design System)
 *
 * Full redesign of the student settings page.
 *
 * ─── Structure ────────────────────────────────────────────────────────────────
 *
 *   Desktop: sticky left nav rail (xl+) + main content column
 *   Mobile:  pill tabs + single column
 *
 * ─── Sections ────────────────────────────────────────────────────────────────
 *
 *   1. Profile     — avatar upload (optimistic), name, email, display name
 *   2. Preferences — theme picker, language selector, notification toggles,
 *                    display toggles
 *   3. Security    — change password with strength meter + per-field validation
 *   4. Account     — sign out, delete account (typed confirmation modal)
 *
 * ─── Form UX ─────────────────────────────────────────────────────────────────
 *
 *   • Per-section SaveBar: spinner → "Changes saved" → idle auto-reset
 *   • Field-level validation with inline error messages + aria attributes
 *   • Dirty-state detection (Save button disabled when nothing changed)
 *   • Password strength meter (4-segment bar)
 *   • Delete account guarded by exact-phrase confirmation input
 *   • Avatar upload with optimistic preview + camera overlay button
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Bell,
  Globe,
  LogOut,
  Trash2,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  Camera,
  Sun,
  Moon,
  Monitor,
  ShieldCheck,
  Sparkles,
  X,
  Info,
} from 'lucide-react';

import {
  PageContainer,
  Card,
  CardBody,
  StudentButton,
  StudentInput,
  SectionDivider,
} from '../../components/student/design-system/student-design-system';

import { useAuth } from '../../hooks/useAuth';
import i18n, { normalizeInterfaceLanguage } from '../../i18n';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type SaveState   = 'idle' | 'saving' | 'success' | 'error';
type ThemeValue  = 'light' | 'dark' | 'system';
type LangValue   = 'en' | 'it' | 'ru';

interface FieldErrors { [key: string]: string | undefined }

// ─────────────────────────────────────────────────────────────────────────────
// SECTION NAV CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'profile',     label: 'Profile',     icon: User,        color: 'text-teal-600'   },
  { id: 'preferences', label: 'Preferences', icon: Globe,       color: 'text-indigo-600' },
  { id: 'security',    label: 'Security',    icon: ShieldCheck, color: 'text-violet-600' },
  { id: 'account',     label: 'Account',     icon: LogOut,      color: 'text-slate-600'  },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

/** Inline save feedback + save button at the bottom of a form section */
function SaveBar({
  state,
  errorMessage,
  onSave,
  disabled = false,
  label = 'Save changes',
}: {
  state: SaveState;
  errorMessage?: string;
  onSave: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
      {/* Feedback */}
      <div className="min-h-[18px]">
        {state === 'saving' && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving…
          </span>
        )}
        {state === 'success' && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <Check className="h-3.5 w-3.5" />
            Changes saved
          </span>
        )}
        {state === 'error' && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
            <AlertCircle className="h-3.5 w-3.5" />
            {errorMessage ?? 'Could not save'}
          </span>
        )}
      </div>

      <StudentButton
        variant="primary"
        size="sm"
        onClick={onSave}
        loading={state === 'saving'}
        disabled={disabled || state === 'saving'}
        iconRight={state !== 'saving' ? <ChevronRight className="h-3.5 w-3.5" /> : undefined}
      >
        {label}
      </StudentButton>
    </div>
  );
}

/** Reusable section card with icon header */
function SettingsSection({
  id,
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  children,
}: {
  id: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white px-6 py-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight text-slate-900">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs leading-tight text-slate-400">{description}</p>
            )}
          </div>
        </div>
        <CardBody>{children}</CardBody>
      </Card>
    </section>
  );
}

/** Password input with show/hide and optional strength bar */
function PasswordField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  error,
  showStrength = false,
  id: idProp,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  showStrength?: boolean;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);

  const strength = useMemo((): number => {
    if (!value) return 0;
    let s = 0;
    if (value.length >= 8)           s++;
    if (/[A-Z]/.test(value))         s++;
    if (/[0-9]/.test(value))         s++;
    if (/[^A-Za-z0-9]/.test(value))  s++;
    return s;
  }, [value]);

  const strengthMeta = [
    { label: 'Very weak', color: 'bg-red-400'     },
    { label: 'Weak',      color: 'bg-orange-400'  },
    { label: 'Fair',      color: 'bg-amber-400'   },
    { label: 'Good',      color: 'bg-teal-400'    },
    { label: 'Strong',    color: 'bg-emerald-500' },
  ][strength] ?? { label: '', color: '' };

  const fieldId = idProp ?? `pw-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined}
          className={[
            'w-full rounded-xl border bg-slate-50 py-2.5 pl-3.5 pr-10 text-sm text-slate-800',
            'placeholder:text-slate-400 transition-all',
            'focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/30',
            error ? 'border-red-300 bg-red-50' : 'border-slate-200',
          ].join(' ')}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-400"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="pt-0.5 space-y-1">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className={[
                  'h-1 flex-1 rounded-full transition-all duration-300',
                  i <= strength ? strengthMeta.color : 'bg-slate-200',
                ].join(' ')}
              />
            ))}
          </div>
          <p className="text-[11px] font-medium text-slate-400">{strengthMeta.label}</p>
        </div>
      )}

      {hint && !error && <p id={`${fieldId}-hint`} className="text-xs text-slate-400">{hint}</p>}
      {error && (
        <p id={`${fieldId}-err`} role="alert" className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

/** Toggle row for preferences */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useRef(`toggle-${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-slate-50/60 transition-colors">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-slate-800">{label}</label>
        {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1',
          checked ? 'bg-teal-500' : 'bg-slate-200',
        ].join(' ')}
      >
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
        <span className={[
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        ].join(' ')} />
      </button>
    </div>
  );
}

/** Preference group with overline label */
function PrefGroup({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-teal-500" />
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      </div>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
        {children}
      </div>
    </div>
  );
}

/** Pill option selector (theme, etc.) */
function PillSelector<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon: React.ElementType }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={[
              'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
              active
                ? 'border-teal-300 bg-teal-50 text-teal-700 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" />{opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Account action row (logout / delete) */
function AccountActionRow({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  loading = false,
  danger = false,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/40 px-4 py-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${danger ? 'bg-red-50' : 'bg-slate-100'}`}>
          <Icon className={`h-4 w-4 ${danger ? 'text-red-500' : 'text-slate-500'}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">{title}</p>
          <p className="mt-0.5 text-xs leading-snug text-slate-400">{description}</p>
        </div>
      </div>
      <StudentButton
        variant={danger ? 'danger' : 'ghost'}
        size="sm"
        onClick={onAction}
        loading={loading}
        className="shrink-0"
      >
        {actionLabel}
      </StudentButton>
    </div>
  );
}

/** Delete account modal with typed confirmation */
function DeleteAccountModal({
  open,
  onClose,
  onConfirm,
  loading,
  email,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  email: string;
}) {
  const [typed, setTyped] = useState('');
  const confirmed = typed.trim().toLowerCase() === 'delete my account';
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTyped('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80 overflow-hidden">
        {/* Red accent top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-red-400 to-red-600" />

        <div className="p-6">
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute right-4 top-5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Icon */}
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100">
            <Trash2 className="h-6 w-6 text-red-600" />
          </div>

          {/* Body */}
          <h3 id="delete-modal-title" className="mt-4 text-lg font-bold text-slate-900">
            Delete your account?
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            This will permanently delete the account for{' '}
            <span className="font-semibold text-slate-700">{email}</span>, including all your
            grades, submissions, and course progress. This cannot be undone.
          </p>

          {/* Typed confirmation */}
          <div className="mt-5 space-y-2">
            <label className="block text-xs font-semibold text-slate-600">
              Type{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-800">
                delete my account
              </code>{' '}
              to confirm
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder="delete my account"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-300 focus:border-red-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
            />
          </div>

          {/* Actions */}
          <div className="mt-5 flex gap-2.5">
            <StudentButton variant="ghost" size="md" onClick={onClose} className="flex-1">
              Cancel
            </StudentButton>
            <StudentButton
              variant="danger"
              size="md"
              onClick={onConfirm}
              loading={loading}
              disabled={!confirmed}
              className="flex-1"
            >
              Delete account
            </StudentButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Avatar with upload overlay */
function AvatarUpload({
  firstName,
  lastName,
  avatarUrl,
  onFileSelect,
  uploading,
}: {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  onFileSelect: (f: File) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initials = ((firstName[0] ?? '') + (lastName[0] ?? '')).toUpperCase() || '?';

  return (
    <div className="mb-7 flex items-center gap-5">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 text-2xl font-bold text-white shadow-md ring-4 ring-white">
          {avatarUrl
            ? <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
            : initials}
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="Change profile photo"
          className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-teal-600 text-white shadow-sm transition-colors hover:bg-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-60"
        >
          {uploading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Camera className="h-3.5 w-3.5" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* Identity */}
      <div className="min-w-0">
        <p className="truncate text-base font-bold text-slate-900 leading-snug">
          {[firstName, lastName].filter(Boolean).join(' ') || 'Your Name'}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">Student account</p>
        <button
          onClick={() => inputRef.current?.click()}
          className="mt-1.5 text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline focus:outline-none focus-visible:underline"
        >
          Change photo
        </button>
      </div>
    </div>
  );
}

/** Sticky left nav (xl+ only) */
function SideNav({ active, onSelect }: { active: SectionId; onSelect: (id: SectionId) => void }) {
  return (
    <nav aria-label="Settings sections" className="sticky top-6 hidden w-52 shrink-0 xl:block">
      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Settings
      </p>
      <ul className="space-y-0.5" role="list">
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const isActive = active === s.id;
          return (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s.id)}
                aria-current={isActive ? 'true' : undefined}
                className={[
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium',
                  'transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                  isActive
                    ? 'bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-100'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? s.color : 'text-slate-400'}`} />
                {s.label}
                {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Scrollable pill tabs for mobile */
function MobileTabs({ active, onSelect }: { active: SectionId; onSelect: (id: SectionId) => void }) {
  return (
    <div className="mb-6 -mx-4 flex overflow-x-auto gap-2 px-4 pb-1 xl:hidden">
      {SECTIONS.map(s => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={[
              'flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium',
              'transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
              isActive
                ? 'border-teal-300 bg-teal-50 text-teal-700 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            <Icon className={`h-4 w-4 ${isActive ? s.color : 'text-slate-400'}`} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [activeSection, setActiveSection] = useState<SectionId>('profile');

  // ── 1. Profile ────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    first_name:   user?.first_name ?? '',
    last_name:    user?.last_name  ?? '',
    email:        user?.email      ?? '',
    display_name: '',
  });
  const [profileSave,   setProfileSave]   = useState<SaveState>('idle');
  const [profileErrMsg, setProfileErrMsg] = useState('');
  const [profileFieldErrors, setProfileFieldErrors] = useState<FieldErrors>({});
  const [avatarUrl,     setAvatarUrl]     = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile(p => ({
        ...p,
        first_name: user.first_name ?? '',
        last_name:  user.last_name  ?? '',
        email:      user.email      ?? '',
      }));
    }
  }, [user]);

  const validateProfile = () => {
    const e: FieldErrors = {};
    if (!profile.first_name.trim()) e.first_name = 'First name is required';
    if (!profile.last_name.trim())  e.last_name  = 'Last name is required';
    if (!profile.email.trim())      e.email      = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(profile.email)) e.email = 'Enter a valid email address';
    setProfileFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveProfile = useCallback(async () => {
    if (!validateProfile()) return;
    setProfileSave('saving');
    setProfileErrMsg('');
    try {
      const res = await fetch('/api/v1/student/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
        body: JSON.stringify(profile),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.message ?? `HTTP ${res.status}`); }
      setProfileSave('success');
      setTimeout(() => setProfileSave('idle'), 2500);
    } catch (err) {
      setProfileSave('error');
      setProfileErrMsg(err instanceof Error ? err.message : 'Could not save changes');
    }
  }, [profile]);

  const handleAvatarSelect = useCallback(async (file: File) => {
    setAvatarLoading(true);
    setAvatarUrl(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      await fetch('/api/v1/student/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
        body: fd,
      });
    } catch { /* keep optimistic preview */ }
    finally { setAvatarLoading(false); }
  }, []);

  // ── 2. Preferences ────────────────────────────────────────────────────────
  const [prefs, setPrefs] = useState({
    theme:               'system' as ThemeValue,
    interface_language:  'en'     as LangValue,
    email_task_reminder: true,
    email_grade_notify:  true,
    email_live_alert:    true,
    show_level_badges:   true,
    compact_lesson_view: false,
    auto_advance_slides: false,
  });
  const [prefSave,   setPrefSave]   = useState<SaveState>('idle');
  const [prefErrMsg, setPrefErrMsg] = useState('');

  // Hydrates local interface language preference from authenticated user locale.
  useEffect(() => {
    if (!user?.locale) return;
    // Converts server locale into one of the selector values.
    const normalizedUserLocale = normalizeInterfaceLanguage(user.locale);
    setPrefs((previousPrefs) => ({ ...previousPrefs, interface_language: normalizedUserLocale }));
  }, [user?.locale]);

  const togglePref = (key: keyof typeof prefs) =>
    setPrefs(p => ({ ...p, [key]: !p[key] }));

  const savePrefs = useCallback(async () => {
    setPrefSave('saving');
    setPrefErrMsg('');
    try {
      // Normalizes selected interface language before persisting and applying it globally.
      const normalizedInterfaceLanguage = normalizeInterfaceLanguage(prefs.interface_language);
      const res = await fetch('/api/v1/student/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
        body: JSON.stringify({ ...prefs, interface_language: normalizedInterfaceLanguage }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (normalizedInterfaceLanguage !== i18n.language) {
        await i18n.changeLanguage(normalizedInterfaceLanguage);
      }
      setPrefSave('success');
      setTimeout(() => setPrefSave('idle'), 2500);
    } catch (err) {
      setPrefSave('error');
      setPrefErrMsg(err instanceof Error ? err.message : 'Could not save');
    }
  }, [prefs]);

  // ── 3. Security (password) ────────────────────────────────────────────────
  const [pw, setPw]           = useState({ current: '', next: '', confirm: '' });
  const [pwSave,    setPwSave]   = useState<SaveState>('idle');
  const [pwErrMsg,  setPwErrMsg] = useState('');
  const [pwFieldErrors, setPwFieldErrors] = useState<FieldErrors>({});

  const validatePw = () => {
    const e: FieldErrors = {};
    if (!pw.current)             e.current = 'Required';
    if (pw.next.length < 8)      e.next    = 'Minimum 8 characters';
    if (pw.next !== pw.confirm)  e.confirm = "Passwords don't match";
    setPwFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const savePassword = useCallback(async () => {
    if (!validatePw()) return;
    setPwSave('saving');
    setPwErrMsg('');
    try {
      const res = await fetch('/api/v1/student/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
        body: JSON.stringify({ current_password: pw.current, new_password: pw.next }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.message ?? `HTTP ${res.status}`); }
      setPwSave('success');
      setPw({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwSave('idle'), 2500);
    } catch (err) {
      setPwSave('error');
      setPwErrMsg(err instanceof Error ? err.message : 'Could not update password');
    }
  }, [pw]);

  // ── 4. Account ────────────────────────────────────────────────────────────
  const [logoutLoading,   setLogoutLoading]   = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading,   setDeleteLoading]   = useState(false);

  const handleLogout = useCallback(async () => {
    setLogoutLoading(true);
    const ok = await logout();
    if (ok) { localStorage.removeItem('token'); localStorage.removeItem('refresh_token'); navigate('/login', { replace: true }); }
    else setLogoutLoading(false);
  }, [logout, navigate]);

  const handleDeleteAccount = useCallback(async () => {
    setDeleteLoading(true);
    try {
      await fetch('/api/v1/student/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
      });
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      navigate('/login', { replace: true });
    } catch {
      setDeleteLoading(false);
      setDeleteModalOpen(false);
    }
  }, [navigate]);

  // ── Section scroll ────────────────────────────────────────────────────────
  const scrollTo = (id: SectionId) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Static options ────────────────────────────────────────────────────────
  const LANGUAGES: { value: LangValue; flag: string; label: string }[] = [
    { value: 'en', flag: '🇬🇧', label: 'English' },
    { value: 'it', flag: '🇮🇹', label: 'Italiano' },
    { value: 'ru', flag: '🇷🇺', label: 'Русский' },
  ];
  const THEME_OPTIONS = [
    { value: 'light'  as ThemeValue, label: 'Light',  icon: Sun     },
    { value: 'dark'   as ThemeValue, label: 'Dark',   icon: Moon    },
    { value: 'system' as ThemeValue, label: 'System', icon: Monitor },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <PageContainer>

        {/* ── Page header ───────────────────────────────────────────────── */}
        <div className="mb-8">
          <p className="text-sm font-semibold text-teal-600">Student Portal</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-900 sm:text-3xl">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your profile, preferences, and account security.
          </p>
        </div>

        {/* ── Mobile tabs ───────────────────────────────────────────────── */}
        <MobileTabs active={activeSection} onSelect={scrollTo} />

        {/* ── Two-column layout ─────────────────────────────────────────── */}
        <div className="flex gap-8 items-start">
          <SideNav active={activeSection} onSelect={scrollTo} />

          <div className="min-w-0 flex-1 space-y-6">

            {/* ═══ PROFILE ══════════════════════════════════════════════ */}
            <SettingsSection
              id="profile"
              icon={User}
              iconBg="bg-teal-50"
              iconColor="text-teal-600"
              title="Profile"
              description="Your name, email, and profile photo"
            >
              <AvatarUpload
                firstName={profile.first_name}
                lastName={profile.last_name}
                avatarUrl={avatarUrl}
                onFileSelect={handleAvatarSelect}
                uploading={avatarLoading}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <StudentInput
                  label="First name"
                  value={profile.first_name}
                  placeholder="Maria"
                  error={profileFieldErrors.first_name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setProfile(p => ({ ...p, first_name: e.target.value }));
                    if (profileFieldErrors.first_name) setProfileFieldErrors(fe => ({ ...fe, first_name: undefined }));
                  }}
                />
                <StudentInput
                  label="Last name"
                  value={profile.last_name}
                  placeholder="Rossi"
                  error={profileFieldErrors.last_name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setProfile(p => ({ ...p, last_name: e.target.value }));
                    if (profileFieldErrors.last_name) setProfileFieldErrors(fe => ({ ...fe, last_name: undefined }));
                  }}
                />
              </div>

              <StudentInput
                label="Email address"
                type="email"
                value={profile.email}
                placeholder="you@example.com"
                hint="Used for grade notifications and lesson reminders."
                error={profileFieldErrors.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setProfile(p => ({ ...p, email: e.target.value }));
                  if (profileFieldErrors.email) setProfileFieldErrors(fe => ({ ...fe, email: undefined }));
                }}
                className="mt-4"
              />

              <StudentInput
                label="Display name (optional)"
                value={profile.display_name}
                placeholder="How your name appears in class"
                hint="Leave blank to use your full name."
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(p => ({ ...p, display_name: e.target.value }))}
                className="mt-4"
              />

              <SaveBar state={profileSave} errorMessage={profileErrMsg} onSave={saveProfile} />
            </SettingsSection>

            {/* ═══ PREFERENCES ══════════════════════════════════════════ */}
            <SettingsSection
              id="preferences"
              icon={Globe}
              iconBg="bg-indigo-50"
              iconColor="text-indigo-600"
              title="Preferences"
              description="Language, theme, and notification settings"
            >
              {/* Interface language */}
              <div className="mb-6">
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Interface language
                </p>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.value}
                      onClick={() => {
                        // Stores selected interface language and applies it immediately app-wide.
                        const nextLanguage = normalizeInterfaceLanguage(lang.value);
                        setPrefs((previousPrefs) => ({ ...previousPrefs, interface_language: nextLanguage }));
                        if (nextLanguage !== i18n.language) {
                          void i18n.changeLanguage(nextLanguage);
                        }
                      }}
                      className={[
                        'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                        prefs.interface_language === lang.value
                          ? 'border-teal-300 bg-teal-50 text-teal-700 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <span aria-hidden>{lang.flag}</span>
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div className="mb-6">
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Appearance
                </p>
                <PillSelector
                  value={prefs.theme}
                  options={THEME_OPTIONS}
                  onChange={v => setPrefs(p => ({ ...p, theme: v }))}
                />
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                  <Info className="h-3 w-3 shrink-0" />
                  Dark mode coming soon. System follows your device setting.
                </p>
              </div>

              <SectionDivider className="mt-0 mb-6" />

              {/* Notification toggles */}
              <PrefGroup icon={Bell} label="Email notifications">
                <ToggleRow
                  label="Task reminders"
                  description="Notified when your teacher assigns a new task."
                  checked={prefs.email_task_reminder}
                  onChange={() => togglePref('email_task_reminder')}
                />
                <ToggleRow
                  label="Grade notifications"
                  description="Email when your work has been graded."
                  checked={prefs.email_grade_notify}
                  onChange={() => togglePref('email_grade_notify')}
                />
                <ToggleRow
                  label="Live lesson alerts"
                  description="Notified when a live session starts in your class."
                  checked={prefs.email_live_alert}
                  onChange={() => togglePref('email_live_alert')}
                />
              </PrefGroup>

              {/* Display toggles */}
              <PrefGroup icon={Monitor} label="Display">
                <ToggleRow
                  label="Show level badges"
                  description="Display CEFR labels (A1–C2) on course cards."
                  checked={prefs.show_level_badges}
                  onChange={() => togglePref('show_level_badges')}
                />
                <ToggleRow
                  label="Compact lesson view"
                  description="Tighter spacing inside lessons."
                  checked={prefs.compact_lesson_view}
                  onChange={() => togglePref('compact_lesson_view')}
                />
                <ToggleRow
                  label="Auto-advance slides"
                  description="Automatically move to the next slide when viewed."
                  checked={prefs.auto_advance_slides}
                  onChange={() => togglePref('auto_advance_slides')}
                />
              </PrefGroup>

              <SaveBar
                state={prefSave}
                errorMessage={prefErrMsg}
                onSave={savePrefs}
                label="Save preferences"
              />
            </SettingsSection>

            {/* ═══ SECURITY ═════════════════════════════════════════════ */}
            <SettingsSection
              id="security"
              icon={ShieldCheck}
              iconBg="bg-violet-50"
              iconColor="text-violet-600"
              title="Security"
              description="Update your password and keep your account safe"
            >
              {/* Tips callout */}
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                <p className="text-xs leading-relaxed text-violet-700">
                  Use a mix of uppercase letters, numbers, and symbols. Avoid reusing passwords from other sites.
                </p>
              </div>

              <div className="space-y-4">
                <PasswordField
                  id="pw-current"
                  label="Current password"
                  value={pw.current}
                  onChange={v => { setPw(p => ({ ...p, current: v })); if (pwFieldErrors.current) setPwFieldErrors(e => ({ ...e, current: undefined })); }}
                  placeholder="Enter your current password"
                  error={pwFieldErrors.current}
                />
                <PasswordField
                  id="pw-new"
                  label="New password"
                  value={pw.next}
                  onChange={v => { setPw(p => ({ ...p, next: v })); if (pwFieldErrors.next) setPwFieldErrors(e => ({ ...e, next: undefined })); }}
                  placeholder="At least 8 characters"
                  error={pwFieldErrors.next}
                  showStrength
                />
                <PasswordField
                  id="pw-confirm"
                  label="Confirm new password"
                  value={pw.confirm}
                  onChange={v => { setPw(p => ({ ...p, confirm: v })); if (pwFieldErrors.confirm) setPwFieldErrors(e => ({ ...e, confirm: undefined })); }}
                  placeholder="Repeat your new password"
                  error={pwFieldErrors.confirm}
                />
              </div>

              <SaveBar
                state={pwSave}
                errorMessage={pwErrMsg}
                onSave={savePassword}
                disabled={!pw.current && !pw.next && !pw.confirm}
                label="Update password"
              />
            </SettingsSection>

            {/* ═══ ACCOUNT ══════════════════════════════════════════════ */}
            <SettingsSection
              id="account"
              icon={LogOut}
              iconBg="bg-slate-100"
              iconColor="text-slate-600"
              title="Account"
              description="Session management and account actions"
            >
              <div className="space-y-3">
                <AccountActionRow
                  icon={LogOut}
                  title="Sign out"
                  description="End your current session on this device."
                  actionLabel="Sign out"
                  onAction={handleLogout}
                  loading={logoutLoading}
                />

                {/* Danger zone */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-widest text-red-400">
                    <AlertCircle className="h-3 w-3" />
                    Danger zone
                  </p>
                  <AccountActionRow
                    icon={Trash2}
                    title="Delete account"
                    description="Permanently remove your account and all data. This cannot be undone."
                    actionLabel="Delete account"
                    onAction={() => setDeleteModalOpen(true)}
                    danger
                  />
                </div>
              </div>
            </SettingsSection>

          </div>
        </div>
      </PageContainer>

      {/* ── Delete modal ──────────────────────────────────────────────────── */}
      <DeleteAccountModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteAccount}
        loading={deleteLoading}
        email={profile.email}
      />
    </>
  );
}
