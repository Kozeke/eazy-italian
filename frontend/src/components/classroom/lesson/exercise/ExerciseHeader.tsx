/**
 * ExerciseHeader.tsx — LinguAI v2 (Screenshot-match refactor)
 *
 * Full-width fixed header:
 * LEFT: LinguAI orbital mark only (no wordmark)
 * CENTER: title input (editable)
 * RIGHT: settings icon | help icon | close (×) button  (analytics commented out)
 *
 * Bar height matches teacher `ClassroomHeader` on /teacher/classroom/…
 * (inner row h-12 = 48px + 1px border-b ≈ 49px).
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, HelpCircle, X, ChevronDown } from 'lucide-react';
import { LinguAiLogo } from '../../../global/LinguAiLogo';

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  primary:    '#6C6FEF',
  primaryDk:  '#4F52C2',
  tint:       '#EEF0FE',
  bg:         '#F7F7FA',
  white:      '#FFFFFF',
  border:     '#E8EAFD',
  borderSoft: '#F1F2FA',
  text:       '#1C1F3A',
  sub:        '#6B6F8E',
  muted:      '#A8ABCA',
};

/** Same total height as teacher `ClassroomHeader` main strip (48px row + 1px border). */
export const EXERCISE_HEADER_HEIGHT_PX = 49;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExerciseHeaderProps {
  title: string;
  headerLabel?: string;
  /** Overrides the default help tooltip (e.g. for special editors). */
  helpTooltip?: string;
  editableTitleInHeader?: boolean;
  questionCount?: number;
  isDirty?: boolean;
  isSaveSuccess?: boolean;
  /** Cog: e.g. return to ExerciseDraftsPage template gallery when set. */
  onSettingsClick?: () => void;
  onClose: () => void;
  onTitleChange?: (title: string) => void;
}

// ─── Icon button helper ───────────────────────────────────────────────────────

function IconBtn({
  children,
  onClick,
  title: tooltipTitle,
  ariaLabel,
  ariaExpanded,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  /** Short accessible name when `title` is too long for aria-label. */
  ariaLabel?: string;
  /** Reflects popover / menu open state for the help control. */
  ariaExpanded?: boolean;
  danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltipTitle}
      aria-label={ariaLabel ?? tooltipTitle}
      aria-expanded={ariaExpanded}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hov
          ? danger ? '#FEE2E2' : T.tint
          : 'transparent',
        color: hov
          ? danger ? '#E03C3C' : T.primary
          : T.muted,
        cursor: 'pointer',
        transition: 'background 110ms ease, color 110ms ease',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExerciseHeader({
  title,
  headerLabel,
  helpTooltip,
  editableTitleInHeader = true,
  isDirty = false,
  isSaveSuccess = false,
  onSettingsClick,
  onClose,
  onTitleChange,
}: ExerciseHeaderProps) {
  const { t } = useTranslation();
  const resolvedHeaderLabel = headerLabel || title || t('exerciseHeader.untitledExercise');
  /** Lines for the help popover; custom `helpTooltip` may use newlines between paragraphs. */
  const helpLines: string[] = helpTooltip
    ? helpTooltip.split(/\n+/).map((s) => s.trim()).filter(Boolean)
    : [
        t('exerciseHeader.helpLine1', { label: resolvedHeaderLabel }),
        t('exerciseHeader.helpLine2'),
        t('exerciseHeader.helpLine3'),
        t('exerciseHeader.helpLine4'),
      ];

  /** True while the ? popover is open (click ? to toggle; backdrop or × closes). */
  const [helpOpen, setHelpOpen] = useState(false);

  // Dismiss help with Escape so the overlay does not trap focus awkwardly.
  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  return (
    <>
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: EXERCISE_HEADER_HEIGHT_PX,
          boxSizing: 'border-box',
          zIndex: 100,
          background: T.white,
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* ── LEFT: LinguAI mark only (exercise editor — no “Lingu AI” text) ── */}
        <a
          href="/admin"
          aria-label={t('exerciseHeader.linguaiHome')}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <LinguAiLogo height={32} showWordmark={false} style={{ display: 'block' }} />
        </a>

        {/* ── CENTER: Settings + Title input + chevron ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          minWidth: 0,
          /* Visually center the title cluster */
          justifyContent: 'center',
        }}>
          {/* Settings (cog) — opens template gallery when onSettingsClick is set */}
          <IconBtn
            title={onSettingsClick ? t('exerciseHeader.backToTemplateGallery') : t('exerciseHeader.settings')}
            onClick={onSettingsClick}
          >
            <Settings size={15} strokeWidth={1.8} />
          </IconBtn>

          {/* Analytics icon — reserved; not wired yet
          <IconBtn title="Analytics">
            <BarChart2 size={15} strokeWidth={1.8} />
          </IconBtn>
          */}

          {/* Title input */}
          {editableTitleInHeader && onTitleChange ? (
            <input
              value={title}
              onChange={e => onTitleChange(e.target.value)}
              placeholder={t('exerciseHeader.titlePlaceholder')}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                color: T.text,
                letterSpacing: '-0.02em',
                lineHeight: 1.4,
                textAlign: 'center',
                minWidth: 120,
                maxWidth: 340,
                width: `${Math.max(120, Math.min(340, (title || t('exerciseHeader.titlePlaceholder')).length * 8.5))}px`,
                transition: 'width 80ms ease',
              }}
            />
          ) : (
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: T.text,
              letterSpacing: '-0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {resolvedHeaderLabel}
            </span>
          )}

          {/* Chevron dropdown hint */}
          <ChevronDown size={13} strokeWidth={2} color={T.muted} style={{ flexShrink: 0 }} />

          {/* Dirty / saved indicator dot */}
          {isDirty && !isSaveSuccess && (
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: T.primary,
              boxShadow: `0 0 0 2px ${T.tint}`,
              flexShrink: 0,
              marginLeft: 2,
            }}
              title={t('exerciseHeader.unsavedChanges')}
            />
          )}
          {isSaveSuccess && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#17a865',
              flexShrink: 0,
              marginLeft: 4,
              animation: 'exFadeIn 0.18s ease both',
            }}>
              {t('exerciseHeader.saved')}
            </span>
          )}
        </div>

        {/* ── RIGHT: Help + Close ────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <IconBtn
            title={t('exerciseHeader.helpHoverHint')}
            ariaLabel={t('exerciseHeader.helpAriaLabel')}
            ariaExpanded={helpOpen}
            onClick={() => setHelpOpen((o) => !o)}
          >
            <HelpCircle size={16} strokeWidth={1.8} />
          </IconBtn>
          <IconBtn title={t('common.close')} onClick={onClose} danger>
            <X size={15} strokeWidth={2} />
          </IconBtn>
        </div>
      </header>

      {/* Help popover — native title tooltips are easy to miss; click ? for full text. */}
      {helpOpen && (
        <>
          <button
            type="button"
            aria-label={t('exerciseHeader.closeHelp')}
            onClick={() => setHelpOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 199,
              border: 'none',
              padding: 0,
              margin: 0,
              background: 'rgba(28,31,58,0.12)',
              cursor: 'default',
            }}
          />
          <div
            role="dialog"
            aria-labelledby="exercise-header-help-title"
            style={{
              position: 'fixed',
              top: EXERCISE_HEADER_HEIGHT_PX + 8,
              right: 16,
              zIndex: 200,
              width: 'min(400px, calc(100vw - 32px))',
              maxHeight: 'min(70vh, 420px)',
              overflowY: 'auto',
              background: T.white,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              boxShadow: '0 12px 40px rgba(28,31,58,0.18)',
              padding: '14px 16px 16px',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 10,
            }}>
              <span
                id="exercise-header-help-title"
                style={{ fontSize: 14, fontWeight: 700, color: T.text }}
              >
                {t('exerciseHeader.helpTitle')}
              </span>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                style={{
                  border: 'none',
                  background: T.bg,
                  borderRadius: 6,
                  width: 28,
                  height: 28,
                  cursor: 'pointer',
                  color: T.sub,
                  fontSize: 16,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
            {helpLines.map((line, i) => (
              <p
                key={i}
                style={{
                  margin: i === 0 ? '0 0 10px' : '0 0 10px',
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: T.sub,
                }}
              >
                {line}
              </p>
            ))}
          </div>
        </>
      )}

      <style>{`
        @keyframes exFadeIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}