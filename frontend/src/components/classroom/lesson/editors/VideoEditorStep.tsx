/**
 * VideoEditorStep.tsx  (v2 — slide-shell parity)
 *
 * Redesigned to render inside the same PlayerFrame / PlayerHeader shell that
 * slide creation uses.  The editor is no longer a standalone form page — it
 * is a single "video slide" card with:
 *
 *   • Editable title input   — top of card
 *   • Video preview area     — centre (thumbnail when URL known, placeholder otherwise)
 *   • URL input              — overlaid/below preview
 *   • Description textarea   — bottom of card
 *
 * URL → thumbnail extraction
 * ──────────────────────────
 * YouTube:  https://img.youtube.com/vi/<VIDEO_ID>/hqdefault.jpg
 * Vimeo:    fetches https://vimeo.com/api/oembed.json?url=<url>&fields=thumbnail_url
 *           (fire-and-forget; shows placeholder on failure)
 *
 * This component is a controlled form element only — it owns no network calls
 * beyond the thumbnail fetch.  Save / back buttons live in the shell.
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { Link2, PlayCircle, Video } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Provider / ID detection ──────────────────────────────────────────────────

export type VideoProvider = 'youtube' | 'vimeo' | 'direct' | undefined;

export function detectProvider(url: string): VideoProvider {
  if (!url) return undefined;
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('vimeo.com'))                               return 'vimeo';
  if (u.startsWith('http'))                                  return 'direct';
  return undefined;
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    // Standard watch URL
    if (u.searchParams.has('v')) return u.searchParams.get('v');
    // Shortened youtu.be/ID
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    // embed/ID or shorts/ID
    const m = u.pathname.match(/\/(embed|shorts|v)\/([^/?&#]+)/);
    if (m) return m[2];
  } catch { /* invalid url */ }
  return null;
}

function youTubeThumbnail(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface VideoEditorStepProps {
  /** Current draft (controlled). */
  draft?:    VideoDraft;
  /** Called on every change so parent can persist state. */
  onChange?: (draft: VideoDraft) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VideoEditorStep({
  draft:    externalDraft,
  onChange,
}: VideoEditorStepProps) {

  const [draft, setDraft] = useState<VideoDraft>(
    externalDraft ?? { ...EMPTY_VIDEO_DRAFT },
  );

  // Keep in sync when parent supplies a new initialValue (e.g. existing video loaded).
  const lastExternalRef = useRef<VideoDraft | undefined>(externalDraft);
  useEffect(() => {
    if (externalDraft && externalDraft !== lastExternalRef.current) {
      lastExternalRef.current = externalDraft;
      setDraft(externalDraft);
    }
  }, [externalDraft]);

  const update = useCallback(
    <K extends keyof VideoDraft>(key: K, value: VideoDraft[K]) => {
      setDraft((prev) => {
        const next = { ...prev, [key]: value };
        onChange?.(next);
        return next;
      });
    },
    [onChange],
  );

  const provider   = detectProvider(draft.url);
  const ytThumb    = provider === 'youtube' ? youTubeThumbnail(draft.url) : null;

  // Vimeo thumbnail (async)
  const [vimeoThumb, setVimeoThumb] = useState<string | null>(null);
  const vimeoFetchRef = useRef<string>('');
  useEffect(() => {
    if (provider !== 'vimeo' || !draft.url) {
      setVimeoThumb(null);
      return;
    }
    if (vimeoFetchRef.current === draft.url) return;
    vimeoFetchRef.current = draft.url;

    let cancelled = false;
    fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(draft.url)}&fields=thumbnail_url`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.thumbnail_url) setVimeoThumb(data.thumbnail_url);
      })
      .catch(() => { /* ignore — thumbnail remains null */ });
    return () => { cancelled = true; };
  }, [provider, draft.url]);

  const thumbnailUrl = ytThumb ?? vimeoThumb ?? null;
  const hasUrl       = draft.url.trim().length > 0;

  return (
    <div className="flex flex-col h-full gap-0">

      {/* ── Title input ───────────────────────────────────────────────────── */}
      <div className="px-1 pb-3">
        <input
          type="text"
          value={draft.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="Video title…"
          aria-label="Video title"
          className={[
            'w-full rounded-xl border-0 border-b-2 border-slate-100 bg-transparent',
            'px-0 py-1 text-[22px] font-bold tracking-tight text-slate-800 placeholder-slate-300',
            'focus:border-sky-400 focus:outline-none transition-colors duration-150',
          ].join(' ')}
        />
      </div>

      {/* ── Preview / URL area ────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex flex-col">

        {/* Thumbnail backdrop */}
        {thumbnailUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${thumbnailUrl})` }}
            aria-hidden
          >
            {/* Gradient vignette for legibility */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
            <Video className="h-14 w-14 opacity-30" />
            {!hasUrl && (
              <p className="text-[13px] text-slate-400">
                Paste a URL below to see the preview
              </p>
            )}
          </div>
        )}

        {/* Play overlay (visual only) */}
        {thumbnailUrl && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/30 backdrop-blur-sm ring-2 ring-white/50">
              <PlayCircle className="h-8 w-8 text-white drop-shadow" />
            </div>
          </div>
        )}

        {/* Provider chip */}
        {provider && (
          <div className="absolute top-3 left-3 z-10">
            <ProviderChip provider={provider} />
          </div>
        )}

        {/* URL input — pinned to bottom of preview area */}
        <div className="relative z-10 mt-auto p-3">
          <div className="flex items-center gap-2 rounded-xl bg-white/90 px-3 py-2 shadow-sm ring-1 ring-black/10 backdrop-blur">
            <Link2 className={[
              'h-4 w-4 shrink-0 transition-colors',
              hasUrl ? 'text-sky-500' : 'text-slate-300',
            ].join(' ')} />
            <input
              type="url"
              value={draft.url}
              onChange={(e) => {
                update('url', e.target.value);
                // Reset vimeo thumb on url change
                if (vimeoFetchRef.current !== e.target.value) {
                  setVimeoThumb(null);
                }
              }}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label="Video URL"
              spellCheck={false}
              className={[
                'flex-1 bg-transparent text-[13px] text-slate-800 placeholder-slate-400',
                'focus:outline-none min-w-0',
              ].join(' ')}
            />
          </div>
        </div>
      </div>

      {/* ── Description textarea ──────────────────────────────────────────── */}
      <div className="pt-3 px-1">
        <textarea
          value={draft.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="Add a description for students…"
          rows={3}
          aria-label="Video description"
          className={[
            'w-full resize-none rounded-xl border border-slate-100 bg-transparent',
            'px-0 py-1 text-[14px] leading-relaxed text-slate-600 placeholder-slate-300',
            'focus:border-sky-300 focus:outline-none transition-colors duration-150',
          ].join(' ')}
        />
      </div>

    </div>
  );
}

// ─── ProviderChip ─────────────────────────────────────────────────────────────

const PROVIDER_STYLES: Record<
  NonNullable<VideoProvider>,
  { label: string; cls: string }
> = {
  youtube: { label: 'YouTube', cls: 'bg-red-600/90 text-white' },
  vimeo:   { label: 'Vimeo',   cls: 'bg-sky-600/90  text-white' },
  direct:  { label: 'Video',   cls: 'bg-slate-700/80 text-white' },
};

function ProviderChip({ provider }: { provider: NonNullable<VideoProvider> }) {
  const { label, cls } = PROVIDER_STYLES[provider];
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5',
        'text-[11px] font-bold tracking-wide backdrop-blur-sm',
        cls,
      ].join(' ')}
    >
      <PlayCircle className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}