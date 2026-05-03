/**
 * ClassroomEnrollStudentModal.tsx
 *
 * Lets a teacher choose one of their admin-created students from a dropdown and
 * enroll them in the current course (POST /admin/students/:id/enrollments).
 * Enrollment status for this course is loaded via GET …/enrolled-student-ids.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { X, UserPlus } from "lucide-react";
import { coursesApi, usersApi } from "../../services/api";
import type { Student } from "../../types";

type ClassroomEnrollStudentModalProps = {
  open: boolean;
  onClose: () => void;
  /** Numeric course id from the classroom route (must match teacher-owned course). */
  courseId: number;
  /** Student user IDs currently connected to this classroom (shown in the dropdown label). */
  onlineUserIds: Set<number>;
};

/** Builds a stable display label for roster rows (name, else email). */
function studentDisplayName(student: Student): string {
  const combined = [student.first_name, student.last_name].filter(Boolean).join(" ").trim();
  return combined || student.email;
}

export default function ClassroomEnrollStudentModal({
  open,
  onClose,
  courseId,
  onlineUserIds,
}: ClassroomEnrollStudentModalProps) {
  // Provides localized copy for the enroll modal.
  const { t } = useTranslation();
  // Teacher-owned students from GET /admin/students.
  const [students, setStudents] = useState<Student[]>([]);
  // Student ids with an enrollment row for this course (GET …/enrolled-student-ids).
  const [enrolledIds, setEnrolledIds] = useState<Set<number>>(() => new Set());
  // True while students or enrollment ids are loading.
  const [loadingList, setLoadingList] = useState(false);
  // Stores load failure message; cleared on retry.
  const [listError, setListError] = useState<string | null>(null);
  // Selected student id from the dropdown; empty string means no selection.
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  // Student id currently receiving POST …/enrollments.
  const [enrollingId, setEnrollingId] = useState<number | null>(null);

  // Students sorted: not enrolled in this course first, then enrolled; then by display name.
  const sortedStudents = useMemo(() => {
    const copy = [...students];
    copy.sort((a, b) => {
      const aEnrolled = enrolledIds.has(a.id);
      const bEnrolled = enrolledIds.has(b.id);
      if (aEnrolled !== bEnrolled) return aEnrolled ? 1 : -1;
      const aOnline = onlineUserIds.has(a.id) ? 0 : 1;
      const bOnline = onlineUserIds.has(b.id) ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return studentDisplayName(a).localeCompare(studentDisplayName(b), undefined, {
        sensitivity: "base",
      });
    });
    return copy;
  }, [students, enrolledIds, onlineUserIds]);

  // Loads roster and who is already enrolled in this course when the modal opens.
  useEffect(() => {
    if (!open || !courseId) return;
    let cancelled = false;
    setLoadingList(true);
    setListError(null);
    setSelectedStudentId("");
    Promise.all([usersApi.getStudents(), coursesApi.getCourseEnrolledStudentIds(courseId)])
      .then(([rows, enrolledPayload]) => {
        if (cancelled) return;
        setStudents(Array.isArray(rows) ? rows : []);
        const ids = enrolledPayload?.student_ids;
        setEnrolledIds(new Set(Array.isArray(ids) ? ids : []));
      })
      .catch(() => {
        if (!cancelled) setListError(t("classroom.enrollStudentModal.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, courseId, t]);

  // Resolved selection: full student row when the dropdown value matches an id.
  const selectedStudent = useMemo(() => {
    const id = Number(selectedStudentId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return students.find((s) => s.id === id) ?? null;
  }, [selectedStudentId, students]);

  // True when the current dropdown selection is already enrolled in this course.
  const selectedAlreadyEnrolled =
    selectedStudent != null && enrolledIds.has(selectedStudent.id);

  // Submits enrollment for the selected student and refreshes local enrolled set on success.
  const handleEnroll = useCallback(async () => {
    if (!courseId || !selectedStudent || enrollingId != null) return;
    if (enrolledIds.has(selectedStudent.id)) return;
    setEnrollingId(selectedStudent.id);
    try {
      const result = await usersApi.enrollStudentInCourse(selectedStudent.id, courseId);
      const name = studentDisplayName(selectedStudent);
      if (result.already_enrolled) {
        toast.success(t("classroom.enrollStudentModal.alreadyEnrolledToast", { name }));
      } else {
        toast.success(t("classroom.enrollStudentModal.enrolledToast", { name }));
      }
      setEnrolledIds((prev) => new Set(prev).add(selectedStudent.id));
      onClose();
    } catch {
      toast.error(t("classroom.enrollStudentModal.enrollFailed"));
    } finally {
      setEnrollingId(null);
    }
  }, [courseId, selectedStudent, enrollingId, enrolledIds, onClose, t]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center px-4"
      style={{ background: "rgba(15, 17, 35, 0.40)", backdropFilter: "blur(4px)" }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="classroom-enroll-student-title"
        className="flex w-full max-w-md flex-col overflow-hidden p-6 sm:p-7"
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(108, 111, 239, 0.12), 0 2px 8px rgba(0,0,0,0.08)",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "#EEF0FE" }}
            >
              <UserPlus className="h-5 w-5" style={{ color: "#6C6FEF" }} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2
                id="classroom-enroll-student-title"
                className="text-base font-semibold text-slate-900"
              >
                {t("classroom.enrollStudentModal.title")}
              </h2>
              {/*
                Long instructional subtitle removed: roster and enrollment state are visible
                directly in the dropdown options (enrolled vs not enrolled).
              */}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label={t("classroom.enrollStudentModal.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 flex flex-col gap-3">
          {loadingList && (
            <p className="py-8 text-center text-sm text-slate-500">
              {t("classroom.enrollStudentModal.loading")}
            </p>
          )}
          {!loadingList && listError && (
            <p className="py-6 text-center text-sm text-red-600">{listError}</p>
          )}
          {!loadingList && !listError && sortedStudents.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              {t("classroom.enrollStudentModal.empty")}
            </p>
          )}
          {!loadingList && !listError && sortedStudents.length > 0 && (
            <>
              <label htmlFor="classroom-enroll-student-select" className="text-xs font-medium text-slate-600">
                {t("classroom.enrollStudentModal.selectLabel")}
              </label>
              <select
                id="classroom-enroll-student-select"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                disabled={enrollingId != null}
              >
                <option value="">{t("classroom.enrollStudentModal.selectPlaceholder")}</option>
                {sortedStudents.map((student) => {
                  const name = studentDisplayName(student);
                  const inCourse = enrolledIds.has(student.id);
                  const onlineHere = onlineUserIds.has(student.id);
                  const statusLabel = inCourse
                    ? t("classroom.enrollStudentModal.optionInCourse")
                    : t("classroom.enrollStudentModal.optionNotInCourse");
                  const onlineLabel = onlineHere ? ` · ${t("classroom.enrollStudentModal.optionOnline")}` : "";
                  return (
                    <option key={student.id} value={String(student.id)}>
                      {name} ({student.email}) — {statusLabel}
                      {onlineLabel}
                    </option>
                  );
                })}
              </select>
              {selectedAlreadyEnrolled && (
                <p className="text-xs text-slate-500">{t("classroom.enrollStudentModal.alreadyInCourseHint")}</p>
              )}
              <button
                type="button"
                onClick={() => void handleEnroll()}
                disabled={
                  !selectedStudent ||
                  selectedAlreadyEnrolled ||
                  enrollingId != null
                }
                className="mt-1 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "#6C6FEF" }}
              >
                {enrollingId != null
                  ? t("classroom.enrollStudentModal.enrollingButton")
                  : t("classroom.enrollStudentModal.addToCourse")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
