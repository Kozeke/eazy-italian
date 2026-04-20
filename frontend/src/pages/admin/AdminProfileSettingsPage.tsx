/**
 * AdminProfileSettingsPage.tsx
 *
 * Instructor personal profile screen (settings + description tabs) opened from the
 * shell header user menu. Persists name, email, locale, and extended fields via PUT /users/me.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n, { normalizeInterfaceLanguage } from '../../i18n';
import { ChevronLeft, ChevronDown, Camera } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { authApi, resolveStaticAssetUrl } from '../../services/api';

// IANA zones shown in the timezone selector (covers EU/US defaults for teachers).
const TIMEZONE_OPTIONS = [
  'UTC',
  'Europe/Rome',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Europe/London',
  'America/New_York',
  'Asia/Almaty',
];

// ISO-like country codes stored in notification_prefs.country for billing/UI context.
const COUNTRY_OPTIONS = [
  { code: 'IT', labelKey: 'admin.profileSettings.countryIT' },
  { code: 'RU', labelKey: 'admin.profileSettings.countryRU' },
  { code: 'KZ', labelKey: 'admin.profileSettings.countryKZ' },
  { code: 'US', labelKey: 'admin.profileSettings.countryUS' },
  { code: 'GB', labelKey: 'admin.profileSettings.countryGB' },
  { code: 'DE', labelKey: 'admin.profileSettings.countryDE' },
  { code: 'FR', labelKey: 'admin.profileSettings.countryFR' },
];

// Interface / native language values map to persisted user.locale and prefs.native_language.
const LOCALE_OPTIONS = [
  { value: 'ru', labelKey: 'admin.profileSettings.langRussian' },
  { value: 'en', labelKey: 'admin.profileSettings.langEnglish' },
  { value: 'it', labelKey: 'admin.profileSettings.langItalian' },
];

// Reuses AdminCoursesCatalog visual language (white centered card, Inter/Nunito, violet accents).
const PROFILE_PAGE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

.aps-root {
  min-height: 100%;
  font-family: 'Inter', system-ui, sans-serif;
  color: #18181B;
  padding-bottom: 80px;
}
.aps-page {
  background: #FFFFFF;
  border-radius: 16px;
  border: 1px solid #E8E8F0;
  margin: 28px 20%;
  padding: 26px 30px 30px;
  box-shadow: 0 1px 4px rgba(108, 111, 239, .04);
}
.aps-title {
  font-family: 'Nunito', system-ui, sans-serif;
  font-size: 24px;
  font-weight: 900;
  color: #18181B;
  margin: 0 0 14px;
}
.aps-top-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.aps-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1.5px solid #E8E8F0;
  background: #FFFFFF;
  color: #52525B;
  cursor: pointer;
  transition: all .15s;
}
.aps-back-btn:hover {
  border-color: #6C6FEF;
  background: #EEF0FE;
  color: #4F52C2;
}
.aps-tabs {
  display: flex;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid #E8E8F0;
  margin-bottom: 20px;
}
.aps-tab-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0 2px 10px;
  margin-bottom: -1px;
  border-bottom: 2px solid transparent;
  color: #A1A1AA;
  font-size: 13px;
  font-weight: 600;
  font-family: 'Inter', system-ui, sans-serif;
  transition: all .14s;
}
.aps-tab-btn:hover {
  color: #52525B;
}
.aps-tab-btn.is-active {
  border-bottom-color: #6C6FEF;
  color: #18181B;
}
.aps-avatar {
  width: 112px;
  height: 112px;
  border-radius: 999px;
  overflow: hidden;
  border: 4px solid #EEF0FE;
  background: #EEF0FE;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4F52C2;
  font-family: 'Nunito', system-ui, sans-serif;
  font-weight: 900;
  font-size: 40px;
}
.aps-label {
  font-size: 13px;
  font-weight: 600;
  color: #52525B;
}
.aps-field {
  width: 100%;
  border: 1.5px solid #E8E8F0;
  border-radius: 10px;
  background: #FFFFFF;
  color: #18181B;
  font-size: 13px;
  font-family: 'Inter', system-ui, sans-serif;
  padding: 10px 12px;
  outline: none;
  transition: all .14s;
}
.aps-field:focus {
  border-color: #6C6FEF;
  box-shadow: 0 0 0 3px #EEF0FE;
}
.aps-field-wrap {
  position: relative;
}
.aps-select {
  appearance: none;
  padding-right: 34px;
}
.aps-button-soft {
  border: 1.5px solid #E8E8F0;
  background: #FFFFFF;
  color: #4F52C2;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12.5px;
  font-weight: 700;
  font-family: 'Inter', system-ui, sans-serif;
  cursor: pointer;
  transition: all .14s;
}
.aps-button-soft:hover {
  border-color: #6C6FEF;
  background: #EEF0FE;
}
.aps-button-primary {
  border: none;
  background: #6C6FEF;
  color: #FFFFFF;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 700;
  font-family: 'Inter', system-ui, sans-serif;
  box-shadow: 0 2px 10px rgba(108, 111, 239, .22);
  cursor: pointer;
  transition: all .15s;
}
.aps-button-primary:hover {
  background: #4F52C2;
}
.aps-button-primary:disabled {
  cursor: not-allowed;
  opacity: .65;
}

@media (max-width: 1024px) {
  .aps-page {
    margin: 22px 10%;
  }
}
@media (max-width: 768px) {
  .aps-page {
    margin: 16px;
    padding: 18px 16px 22px;
  }
}
`;

function flagForCountry(code: string): string {
  const map: Record<string, string> = {
    IT: '🇮🇹',
    RU: '🇷🇺',
    KZ: '🇰🇿',
    US: '🇺🇸',
    GB: '🇬🇧',
    DE: '🇩🇪',
    FR: '🇫🇷',
  };
  return map[code] ?? '🏳️';
}

function flagForLocale(locale: string): string {
  if (locale === 'ru') return '🇷🇺';
  if (locale === 'it') return '🇮🇹';
  return '🇺🇸';
}

// Builds a short clock + offset label for a timezone option (matches compact dropdown rows).
function formatTimezoneRow(timeZone: string): string {
  try {
    const now = new Date();
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    return `${time} (${tzName || timeZone})`;
  } catch {
    return timeZone;
  }
}

// Parses "Firstname Rest" into API first/last name fields.
function splitDisplayName(displayName: string): { first_name: string; last_name: string } {
  const trimmed = displayName.trim();
  if (!trimmed) return { first_name: '', last_name: '' };
  const parts = trimmed.split(/\s+/);
  const first_name = parts[0] ?? '';
  const last_name = parts.slice(1).join(' ');
  return { first_name, last_name };
}

// Reads string metadata safely from notification_prefs JSON.
function readPref(prefs: Record<string, unknown> | undefined, key: string): string {
  if (!prefs || typeof prefs !== 'object') return '';
  const v = prefs[key];
  return typeof v === 'string' ? v : '';
}

export default function AdminProfileSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  // Active top tab: account fields vs longer bio text.
  const [activeTab, setActiveTab] = useState<'settings' | 'description'>('settings');
  // Single "Name" field shown like the reference UI; split on save.
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [locale, setLocale] = useState('ru');
  const [nativeLanguage, setNativeLanguage] = useState('ru');
  const [country, setCountry] = useState('IT');
  const [timezone, setTimezone] = useState('Europe/Rome');
  const [bio, setBio] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  // Shown when the user taps "Change password" (no dedicated reset flow in this shell yet).
  const [passwordChangeHint, setPasswordChangeHint] = useState('');
  // Stores avatar upload state for button disabled/loading behavior.
  const [avatarUploadState, setAvatarUploadState] = useState<'idle' | 'uploading' | 'ok' | 'err'>('idle');
  // Stores success/error feedback after avatar upload attempts.
  const [avatarUploadMessage, setAvatarUploadMessage] = useState('');
  // References hidden file input used to trigger native image picker.
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  // Hydrates form state whenever the authenticated user record changes.
  useEffect(() => {
    if (!user) return;
    const prefs = (user.notification_prefs ?? {}) as Record<string, unknown>;
    const combined =
      user.full_name?.trim() ||
      [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    setDisplayName(combined);
    setEmail(user.email ?? '');
    setPhone(readPref(prefs, 'phone'));
    // Normalizes locale from API shape (e.g. en-US) before binding to selector options.
    const normalizedUserLocale = normalizeInterfaceLanguage(user.locale);
    setLocale(normalizedUserLocale);
    setNativeLanguage(readPref(prefs, 'native_language') || normalizedUserLocale);
    setCountry(readPref(prefs, 'country') || 'IT');
    setTimezone(readPref(prefs, 'timezone') || 'Europe/Rome');
    setBio(readPref(prefs, 'profile_bio'));
  }, [user]);

  const avatarLetter = useMemo(() => {
    const ch = displayName.trim()[0] || user?.email?.[0] || '?';
    return ch.toUpperCase();
  }, [displayName, user?.email]);
  // Stores resolved avatar URL for rendering profile icon from backend static storage.
  const avatarPreviewUrl = useMemo(() => {
    if (!user?.avatar_url) return '';
    return resolveStaticAssetUrl(user.avatar_url);
  }, [user?.avatar_url]);

  // Opens hidden file picker so user can choose a new profile icon image.
  const handleAvatarButtonClick = useCallback(() => {
    avatarFileInputRef.current?.click();
  }, []);

  // Uploads selected image file and refreshes authenticated user avatar URL.
  const handleAvatarFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      // Stores first selected file from image picker (single-file upload).
      const selectedFile = event.target.files?.[0];
      if (!selectedFile || !user) {
        return;
      }
      // Clears input value so selecting the same file again still triggers change event.
      event.currentTarget.value = '';
      // Rejects unsupported image file types before making API request.
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setAvatarUploadState('err');
        setAvatarUploadMessage('Avatar must be JPG, PNG, or WEBP');
        return;
      }
      // Enforces 5MB client-side upload limit aligned with backend guard.
      if (selectedFile.size > 5 * 1024 * 1024) {
        setAvatarUploadState('err');
        setAvatarUploadMessage('Avatar file must be up to 5MB');
        return;
      }
      setAvatarUploadState('uploading');
      setAvatarUploadMessage('');
      try {
        await authApi.uploadCurrentUserAvatar(selectedFile);
        await refreshUser();
        setAvatarUploadState('ok');
        setAvatarUploadMessage(t('admin.profileSettings.saved'));
        window.setTimeout(() => setAvatarUploadState('idle'), 2500);
      } catch (error) {
        console.error(error);
        setAvatarUploadState('err');
        setAvatarUploadMessage(t('admin.profileSettings.saveError'));
      }
    },
    [refreshUser, t, user],
  );

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaveState('saving');
    setSaveMessage('');
    const { first_name, last_name } = splitDisplayName(displayName);
    const prevPrefs =
      user.notification_prefs && typeof user.notification_prefs === 'object'
        ? { ...user.notification_prefs }
        : {};
    const notification_prefs = {
      ...prevPrefs,
      phone: phone.trim() || null,
      native_language: nativeLanguage,
      country,
      timezone,
      profile_bio: bio.trim() || null,
    };
    try {
      // Converts selected language into a supported i18n language code before persisting.
      const normalizedLocale = normalizeInterfaceLanguage(locale);
      await authApi.updateCurrentUser({
        first_name: first_name || user.first_name,
        last_name: last_name || user.last_name,
        email: email.trim(),
        locale: normalizedLocale,
        notification_prefs,
      });
      await refreshUser();
      if (normalizedLocale && normalizedLocale !== i18n.language) {
        await i18n.changeLanguage(normalizedLocale);
      }
      setSaveState('ok');
      setSaveMessage(t('admin.profileSettings.saved'));
      window.setTimeout(() => setSaveState('idle'), 2500);
    } catch (e) {
      console.error(e);
      setSaveState('err');
      setSaveMessage(t('admin.profileSettings.saveError'));
    }
  }, [
    user,
    displayName,
    phone,
    nativeLanguage,
    country,
    timezone,
    bio,
    email,
    locale,
    refreshUser,
    t,
  ]);

  const rowClass = 'grid grid-cols-1 sm:grid-cols-[minmax(140px,200px)_1fr] gap-3 sm:gap-6 sm:items-center py-4 border-b border-slate-100 last:border-0';
  const labelClass = 'aps-label';
  const inputClass = 'aps-field';

  return (
    <div className="aps-root">
      <style>{PROFILE_PAGE_CSS}</style>
      <div className="aps-page">
        <div className="aps-top-row">
          <button
            type="button"
            onClick={() => navigate('/admin/courses')}
            className="aps-back-btn"
            aria-label={t('admin.profileSettings.back')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="aps-title">{t('admin.profileSettings.pageTitle')}</h1>
        </div>
        <div className="aps-tabs">
            <button
              type="button"
              className={`aps-tab-btn ${activeTab === 'settings' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              {t('admin.profileSettings.tabSettings')}
            </button>
            <button
              type="button"
              className={`aps-tab-btn ${activeTab === 'description' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('description')}
            >
              {t('admin.profileSettings.tabDescription')}
            </button>
        </div>

        {activeTab === 'settings' ? (
          <div className="flex flex-col gap-6 py-2 sm:flex-row">
            <div className="flex flex-col items-center sm:w-44">
              <div className="aps-avatar">
                {avatarPreviewUrl ? (
                  <img
                    src={avatarPreviewUrl}
                    alt={t('admin.profileSettings.editAvatar')}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  avatarLetter
                )}
              </div>
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
              <button
                type="button"
                className="aps-button-soft mt-4 w-full"
                onClick={handleAvatarButtonClick}
                disabled={avatarUploadState === 'uploading'}
              >
                <span className="inline-flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  {avatarUploadState === 'uploading'
                    ? t('common.loading')
                    : t('admin.profileSettings.editAvatar')}
                </span>
              </button>
              {avatarUploadMessage ? (
                <p
                  className={`mt-2 text-center text-xs ${
                    avatarUploadState === 'err' ? 'text-red-600' : 'text-teal-700'
                  }`}
                >
                  {avatarUploadMessage}
                </p>
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <div className={rowClass}>
                <label className={labelClass}>{t('admin.profileSettings.name')}</label>
                <input
                  className={inputClass}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className={rowClass}>
                <label className={labelClass}>{t('admin.profileSettings.email')}</label>
                <input
                  className={inputClass}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className={rowClass}>
                <label className={labelClass}>{t('admin.profileSettings.password')}</label>
                <div>
                  <div className="flex gap-2">
                    <input
                      className={`${inputClass} flex-1`}
                      type="password"
                      value="••••••••"
                      readOnly
                      aria-label={t('admin.profileSettings.password')}
                    />
                    <button
                      type="button"
                      className="aps-button-soft shrink-0"
                      onClick={() => setPasswordChangeHint(t('admin.profileSettings.passwordHint'))}
                    >
                      {t('admin.profileSettings.changePassword')}
                    </button>
                  </div>
                  {passwordChangeHint ? (
                    <p className="mt-1 text-xs text-slate-500">{passwordChangeHint}</p>
                  ) : null}
                </div>
              </div>
              <div className={rowClass}>
                <label className={labelClass}>{t('admin.profileSettings.phone')}</label>
                <input
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('admin.profileSettings.phonePlaceholder')}
                  autoComplete="tel"
                />
              </div>
              <div className={rowClass}>
                <label className={labelClass}>{t('admin.profileSettings.uiLanguage')}</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg">
                    {flagForLocale(locale)}
                  </span>
                  <select
                    className={`${inputClass} aps-select pl-10`}
                    value={locale}
                    onChange={(e) => {
                      // Applies UI language immediately so all translated pages react without waiting for Save.
                      const nextLocale = normalizeInterfaceLanguage(e.target.value);
                      setLocale(nextLocale);
                      if (nextLocale !== i18n.language) {
                        void i18n.changeLanguage(nextLocale);
                      }
                    }}
                  >
                    {LOCALE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <div className={rowClass}>
                <label className={labelClass}>{t('admin.profileSettings.nativeLanguage')}</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg">
                    {flagForLocale(nativeLanguage)}
                  </span>
                  <select
                    className={`${inputClass} aps-select pl-10`}
                    value={nativeLanguage}
                    onChange={(e) => setNativeLanguage(e.target.value)}
                  >
                    {LOCALE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <div className={rowClass}>
                <label className={labelClass}>{t('admin.profileSettings.country')}</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg">
                    {flagForCountry(country)}
                  </span>
                  <select
                    className={`${inputClass} aps-select pl-10`}
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  >
                    {COUNTRY_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <div className={rowClass}>
                <label className={labelClass}>{t('admin.profileSettings.timezone')}</label>
                <div className="aps-field-wrap">
                  <select
                    className={`${inputClass} aps-select`}
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz}>
                        {formatTimezoneRow(tz)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveState === 'saving'}
                  className="aps-button-primary"
                >
                  {saveState === 'saving' ? t('common.loading') : t('admin.actions.save')}
                </button>
                {saveMessage ? (
                  <span
                    className={`text-sm ${saveState === 'err' ? 'text-red-600' : 'text-teal-700'}`}
                  >
                    {saveMessage}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-3">
            <label className="mb-2 block text-sm font-medium text-slate-500">
              {t('admin.profileSettings.bioLabel')}
            </label>
            <textarea
              className="aps-field min-h-[220px] resize-y p-4"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('admin.profileSettings.bioPlaceholder')}
            />
            <div className="mt-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === 'saving'}
                className="aps-button-primary"
              >
                {saveState === 'saving' ? t('common.loading') : t('admin.actions.save')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
