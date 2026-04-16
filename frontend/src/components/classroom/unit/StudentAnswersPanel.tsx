/**
 * StudentAnswersPanel.tsx
 *
 * A slide-in panel for teachers to switch between observed students and
 * see their live exercise answers in real time.
 *
 * ─── How it integrates ────────────────────────────────────────────────────────
 *
 * The panel reads/writes `observedStudentId` from LiveSessionContext.
 * When the teacher selects a student, the provider transparently redirects
 * all exercise subscribe() calls to that student's scoped patch keys
 * ("s/{studentId}/ex/…"), so every exercise block in the lesson player
 * instantly reflects the selected student's answers — zero extra wiring.
 *
 * ─── Auto-select ─────────────────────────────────────────────────────────────
 *
 * When exactly one student is online and no student is currently selected,
 * the panel auto-selects that student. This preserves the existing 1-student
 * experience where the teacher always sees the single student's answers.
 *
 * ─── Props ────────────────────────────────────────────────────────────────────
 *
 * open          — controlled visibility
 * onClose       — called when the user dismisses the panel
 * onlineUsers   — list from useOnlinePresence(); filtered to exclude the teacher
 * teacherUserId — used to filter the teacher out of the student list
 */

import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { X, Users, HelpCircle } from 'lucide-react';
import { LiveSessionContext } from '../live/LiveSessionProvider';
import type { OnlineUser } from '../../../hooks/useOnlinePresence';
import { getAvatarColor } from '../../../hooks/useOnlinePresence';
import {
  homeworkSubmissionApi,
  type HomeworkSubmissionListItemDto,
} from '../../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentAnswersPanelProps {
  open: boolean;
  onClose: () => void;
  onlineUsers: OnlineUser[];
  /** Teacher's user_id — filtered out from the student list */
  teacherUserId?: number | string | null;
  /** `homework` lists enrolled students + homework status; `lesson` uses online presence only */
  variant?: 'lesson' | 'homework';
  /** Current unit id — required for homework teacher review actions */
  unitId?: number | null;
  /** Enrolled students + homework workflow row (teacher) */
  homeworkRoster?: HomeworkSubmissionListItemDto[];
  /** True while homework roster is loading */
  homeworkRosterLoading?: boolean;
  /** After a successful teacher PATCH, parent can refetch the roster */
  onHomeworkReviewed?: () => void;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function StudentAvatar({ user }: { user: OnlineUser }) {
  const initial = (user.user_name ?? '?').charAt(0).toUpperCase();
  const color   = user.color ?? getAvatarColor(user.user_id);

  if (user.avatar_url) {
    return (
      <div className="sap-avatar">
        <img src={user.avatar_url} alt={user.user_name} className="sap-avatar__img" />
        <span className="sap-avatar__dot" />
      </div>
    );
  }

  return (
    <div className="sap-avatar" style={{ background: color }}>
      <span className="sap-avatar__initial">{initial}</span>
      <span className="sap-avatar__dot" />
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

/** Short Russian labels for homework workflow chips in the roster */
function homeworkStatusShort(status: string): string {
  switch (status) {
    case 'pending_review':
      return 'На проверке';
    case 'awaiting_student':
      return 'Студент';
    case 'completed':
      return 'Готово';
    case 'assigned':
    default:
      return 'Черновик';
  }
}

export default function StudentAnswersPanel({
  open,
  onClose,
  onlineUsers,
  teacherUserId,
  variant = 'lesson',
  unitId = null,
  homeworkRoster = [],
  homeworkRosterLoading = false,
  onHomeworkReviewed,
}: StudentAnswersPanelProps) {
  const ctx = useContext(LiveSessionContext);

  const observedStudentId  = ctx?.observedStudentId ?? null;
  const setObservedStudent = ctx?.setObservedStudentId;

  // Optional feedback text when the teacher sends homework back for edits
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  // Filter out the teacher from the student list — stable reference so the
  // auto-select useEffect below doesn't re-fire on every render.
  const students = useMemo(
    () => onlineUsers.filter((u) => String(u.user_id) !== String(teacherUserId)),
    [onlineUsers, teacherUserId],
  );

  const onlineIdSet = useMemo(
    () => new Set(students.map((s) => Number(s.user_id))),
    [students],
  );

  useEffect(() => {
    setReviewFeedback('');
  }, [observedStudentId]);

  // ── Auto-select when exactly one student is online ───────────────────────
  const prevCountRef = useRef(students.length);
  useEffect(() => {
    if (!setObservedStudent) return;
    if (variant === 'homework') return;

    const count = students.length;
    const prev  = prevCountRef.current;
    prevCountRef.current = count;

    // Auto-select the single student when they first join
    if (count === 1 && observedStudentId === null) {
      setObservedStudent(students[0].user_id);
    }

    // If the observed student went offline, clear the selection
    if (
      observedStudentId !== null &&
      !students.some((s) => s.user_id === observedStudentId)
    ) {
      setObservedStudent(null);
    }

    // If we dropped from 1 → 0, clear selection
    if (count === 0 && prev > 0) {
      setObservedStudent(null);
    }
  }, [students, observedStudentId, setObservedStudent, variant]); // eslint-disable-line

  const handleSelectAll = () => setObservedStudent?.(null);

  const handleSelectStudent = (uid: number) => {
    if (observedStudentId === uid) {
      setObservedStudent?.(null); // toggle off
    } else {
      setObservedStudent?.(uid);
    }
  };

  const selectedHomeworkRow = useMemo(() => {
    if (variant !== 'homework' || observedStudentId == null) return null;
    return homeworkRoster.find((r) => r.student_id === observedStudentId) ?? null;
  }, [variant, homeworkRoster, observedStudentId]);

  return (
    <>
      {/* ── Backdrop (mobile / focus-trap) ─────────────────────────────── */}
      {open && (
        <div
          className="sap-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* ── Panel ──────────────────────────────────────────────────────── */}
      <aside
        className={`sap-panel ${open ? 'sap-panel--open' : ''}`}
        aria-label="Student answers"
        role="complementary"
      >
        {/* Header */}
        <div className="sap-header">
          <div className="sap-header__title-row">
            <span className="sap-header__title">Answers</span>
            <button
              type="button"
              className="sap-header__help"
              title={
                variant === 'homework'
                  ? 'Select a student to view their saved homework like in the lesson player'
                  : 'Select a student to view their live answers in the lesson player'
              }
              aria-label="Help"
            >
              <HelpCircle size={14} />
            </button>
          </div>
          <button
            type="button"
            className="sap-header__close"
            onClick={onClose}
            aria-label="Close answers panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Student list */}
        <div className="sap-list" role="listbox" aria-label="Students">

          {/* All students row */}
          <button
            type="button"
            role="option"
            aria-selected={observedStudentId === null}
            className={`sap-row ${observedStudentId === null ? 'sap-row--selected' : ''}`}
            onClick={handleSelectAll}
          >
            <div className="sap-row__avatar sap-row__avatar--all">
              <Users size={16} />
            </div>
            <span className="sap-row__name">All students</span>
          </button>

          {/* Per-student rows */}
          {variant === 'homework' ? (
            homeworkRosterLoading ? (
              <div className="sap-empty">
                <span>Loading roster…</span>
              </div>
            ) : homeworkRoster.length === 0 ? (
              <div className="sap-empty">
                <span>No enrolled students</span>
              </div>
            ) : (
              homeworkRoster.map((row) => {
                const isSelected = observedStudentId === row.student_id;
                const online = onlineIdSet.has(row.student_id);
                const color = getAvatarColor(row.student_id);
                const initial = (row.student_name ?? '?').charAt(0).toUpperCase();
                return (
                  <button
                    key={row.student_id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`sap-row ${isSelected ? 'sap-row--selected' : ''}`}
                    onClick={() => handleSelectStudent(row.student_id)}
                  >
                    <div className="sap-avatar" style={{ background: color }}>
                      <span className="sap-avatar__initial">{initial}</span>
                      {online ? <span className="sap-avatar__dot" /> : null}
                    </div>
                    <span className="sap-row__name">{row.student_name}</span>
                    <span className="sap-hw-chip">{homeworkStatusShort(row.status)}</span>
                  </button>
                );
              })
            )
          ) : students.length === 0 ? (
            <div className="sap-empty">
              <span>No students online</span>
            </div>
          ) : (
            students.map((student) => {
              const isSelected = observedStudentId === student.user_id;
              return (
                <button
                  key={student.user_id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`sap-row ${isSelected ? 'sap-row--selected' : ''}`}
                  onClick={() => handleSelectStudent(student.user_id)}
                >
                  <StudentAvatar user={student} />
                  <span className="sap-row__name">{student.user_name ?? `Student ${student.user_id}`}</span>
                </button>
              );
            })
          )}
        </div>

        {variant === 'homework' &&
          observedStudentId !== null &&
          unitId &&
          selectedHomeworkRow?.status === 'pending_review' && (
            <div className="sap-hw-review">
              <textarea
                className="sap-hw-review__ta"
                rows={3}
                placeholder="Feedback for the student (optional)"
                value={reviewFeedback}
                onChange={(e) => setReviewFeedback(e.target.value)}
              />
              <div className="sap-hw-review__actions">
                <button
                  type="button"
                  className="sap-hw-review__btn sap-hw-review__btn--ghost"
                  disabled={reviewBusy}
                  onClick={async () => {
                    setReviewBusy(true);
                    try {
                      await homeworkSubmissionApi.teacherReview(unitId, observedStudentId, {
                        status: 'completed',
                        teacher_feedback: reviewFeedback.trim() || null,
                      });
                      onHomeworkReviewed?.();
                    } finally {
                      setReviewBusy(false);
                    }
                  }}
                >
                  Mark complete
                </button>
                <button
                  type="button"
                  className="sap-hw-review__btn sap-hw-review__btn--primary"
                  disabled={reviewBusy}
                  onClick={async () => {
                    setReviewBusy(true);
                    try {
                      await homeworkSubmissionApi.teacherReview(unitId, observedStudentId, {
                        status: 'awaiting_student',
                        teacher_feedback: reviewFeedback.trim() || null,
                      });
                      onHomeworkReviewed?.();
                    } finally {
                      setReviewBusy(false);
                    }
                  }}
                >
                  Needs student review
                </button>
              </div>
            </div>
          )}

        {/* Footer hint */}
        {observedStudentId !== null && (
          <div className="sap-footer">
            <span className="sap-footer__dot" />
            <span>
              {variant === 'homework' ? 'Viewing saved homework' : 'Viewing live answers'}
            </span>
          </div>
        )}
      </aside>

      <style>{`
        /* ── Backdrop ──────────────────────────────────────────────────── */
        .sap-backdrop {
          position: fixed;
          inset: 0;
          z-index: 39;
          background: transparent;
        }

        /* ── Panel shell ────────────────────────────────────────────────── */
        .sap-panel {
          position: fixed;
          top: 48px; /* below classroom header */
          right: 0;
          bottom: 0;
          z-index: 40;
          width: 256px;
          background: #ffffff;
          border-left: 1px solid #e8eaed;
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.07);
          display: flex;
          flex-direction: column;
          transform: translateX(100%);
          transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }

        .sap-panel--open {
          transform: translateX(0);
        }

        /* ── Header ─────────────────────────────────────────────────────── */
        .sap-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 14px 10px 16px;
          border-bottom: 1px solid #f0f1f5;
          flex-shrink: 0;
        }

        .sap-header__title-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .sap-header__title {
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
          letter-spacing: -0.01em;
        }

        .sap-header__help {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border: none;
          background: #f1f2f8;
          border-radius: 50%;
          color: #94a3b8;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          padding: 0;
        }

        .sap-header__help:hover {
          background: #EEF0FE;
          color: #6C6FEF;
        }

        .sap-header__close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          border-radius: 8px;
          color: #94a3b8;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          padding: 0;
        }

        .sap-header__close:hover {
          background: #f1f5f9;
          color: #475569;
        }

        /* ── Student list ────────────────────────────────────────────────── */
        .sap-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        /* ── Row ─────────────────────────────────────────────────────────── */
        .sap-row {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px 10px;
          border: none;
          background: transparent;
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          transition: background 0.14s ease;
          color: #374151;
          font-family: inherit;
        }

        .sap-row:hover {
          background: #F7F7FA;
        }

        .sap-row--selected {
          background: #EEF0FE !important;
          color: #4F52C2;
        }

        .sap-row__name {
          font-size: 13px;
          font-weight: 500;
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ── Avatar ──────────────────────────────────────────────────────── */
        .sap-avatar {
          position: relative;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #e2e8f0;
          overflow: visible;
        }

        .sap-avatar__img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .sap-avatar__initial {
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
          line-height: 1;
          user-select: none;
        }

        .sap-avatar__dot {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #22c55e;
          border: 1.5px solid #ffffff;
        }

        .sap-row__avatar--all {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #f1f5f9;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .sap-row--selected .sap-row__avatar--all {
          background: #6C6FEF;
          color: #ffffff;
        }

        /* ── Empty state ─────────────────────────────────────────────────── */
        .sap-empty {
          padding: 24px 12px;
          text-align: center;
          font-size: 12.5px;
          color: #94a3b8;
        }

        /* ── Footer ──────────────────────────────────────────────────────── */
        .sap-footer {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          border-top: 1px solid #f0f1f5;
          font-size: 11.5px;
          color: #6C6FEF;
          font-weight: 500;
        }

        .sap-footer__dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
          flex-shrink: 0;
          animation: sap-pulse 2s ease-in-out infinite;
        }

        @keyframes sap-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.85); }
        }

        .sap-hw-chip {
          flex-shrink: 0;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 999px;
          background: #f1f5f9;
          color: #64748b;
        }

        .sap-row--selected .sap-hw-chip {
          background: #ffffff;
          color: #4f52c2;
        }

        .sap-hw-review {
          flex-shrink: 0;
          padding: 10px 12px 12px;
          border-top: 1px solid #f0f1f5;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .sap-hw-review__ta {
          width: 100%;
          resize: vertical;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          padding: 8px 10px;
          font-size: 12.5px;
          font-family: inherit;
          outline: none;
        }

        .sap-hw-review__ta:focus {
          border-color: #6c6fef;
          box-shadow: 0 0 0 2px #eef0fe;
        }

        .sap-hw-review__actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .sap-hw-review__btn {
          border: none;
          border-radius: 9px;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .sap-hw-review__btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .sap-hw-review__btn--ghost {
          background: #f1f5f9;
          color: #475569;
        }

        .sap-hw-review__btn--primary {
          background: #6c6fef;
          color: #fff;
        }
      `}</style>
    </>
  );
}