/**
 * EditCourseModal.tsx
 *
 * A two-tab modal for editing course settings.
 * Tab "Основные" — cover, title, description, language, sections toggle, delete.
 * Tab "Теги"     — age, level, type dropdowns.
 *
 * The modal resizes when switching tabs (Основные is taller, Теги is shorter).
 */

import { useEffect, useRef, useState } from 'react';
import { X, Upload } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditCourseModalProps = {
  open: boolean;
  onClose: () => void;
  /** Persist course edits — may return a Promise; modal closes only after it resolves */
  onSave: (data: CourseEditData) => void | Promise<void>;
  onDelete?: () => void;

  // Initial values
  initialTitle?: string;
  initialDescription?: string;
  initialLanguage?: string;
  initialSectionsEnabled?: boolean;
  initialCoverUrl?: string;

  // Tag initial values
  initialAge?: string;
  initialLevel?: string;
  initialType?: string;
};

export type CourseEditData = {
  title: string;
  description: string;
  language: string;
  sectionsEnabled: boolean;
  age: string;
  level: string;
  type: string;
};

type ActiveTab = 'basics' | 'tags';

const LANGUAGES = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'ru', label: 'Русский', flag: '🇷🇺' },
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'es', label: 'Español', flag: '🇪🇸' },
];

const AGE_OPTIONS = ['3–5', '6–8', '9–11', '12–14', '15–17', '18+'];
const LEVEL_OPTIONS = ['Beginner', 'Elementary', 'Intermediate', 'Upper-Intermediate', 'Advanced'];
const TYPE_OPTIONS = ['Course', 'Workshop', 'Bootcamp', 'Webinar', 'Self-study'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
        enabled ? 'bg-teal-500' : 'bg-slate-300',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
          enabled ? 'translate-x-4' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  );
}

function SelectField({
  label,
  placeholder,
  value,
  onChange,
  options,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-slate-100 last:border-0">
      <span className="w-28 shrink-0 text-sm font-medium text-slate-700">{label}</span>
      <div className="relative flex-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-9 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditCourseModal({
  open,
  onClose,
  onSave,
  initialTitle = '',
  initialDescription = '',
  initialLanguage = 'en',
  initialSectionsEnabled = false,
  initialCoverUrl,
  initialAge = '',
  initialLevel = '',
  initialType = '',
}: EditCourseModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('basics');
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [language, setLanguage] = useState(initialLanguage);
  const [sectionsEnabled, setSectionsEnabled] = useState(initialSectionsEnabled);
  const [age, setAge] = useState(initialAge);
  const [level, setLevel] = useState(initialLevel);
  const [type, setType] = useState(initialType);
  // True while onSave (API) is in flight — disables actions to avoid double submit
  const [saveInFlight, setSaveInFlight] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  // Sync initial values when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('basics');
      setTitle(initialTitle);
      setDescription(initialDescription);
      setLanguage(initialLanguage);
      setSectionsEnabled(initialSectionsEnabled);
      setAge(initialAge);
      setLevel(initialLevel);
      setType(initialType);
      setSaveInFlight(false);
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [
    open,
    initialTitle,
    initialDescription,
    initialLanguage,
    initialSectionsEnabled,
    initialAge,
    initialLevel,
    initialType,
  ]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = async () => {
    setSaveInFlight(true);
    try {
      await Promise.resolve(
        onSave({ title, description, language, sectionsEnabled, age, level, type }),
      );
      onClose();
    } finally {
      setSaveInFlight(false);
    }
  };

  // Tab sizes: basics is taller, tags is shorter
  const isBasics = activeTab === 'basics';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Редактировать материал"
        className={[
          'fixed z-[60] inset-x-4 mx-auto max-w-lg flex flex-col bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden transition-all duration-200',
          // Vertically center with top offset — basics is taller so sits higher
          isBasics ? 'top-[8vh]' : 'top-[16vh]',
        ].join(' ')}
        style={{ maxHeight: isBasics ? '84vh' : '60vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-bold text-slate-900">Редактировать материал</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex border-b border-slate-200 px-6">
          {(['basics', 'tags'] as const).map((tab) => {
            const label = tab === 'basics' ? 'Основные' : 'Теги';
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'mr-6 pb-2.5 pt-1 text-[13px] font-semibold transition-colors focus:outline-none',
                  active
                    ? 'text-teal-600 border-b-2 border-teal-500 -mb-px'
                    : 'text-slate-400 hover:text-slate-600 border-b-2 border-transparent',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          {activeTab === 'basics' ? (
            <div className="space-y-5">
              {/* Cover */}
              <div className="flex items-center gap-4">
                <span className="w-28 shrink-0 text-sm font-medium text-slate-700">Обложка</span>
                <div className="flex items-center gap-3">
                  {initialCoverUrl ? (
                    <img
                      src={initialCoverUrl}
                      alt="Cover"
                      className="h-10 w-10 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500 text-white font-bold text-lg select-none">
                      {(title[0] ?? 'C').toUpperCase()}
                    </div>
                  )}
                  <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400">
                    <Upload className="h-3.5 w-3.5" />
                    Загрузить
                  </button>
                </div>
              </div>

              {/* Title */}
              <div className="flex items-start gap-4">
                <span className="w-28 shrink-0 pt-2.5 text-sm font-medium text-slate-700">
                  Название
                </span>
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
                  placeholder="Название курса"
                />
              </div>

              {/* Description */}
              <div className="flex items-start gap-4">
                <span className="w-28 shrink-0 pt-2.5 text-sm font-medium text-slate-700">
                  Описание
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all resize-none"
                  placeholder="Введите описание"
                />
              </div>

              {/* Language */}
              <div className="flex items-center gap-4">
                <span className="w-28 shrink-0 text-sm font-medium text-slate-700">Язык</span>
                <div className="relative flex-1">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-9 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.flag} {l.label}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>

              {/* Sections toggle */}
              <div className="flex items-center gap-4">
                <span className="w-28 shrink-0 text-sm font-medium text-slate-700 flex items-center gap-1">
                  Разделы
                  <span
                    title="Группировка уроков по разделам"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-400 cursor-help"
                  >
                    ?
                  </span>
                </span>
                <Toggle enabled={sectionsEnabled} onChange={setSectionsEnabled} />
              </div>

              {/* Delete */}
              <div className="flex items-center gap-4 pt-2">
                {/* <span className="w-28 shrink-0 text-sm font-medium text-slate-700">
                  Удалить материал
                </span>
                <button
                  onClick={handleDelete}
                  className={[
                    'rounded-xl px-5 py-2 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400',
                    showDeleteConfirm
                      ? 'bg-red-700 hover:bg-red-800'
                      : 'bg-red-500 hover:bg-red-600',
                  ].join(' ')}
                >
                  {showDeleteConfirm ? 'Подтвердить удаление' : 'Удалить'}
                </button> */}
              </div>
            </div>
          ) : (
            /* Tags tab */
            <div>
              <SelectField
                label="Возраст"
                placeholder="Выберите возраст"
                value={age}
                onChange={setAge}
                options={AGE_OPTIONS}
              />
              <SelectField
                label="Уровень"
                placeholder="Выберите уровень"
                value={level}
                onChange={setLevel}
                options={LEVEL_OPTIONS}
              />
              <SelectField
                label="Тип"
                placeholder="Выберите тип"
                value={type}
                onChange={setType}
                options={TYPE_OPTIONS}
              />
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            disabled={saveInFlight}
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={saveInFlight}
            onClick={() => void handleSave()}
            className="rounded-xl bg-teal-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-50"
          >
            {saveInFlight ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </>
  );
}