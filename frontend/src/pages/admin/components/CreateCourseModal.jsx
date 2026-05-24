/**
 * CreateCourseModal.jsx  (v4 — language-aware generation)
 *
 * Two modes in one compact modal:
 *   • Quick    — single title input → create course immediately
 *   • Generate — describe your course → AI builds title + units (JSON POST /generate-outline).
 *                Optional file enrichment: CourseFileUploadModal.jsx (multipart /generate-outline-from-files).
 *
 * v4 adds smart language detection:
 *   - Auto-detects the target language from the description ("Italian A1" → Italian)
 *   - Reads the teacher's native language from their profile (locale / notification_prefs)
 *   - Shows a compact editable "Teaching X · Explaining in Y" pill below the textarea
 *   - Passes target_language + native_language to both outline endpoints so the AI
 *     generates Italian content explained in English (not everything in English)
 *
 * Props:
 *   open       — controls visibility
 *   onClose    — called when user cancels / presses Escape / clicks backdrop
 *   onCreated  — called with the created course object after success
 */

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTeacherClassroomTransition } from '../../../contexts/TeacherClassroomTransitionContext';
import { useAuth } from '../../../hooks/useAuth';
// Optional second step: teacher attaches PDFs/docs before outline generation.
import CourseFileUploadModal from './CourseFileUploadModal';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  primary:    '#6C6FEF',
  primaryDk:  '#4F52C2',
  tint:       '#EEF0FE',
  tintDeep:   '#DDE1FC',
  bg:         '#F7F7FA',
  white:      '#FFFFFF',
  border:     '#E8EAFD',
  text:       '#1C1F3A',
  sub:        '#6B6F8E',
  muted:      '#A8ABCA',
  error:      '#EF4444',
  errorBg:    '#FEF2F2',
  success:    '#10B981',
  successBg:  '#ECFDF5',
};

const FONT_DISPLAY = "'Nunito', system-ui, sans-serif";
const FONT_BODY    = "'Inter', system-ui, sans-serif";

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// ─── Language detection helpers ───────────────────────────────────────────────

/**
 * Maps language names to keyword variants for detection from free-text input.
 * Ordered by specificity — more specific keywords first.
 */
const LANGUAGE_DETECT_MAP = {
  Italian:    ['italian', 'italiano'],
  Spanish:    ['spanish', 'español', 'espanol', 'castellano'],
  French:     ['french', 'français', 'francais'],
  German:     ['german', 'deutsch'],
  Russian:    ['russian', 'русский'],
  Portuguese: ['portuguese', 'português', 'portugues', 'brazilian'],
  Chinese:    ['chinese', 'mandarin', '中文', 'cantonese'],
  Japanese:   ['japanese', '日本語'],
  Korean:     ['korean', '한국어'],
  Arabic:     ['arabic', 'العربية'],
  Dutch:      ['dutch', 'nederlands'],
  Polish:     ['polish', 'polski'],
  Ukrainian:  ['ukrainian', 'українська'],
  Turkish:    ['turkish', 'türkçe', 'turkce'],
  Swedish:    ['swedish', 'svenska'],
  Norwegian:  ['norwegian', 'norsk'],
  Greek:      ['greek', 'ελληνικά'],
  Hebrew:     ['hebrew', 'עברית'],
  Hindi:      ['hindi', 'हिंदी'],
  English:    ['english'],
};

/** Maps locale codes (from user.locale) to full language names. */
const LOCALE_TO_LANGUAGE = {
  en: 'English',  ru: 'Russian',  it: 'Italian',  de: 'German',
  fr: 'French',   es: 'Spanish',  pt: 'Portuguese', zh: 'Chinese',
  ja: 'Japanese', ko: 'Korean',   ar: 'Arabic',   nl: 'Dutch',
  pl: 'Polish',   uk: 'Ukrainian', tr: 'Turkish',  sv: 'Swedish',
  no: 'Norwegian', el: 'Greek',   he: 'Hebrew',   hi: 'Hindi',
};

/** Language options for the override dropdowns. */
const ALL_LANGUAGES = Object.keys(LANGUAGE_DETECT_MAP).sort();

/** Country-flag emoji for each language (best-effort). */
const FLAG_MAP = {
  Italian: '🇮🇹', Spanish: '🇪🇸', French: '🇫🇷', German: '🇩🇪',
  English: '🇬🇧', Russian: '🇷🇺', Portuguese: '🇵🇹', Chinese: '🇨🇳',
  Japanese: '🇯🇵', Korean: '🇰🇷', Arabic: '🇸🇦', Dutch: '🇳🇱',
  Polish: '🇵🇱', Ukrainian: '🇺🇦', Turkish: '🇹🇷', Swedish: '🇸🇪',
  Norwegian: '🇳🇴', Greek: '🇬🇷', Hebrew: '🇮🇱', Hindi: '🇮🇳',
};

/**
 * Scan free-text for a recognisable language name.
 * Returns the canonical language name ("Italian") or null.
 */
function detectTargetLanguage(text) {
  const lower = text.toLowerCase();
  for (const [lang, keywords] of Object.entries(LANGUAGE_DETECT_MAP)) {
    if (keywords.some(kw => lower.includes(kw))) return lang;
  }
  return null;
}

/**
 * Derive a display-name language from a user object.
 * Priority: notification_prefs.native_language → locale → "English"
 */
function nativeLanguageFromUser(user) {
  if (!user) return 'English';
  // 1. Explicit native_language field (stored in notification_prefs for students;
  //    some teacher accounts also set this via profile settings).
  const explicit = user?.notification_prefs?.native_language;
  if (explicit && typeof explicit === 'string' && explicit.trim()) {
    const trimmed = explicit.trim();
    // Normalise to title-case if it matches a known language
    const normalised = ALL_LANGUAGES.find(l => l.toLowerCase() === trimmed.toLowerCase());
    return normalised ?? trimmed;
  }
  // 2. locale code → full language name
  const locale = (user?.locale ?? 'en').split('-')[0].toLowerCase();
  return LOCALE_TO_LANGUAGE[locale] ?? 'English';
}

// ─── Shared tariff cache ──────────────────────────────────────────────────────
// Stored on `window` so every component in the same JS bundle shares it.
// GenerateUnitModal, AdminHeader etc. all write here — CreateCourseModal reads
// instantly without firing a duplicate network request.

const TARIFF_CACHE_TTL = 90_000; // ms

function getTariffCache() {
  try {
    const c = window.__lingu_tariff_cache;
    if (c && Date.now() - c.ts < TARIFF_CACHE_TTL) return c.data;
  } catch {}
  return null;
}

function setTariffCache(data) {
  try { window.__lingu_tariff_cache = { data, ts: Date.now() }; } catch {}
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Resolves API base URL for admin create flows (same default as services/api.ts).
const ADMIN_API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/+$/, '');

// Builds an absolute API URL from the configured base and a relative endpoint path.
function buildAdminApiUrl(endpointPath) {
  return `${ADMIN_API_BASE}/${endpointPath.replace(/^\/+/, '')}`;
}

// Parses JSON safely and reports empty/non-JSON payloads with actionable context.
async function parseJsonResponse(res, fallbackMessage) {
  const rawBody = await res.text();
  if (!rawBody || !rawBody.trim()) {
    throw new Error(fallbackMessage);
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error(fallbackMessage);
  }
}

// Creates a published course row. Optional ``languages`` lets callers persist
// the AI-flow language context (target_language / native_language) on the
// course so unit generation, content rendering, and admin filters can read
// them later without re-asking the teacher.
async function apiCreateCourse(title, languages = {}) {
  // Builds the request body, only including language fields when non-empty so
  // we never overwrite existing values with empty strings.
  const body = { title, status: 'published', is_visible_to_students: true };
  const targetLanguage = (languages.targetLanguage || '').trim();
  const nativeLanguage = (languages.nativeLanguage || '').trim();
  // The teacher's generation directive (e.g. "use Harry Potter examples") is
  // saved here so the backend can inject it into unit text generation later.
  const description = (languages.description || '').trim();
  if (targetLanguage) body.target_language = targetLanguage;
  if (nativeLanguage) body.native_language = nativeLanguage;
  if (description) body.description = description;

  const res = await fetch(buildAdminApiUrl('/admin/courses'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return parseJsonResponse(
    res,
    'Course was created but API returned an empty or invalid JSON response. Check VITE_API_BASE_URL and backend proxy settings.',
  );
}

async function apiCreateUnit(courseId, title, orderIndex = 0, description = '') {
  const res = await fetch(buildAdminApiUrl('/units/admin/units'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      title,
      description,
      level: 'A1',
      status: 'draft',
      order_index: orderIndex,
      course_id: courseId,
      is_visible_to_students: false,
    }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return parseJsonResponse(res, 'Unit was created but API returned an empty or invalid JSON response.');
}

async function apiUploadThumbnail(courseId, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(buildAdminApiUrl(`/admin/courses/${courseId}/thumbnail`), {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
}

// ─── Tiny sub-components ──────────────────────────────────────────────────────

const ThumbnailPlaceholder = () => (
  <svg
    width="100%" height="100%" viewBox="0 0 120 80"
    fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
  >
    <rect width="120" height="80" rx="10" fill={C.tint} />
    <rect x="20" y="18" width="80" height="8" rx="4" fill="#CFC9EE" />
    <rect x="28" y="32" width="64" height="5" rx="2.5" fill={C.border} />
    <rect x="32" y="42" width="56" height="5" rx="2.5" fill={C.border} />
    <rect x="36" y="52" width="48" height="5" rx="2.5" fill={C.border} />
  </svg>
);

const ThumbnailZone = ({ preview, onPick, onClear, disabled }) => {
  // Resolves admin create-course strings for the shared thumbnail drop zone.
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) onPick(file);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        role="button" tabIndex={0} aria-label={t('admin.createCourseModal.thumbnailZoneAria')}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          width: '100%', aspectRatio: '16/9',
          borderRadius: 12, overflow: 'hidden',
          border: `2px dashed ${dragOver ? C.primary : preview ? 'transparent' : C.border}`,
          background: preview ? 'transparent' : C.bg,
          cursor: disabled ? 'default' : 'pointer',
          position: 'relative',
          transition: 'border-color .15s, box-shadow .15s',
          boxShadow: dragOver ? `0 0 0 3px ${C.tint}` : 'none',
        }}
      >
        {preview ? (
          <img src={preview} alt={t('admin.createCourseModal.thumbnailAlt')}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <ThumbnailPlaceholder />
        )}
        {!disabled && (
          <div className="ccm2-thumb-overlay" style={{
            position: 'absolute', inset: 0,
            background: preview ? 'rgba(28,31,58,.45)' : 'rgba(108,111,239,.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, opacity: 0, transition: 'opacity .18s', borderRadius: 10,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 11V4M5 7l3-3 3 3M2 14h12"
                stroke={preview ? '#fff' : C.primary} strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: preview ? '#fff' : C.primary, fontFamily: FONT_BODY }}>
              {preview ? t('admin.createCourseModal.changePhoto') : t('admin.createCourseModal.uploadPhoto')}
            </span>
          </div>
        )}
      </div>

      {preview && !disabled && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          aria-label={t('admin.createCourseModal.removeThumbnailAria')}
          style={{
            position: 'absolute', top: 7, right: 7,
            width: 24, height: 24, borderRadius: 6,
            border: 'none', background: 'rgba(28,31,58,.55)',
            color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .15s',
          }}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}

      <input
        ref={inputRef} type="file" accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { const file = e.target.files?.[0]; if (file) onPick(file); e.target.value = ''; }}
        aria-hidden="true"
      />
    </div>
  );
};

const Spinner = ({ size = 14, color = '#fff' }) => (
  <span style={{
    display: 'inline-block',
    width: size, height: size,
    border: `2px solid rgba(255,255,255,.3)`,
    borderTopColor: color,
    borderRadius: '50%',
    animation: 'ccm2-spin .7s linear infinite',
    flexShrink: 0,
  }} />
);

const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M7 1l1.2 3.8L12 6l-3.8 1.2L7 11 5.8 7.2 2 6l3.8-1.2L7 1z"
      fill="currentColor" opacity=".9" />
    <path d="M11.5 1l.5 1.5L13.5 3l-1.5.5L11.5 5l-.5-1.5L9.5 3l1.5-.5L11.5 1z"
      fill="currentColor" opacity=".6" />
  </svg>
);

const GeneratingSteps = ({ step }) => {
  // Localized labels for the three-phase AI outline progress UI.
  const { t } = useTranslation();
  const steps = [
    t('admin.createCourseModal.genStepOutline'),
    t('admin.createCourseModal.genStepStructure'),
    t('admin.createCourseModal.genStepAlmost'),
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {steps.map((label, i) => {
        const done    = i < step;
        const current = i === step;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            opacity: done ? 1 : current ? 1 : 0.35,
            transition: 'opacity .3s',
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? C.success : current ? C.primary : C.bg,
              border: `2px solid ${done ? C.success : current ? C.primary : C.border}`,
              transition: 'all .3s',
            }}>
              {done ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : current ? (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#fff', animation: 'ccm2-pulse .8s ease-in-out infinite',
                }} />
              ) : null}
            </span>
            <span style={{
              fontSize: 13, fontWeight: current ? 600 : 500,
              color: done ? C.success : current ? C.text : C.muted,
              fontFamily: FONT_BODY, transition: 'color .3s',
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Language Context Pill ─────────────────────────────────────────────────────
/**
 * Shows the auto-detected "Teaching X · Explaining in Y" summary.
 * Clicking opens inline dropdowns so the teacher can override either language.
 */
const LanguagePill = ({
  targetLanguage,
  nativeLanguage,
  onChangeTarget,
  onChangeNative,
  disabled,
}) => {
  const [editing, setEditing] = useState(false);
  const flag = (lang) => FLAG_MAP[lang] ?? '🌐';

  if (!targetLanguage) return null;

  return (
    <div style={{ marginBottom: 2 }}>
      {!editing ? (
        /* ── Pill view ── */
        <button
          type="button"
          onClick={() => !disabled && setEditing(true)}
          disabled={disabled}
          title="Click to change languages"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 10px 5px 8px',
            background: C.tint, border: `1.5px solid ${C.border}`,
            borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
            fontFamily: FONT_BODY, fontSize: 12, fontWeight: 500, color: C.primary,
            transition: 'background .14s, border-color .14s',
            whiteSpace: 'nowrap', overflow: 'hidden',
          }}
          onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = C.tintDeep; e.currentTarget.style.borderColor = C.primary; } }}
          onMouseLeave={e => { e.currentTarget.style.background = C.tint; e.currentTarget.style.borderColor = C.border; }}
        >
          {/* Teaching badge */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 14 }}>{flag(targetLanguage)}</span>
            <span>Teaching <strong>{targetLanguage}</strong></span>
          </span>
          {/* Divider */}
          <span style={{ color: C.border, fontWeight: 300 }}>·</span>
          {/* Explaining badge */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 14 }}>{flag(nativeLanguage)}</span>
            <span>Explaining in <strong>{nativeLanguage || 'English'}</strong></span>
          </span>
          {/* Edit icon */}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: .6, marginLeft: 2, flexShrink: 0 }}>
            <path d="M7 1.5L8.5 3l-5 5H2V6.5l5-5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      ) : (
        /* ── Edit panel ── */
        <div style={{
          padding: '10px 12px', background: C.tint,
          border: `1.5px solid ${C.border}`, borderRadius: 12,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {/* Target language */}
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: C.sub, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                Language to teach
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>
                  {flag(targetLanguage)}
                </span>
                <select
                  value={targetLanguage}
                  onChange={e => onChangeTarget(e.target.value)}
                  style={{
                    width: '100%', padding: '7px 10px 7px 28px',
                    borderRadius: 9, border: `1.5px solid ${C.border}`,
                    background: C.white, fontSize: 12.5, color: C.text,
                    outline: 'none', appearance: 'none', cursor: 'pointer',
                    fontFamily: FONT_BODY,
                  }}
                >
                  {ALL_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Native / instruction language */}
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: C.sub, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                Explain in
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>
                  {flag(nativeLanguage)}
                </span>
                <select
                  value={nativeLanguage || 'English'}
                  onChange={e => onChangeNative(e.target.value)}
                  style={{
                    width: '100%', padding: '7px 10px 7px 28px',
                    borderRadius: 9, border: `1.5px solid ${C.border}`,
                    background: C.white, fontSize: 12.5, color: C.text,
                    outline: 'none', appearance: 'none', cursor: 'pointer',
                    fontFamily: FONT_BODY,
                  }}
                >
                  {ALL_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Done button */}
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                marginTop: 20, padding: '7px 12px', borderRadius: 9,
                border: 'none', background: C.primary, color: C.white,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: FONT_BODY, flexShrink: 0,
              }}
            >
              Done
            </button>
          </div>

          <p style={{ fontSize: 11, color: C.sub, margin: 0, lineHeight: 1.4 }}>
            The course will <strong>teach {targetLanguage}</strong> with explanations written in <strong>{nativeLanguage || 'English'}</strong>.
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function CreateCourseModal({ open, onClose, onCreated }) {
  // i18n for all user-visible copy (en / ru via profile or app language).
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startTeacherClassroomOpen } = useTeacherClassroomTransition();

  const [mode, setMode]               = useState('quick');
  const [thumbFile, setThumbFile]     = useState(null);
  const [thumbPreview, setThumbPreview] = useState(null);
  const [quickTitle, setQuickTitle]   = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel]             = useState('B1');
  const [loading, setLoading]         = useState(false);
  const [genStep, setGenStep]         = useState(0);
  const [error, setError]             = useState(null);

  // ── Language context ──────────────────────────────────────────────────────
  // targetLanguage: language the course *teaches* (detected from description)
  // nativeLanguage: language for teacher-facing explanations (from user profile)
  const [targetLanguage, setTargetLanguage] = useState('');
  const [nativeLanguage, setNativeLanguage] = useState('English');

  // ── File enrichment step (Generate mode only)
  const [fileModalOpen, setFileModalOpen] = useState(false);

  // ── Course generation quota (fetched once when modal opens) ──────────────
  const [quotaStatus, setQuotaStatus] = useState('idle'); // 'idle' | 'loading' | 'ok' | 'error'
  const [tariffData,  setTariffData]  = useState(null);

  const quickInputRef = useRef(null);
  const descRef       = useRef(null);

  // ── Seed native language from user profile when modal opens ──────────────
  useEffect(() => {
    if (open) {
      setNativeLanguage(nativeLanguageFromUser(user));
    }
  }, [open, user]);

  // ── Auto-detect target language from description as teacher types ─────────
  // Only applies in Generate mode — in Quick mode there is no description and
  // we want the teacher's chosen target_language to persist (defaulted to
  // "Italian" on open so the LanguagePill is always rendered for Quick mode).
  useEffect(() => {
    if (mode !== 'generate') return;
    if (!description.trim()) {
      setTargetLanguage('');
      return;
    }
    const detected = detectTargetLanguage(description);
    if (detected) setTargetLanguage(detected);
  }, [description, mode]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setMode('quick');
      setQuickTitle('');
      setDescription('');
      setLevel('B1');
      // Default the teaching language to "Italian" — sensible app-wide default
      // that also ensures the LanguagePill is always visible in Quick mode.
      // The teacher can still override it in either mode.
      setTargetLanguage('Italian');
      setThumbFile(null);
      setThumbPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      setLoading(false);
      setGenStep(0);
      setError(null);
      setFileModalOpen(false);
      // ── Hydrate quota from cache immediately so the button is never in a
      // loading spinner state on re-open (cache written by any component on page)
      const cached = getTariffCache();
      if (cached) {
        setTariffData(cached);
        setQuotaStatus('ok');
      } else {
        setQuotaStatus('idle');
        setTariffData(null);
      }
      setTimeout(() => quickInputRef.current?.focus(), 80);
    }
  }, [open]);

  // ── Fetch course generation quota when modal opens ────────────────────────
  useEffect(() => {
    if (!open) return;
    if (quotaStatus === 'ok' || quotaStatus === 'loading') return;
    // Check shared window cache first — populated by AdminHeader / GenerateUnitModal
    const cached = getTariffCache();
    if (cached) { setTariffData(cached); setQuotaStatus('ok'); return; }
    // Nothing cached — do a real fetch
    let mounted = true;
    setQuotaStatus('loading');
    (async () => {
      try {
        const token = localStorage.getItem('token') ?? '';
        const res = await fetch(buildAdminApiUrl('/admin/tariffs/me'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('quota fetch failed');
        const data = await res.json();
        setTariffCache(data); // warm cache for subsequent opens / components
        if (mounted) { setTariffData(data); setQuotaStatus('ok'); }
      } catch {
        if (mounted) setQuotaStatus('error');
      }
    })();
    return () => { mounted = false; };
  }, [open, quotaStatus]);

  useEffect(() => {
    return () => { if (thumbPreview) URL.revokeObjectURL(thumbPreview); };
  }, [thumbPreview]);

  useEffect(() => {
    if (!open || loading) return;
    const timer = setTimeout(() => {
      if (mode === 'quick') quickInputRef.current?.focus();
      else                  descRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [mode, open, loading]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose, loading]);

  const handleThumbPick = useCallback((file) => {
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbFile(file);
    setThumbPreview(URL.createObjectURL(file));
  }, [thumbPreview]);

  const handleThumbClear = useCallback(() => {
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbFile(null);
    setThumbPreview(null);
  }, [thumbPreview]);

  // ── Navigate helper — forwards source_token in URL when present
  const goToClassroom = useCallback((courseId, unitId, generationParams = null) => {
    startTeacherClassroomOpen();
    const base = unitId
      ? `/teacher/classroom/${courseId}/${unitId}`
      : `/teacher/classroom/${courseId}`;

    let search = '';
    if (generationParams) {
      const params = new URLSearchParams({
        ai_outline: 'true',
        level: generationParams.level ?? 'B1',
      });
      if (generationParams.sourceToken) {
        params.set('source_token', generationParams.sourceToken);
      }
      // Forward target language so the SSE unit-generation stream also uses
      // the correct language (ClassroomPage reads ?language= and passes it to
      // the stream endpoint).
      if (generationParams.language) {
        params.set('language', generationParams.language);
      }
      if (generationParams.nativeLanguage) {
        params.set('native_language', generationParams.nativeLanguage);
      }
      search = `?${params.toString()}`;
    }

    navigate(base + search);
  }, [navigate, startTeacherClassroomOpen]);

  // ── Course generation limit (derived from tariff data) ───────────────────
  const courseLimit = (() => {
    if (!tariffData?.ai_limits) return null;
    const limits = tariffData.ai_limits;
    const raw = limits['course_generation'] ?? limits['course_generations'] ?? undefined;
    return raw === undefined ? null : raw; // null = unlimited
  })();
  const courseUsed = tariffData?.ai_usage?.course_generations ?? 0;
  const isAtLimit  = courseLimit !== null && courseUsed >= courseLimit;
  const showQuota  = quotaStatus === 'ok' && tariffData !== null;

  const redirectToTariffs = useCallback(() => {
    navigate('/admin/tariffs');
  }, [navigate]);

  // ── QUICK CREATE ─────────────────────────────────────────────────────────────

  const handleQuickCreate = useCallback(async () => {
    const title = quickTitle.trim();
    if (!title) {
      setError(t('admin.createCourseModal.errorTitleRequired'));
      quickInputRef.current?.focus();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Persist the selected teaching/explanation languages on the course row
      // so unit generation, content rendering, and admin filters can read them
      // later without prompting the teacher again.
      const course = await apiCreateCourse(title, {
        targetLanguage,
        nativeLanguage,
      });
      if (thumbFile) {
        try { await apiUploadThumbnail(course.id, thumbFile); }
        catch (e) { console.warn('[CreateCourseModal] Thumbnail upload failed.', e); }
      }
      let firstUnitId = null;
      try {
        const unit = await apiCreateUnit(course.id, t('admin.createCourseModal.defaultUnitTitle', { n: 1 }), 0);
        firstUnitId = unit.id;
      } catch (e) {
        console.warn('[CreateCourseModal] First unit failed, continuing.', e);
      }
      onCreated?.(course);
      goToClassroom(course.id, firstUnitId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.createCourseModal.errorCreateFailed'));
      setLoading(false);
    }
  }, [quickTitle, onCreated, goToClassroom, thumbFile, targetLanguage, nativeLanguage, t]);

  // ── AI GENERATE — Step 2: outline + course creation (second step: CourseFileUploadModal) ──
  //
  //  files.length === 0  →  POST /generate-outline            (JSON, fast path)
  //  files.length  >  0  →  POST /generate-outline-from-files (multipart, returns source_token)

  const handleGenerateWithFiles = useCallback(async (files) => {
    setFileModalOpen(false);
    setLoading(true);
    setGenStep(0);

    const desc = description.trim();

    try {
      // ── Step 0: generate outline via appropriate endpoint ──────────────────
      let outline;
      let sourceToken = null;

      if (files.length > 0) {
        // File-enrichment path
        const res = await fetch(buildAdminApiUrl('/course-builder/generate-outline-from-files'), {
          method: 'POST',
          headers: { ...authHeaders() },
          body: (() => {
            const form = new FormData();
            form.append('description', desc);
            form.append('level', level);
            // ── Language context ───────────────────────────────────────────
            if (targetLanguage) form.append('target_language', targetLanguage);
            if (nativeLanguage) form.append('native_language', nativeLanguage);
            // ──────────────────────────────────────────────────────────────
            for (const f of files) form.append('files', f);
            return form;
          })(),
        });
        if (res.status === 402) { redirectToTariffs(); return; }
        if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
        const result = await parseJsonResponse(res, 'Outline generation from files returned an empty or invalid JSON response.');
        sourceToken = result.source_token ?? null;
        outline     = result;
      } else {
        // Fast path — no files
        const res = await fetch(buildAdminApiUrl('/course-builder/generate-outline'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            description: desc,
            level,
            // ── Language context ─────────────────────────────────────────
            target_language: targetLanguage || undefined,
            native_language: nativeLanguage || undefined,
            // ────────────────────────────────────────────────────────────
          }),
        });
        if (res.status === 402) { redirectToTariffs(); return; }
        if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
        outline = await parseJsonResponse(res, 'Outline generation returned an empty or invalid JSON response.');
      }

      setGenStep(1);

      // ── Step 1: create course row ────────────────────────────────────────────
      // Persist target/native language and the teacher's directive on the course
      // so unit generation can inject the directive (e.g. "use Harry Potter
      // examples") into every text-block and exercise prompt later.
      const course = await apiCreateCourse(outline.title, {
        targetLanguage,
        nativeLanguage,
        description: desc,
      });
      if (thumbFile) {
        try { await apiUploadThumbnail(course.id, thumbFile); }
        catch (e) { console.warn('[CreateCourseModal] Thumbnail upload failed.', e); }
      }

      setGenStep(2);

      // ── Step 2: create unit rows ─────────────────────────────────────────────
      let firstUnitId = null;
      const unitTitles = outline.units ?? [];

      for (let i = 0; i < Math.max(1, unitTitles.length); i++) {
        const u = unitTitles[i] ?? { title: t('admin.createCourseModal.defaultUnitTitle', { n: i + 1 }), description: '' };
        try {
          const unit = await apiCreateUnit(course.id, u.title, i, u.description ?? '');
          if (i === 0) firstUnitId = unit.id;
        } catch (e) {
          console.warn(`[CreateCourseModal] Unit ${i} failed.`, e);
        }
      }

      // ── Step 3: cache outline (+ source_token) for UnitSelectorModal ─────────
      try {
        sessionStorage.setItem(`ai_outline_${course.id}`, JSON.stringify(outline));
        if (sourceToken) {
          sessionStorage.setItem(`ai_source_token_${course.id}`, sourceToken);
        }
        // Cache target language so ClassroomPage can pass it to the SSE stream.
        if (targetLanguage) {
          sessionStorage.setItem(`ai_language_${course.id}`, targetLanguage);
        }
        if (nativeLanguage) {
          sessionStorage.setItem(`ai_native_language_${course.id}`, nativeLanguage);
        }
        // Cache the teacher's directive so the stream endpoint can re-read it
        // from sessionStorage if course.description was somehow not saved.
        if (desc) {
          sessionStorage.setItem(`ai_description_${course.id}`, desc);
        }
      } catch {
        // sessionStorage full — not critical
      }

      await new Promise(r => setTimeout(r, 350));

      onCreated?.(course);
      goToClassroom(course.id, firstUnitId, {
        level,
        sourceToken,
        language:       targetLanguage || undefined,
        nativeLanguage: nativeLanguage || undefined,
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.createCourseModal.errorGeneric'));
      setLoading(false);
      setGenStep(0);
    }
  }, [description, level, targetLanguage, nativeLanguage, thumbFile, onCreated, goToClassroom, redirectToTariffs, t]);

  // ── AI GENERATE — Step 1: validate, then open file-enrichment modal (Skip → JSON outline; files → multipart).
  const handleGenerate = useCallback(() => {
    // Only block when the limit is *confirmed* hit. If quota hasn't loaded yet
    // we fail open — the backend enforces limits server-side anyway.
    if (isAtLimit) return;
    const desc = description.trim();
    if (!desc) {
      setError(t('admin.createCourseModal.errorDescRequired'));
      descRef.current?.focus();
      return;
    }
    setError(null);
    setFileModalOpen(true);
  }, [description, isAtLimit, t]);

  const handleBackdrop = useCallback((e) => {
    if (e.target === e.currentTarget && !loading) onClose();
  }, [loading, onClose]);

  if (!open) return null;

  const isGenerate = mode === 'generate';
  // Also block submit while quota is still loading so the button stays disabled
  // until we know whether the user is under their limit.
  const canSubmit  = isGenerate
    ? (description.trim().length > 0 && !isAtLimit)
    : quickTitle.trim().length > 0;

  return createPortal(
    <>
      <style>{`
        @keyframes ccm2-fade-in { from{opacity:0} to{opacity:1} }
        @keyframes ccm2-pop-in  {
          from { opacity:0; transform: scale(.94) translateY(12px) }
          to   { opacity:1; transform: none }
        }
        @keyframes ccm2-spin  { to { transform: rotate(360deg) } }
        @keyframes ccm2-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }

        .ccm2-backdrop { animation: ccm2-fade-in .18s ease; }
        .ccm2-modal    { animation: ccm2-pop-in .24s cubic-bezier(.22,.68,0,1.15); }

        .ccm2-tab {
          flex: 1; padding: 7px 0; border: none; cursor: pointer;
          font-size: 13px; font-weight: 600; border-radius: 9px;
          transition: all .18s; display: flex; align-items: center;
          justify-content: center; gap: 5px;
          font-family: ${FONT_BODY};
        }
        .ccm2-tab-active {
          background: ${C.white}; color: ${C.primary};
          box-shadow: 0 1px 4px rgba(108,111,239,.18), 0 1px 2px rgba(0,0,0,.06);
        }
        .ccm2-tab-inactive { background: transparent; color: ${C.sub}; }
        .ccm2-tab-inactive:hover { color: ${C.text}; background: rgba(255,255,255,.5); }

        .ccm2-input {
          width: 100%; padding: 11px 14px; box-sizing: border-box;
          border-radius: 12px; border: 1.5px solid ${C.border};
          background: ${C.bg}; color: ${C.text};
          font-size: 14px; font-weight: 500; outline: none;
          font-family: ${FONT_BODY}; resize: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .ccm2-input::placeholder { color: ${C.muted}; }
        .ccm2-input:focus {
          border-color: ${C.primary};
          box-shadow: 0 0 0 3px ${C.tint};
        }

        .ccm2-level-chip {
          padding: 5px 11px; border-radius: 8px; font-size: 12px;
          font-weight: 700; border: 1.5px solid transparent;
          cursor: pointer; transition: all .15s; font-family: ${FONT_BODY};
          letter-spacing: .2px;
        }
        .ccm2-level-chip-active  { background: ${C.tint}; color: ${C.primary}; border-color: ${C.border}; }
        .ccm2-level-chip-inactive { background: ${C.bg}; color: ${C.muted}; border-color: ${C.bg}; }
        .ccm2-level-chip-inactive:hover { background: ${C.tint}; color: ${C.sub}; border-color: ${C.border}; }

        .ccm2-btn-cancel {
          padding: 10px 18px; border-radius: 11px; font-size: 14px;
          font-weight: 600; cursor: pointer; font-family: ${FONT_BODY};
          border: 1.5px solid ${C.border}; background: ${C.white};
          color: ${C.sub}; transition: background .15s;
        }
        .ccm2-btn-cancel:hover:not(:disabled) { background: ${C.bg}; }

        .ccm2-btn-primary {
          padding: 10px 22px; border-radius: 11px; font-size: 14px;
          font-weight: 700; cursor: pointer; font-family: ${FONT_DISPLAY};
          border: none; color: ${C.white}; letter-spacing: -.1px;
          display: flex; align-items: center; gap: 7px;
          transition: background .15s, transform .1s, opacity .15s;
        }
        .ccm2-btn-primary:hover:not(:disabled) {
          background: ${C.primaryDk} !important;
          transform: translateY(-1px);
        }
        .ccm2-btn-primary:active:not(:disabled) { transform: translateY(0); }
        .ccm2-btn-primary:disabled { opacity: .7; cursor: not-allowed; }

        .ccm2-close:hover { background: ${C.tint} !important; color: ${C.primary} !important; }

        .ccm2-thumb-overlay { pointer-events: none; }
        div:hover > .ccm2-thumb-overlay,
        div:focus > .ccm2-thumb-overlay { opacity: 1 !important; }
      `}</style>

      {/* Backdrop — hidden while file modal is open so only one modal shows */}
      <div
        className="ccm2-backdrop"
        onClick={handleBackdrop}
        role="dialog"
        aria-modal="true"
        aria-label={t('admin.createCourseModal.ariaDialog')}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(26,26,48,.5)',
          backdropFilter: 'blur(4px)',
          display: fileModalOpen ? 'none' : 'flex',
          alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        {/* Modal card */}
        <div
          className="ccm2-modal"
          style={{
            background: C.white,
            borderRadius: 20,
            boxShadow: '0 24px 64px rgba(108,111,239,.18), 0 4px 16px rgba(0,0,0,.08)',
            width: '100%', maxWidth: 400,
            padding: '24px 24px 20px',
            display: 'flex', flexDirection: 'column', gap: 0,
            fontFamily: FONT_BODY,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: C.text, fontFamily: FONT_DISPLAY, letterSpacing: '-.3px' }}>
              {t('admin.createCourseModal.title')}
            </span>
            <button
              className="ccm2-close"
              onClick={() => !loading && onClose()}
              disabled={loading}
              aria-label={t('common.close')}
              style={{
                width: 28, height: 28, borderRadius: 8,
                border: 'none', background: C.bg, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.muted, transition: 'background .15s, color .15s', flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* ── Mode toggle ── */}
          <div style={{ display: 'flex', gap: 3, padding: 3, background: C.bg, borderRadius: 12, marginBottom: 20 }}>
            {[
              { id: 'quick',    label: t('admin.createCourseModal.tabQuick'),    icon: null },
              { id: 'generate', label: t('admin.createCourseModal.tabGenerate'), icon: <SparkleIcon /> },
            ].map(({ id, label, icon }) => (
              <button
                key={id}
                className={`ccm2-tab ${mode === id ? 'ccm2-tab-active' : 'ccm2-tab-inactive'}`}
                onClick={() => { if (!loading) { setMode(id); setError(null); } }}
                disabled={loading}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          {/* ── Thumbnail (shared) ── */}
          <div style={{ marginBottom: 16 }}>
            <ThumbnailZone
              preview={thumbPreview}
              onPick={handleThumbPick}
              onClear={handleThumbClear}
              disabled={loading}
            />
          </div>

          {/* ── QUICK MODE ── */}
          {!isGenerate && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                ref={quickInputRef}
                className="ccm2-input"
                type="text"
                placeholder={t('admin.createCourseModal.quickPlaceholder')}
                value={quickTitle}
                onChange={e => { setQuickTitle(e.target.value); setError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') handleQuickCreate(); }}
                disabled={loading}
                maxLength={120}
                autoComplete="off"
              />

              {/* ── Language context pill — persisted on the course row ─────────
                  Pre-populated with "Italian" (target) and the teacher's profile
                  language (native) so the pill is always visible and editable. */}
              <LanguagePill
                targetLanguage={targetLanguage}
                nativeLanguage={nativeLanguage}
                onChangeTarget={setTargetLanguage}
                onChangeNative={setNativeLanguage}
                disabled={loading}
              />
            </div>
          )}

          {/* ── GENERATE MODE ── */}
          {isGenerate && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loading ? (
                <div style={{ padding: '16px 14px', background: C.bg, borderRadius: 14, border: `1.5px solid ${C.border}` }}>
                  <GeneratingSteps step={genStep} />
                </div>
              ) : (
                <>
                  {/* ── Quota badge ── */}
                  {showQuota && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 13px', borderRadius: 10,
                      background: isAtLimit ? C.errorBg : C.tint,
                      border: `1.5px solid ${isAtLimit ? '#FECACA' : C.border}`,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                        <path d="M7 1l1.2 3.8L12 6l-3.8 1.2L7 11 5.8 7.2 2 6l3.8-1.2L7 1z"
                          fill={isAtLimit ? C.error : C.primary} />
                      </svg>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: isAtLimit ? C.error : C.primary }}>
                        {isAtLimit
                          ? 'Monthly course generation limit reached'
                          : courseLimit === null
                            ? 'Unlimited course generations'
                            : `${courseUsed} of ${courseLimit} course generations used`}
                      </span>
                      {isAtLimit && (
                        <button
                          type="button"
                          onClick={redirectToTariffs}
                          style={{
                            flexShrink: 0, fontSize: 11.5, fontWeight: 700,
                            color: C.white, background: C.primary,
                            border: 'none', borderRadius: 7, padding: '3px 9px',
                            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                          }}
                        >
                          Upgrade
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Description textarea ── */}
                  <textarea
                    ref={descRef}
                    className="ccm2-input"
                    rows={3}
                    placeholder={t('admin.createCourseModal.descPlaceholder')}
                    value={description}
                    onChange={e => { setDescription(e.target.value); setError(null); }}
                    disabled={loading}
                    maxLength={400}
                  />

                  {/* ── Language context pill — appears when a language is detected ── */}
                  <LanguagePill
                    targetLanguage={targetLanguage}
                    nativeLanguage={nativeLanguage}
                    onChangeTarget={setTargetLanguage}
                    onChangeNative={setNativeLanguage}
                    disabled={loading}
                  />

                  {/* ── CEFR level chips ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '.4px', textTransform: 'uppercase', flexShrink: 0 }}>
                      {t('admin.createCourseModal.level')}
                    </span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {CEFR_LEVELS.map(l => (
                        <button
                          key={l}
                          className={`ccm2-level-chip ${level === l ? 'ccm2-level-chip-active' : 'ccm2-level-chip-inactive'}`}
                          onClick={() => setLevel(l)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div style={{
              marginTop: 12, padding: '9px 13px', borderRadius: 10,
              background: C.errorBg, border: `1.5px solid #FCA5A5`,
              color: C.error, fontSize: 13, fontWeight: 500,
            }} role="alert">
              {error}
            </div>
          )}

          {/* ── Footer ── */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            {!loading && (
              <button
                className="ccm2-btn-cancel"
                onClick={() => !loading && onClose()}
                disabled={loading}
                type="button"
              >
                {t('common.cancel')}
              </button>
            )}
            {isGenerate && isAtLimit ? (
              <button
                className="ccm2-btn-primary"
                style={{ background: C.primary }}
                onClick={redirectToTariffs}
                type="button"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M7 1l1.2 3.8L12 6l-3.8 1.2L7 11 5.8 7.2 2 6l3.8-1.2L7 1z" fill="currentColor" />
                </svg>
                Upgrade Plan
              </button>
            ) : (
              <button
                className="ccm2-btn-primary"
                style={{
                  background: canSubmit && !loading ? C.primary : C.muted,
                  flex: loading ? 1 : 'unset',
                  justifyContent: loading ? 'center' : 'flex-start',
                }}
                onClick={isGenerate ? handleGenerate : handleQuickCreate}
                disabled={loading || !canSubmit}
                type="button"
              >
                {loading ? (
                  <><Spinner />{isGenerate ? t('admin.createCourseModal.generating') : t('admin.createCourseModal.creating')}</>
                ) : isGenerate ? (
                  <><SparkleIcon />{t('admin.createCourseModal.generateCourse')}</>
                ) : (
                  t('admin.createCourseModal.createCourse')
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── File enrichment modal (Generate mode, step 2) ── */}
      <CourseFileUploadModal
        open={fileModalOpen}
        onClose={() => setFileModalOpen(false)}
        onSkip={() => handleGenerateWithFiles([])}
        onGenerate={handleGenerateWithFiles}
      />
    </>,
    document.body,
  );
}