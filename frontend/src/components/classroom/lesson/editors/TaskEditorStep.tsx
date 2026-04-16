/**
 * TaskEditorStep.tsx
 *
 * Local task editor for the teacher classroom builder.
 *
 * Fields (mirrors StudentTask / backend task model)
 * ─────────────────────────────────────────────────
 * • title        — required
 * • type         — picker: manual | writing | practice | reading | listening
 * • instructions — guidance shown to students
 * • content      — body / passage text (used by reading; optional for others)
 * • description  — internal note / short summary
 *
 * The draft shape maps directly to the POST /api/v1/units/:id/tasks body so
 * no transformation is needed when wiring to the real API.
 *
 * API wiring notes (for next step):
 *   onSave(draft) → POST /api/v1/units/:unitId/tasks
 *   Expected body: { title, type, instructions, content, description, unit_id }
 */

import React, { useState, useCallback } from 'react';
import {
  FileText, PenLine, BookOpen, Headphones,
  ClipboardCheck, MessageSquare,
} from 'lucide-react';

// ─── Local draft type ─────────────────────────────────────────────────────────

export const TASK_TYPES = [
  { value: 'manual',    label: 'Written task',     Icon: PenLine,        hint: 'Open-ended teacher-reviewed response.' },
  { value: 'writing',   label: 'Writing',           Icon: FileText,       hint: 'Guided essay or written composition.' },
  { value: 'practice',  label: 'Practice',          Icon: ClipboardCheck, hint: 'Exercises and worked examples.' },
  { value: 'reading',   label: 'Reading',           Icon: BookOpen,       hint: 'Comprehension passage with questions.' },
  { value: 'listening', label: 'Listening',         Icon: Headphones,     hint: 'Audio/video comprehension task.' },
] as const;

export type TaskType = (typeof TASK_TYPES)[number]['value'];

export interface TaskDraft {
  title:        string;
  type:         TaskType;
  instructions: string;
  content:      string;
  description:  string;
}

export const EMPTY_TASK_DRAFT: TaskDraft = {
  title:        '',
  type:         'manual',
  instructions: '',
  content:      '',
  description:  '',
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TaskEditorStepProps {
  draft?:    TaskDraft;
  onChange?: (draft: TaskDraft) => void;
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function FieldLabel({ children, htmlFor, optional }: {
  children: React.ReactNode; htmlFor?: string; optional?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 mb-1.5"
    >
      {children}
      {optional && (
        <span className="normal-case font-normal text-slate-300 text-[11px]">optional</span>
      )}
    </label>
  );
}

function TextInput({
  id, value, onChange, placeholder,
}: {
  id?: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[
        'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5',
        'text-[14px] text-slate-800 placeholder-slate-300',
        'focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100',
        'transition-colors',
      ].join(' ')}
    />
  );
}

function TextArea({
  id, value, onChange, placeholder, rows = 4,
}: {
  id?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={[
        'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5',
        'text-[14px] text-slate-800 placeholder-slate-300 resize-none',
        'focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100',
        'transition-colors',
      ].join(' ')}
    />
  );
}

// ─── Task type selector ───────────────────────────────────────────────────────

function TaskTypePicker({
  value,
  onChange,
}: {
  value: TaskType;
  onChange: (v: TaskType) => void;
}) {
  return (
    <div>
      <FieldLabel>Task type</FieldLabel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TASK_TYPES.map(({ value: v, label, Icon, hint }) => {
          const active = v === value;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={[
                'group flex flex-col items-start rounded-xl border px-3.5 py-3 text-left',
                'transition-all duration-150 focus:outline-none focus-visible:ring-2',
                'focus-visible:ring-amber-400',
                active
                  ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200'
                  : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40',
              ].join(' ')}
              title={hint}
            >
              <span className={[
                'mb-2 flex h-7 w-7 items-center justify-center rounded-lg',
                active ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400 group-hover:bg-amber-50 group-hover:text-amber-500',
              ].join(' ')}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className={[
                'text-[13px] font-semibold leading-snug',
                active ? 'text-amber-800' : 'text-slate-700',
              ].join(' ')}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Content hint by type ─────────────────────────────────────────────────────

function ContentHint({ type }: { type: TaskType }) {
  const hints: Record<TaskType, string> = {
    manual:    'Instructions are shown directly to students. Keep them clear and specific.',
    writing:   'Provide a writing prompt or topic. Students submit a written response.',
    practice:  'Describe the exercises or worked examples students should complete.',
    reading:   'Paste the reading passage in the Content field below.',
    listening: 'Link a video or audio clip in the Content field. Add comprehension questions in Instructions.',
  };
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
      <p className="text-[12px] leading-relaxed text-amber-700">{hints[type]}</p>
    </div>
  );
}

// ─── Preview card ─────────────────────────────────────────────────────────────

function TaskPreviewCard({ draft }: { draft: TaskDraft }) {
  const typeLabel = TASK_TYPES.find((t) => t.value === draft.type)?.label ?? draft.type;
  const isEmpty   = !draft.title && !draft.instructions && !draft.content;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="h-[3px] w-full bg-gradient-to-r from-amber-500 to-amber-400" />
      <div className="px-5 pt-4 pb-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-600">
          <FileText className="h-3 w-3" />
          {typeLabel}
        </span>
      </div>
      <div className="px-5 pb-5">
        {isEmpty ? (
          <p className="text-sm italic text-slate-300 py-6 text-center">
            Preview appears here as you fill in the fields.
          </p>
        ) : (
          <div className="space-y-3">
            {draft.title && (
              <h3 className="text-[17px] font-bold text-slate-900 leading-snug">
                {draft.title}
              </h3>
            )}
            {draft.description && (
              <p className="text-[13px] text-slate-500">{draft.description}</p>
            )}
            {draft.content && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Content</p>
                <p className="text-[14px] leading-relaxed text-slate-700 whitespace-pre-wrap line-clamp-6">
                  {draft.content}
                </p>
              </div>
            )}
            {draft.instructions && (
              <div className="rounded-xl bg-amber-50/60 border border-amber-100 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-500 mb-2">Instructions</p>
                <p className="text-[14px] leading-relaxed text-slate-700 whitespace-pre-wrap line-clamp-4">
                  {draft.instructions}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TaskEditorStep({
  draft: initialDraft,
  onChange,
}: TaskEditorStepProps) {
  const [draft, setDraft] = useState<TaskDraft>(initialDraft ?? { ...EMPTY_TASK_DRAFT });

  const update = useCallback(<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  const showContent = draft.type === 'reading' || draft.type === 'listening';

  return (
    <div className="flex flex-col gap-5">

      <p className="text-[12px] text-slate-400">
        Configure the task below. Students will see the instructions and complete their response inline.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* ── Left: form ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* Title */}
          <div>
            <FieldLabel htmlFor="task-title">Title</FieldLabel>
            <TextInput
              id="task-title"
              value={draft.title}
              onChange={(v) => update('title', v)}
              placeholder="e.g. Comprehension questions"
            />
          </div>

          {/* Type picker */}
          <TaskTypePicker value={draft.type} onChange={(v) => update('type', v)} />

          {/* Type hint */}
          <ContentHint type={draft.type} />

          {/* Content / passage (reading + listening) */}
          {showContent && (
            <div>
              <FieldLabel htmlFor="task-content">
                {draft.type === 'reading' ? 'Reading passage' : 'Content / resource'}
              </FieldLabel>
              <TextArea
                id="task-content"
                value={draft.content}
                onChange={(v) => update('content', v)}
                placeholder={
                  draft.type === 'reading'
                    ? 'Paste the reading passage here…'
                    : 'Link or description of the listening resource…'
                }
                rows={6}
              />
            </div>
          )}

          {/* Instructions */}
          <div>
            <FieldLabel htmlFor="task-instructions">
              Instructions <span className="normal-case font-normal text-slate-300 text-[11px]">shown to students</span>
            </FieldLabel>
            <TextArea
              id="task-instructions"
              value={draft.instructions}
              onChange={(v) => update('instructions', v)}
              placeholder="e.g. Answer the following questions in full sentences."
              rows={4}
            />
          </div>

          {/* Description */}
          <div>
            <FieldLabel htmlFor="task-description" optional>Internal note</FieldLabel>
            <TextInput
              id="task-description"
              value={draft.description}
              onChange={(v) => update('description', v)}
              placeholder="Short summary visible only to you"
            />
          </div>

        </div>

        {/* ── Right: preview ─────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-2">
            Preview
          </p>
          <TaskPreviewCard draft={draft} />
        </div>

      </div>
    </div>
  );
}