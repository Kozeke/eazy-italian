/**
 * FirstGenCelebrationModal.tsx
 *
 * One-time celebration modal shown immediately after a teacher's very first
 * successful AI unit generation.  The gate is the localStorage flag
 * `linguai_first_gen_done` — once set this modal is never shown again.
 *
 * Layout: semi-transparent backdrop (click-outside or Escape dismisses) +
 * centred white card with a 4-px primary accent bar on the left edge.
 *
 * Two CTA paths:
 *   • [Preview lesson]  — closes the modal; the lesson is already loaded.
 *   • [Export as HTML]  — closes the modal then triggers the HTML download.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Eye, X } from 'lucide-react';

// ── Design tokens (mirrors ClassroomPage DS object) ────────────────────────────
const C = {
  primary:    '#6C6FEF',
  primaryDk:  '#4F52C2',
  tint:       '#EEF0FE',
  white:      '#FFFFFF',
  text:       '#1C1F3A',
  sub:        '#6B6F8E',
} as const;

// Box-shadow consistent with the exit-confirm dialog used elsewhere in ClassroomPage.
const SHADOW = '0 8px 32px rgba(108, 111, 239, 0.18), 0 2px 8px rgba(0,0,0,0.08)';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface FirstGenCelebrationModalProps {
  /** Whether the modal is currently visible. */
  open: boolean;
  /** Called when the modal should be dismissed (X, backdrop, or Escape). */
  onClose: () => void;
  /** Called when the teacher clicks "Preview lesson" — just closes the modal. */
  onPreview: () => void;
  /** Called when the teacher clicks "Export as HTML". */
  onExport: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function FirstGenCelebrationModal({
  open,
  onClose,
  onPreview,
  onExport,
}: FirstGenCelebrationModalProps) {
  const { t } = useTranslation();

  // Focus the first CTA button automatically when the modal opens for accessibility.
  const previewBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Small delay lets the modal render before focus is attempted.
    const id = setTimeout(() => previewBtnRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [open]);

  // Dismiss on Escape key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Handle export: close first so the modal doesn't block the download toast.
  const handleExport = () => {
    onClose();
    onExport();
  };

  const handlePreview = () => {
    onClose();
    onPreview();
  };

  return (
    /* ── Backdrop ─────────────────────────────────────────────────────────── */
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4"
      style={{ background: 'rgba(15, 18, 50, 0.45)', backdropFilter: 'blur(4px)' }}
      role="presentation"
      aria-label={t('classroom.firstGen.backdropAria', 'First generation celebration backdrop')}
      onClick={onClose}
    >
      {/* ── Card ───────────────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-gen-title"
        className="w-full max-w-md"
        style={{
          borderRadius: '16px',
          boxShadow: SHADOW,
          overflow: 'hidden',
          display: 'flex',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left accent bar — 4 px primary colour strip */}
        <div
          aria-hidden="true"
          style={{ width: 4, background: C.primary, flexShrink: 0 }}
        />

        {/* Card body */}
        <div
          style={{
            flex: 1,
            background: C.white,
            padding: '28px 28px 24px',
            position: 'relative',
          }}
        >
          {/* Dismiss ×  */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('classroom.firstGen.closeAria', 'Dismiss')}
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              width: 28,
              height: 28,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.sub,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              // Subtle hover state — no extra CSS class needed.
              (e.currentTarget as HTMLButtonElement).style.background = C.tint;
              (e.currentTarget as HTMLButtonElement).style.color = C.primary;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = C.sub;
            }}
          >
            <X size={15} strokeWidth={2.2} />
          </button>

          {/* Sparkle emoji badge */}
          <div
            className="mb-4 inline-flex items-center justify-center"
            style={{
              width: 44,
              height: 44,
              borderRadius: '12px',
              background: C.tint,
              fontSize: 22,
            }}
            aria-hidden="true"
          >
            ✨
          </div>

          {/* Headline */}
          <h2
            id="first-gen-title"
            className="mb-2 text-lg font-semibold leading-snug"
            style={{ color: C.text }}
          >
            {t('classroom.firstGen.title', 'Your first lesson is ready.')}
          </h2>

          {/* Body copy */}
          <p
            className="mb-6 text-sm leading-relaxed"
            style={{ color: C.sub }}
          >
            {t(
              'classroom.firstGen.body',
              'Preview it now, or export it as an interactive HTML file you can share directly with students — no accounts needed.',
            )}
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-3">
            {/* Primary: Preview lesson */}
            <button
              ref={previewBtnRef}
              type="button"
              onClick={handlePreview}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{
                background: C.primary,
                // Ring colour for focus-visible
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ['--tw-ring-color' as any]: C.primary,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = C.primaryDk;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = C.primary;
              }}
            >
              <Eye size={14} strokeWidth={2.2} />
              {t('classroom.firstGen.previewCta', 'Preview lesson')}
            </button>

            {/* Secondary: Export as HTML */}
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{
                background: C.tint,
                borderColor: C.primary + '33',  // primary at ~20% opacity
                color: C.primary,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ['--tw-ring-color' as any]: C.primary,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = C.primary;
                (e.currentTarget as HTMLButtonElement).style.color = C.white;
                (e.currentTarget as HTMLButtonElement).style.borderColor = C.primary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = C.tint;
                (e.currentTarget as HTMLButtonElement).style.color = C.primary;
                (e.currentTarget as HTMLButtonElement).style.borderColor = C.primary + '33';
              }}
            >
              <Download size={14} strokeWidth={2.2} />
              {t('classroom.firstGen.exportCta', 'Export as HTML')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
