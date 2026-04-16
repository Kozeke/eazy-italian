/**
 * VideoStep.tsx  — Immersive Video Step for the Lesson Flow
 *
 * Design goals (consistent with SlideStep philosophy):
 *   • The video player is the visual hero — full-width, rounded, no extra chrome.
 *   • A sky-blue accent palette distinguishes video from slides (teal),
 *     tasks (amber) and tests (emerald).
 *   • Three embed strategies, auto-detected from the URL:
 *       1. YouTube  → <iframe> with youtube-nocookie embed
 *       2. Vimeo    → <iframe> with player.vimeo.com embed
 *       3. Direct   → <video> element with native controls + onTimeUpdate tracking
 *   • Completion is triggered at the COMPLETION_THRESHOLD (default 80 %).
 *     For iframe embeds we cannot track playback directly, so a "Mark as watched"
 *     button lets the student signal completion manually.
 *   • VideoProgress (watchedFraction, completed) is emitted via onProgressChange.
 *   • A ContinueCta strip identical to SlideStep's appears once the video is
 *     marked complete.
 *   • Locked prop shows a frosted overlay (live classroom mode compatibility).
 *   • If `video` is undefined the component renders a graceful placeholder
 *     instead of crashing — safe for the pre-backend period.
 *
 * TODO(backend): Remove the placeholder branch once the API delivers video data.
 */

import {
  useState, useCallback, useRef, useEffect,
} from 'react';
import {
  Play, CheckCircle2, ArrowRight, Lock,
  Video, Clock, ExternalLink, PlayCircle,
} from 'lucide-react';
import type { StudentVideo, VideoProgress } from './flow/lessonFlow.types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Fraction of native video that must be watched to auto-complete */
const COMPLETION_THRESHOLD = 0.80;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type EmbedStrategy = 'youtube' | 'vimeo' | 'direct' | 'unknown';

function detectStrategy(video?: StudentVideo): EmbedStrategy {
  if (!video?.url) return 'unknown';

  if (video.provider) {
    if (video.provider === 'youtube') return 'youtube';
    if (video.provider === 'vimeo')   return 'vimeo';
    if (video.provider === 'direct')  return 'direct';
  }

  const url = video.url.toLowerCase();
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('vimeo.com'))                                 return 'vimeo';
  return 'direct';
}

function buildYouTubeEmbed(url: string): string {
  // Extract video ID from both full and short URLs
  const full  = url.match(/[?&]v=([^&]+)/);
  const short = url.match(/youtu\.be\/([^?]+)/);
  const id    = (full?.[1] ?? short?.[1])?.split('&')[0];
  if (!id) return url;
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&color=white`;
}

function buildVimeoEmbed(url: string): string {
  const match = url.match(/vimeo\.com\/(\d+)/);
  const id    = match?.[1];
  if (!id) return url;
  return `https://player.vimeo.com/video/${id}?color=0ea5e9&title=0&byline=0&portrait=0`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface VideoStepProps {
  video?:            StudentVideo;
  onProgressChange?: (p: VideoProgress) => void;
  nextStepLabel?:    string;
  onContinue?:       () => void;
  hideContinueCta?:  boolean;
  locked?:           boolean;
}

// ─── Placeholder (no video source yet) ───────────────────────────────────────

function VideoPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-sky-100 bg-sky-50/60 py-14">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-400">
        <Video className="h-6 w-6" />
      </div>
      <div className="space-y-1 text-center">
        <p className="text-[14px] font-semibold text-sky-700">Video coming soon</p>
        <p className="text-[12px] text-sky-500">
          {/* TODO(backend): Remove once video URL is provided by the API */}
          Your teacher hasn't uploaded a video for this step yet.
        </p>
      </div>
    </div>
  );
}

// ─── YouTube / Vimeo iframe embed ─────────────────────────────────────────────

interface IframePlayerProps {
  src:          string;
  title:        string;
  thumbnail?:   string;
  onWatched:    () => void;
  watched:      boolean;
  locked:       boolean;
}

function IframePlayer({ src, title, thumbnail, onWatched, watched, locked }: IframePlayerProps) {
  const [started, setStarted] = useState(false);

  return (
    <div className="space-y-4">
      {/* Aspect-ratio box */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 shadow-lg"
           style={{ aspectRatio: '16/9' }}>

        {/* Locked overlay */}
        {locked && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[2px]">
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-500">
              <Lock className="h-3.5 w-3.5" />
              Controlled by your teacher
            </div>
          </div>
        )}

        {/* Pre-load thumbnail splash (optional) */}
        {!started && thumbnail && (
          <div className="absolute inset-0 z-10">
            <img
              src={thumbnail}
              alt={title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <button
                onClick={() => setStarted(true)}
                aria-label="Play video"
                className={[
                  'flex h-16 w-16 items-center justify-center rounded-full',
                  'bg-white/90 text-slate-900 shadow-xl shadow-black/20',
                  'transition-transform duration-150 hover:scale-105 active:scale-95',
                ].join(' ')}
              >
                <Play className="ml-1 h-6 w-6" />
              </button>
            </div>
          </div>
        )}

        {/* Actual iframe */}
        {(started || !thumbnail) && (
          <iframe
            src={src}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
      </div>

      {/* Manual "mark as watched" — needed because iframes don't expose playback events */}
      {!watched && !locked && (
        <div className="flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3">
          <p className="text-[12px] text-sky-700">
            Finished watching? Mark this video as complete to continue.
          </p>
          <button
            onClick={onWatched}
            className={[
              'ml-4 inline-flex shrink-0 items-center gap-1.5 rounded-xl',
              'bg-sky-500 px-4 py-2 text-[12px] font-bold text-white shadow-sm shadow-sky-200',
              'transition-all duration-150 hover:bg-sky-600 hover:shadow-md active:scale-[0.97]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2',
            ].join(' ')}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Mark as watched
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Native <video> player ────────────────────────────────────────────────────

interface NativePlayerProps {
  src:              string;
  thumbnail?:       string;
  title:            string;
  durationSeconds?: number;
  onProgressUpdate: (fraction: number) => void;
  watched:          boolean;
  locked:           boolean;
}

function NativePlayer({
  src, thumbnail, title, durationSeconds: _durationSeconds, onProgressUpdate, watched: _watched, locked,
}: NativePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el || !el.duration) return;
    onProgressUpdate(el.currentTime / el.duration);
  }, [onProgressUpdate]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-900 shadow-lg"
         style={{ aspectRatio: '16/9' }}>
      {locked && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[2px]">
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            Controlled by your teacher
          </div>
        </div>
      )}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        poster={thumbnail}
        controls={!locked}
        onTimeUpdate={handleTimeUpdate}
        className="absolute inset-0 h-full w-full object-contain"
        aria-label={title}
      />
    </div>
  );
}

// ─── Continue CTA (matches SlideStep's visual style) ─────────────────────────

function VideoContinueCta({ label, onClick }: { label?: string; onClick?: () => void }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 px-5 py-5 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-500">
        <CheckCircle2 className="h-4.5 w-4.5" />
      </div>
      <p className="text-[13px] font-semibold text-sky-900">
        Great — you've watched this video!
      </p>
      {onClick ? (
        <button
          onClick={onClick}
          className={[
            'inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5',
            'text-[13px] font-bold text-white shadow-md shadow-sky-200/60',
            'transition-all duration-200 hover:bg-sky-600 hover:shadow-lg',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2',
            'active:scale-[0.97]',
          ].join(' ')}
        >
          {label ?? 'Continue lesson'}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : (
        <p className="text-[12px] text-sky-600">
          {label ?? 'Continue to the next step below'}
        </p>
      )}
    </div>
  );
}

// ─── Video meta strip ─────────────────────────────────────────────────────────

function VideoMetaStrip({ video, strategy }: { video: StudentVideo; strategy: EmbedStrategy }) {
  const providerLabel =
    strategy === 'youtube' ? 'YouTube' :
    strategy === 'vimeo'   ? 'Vimeo'   :
    strategy === 'direct'  ? 'Video'   : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {video.description && (
        <p className="w-full text-[13px] leading-relaxed text-slate-500">
          {video.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {providerLabel && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-600">
            <PlayCircle className="h-3 w-3" />
            {providerLabel}
          </span>
        )}

        {video.duration_seconds && (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
            <Clock className="h-3 w-3" />
            {formatDuration(video.duration_seconds)}
          </span>
        )}

        {video.url && strategy === 'direct' && (
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Open in new tab
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VideoStep({
  video,
  onProgressChange,
  nextStepLabel,
  onContinue,
  hideContinueCta = false,
  locked = false,
}: VideoStepProps) {

  const [progress, setProgress] = useState<VideoProgress>(() => ({
    watchedFraction: 0,
    completed:       false,
  }));

  // Reset when the video item changes (e.g. unit switch)
  useEffect(() => {
    const initial: VideoProgress = { watchedFraction: 0, completed: false };
    setProgress(initial);
    onProgressChange?.(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  // Called by native <video> via onTimeUpdate
  const handleNativeProgress = useCallback((fraction: number) => {
    setProgress((prev) => {
      if (prev.completed) return prev;
      const completed = fraction >= COMPLETION_THRESHOLD;
      const next: VideoProgress = { watchedFraction: fraction, completed };
      onProgressChange?.(next);
      return next;
    });
  }, [onProgressChange]);

  // Called by "Mark as watched" button (iframe players)
  const handleManualComplete = useCallback(() => {
    const next: VideoProgress = { watchedFraction: 1, completed: true };
    setProgress(next);
    onProgressChange?.(next);
  }, [onProgressChange]);

  const strategy = detectStrategy(video);
  const showCta  = progress.completed && !hideContinueCta;

  // ── No video object at all ─────────────────────────────────────────────────
  if (!video) {
    return <VideoPlaceholder />;
  }

  // ── No URL yet (video record exists but url pending) ──────────────────────
  if (!video.url) {
    return (
      <div className="space-y-3">
        {/* Title */}
        {video.title && (
          <h3 className="text-[18px] font-extrabold leading-snug tracking-tight text-slate-900">
            {video.title}
          </h3>
        )}
        <VideoPlaceholder />
      </div>
    );
  }

  // ── Full render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-0">
      {/* ── Keyframes ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes videoStepEnter {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .video-step-enter {
          animation: videoStepEnter 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      <div className="video-step-enter space-y-4">
        {/* ── Video title ───────────────────────────────────────────────── */}
        {video.title && (
          <h3 className="text-[20px] font-extrabold leading-snug tracking-tight text-slate-900 sm:text-[22px]">
            {video.title}
          </h3>
        )}

        {/* ── Meta strip (description, provider badge, duration) ────────── */}
        <VideoMetaStrip video={video} strategy={strategy} />

        {/* ── Player ────────────────────────────────────────────────────── */}
        {(strategy === 'youtube' || strategy === 'vimeo') && (
          <IframePlayer
            src={strategy === 'youtube'
              ? buildYouTubeEmbed(video.url)
              : buildVimeoEmbed(video.url)}
            title={video.title ?? 'Video'}
            thumbnail={video.thumbnail_url}
            onWatched={handleManualComplete}
            watched={progress.completed}
            locked={locked}
          />
        )}

        {strategy === 'direct' && (
          <NativePlayer
            src={video.url}
            thumbnail={video.thumbnail_url}
            title={video.title ?? 'Video'}
            durationSeconds={video.duration_seconds}
            onProgressUpdate={handleNativeProgress}
            watched={progress.completed}
            locked={locked}
          />
        )}

        {/* ── Completion acknowledgement (non-CTA) ──────────────────────── */}
        {progress.completed && (
          <div className="flex items-center gap-2 text-[12px] font-semibold text-sky-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Marked as watched
          </div>
        )}
      </div>

      {/* ── Continue CTA ──────────────────────────────────────────────── */}
      {showCta && (
        <VideoContinueCta
          label={nextStepLabel}
          onClick={onContinue}
        />
      )}
    </div>
  );
}
