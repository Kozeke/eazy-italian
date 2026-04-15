/**
 * CreateUnitModal.tsx
 *
 * A three-tab modal for creating a new unit (lesson).
 *
 * Tab "Основные"   — cover avatar, title, description.
 * Tab "Материалы"  — drag-and-drop file upload zone + uploaded file list.
 * Tab "Теги"       — age, level, type, skills, time dropdowns + tag inputs.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, Plus, UploadCloud } from 'lucide-react';
import { type UnitEditData } from './EditUnitModal';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateUnitData = {
  title: string;
  description: string;
  files: File[];
  // tag fields (mirrors UnitEditData minus the display toggles)
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

export type CreateUnitModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (data: CreateUnitData) => void;
};

type ActiveTab = 'basics' | 'materials' | 'tags';

// ─── Options ──────────────────────────────────────────────────────────────────

const AGE_OPTIONS    = ['3–5', '6–8', '9–11', '12–14', '15–17', '18+'];
const LEVEL_OPTIONS  = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TYPE_OPTIONS   = ['Урок', 'Тест', 'Практика', 'Проект', 'Вебинар'];
const SKILLS_OPTIONS = ['Чтение', 'Письмо', 'Аудирование', 'Говорение'];
const TIME_OPTIONS   = ['15 мин', '30 мин', '45 мин', '60 мин', '90 мин'];

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'basics',    label: 'Основные' },
  { id: 'materials', label: 'Материалы' },
  { id: 'tags',      label: 'Теги' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateUnitModal({ open, onClose, onCreate }: CreateUnitModalProps) {
  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('basics');

  // ── Basics tab state ───────────────────────────────────────────────────────
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');

  // ── Materials tab state ────────────────────────────────────────────────────
  const [files, setFiles]       = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef              = useRef<HTMLInputElement>(null);

  // ── Tags tab state ─────────────────────────────────────────────────────────
  const [age, setAge]           = useState('');
  const [level, setLevel]       = useState('');
  const [type, setType]         = useState('');
  const [skills, setSkills]     = useState('');
  const [time, setTime]         = useState('');
  const [grammar, setGrammar]   = useState<string[]>([]);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [functions, setFunctions]   = useState<string[]>([]);
  const [other, setOther]           = useState<string[]>([]);

  const titleRef = useRef<HTMLInputElement>(null);

  // Reset all state when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('basics');
      setTitle('');
      setDescription('');
      setFiles([]);
      setIsDragging(false);
      setAge(''); setLevel(''); setType(''); setSkills(''); setTime('');
      setGrammar([]); setVocabulary([]); setFunctions([]); setOther([]);
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [open]);

  // Escape key handling
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // ── File helpers ───────────────────────────────────────────────────────────
  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const newFiles = Array.from(incoming);
    setFiles((prev) => {
      // Deduplicate by name+size
      const existingKeys = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const filtered = newFiles.filter((f) => !existingKeys.has(`${f.name}:${f.size}`));
      return [...prev, ...filtered];
    });
  }, []);

  const handleDropZoneClick = () => fileInputRef.current?.click();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleCreate = () => {
    onCreate({
      title,
      description,
      files,
      age, level, type, skills, time,
      grammar, vocabulary, functions, other,
    });
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop — sits above the UnitSelectorModal (z-60) but below us (z-[70]) */}
      <div
        className="fixed inset-0 z-[65] bg-slate-900/30 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Создать урок"
        className="fixed z-[70] inset-x-4 top-[8vh] mx-auto max-w-lg flex flex-col bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden"
        style={{ maxHeight: '84vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-bold text-slate-900">Создать урок</h2>
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400 text-white font-bold text-lg select-none">
                    {(title[0] ?? 'Л').toUpperCase()}
                  </div>
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
                  placeholder="Введите название"
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
            </div>
          )}

          {/* ── Tab: Материалы ─────────────────────────────────────────── */}
          {activeTab === 'materials' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload files"
                onClick={handleDropZoneClick}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDropZoneClick(); }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={[
                  'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                  isDragging
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-slate-200 bg-slate-50 hover:border-teal-300 hover:bg-teal-50/50',
                ].join(' ')}
              >
                <div className={[
                  'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                  isDragging ? 'bg-teal-100 text-teal-500' : 'bg-slate-100 text-slate-400',
                ].join(' ')}>
                  <UploadCloud className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    Перетащите файлы или нажмите для загрузки
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Любые типы файлов
                  </p>
                </div>
                {/* Hidden real file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => addFiles(e.target.files)}
                  // Reset the input value so the same file can be re-added after removal
                  onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}:${file.size}:${index}`}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                    >
                      {/* File type badge */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                        <span className="text-[10px] font-bold uppercase leading-none">
                          {file.name.split('.').pop()?.slice(0, 3) ?? 'file'}
                        </span>
                      </div>

                      {/* Name + size */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                        <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => removeFile(index)}
                        className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
            onClick={handleCreate}
            className="rounded-xl bg-teal-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            Создать
          </button>
        </div>
      </div>
    </>
  );
}