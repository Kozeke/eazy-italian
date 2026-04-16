/**
 * MaterialChoiceModal.tsx
 *
 * Two-option modal for choosing how to create course material.
 *
 * Props:
 *   open       — controls visibility
 *   courseId   — needed to POST the new unit
 *   onClose    — called when user dismisses without choosing
 *   onCreated  — called with { unitId, mode } after the unit is created
 *
 * Behaviour:
 *   1. Teacher clicks Manual or AI.
 *   2. POST /api/v1/admin/units with { course_id, title: "New Unit", status: "draft" }
 *   3. onCreated({ unitId: unit.id, mode }) is called — ClassroomPage handles routing.
 *
 * Design: ultra-clean card-picker, consistent with Sora font / white palette.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:      '#ffffff',
  surface: '#F9F8FF',
  border:  '#EDEBF8',
  text:    '#0f0c1d',
  sub:     '#5C5490',
  muted:   '#9188C4',
  mutedL:  '#CFC9EE',
  violet:  '#6C35DE',
  violetL: '#EDE9FF',
  dark:    '#0f0c1d',
  red:     '#EF4444',
};

// ─── API helper ───────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiCreateUnit(courseId: number): Promise<{ id: number; title: string; [k: string]: unknown }> {
  const res = await fetch('/api/v1/admin/units', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      title: 'New Unit',
      course_id: courseId,
      status: 'draft',
      order_index: 0,
      description: '',
      tags: [],
      settings: {},
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Option card ──────────────────────────────────────────────────────────────

interface OptionCardProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}

function OptionCard({ icon, label, description, loading, disabled, onClick }: OptionCardProps) {
  return (
    <button
      className="mcm-option"
      onClick={onClick}
      disabled={disabled}
      type="button"
      aria-label={label}
    >
      <span className="mcm-option-icon">{icon}</span>
      <span className="mcm-option-body">
        <span className="mcm-option-label">
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mcm-spinner" />
              Creating…
            </span>
          ) : label}
        </span>
        <span className="mcm-option-desc">{description}</span>
      </span>
      {!loading && (
        <svg className="mcm-option-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type MaterialMode = 'manual' | 'ai';

export interface MaterialChoiceModalProps {
  open: boolean;
  courseId: number;
  onClose: () => void;
  onCreated: (result: { unitId: number; mode: MaterialMode }) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MaterialChoiceModal({
  open,
  courseId,
  onClose,
  onCreated,
}: MaterialChoiceModalProps) {
  const [loadingMode, setLoadingMode] = useState<MaterialMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setLoadingMode(null);
      setError(null);
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loadingMode) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, loadingMode, onClose]);

  const handleChoose = useCallback(async (mode: MaterialMode) => {
    setLoadingMode(mode);
    setError(null);
    try {
      const unit = await apiCreateUnit(courseId);
      onCreated({ unitId: unit.id, mode });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create unit. Please try again.');
      setLoadingMode(null);
    }
  }, [courseId, onCreated]);

  const handleBackdrop = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loadingMode) onClose();
  }, [loadingMode, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');

        @keyframes mcm-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mcm-card-in {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes mcm-spin { to { transform: rotate(360deg); } }

        .mcm-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 12, 29, 0.44);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
          animation: mcm-backdrop-in 0.18s ease both;
          font-family: 'Sora', system-ui, sans-serif;
        }

        .mcm-card {
          background: #fff;
          border-radius: 22px;
          box-shadow:
            0 0 0 1px rgba(15, 12, 29, 0.06),
            0 20px 60px rgba(15, 12, 29, 0.14),
            0 4px 16px rgba(15, 12, 29, 0.06);
          width: 100%;
          max-width: 400px;
          padding: 32px 28px 28px;
          animation: mcm-card-in 0.24s cubic-bezier(0.22, 0.68, 0, 1.15) both;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* ── Header ── */
        .mcm-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .mcm-heading {
          font-size: 18px;
          font-weight: 700;
          color: ${T.text};
          letter-spacing: -0.3px;
          line-height: 1.3;
        }

        .mcm-close {
          flex-shrink: 0;
          width: 30px;
          height: 30px;
          border-radius: 9px;
          border: none;
          background: ${T.surface};
          color: ${T.muted};
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, color 0.15s;
          margin-top: -2px;
        }
        .mcm-close:hover { background: ${T.border}; color: ${T.text}; }
        .mcm-close:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── Option buttons ── */
        .mcm-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .mcm-option {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          border-radius: 14px;
          border: 1.5px solid ${T.border};
          background: ${T.surface};
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: border-color 0.16s, background 0.16s, transform 0.14s, box-shadow 0.16s;
          outline: none;
        }
        .mcm-option:hover:not(:disabled) {
          border-color: ${T.text};
          background: #fff;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(15, 12, 29, 0.08);
        }
        .mcm-option:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: none;
        }
        .mcm-option:focus-visible {
          border-color: ${T.violet};
          box-shadow: 0 0 0 3px ${T.violetL};
        }
        .mcm-option:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .mcm-option-icon {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: 11px;
          background: #fff;
          border: 1.5px solid ${T.border};
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${T.text};
          transition: border-color 0.15s;
        }
        .mcm-option:hover:not(:disabled) .mcm-option-icon {
          border-color: ${T.mutedL};
        }

        .mcm-option-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .mcm-option-label {
          font-size: 14px;
          font-weight: 600;
          color: ${T.text};
          letter-spacing: -0.1px;
        }

        .mcm-option-desc {
          font-size: 12px;
          font-weight: 400;
          color: ${T.muted};
          line-height: 1.5;
        }

        .mcm-option-arrow {
          flex-shrink: 0;
          color: ${T.mutedL};
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 0.15s, transform 0.15s, color 0.15s;
        }
        .mcm-option:hover:not(:disabled) .mcm-option-arrow {
          opacity: 1;
          transform: translateX(0);
          color: ${T.text};
        }

        /* ── Spinner ── */
        .mcm-spinner {
          display: inline-block;
          width: 13px;
          height: 13px;
          border: 2px solid rgba(15, 12, 29, 0.15);
          border-top-color: ${T.text};
          border-radius: 50%;
          animation: mcm-spin 0.65s linear infinite;
          flex-shrink: 0;
        }

        /* ── Error ── */
        .mcm-error {
          padding: 10px 14px;
          border-radius: 10px;
          background: #FEE2E2;
          border: 1.5px solid #FCA5A5;
          color: ${T.red};
          font-size: 13px;
          font-weight: 500;
          line-height: 1.5;
        }
      `}</style>

      <div className="mcm-backdrop" onClick={handleBackdrop} role="dialog" aria-modal="true" aria-label="Choose how to create material">
        <div className="mcm-card">

          {/* Header */}
          <div className="mcm-header">
            <h2 className="mcm-heading">
              How do you want<br />to create material?
            </h2>
            <button
              className="mcm-close"
              onClick={onClose}
              disabled={!!loadingMode}
              aria-label="Close"
              type="button"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Options */}
          <div className="mcm-options">
            <OptionCard
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="2" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M5 6h8M5 9h6M5 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              label="Manual"
              description="Build lessons step by step yourself"
              loading={loadingMode === 'manual'}
              disabled={!!loadingMode}
              onClick={() => handleChoose('manual')}
            />

            <OptionCard
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2l1.5 4.5H15l-3.75 2.75 1.5 4.5L9 11 5.25 13.75l1.5-4.5L3 6.5h4.5L9 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                </svg>
              }
              label="AI"
              description="Generate lessons automatically with AI"
              loading={loadingMode === 'ai'}
              disabled={!!loadingMode}
              onClick={() => handleChoose('ai')}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mcm-error" role="alert">{error}</div>
          )}

        </div>
      </div>
    </>,
    document.body,
  );
}