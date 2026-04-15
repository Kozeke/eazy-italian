/**
 * ExerciseHeader.tsx — LinguAI v2 (Screenshot-match refactor)
 *
 * Full-width fixed header:
 * LEFT: LinguAI orbital mark only (no wordmark)
 * CENTER: title input (editable)
 * RIGHT: settings icon | analytics icon | help icon | close (×) button
 *
 * Bar height matches teacher `ClassroomHeader` on /teacher/classroom/…
 * (inner row h-12 = 48px + 1px border-b ≈ 49px).
 */

import React, { useState } from 'react';
import { Settings, BarChart2, HelpCircle, X, ChevronDown } from 'lucide-react';
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
  editableTitleInHeader?: boolean;
  questionCount?: number;
  isDirty?: boolean;
  isSaveSuccess?: boolean;
  onClose: () => void;
  onTitleChange?: (title: string) => void;
}

// ─── Icon button helper ───────────────────────────────────────────────────────

function IconBtn({
  children,
  onClick,
  title: tooltipTitle,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={tooltipTitle}
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
  editableTitleInHeader = true,
  isDirty = false,
  isSaveSuccess = false,
  onClose,
  onTitleChange,
}: ExerciseHeaderProps) {
  const resolvedHeaderLabel = headerLabel || title || 'Untitled exercise';

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
          aria-label="LinguAI home"
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

        {/* ── CENTER: Settings + Analytics + Title input + chevron ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          minWidth: 0,
          /* Visually center the title cluster */
          justifyContent: 'center',
        }}>
          {/* Settings icon */}
          <IconBtn title="Settings">
            <Settings size={15} strokeWidth={1.8} />
          </IconBtn>

          {/* Analytics icon */}
          <IconBtn title="Analytics">
            <BarChart2 size={15} strokeWidth={1.8} />
          </IconBtn>

          {/* Title input */}
          {editableTitleInHeader && onTitleChange ? (
            <input
              value={title}
              onChange={e => onTitleChange(e.target.value)}
              placeholder="Untitled exercise…"
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
                width: `${Math.max(120, Math.min(340, (title || 'Untitled exercise…').length * 8.5))}px`,
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
              title="Unsaved changes"
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
              ✓ Saved
            </span>
          )}
        </div>

        {/* ── RIGHT: Help + Close ────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <IconBtn title="Help">
            <HelpCircle size={16} strokeWidth={1.8} />
          </IconBtn>
          <IconBtn title="Close" onClick={onClose} danger>
            <X size={15} strokeWidth={2} />
          </IconBtn>
        </div>
      </header>

      <style>{`
        @keyframes exFadeIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}