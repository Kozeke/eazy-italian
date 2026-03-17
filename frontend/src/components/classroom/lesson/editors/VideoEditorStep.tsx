/**
 * VideoEditorStep.tsx
 *
 * Local video editor for the teacher classroom builder.
 *
 * Fields
 * ──────
 * • title       — displayed above the player (mirrors StudentVideo.title)
 * • description — shown below title (mirrors StudentVideo.description)
 * • url         — YouTube / Vimeo / direct URL (auto-detected)
 *
 * Live preview
 * ────────────
 * Constructs a minimal StudentVideo object from the draft and renders
 * VideoStep directly — the teacher sees the exact embed frame the student
 * will see, including the YouTube/Vimeo iframe or the native player.
 *
 * API wiring notes (for next step):
 *   onSave(draft) → POST /api/v1/units/:unitId/videos  (or similar endpoint)
 *   Payload maps 1-to-1:  { title, description, url, provider (auto) }
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Link2, Eye, EyeOff, PlayCircle, Info } from 'lucide-react';
import VideoStep from '../VideoStep';
import type { StudentVideo } from '../flow/lessonFlow.types';

// ─── Local draft type ─────────────────────────────────────────────────────────

export interface VideoDraft {
  title:       string;
  description: string;
  url:         string;
}

export const EMPTY_VIDEO_DRAFT: VideoDraft = {
  title:       '',
  description: '',
  url:         '',
};

// ─── Provider detection helper ────────────────────────────────────────────────

function detectProvider(url: string): 'youtube' | 'vimeo' | 'direct' | undefined {
  if (!url) return undefined;
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('vimeo.com'))                               return 'vimeo';
  if (u.startsWith('http'))                                  return 'direct';
  return undefined;
}

function ProviderBadge({ provider }: { provider: ReturnType<typeof detectProvider> }) {
  if (!provider) return null;
  const map: Record<string, { label: string; cls: string }> = {
    youtube: { label: 'YouTube',  cls: 'bg-red-50 text-red-600 border-red-100' },
    vimeo:   { label: 'Vimeo',    cls: 'bg-sky-50 text-sky-600 border-sky-100' },
    direct:  { label: 'Direct',   cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  };
  const { label, cls } = map[provider];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      <PlayCircle className="h-3 w-3" />
      {label}
    </span>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 mb-1.5"
    >
      {children}
    </label>
  );
}

function TextInput({
  id, value, onChange, placeholder, type = 'text',
}: {
  id?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[
        'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5',
        'text-[14px] text-slate-800 placeholder-slate-300',
        'focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100',
        'transition-colors',
      ].join(' ')}
    />
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface VideoEditorStepProps {
  draft?:    VideoDraft;
  onChange?: (draft: VideoDraft) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VideoEditorStep({
  draft: initialDraft,
  onChange,
}: VideoEditorStepProps) {
  const [draft, setDraft] = useState<VideoDraft>(initialDraft ?? { ...EMPTY_VIDEO_DRAFT });
  const [showPreview, setShowPreview] = useState(true);

  const update = useCallback(<K extends keyof VideoDraft>(key: K, value: VideoDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  const provider = detectProvider(draft.url);

  // Build a StudentVideo from draft — the exact shape VideoStep expects
  const previewVideo = useMemo<StudentVideo | undefined>(() => {
    if (!draft.url.trim()) return undefined;
    return {
      id:          'preview',
      title:       draft.title || 'Untitled video',
      description: draft.description || undefined,
      url:         draft.url.trim(),
      provider,
    };
  }, [draft, provider]);

  return (
    <div className="flex flex-col gap-5">

      {/* ── Preview toggle ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-slate-400">
          Paste a YouTube, Vimeo, or direct video URL to embed it.
        </p>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 hover:text-slate-700 transition-colors focus:outline-none"
        >
          {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showPreview ? 'Hide preview' : 'Show preview'}
        </button>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className={[
        'grid gap-6',
        showPreview ? 'lg:grid-cols-2' : 'grid-cols-1',
      ].join(' ')}>

        {/* ── Left: form ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* URL — primary field */}
          <div>
            <FieldLabel htmlFor="video-url">Video URL</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-300">
                <Link2 className="h-4 w-4" />
              </span>
              <input
                id="video-url"
                type="url"
                value={draft.url}
                onChange={(e) => update('url', e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className={[
                  'w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 py-2.5',
                  'text-[14px] text-slate-800 placeholder-slate-300',
                  'focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100',
                  'transition-colors',
                ].join(' ')}
              />
            </div>
            {/* Provider badge */}
            {provider && (
              <div className="mt-2 flex items-center gap-2">
                <ProviderBadge provider={provider} />
                <span className="text-[11px] text-slate-400">detected</span>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <FieldLabel htmlFor="video-title">Title</FieldLabel>
            <TextInput
              id="video-title"
              value={draft.title}
              onChange={(v) => update('title', v)}
              placeholder="e.g. Introduction to Newton's Laws"
            />
          </div>

          {/* Description */}
          <div>
            <FieldLabel htmlFor="video-desc">Description (optional)</FieldLabel>
            <textarea
              id="video-desc"
              value={draft.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Short context for students before they watch…"
              rows={3}
              className={[
                'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5',
                'text-[14px] text-slate-800 placeholder-slate-300 resize-none',
                'focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100',
                'transition-colors',
              ].join(' ')}
            />
          </div>

          {/* Hint */}
          <div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <p className="text-[12px] leading-relaxed text-slate-500">
              Students will see a "Mark as watched" button for YouTube and Vimeo videos.
              Native video files (.mp4) support automatic progress tracking.
            </p>
          </div>

        </div>

        {/* ── Right: live preview ───────────────────────────────────────── */}
        {showPreview && (
          <div className="lg:sticky lg:top-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Preview
            </p>

            {previewVideo ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {/* Reuse VideoStep directly — teacher sees exactly what students see */}
                <VideoStep
                  video={previewVideo}
                  hideContinueCta
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-sky-100 bg-sky-50/60 py-12">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-400">
                  <PlayCircle className="h-6 w-6" />
                </div>
                <p className="text-[13px] font-medium text-sky-600">
                  Paste a URL to see the preview
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}