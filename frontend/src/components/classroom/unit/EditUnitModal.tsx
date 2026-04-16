/**
 * EditUnitModal.tsx
 *
 * A three-tab modal for editing unit (lesson) settings.
 *
 * Tab "Основные"   — cover, title, description, delete.
 * Tab "Оформление" — reactions toggle, background toggle.
 * Tab "Теги"       — age, level, type, skills, time dropdowns + grammar/vocabulary/functions/other tag inputs.
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Plus } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UnitEditData = {
  title: string;
  description: string;
  reactionsEnabled: boolean;
  backgroundEnabled: boolean;
  age: string;
  level: string;
  type: string;
  skills: string;
  time: string;
  grammar: string[];
  vocabulary: string[];
  functions: string[];
  other: string[];
};

export type EditUnitModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: UnitEditData) => void;
  onDelete?: () => void;

  // Initial values
  initialTitle?: string;
  initialDescription?: string;
  initialCoverUrl?: string;
  initialReactionsEnabled?: boolean;
  initialBackgroundEnabled?: boolean;
  initialAge?: string;
  initialLevel?: string;
  initialType?: string;
  initialSkills?: string;
  initialTime?: string;
  initialGrammar?: string[];
  initialVocabulary?: string[];
  initialFunctions?: string[];
  initialOther?: string[];
};

type ActiveTab = 'basics' | 'design' | 'tags';

// ─── Options ──────────────────────────────────────────────────────────────────

const AGE_OPTIONS    = ['3–5', '6–8', '9–11', '12–14', '15–17', '18+'];
const LEVEL_OPTIONS  = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TYPE_OPTIONS   = ['Урок', 'Тест', 'Практика', 'Проект', 'Вебинар'];
const SKILLS_OPTIONS = ['Чтение', 'Письмо', 'Аудирование', 'Говорение'];
const TIME_OPTIONS   = ['15 мин', '30 мин', '45 мин', '60 мин', '90 мин'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
        enabled ? 'bg-teal-500' : 'bg-slate-300',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
          enabled ? 'translate-x-6' : 'translate-x-1',
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
    <div className="flex items-center gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="w-24 shrink-0 text-sm font-semibold text-slate-700">{label}</span>
      <div className="relative flex-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-9 text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
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

function TagInputField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [inputVal, setInputVal] = useState('');

  const handleAdd = () => {
    const trimmed = inputVal.trim();
    if (!trimmed) return;
    onChange([...values, trimmed]);
    setInputVal('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  };

  return (
    <div className="flex items-start gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="w-24 shrink-0 pt-2.5 text-sm font-semibold text-slate-700">{label}</span>
      <div className="flex-1 space-y-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите название"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
          />
          <button
            onClick={handleAdd}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400 text-white hover:bg-teal-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 shrink-0"
            aria-label={`Add ${label}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {values.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {values.map((v, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 border border-teal-200"
              >
                {v}
                <button
                  onClick={() => onChange(values.filter((_, j) => j !== i))}
                  className="ml-0.5 text-teal-400 hover:text-teal-600 transition-colors"
                  aria-label={`Remove ${v}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditUnitModal({
  open,
  onClose,
  onSave,
  onDelete,
  initialTitle = '',
  initialDescription = '',
  initialCoverUrl,
  initialReactionsEnabled = false,
  initialBackgroundEnabled = false,
  initialAge = '',
  initialLevel = '',
  initialType = '',
  initialSkills = '',
  initialTime = '',
  initialGrammar = [],
  initialVocabulary = [],
  initialFunctions = [],
  initialOther = [],
}: EditUnitModalProps) {
  const [activeTab, setActiveTab]           = useState<ActiveTab>('basics');
  const [title, setTitle]                   = useState(initialTitle);
  const [description, setDescription]       = useState(initialDescription);
  const [reactionsEnabled, setReactions]    = useState(initialReactionsEnabled);
  const [backgroundEnabled, setBackground]  = useState(initialBackgroundEnabled);
  const [age, setAge]                       = useState(initialAge);
  const [level, setLevel]                   = useState(initialLevel);
  const [type, setType]                     = useState(initialType);
  const [skills, setSkills]                 = useState(initialSkills);
  const [time, setTime]                     = useState(initialTime);
  const [grammar, setGrammar]               = useState<string[]>(initialGrammar);
  const [vocabulary, setVocabulary]         = useState<string[]>(initialVocabulary);
  const [functions, setFunctions]           = useState<string[]>(initialFunctions);
  const [other, setOther]                   = useState<string[]>(initialOther);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  // Sync initial values when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('basics');
      setTitle(initialTitle);
      setDescription(initialDescription);
      setReactions(initialReactionsEnabled);
      setBackground(initialBackgroundEnabled);
      setAge(initialAge);
      setLevel(initialLevel);
      setType(initialType);
      setSkills(initialSkills);
      setTime(initialTime);
      setGrammar(initialGrammar);
      setVocabulary(initialVocabulary);
      setFunctions(initialFunctions);
      setOther(initialOther);
      setShowDeleteConfirm(false);
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    onSave({
      title, description,
      reactionsEnabled, backgroundEnabled,
      age, level, type, skills, time,
      grammar, vocabulary, functions, other,
    });
    onClose();
  };

  const handleDelete = () => {
    if (showDeleteConfirm) { onDelete?.(); onClose(); }
    else setShowDeleteConfirm(true);
  };

  const TABS: { id: ActiveTab; label: string }[] = [
    { id: 'basics', label: 'Основные' },
    { id: 'design', label: 'Оформление' },
    { id: 'tags',   label: 'Теги' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Редактировать урок"
        className="fixed z-[70] inset-x-4 top-[8vh] mx-auto max-w-lg flex flex-col bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden"
        style={{ maxHeight: '84vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-bold text-slate-900">Редактировать урок</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="flex border-b border-slate-200 px-6">
          {TABS.map(({ id, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
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
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">

          {/* ── Tab: Основные ──────────────────────────────────────────── */}
          {activeTab === 'basics' && (
            <div className="space-y-5">
              {/* Cover */}
              <div className="flex items-center gap-4">
                <span className="w-24 shrink-0 text-sm font-semibold text-slate-700">Обложка</span>
                <div className="flex items-center gap-3">
                  {initialCoverUrl ? (
                    <img
                      src={initialCoverUrl}
                      alt="Cover"
                      className="h-10 w-10 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400 text-white font-bold text-lg select-none">
                      {(title[0] ?? 'L').toUpperCase()}
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
                <span className="w-24 shrink-0 pt-2.5 text-sm font-semibold text-slate-700">Название</span>
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
                  placeholder="Название урока"
                />
              </div>

              {/* Description */}
              <div className="flex items-start gap-4">
                <span className="w-24 shrink-0 pt-2.5 text-sm font-semibold text-slate-700">Описание</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all resize-none"
                  placeholder="Введите описание"
                />
              </div>

              {/* Delete */}
              <div className="flex items-center gap-4 pt-2">
                <span className="w-24 shrink-0 text-sm font-semibold text-slate-700">Удалить курс</span>
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
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Оформление ────────────────────────────────────────── */}
          {activeTab === 'design' && (
            <div className="space-y-1">
              {/* Reactions on answers */}
              <div className="flex items-center justify-between py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">Реакции на ответы</span>
                  <span
                    title="Показывать анимированные реакции после ответов"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-400 cursor-help"
                  >
                    ?
                  </span>
                </div>
                <Toggle enabled={reactionsEnabled} onChange={setReactions} />
              </div>

              {/* Background in lesson */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">Фон в уроке</span>
                  <span
                    title="Отображать декоративный фон в уроке"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-400 cursor-help"
                  >
                    ?
                  </span>
                </div>
                <Toggle enabled={backgroundEnabled} onChange={setBackground} />
              </div>
            </div>
          )}

          {/* ── Tab: Теги ──────────────────────────────────────────────── */}
          {activeTab === 'tags' && (
            <div>
              <SelectField label="Возраст"  placeholder="Выберите возраст"  value={age}    onChange={setAge}    options={AGE_OPTIONS} />
              <SelectField label="Уровень"  placeholder="Выберите уровень"  value={level}  onChange={setLevel}  options={LEVEL_OPTIONS} />
              <SelectField label="Тип"      placeholder="Выберите тип"      value={type}   onChange={setType}   options={TYPE_OPTIONS} />
              <SelectField label="Навыки"   placeholder="Выберите навык"    value={skills} onChange={setSkills} options={SKILLS_OPTIONS} />
              <SelectField label="Время"    placeholder="Выберите время"    value={time}   onChange={setTime}   options={TIME_OPTIONS} />
              <TagInputField label="Грамматика" values={grammar}    onChange={setGrammar} />
              <TagInputField label="Лексика"    values={vocabulary} onChange={setVocabulary} />
              <TagInputField label="Функции"    values={functions}  onChange={setFunctions} />
              <TagInputField label="Другое"     values={other}      onChange={setOther} />
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="rounded-xl bg-teal-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            Сохранить
          </button>
        </div>
      </div>
    </>
  );
}