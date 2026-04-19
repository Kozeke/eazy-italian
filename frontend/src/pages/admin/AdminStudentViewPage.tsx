/**
 * Admin student profile page.
 * Displays student identity and class enrollment management in a card-based layout.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Info, Mail, Phone, Plus, UserRound, X } from "lucide-react";
import { coursesApi, gradesApi, usersApi } from "../../services/api";
import AddStudentModal, { AddStudentFormData } from "./components/AddStudentModal";
import StudentLoginCredentialsModal, {
  StudentLoginCredentials,
} from "./components/StudentLoginCredentialsModal";

interface TeacherCourseOption {
  id: number;
  title: string;
}

interface StudentProfile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  last_login: string | null;
  notification_prefs?: Record<string, unknown>;
  // Temporary auto-generated password assigned at creation; null once changed by student.
  temporary_password: string | null;
}

interface StudentEnrollment {
  course_id: number;
  title: string;
  level: string | null;
  enrolled_at: string | null;
  total_units: number;
}

// STUDENT_VIEW_THEME stores the shared visual tokens from the courses catalog design.
const STUDENT_VIEW_THEME = {
  violet: "#6C6FEF",
  violetLight: "#EEF0FE",
  violetDark: "#4F52C2",
  white: "#FFFFFF",
  border: "#E8E8F0",
  text: "#18181B",
  subText: "#52525B",
  muted: "#A1A1AA",
  mutedLight: "#D4D4D8",
  green: "#16A34A",
  greenLight: "#DCFCE7",
  red: "#EF4444",
  redLight: "#FEE2E2",
  cyan: "#0099E6",
  cyanLight: "#DAEEFF",
  displayFont: "'Nunito', system-ui, sans-serif",
  bodyFont: "'Inter', system-ui, sans-serif",
} as const;

// STUDENT_VIEW_CSS keeps page-scoped styles aligned with AdminCoursesCatalog proportions.
const STUDENT_VIEW_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

.svp-root {
  min-height: 100%;
  color: ${STUDENT_VIEW_THEME.text};
  font-family: ${STUDENT_VIEW_THEME.bodyFont};
  padding-bottom: 80px;
}
.svp-root *, .svp-root *::before, .svp-root *::after {
  box-sizing: border-box;
}
.svp-page {
  background: ${STUDENT_VIEW_THEME.white};
  border-radius: 16px;
  border: 1px solid ${STUDENT_VIEW_THEME.border};
  margin: 28px 20%;
  padding: 36px 44px 48px;
  box-shadow: 0 1px 4px rgba(108, 111, 239, 0.04);
}
.svp-header {
  margin-bottom: 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.svp-header-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.svp-back-btn {
  margin-top: 2px;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1.5px solid ${STUDENT_VIEW_THEME.border};
  background: white;
  color: ${STUDENT_VIEW_THEME.subText};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .13s;
}
.svp-back-btn:hover {
  border-color: ${STUDENT_VIEW_THEME.violet};
  color: ${STUDENT_VIEW_THEME.violetDark};
  background: ${STUDENT_VIEW_THEME.violetLight};
}
.svp-profile {
  display: flex;
  align-items: center;
  gap: 12px;
}
.svp-avatar {
  width: 54px;
  height: 54px;
  border-radius: 999px;
  background: ${STUDENT_VIEW_THEME.greenLight};
  color: ${STUDENT_VIEW_THEME.green};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-family: ${STUDENT_VIEW_THEME.displayFont};
  font-weight: 900;
}
.svp-name {
  font-family: ${STUDENT_VIEW_THEME.displayFont};
  font-size: 24px;
  font-weight: 900;
  line-height: 1.2;
  margin-bottom: 6px;
}
.svp-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.svp-meta-item {
  font-size: 12px;
  color: ${STUDENT_VIEW_THEME.muted};
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.svp-ghost-btn {
  border: 1.5px solid ${STUDENT_VIEW_THEME.border};
  border-radius: 10px;
  background: white;
  color: ${STUDENT_VIEW_THEME.subText};
  font-family: ${STUDENT_VIEW_THEME.displayFont};
  font-size: 12.5px;
  font-weight: 700;
  padding: 9px 14px;
  cursor: pointer;
  transition: all .13s;
}
.svp-ghost-btn:hover {
  border-color: ${STUDENT_VIEW_THEME.violet};
  color: ${STUDENT_VIEW_THEME.violetDark};
  background: ${STUDENT_VIEW_THEME.violetLight};
}
.svp-success {
  margin-bottom: 14px;
  border-radius: 11px;
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #15803d;
  padding: 10px 12px;
  font-size: 12.5px;
  font-weight: 600;
}
.svp-info {
  margin-bottom: 16px;
  border-radius: 11px;
  border: 1.5px solid #cfe9fb;
  background: #f2f9ff;
  color: #0369a1;
  padding: 11px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.svp-info-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
}
.svp-primary-btn {
  border: none;
  border-radius: 10px;
  background: ${STUDENT_VIEW_THEME.violet};
  color: white;
  font-family: ${STUDENT_VIEW_THEME.displayFont};
  font-size: 12.5px;
  font-weight: 800;
  padding: 9px 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  cursor: pointer;
  transition: background .13s;
}
.svp-primary-btn:hover {
  background: ${STUDENT_VIEW_THEME.violetDark};
}
.svp-primary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.svp-section {
  border-radius: 12px;
  border: 1px solid ${STUDENT_VIEW_THEME.border};
  background: white;
  padding: 14px;
}
.svp-section-head {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.svp-section-title {
  font-family: ${STUDENT_VIEW_THEME.displayFont};
  font-size: 15px;
  font-weight: 800;
}
.svp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.svp-card {
  border-radius: 10px;
  border: 1px solid ${STUDENT_VIEW_THEME.border};
  background: white;
  padding: 11px 12px;
}
.svp-card-title {
  font-size: 13px;
  font-weight: 700;
  color: ${STUDENT_VIEW_THEME.text};
}
.svp-card-sub {
  margin-top: 5px;
  font-size: 11.5px;
  color: ${STUDENT_VIEW_THEME.subText};
}
.svp-card-meta {
  margin-top: 5px;
  font-size: 11px;
  color: ${STUDENT_VIEW_THEME.muted};
}
.svp-empty {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 18px;
}
.svp-empty-icon {
  width: 58px;
  height: 58px;
  border-radius: 999px;
  background: #f1f5f9;
  color: ${STUDENT_VIEW_THEME.muted};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}
.svp-empty-text {
  max-width: 390px;
  font-size: 13px;
  color: ${STUDENT_VIEW_THEME.subText};
  margin-bottom: 12px;
}
.svp-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(24, 24, 27, .35);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.svp-modal {
  width: 100%;
  max-width: 380px;
  border-radius: 18px;
  background: white;
  padding: 22px;
  box-shadow: 0 20px 54px rgba(0,0,0,.15);
  border: 1px solid ${STUDENT_VIEW_THEME.border};
}
.svp-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.svp-modal-title {
  font-family: ${STUDENT_VIEW_THEME.displayFont};
  font-size: 18px;
  font-weight: 800;
}
.svp-close-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: ${STUDENT_VIEW_THEME.muted};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.svp-close-btn:hover {
  background: #f1f5f9;
  color: ${STUDENT_VIEW_THEME.subText};
}
.svp-modal-note {
  margin-bottom: 10px;
  font-size: 12.5px;
  color: ${STUDENT_VIEW_THEME.subText};
}
.svp-field {
  border-radius: 10px;
  border: 1px solid ${STUDENT_VIEW_THEME.border};
  background: #f8fafc;
  padding: 10px 11px;
  margin-bottom: 8px;
}
.svp-field-label {
  font-size: 11px;
  color: ${STUDENT_VIEW_THEME.muted};
}
.svp-field-value {
  margin-top: 4px;
  font-size: 13px;
  color: ${STUDENT_VIEW_THEME.text};
  font-weight: 600;
}
.svp-warn {
  margin-top: 8px;
  border-radius: 10px;
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
  font-size: 12px;
  padding: 10px 11px;
}
.svp-select {
  width: 100%;
  height: 42px;
  border-radius: 10px;
  border: 1.5px solid ${STUDENT_VIEW_THEME.border};
  padding: 0 12px;
  outline: none;
  font-family: ${STUDENT_VIEW_THEME.bodyFont};
  font-size: 13px;
  color: ${STUDENT_VIEW_THEME.text};
}
.svp-select:focus {
  border-color: ${STUDENT_VIEW_THEME.violet};
  box-shadow: 0 0 0 3px ${STUDENT_VIEW_THEME.violetLight};
}
.svp-error {
  margin-top: 8px;
  border-radius: 10px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 12px;
  padding: 9px 10px;
}
.svp-modal-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.svp-secondary-btn {
  border: 1.5px solid ${STUDENT_VIEW_THEME.border};
  border-radius: 10px;
  background: white;
  color: ${STUDENT_VIEW_THEME.subText};
  font-family: ${STUDENT_VIEW_THEME.displayFont};
  font-size: 12px;
  font-weight: 700;
  padding: 8px 13px;
  cursor: pointer;
}
.svp-secondary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.svp-state-page {
  margin: 28px 20%;
  border: 1px solid ${STUDENT_VIEW_THEME.border};
  border-radius: 16px;
  background: white;
  padding: 48px 30px;
  text-align: center;
}
.svp-spinner {
  margin: 0 auto 10px;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 4px solid ${STUDENT_VIEW_THEME.violetLight};
  border-top-color: ${STUDENT_VIEW_THEME.violet};
  animation: svp-spin .8s linear infinite;
}
@keyframes svp-spin {
  to { transform: rotate(360deg); }
}
@media (max-width: 1024px) {
  .svp-page, .svp-state-page {
    margin: 20px 8%;
  }
}
@media (max-width: 768px) {
  .svp-page, .svp-state-page {
    margin: 16px 16px;
    padding: 22px 20px 28px;
  }
  .svp-name {
    font-size: 20px;
  }
}
`;

// formatDateLabel converts ISO timestamps to compact localized labels.
function formatDateLabel(isoDate: string | null): string {
  if (!isoDate) return "—";
  return new Date(isoDate).toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminStudentViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Stores available teacher courses for enrollment modal.
  const [courses, setCourses] = useState<TeacherCourseOption[]>([]);
  // Stores the selected student profile shown in the header card.
  const [student, setStudent] = useState<StudentProfile | null>(null);
  // Stores the list of classes where the student is enrolled.
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  // Controls visibility of the enroll-in-class modal.
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  // Controls visibility of the login-info modal.
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // Controls visibility of the student edit modal.
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  // Tracks loading state while fetching teacher course options.
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  // Tracks loading state while saving enrollment.
  const [isEnrolling, setIsEnrolling] = useState(false);
  // Tracks loading state while saving edited student profile data.
  const [isUpdatingStudent, setIsUpdatingStudent] = useState(false);
  // Tracks loading state while deleting current student from edit modal.
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  // Stores the course currently chosen in enrollment modal.
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  // Stores enrollment-related API errors for modal feedback.
  const [enrollError, setEnrollError] = useState<string | null>(null);
  // Stores enrollment success messages shown at top of page.
  const [enrollSuccess, setEnrollSuccess] = useState<string | null>(null);
  // Stores errors returned while saving edited student fields.
  const [updateError, setUpdateError] = useState<string | null>(null);
  // Tracks full page loading while profile and classes are fetched.
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  // Stores full page loading error message.
  const [pageError, setPageError] = useState<string | null>(null);

  // Memoized numeric student id used for API calls.
  const studentId = useMemo(() => Number(id), [id]);

  // Computes display name for the profile card.
  const studentFullName = useMemo(() => {
    if (!student) return "";
    return `${student.first_name} ${student.last_name}`.trim();
  }, [student]);

  // Computes first letter used in avatar circle.
  const avatarLetter = useMemo(() => {
    if (studentFullName.length > 0) return studentFullName[0].toUpperCase();
    return "S";
  }, [studentFullName]);

  // Reads phone from optional profile metadata.
  const studentPhone = useMemo(() => {
    const phoneValue = student?.notification_prefs?.phone;
    return typeof phoneValue === "string" && phoneValue.trim().length > 0
      ? phoneValue
      : "Телефон не указан";
  }, [student]);

  // Derives informational login-status text shown in the blue alert row.
  const loginStatusMessage = useMemo(() => {
    if (!student) return "";
    if (!student.last_login) {
      return "Этот ученик еще не входил в свой аккаунт";
    }
    return `Последний вход: ${formatDateLabel(student.last_login)}`;
  }, [student]);
  // Stores credential details rendered by the shared student-login modal.
  const loginCredentials = useMemo<StudentLoginCredentials | null>(() => {
    if (!student) return null;
    // Stores current app login page so teacher shares the correct entry URL.
    const loginPageUrl = `${window.location.origin}/login`;
    // Shows the temporary auto-generated password if it still exists, otherwise
    // indicates the student has already set their own password.
    const passwordDisplay =
      student.temporary_password != null && student.temporary_password.trim().length > 0
        ? student.temporary_password
        : "Устанавливается учеником";
    return {
      loginUrl: loginPageUrl,
      email: student.email,
      password: passwordDisplay,
    };
  }, [student]);

  // Builds initial values so edit modal opens prefilled with current student profile.
  const editModalInitialData = useMemo<AddStudentFormData | undefined>(() => {
    if (!student) return undefined;
    const nativeLanguageValue = student.notification_prefs?.native_language;
    const timezoneValue = student.notification_prefs?.timezone;
    const normalizedNativeLanguage =
      typeof nativeLanguageValue === "string" && nativeLanguageValue.trim().length > 0
        ? nativeLanguageValue
        : "Русский";
    const normalizedTimezone =
      typeof timezoneValue === "string" && timezoneValue.trim().length > 0
        ? timezoneValue
        : "UTC";
    return {
      email: student.email,
      phone: typeof studentPhone === "string" && studentPhone !== "Телефон не указан" ? studentPhone : "",
      firstName: studentFullName,
      nativeLanguage: normalizedNativeLanguage,
      timezone: normalizedTimezone,
    };
  }, [student, studentFullName, studentPhone]);

  // Loads profile and enrollment data for the selected student id.
  useEffect(() => {
    if (!Number.isFinite(studentId) || studentId <= 0) {
      setPageError("Неверный идентификатор ученика");
      setIsLoadingPage(false);
      return;
    }

    let isMounted = true;
    setIsLoadingPage(true);
    setPageError(null);

    Promise.all([
      usersApi.getStudents(),
      gradesApi.getStudentEnrollments(studentId),
    ])
      .then(([studentsResponse, enrollmentsResponse]) => {
        if (!isMounted) return;
        const selectedStudent = studentsResponse.find((entry: any) => entry.id === studentId);
        if (!selectedStudent) {
          setPageError("Ученик не найден");
          return;
        }
        setStudent({
          id: selectedStudent.id,
          first_name: selectedStudent.first_name,
          last_name: selectedStudent.last_name,
          email: selectedStudent.email,
          is_active: selectedStudent.is_active,
          last_login: selectedStudent.last_login ?? null,
          notification_prefs: selectedStudent.notification_prefs ?? {},
          // Stores backend-assigned temporary password so it can be shown in credentials modal.
          temporary_password: selectedStudent.temporary_password ?? null,
        });
        setEnrollments(Array.isArray(enrollmentsResponse) ? enrollmentsResponse : []);
      })
      .catch((error: any) => {
        if (!isMounted) return;
        setPageError(error?.response?.data?.detail ?? "Не удалось загрузить страницу ученика");
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingPage(false);
      });

    return () => {
      isMounted = false;
    };
  }, [studentId]);

  // Loads teacher course options each time enrollment modal opens.
  useEffect(() => {
    if (!isEnrollModalOpen) return;
    setIsLoadingCourses(true);
    setEnrollError(null);
    coursesApi
      .getAdminCourses()
      .then((data: any[]) => {
        const mappedCourses = data.map((course) => ({
          id: course.id,
          title: course.title,
        }));
        setCourses(mappedCourses);
        setSelectedCourseId(mappedCourses[0]?.id ?? null);
      })
      .catch((error: any) => {
        setEnrollError(error?.response?.data?.detail ?? "Не удалось загрузить курсы");
      })
      .finally(() => setIsLoadingCourses(false));
  }, [isEnrollModalOpen]);

  // Refreshes only enrollments after a successful class assignment.
  const refreshEnrollments = async () => {
    if (!Number.isFinite(studentId) || studentId <= 0) return;
    const data = await gradesApi.getStudentEnrollments(studentId);
    setEnrollments(Array.isArray(data) ? data : []);
  };

  // Enrolls current student into selected class from modal.
  const handleEnrollStudent = async () => {
    if (!Number.isFinite(studentId) || studentId <= 0 || !selectedCourseId) return;
    setIsEnrolling(true);
    setEnrollError(null);
    setEnrollSuccess(null);
    try {
      const result = await usersApi.enrollStudentInCourse(studentId, selectedCourseId);
      setIsEnrollModalOpen(false);
      setEnrollSuccess(
        result.already_enrolled
          ? "Ученик уже записан в этот класс"
          : "Ученик успешно записан в класс",
      );
      await refreshEnrollments();
    } catch (error: any) {
      setEnrollError(error?.response?.data?.detail ?? "Не удалось записать ученика в класс");
    } finally {
      setIsEnrolling(false);
    }
  };

  // Saves profile changes submitted from edit modal and updates local header data.
  const handleUpdateStudent = async (formData: AddStudentFormData) => {
    if (!Number.isFinite(studentId) || studentId <= 0 || !student) return;
    setUpdateError(null);
    setIsUpdatingStudent(true);
    try {
      const updatedStudent: any = await usersApi.updateStudent(studentId, {
        email: formData.email.trim(),
        first_name: formData.firstName.trim(),
        phone: formData.phone.trim() || undefined,
        native_language: formData.nativeLanguage,
        timezone: formData.timezone,
      });
      setStudent((previousStudent) => {
        if (!previousStudent) return previousStudent;
        return {
          ...previousStudent,
          first_name: updatedStudent.first_name ?? previousStudent.first_name,
          last_name: updatedStudent.last_name ?? previousStudent.last_name,
          email: updatedStudent.email ?? previousStudent.email,
          notification_prefs: updatedStudent.notification_prefs ?? previousStudent.notification_prefs ?? {},
        };
      });
      setIsEditModalOpen(false);
    } catch (error: any) {
      setUpdateError(error?.response?.data?.detail ?? "Не удалось сохранить данные ученика");
    } finally {
      setIsUpdatingStudent(false);
    }
  };

  // Deletes the selected student and returns to the students list page.
  const handleDeleteStudent = async () => {
    if (!Number.isFinite(studentId) || studentId <= 0) return;
    // Prevents accidental irreversible deletion without explicit user confirmation.
    const shouldDeleteStudent = window.confirm("Вы уверены, что хотите удалить ученика?");
    if (!shouldDeleteStudent) return;
    setUpdateError(null);
    setIsDeletingStudent(true);
    try {
      await usersApi.deleteStudent(studentId);
      setIsEditModalOpen(false);
      navigate("/admin/students");
    } catch (error: any) {
      setUpdateError(error?.response?.data?.detail ?? "Не удалось удалить ученика");
    } finally {
      setIsDeletingStudent(false);
    }
  };
  // Copies credentials from the login-data modal into the user clipboard.
  const handleCopyLoginCredentials = async () => {
    if (!loginCredentials) return;
    // Stores formatted credentials text used in clipboard copy action.
    const shareMessage = [
      "Данные для входа ученика в личный кабинет:",
      `Страница входа: ${loginCredentials.loginUrl}`,
      `Почта аккаунта: ${loginCredentials.email}`,
      `Пароль: ${loginCredentials.password}`,
    ].join("\n");
    await navigator.clipboard.writeText(shareMessage);
  };
  // Opens default mail app with prefilled student login details.
  const handleSendLoginCredentials = () => {
    if (!loginCredentials) return;
    // Stores email subject for the generated credentials message.
    const emailSubject = "Данные для входа в личный кабинет";
    // Stores message body that includes student login URL, email and password text.
    const emailBody = [
      "Здравствуйте!",
      "",
      "Отправляю данные для входа ученика в личный кабинет:",
      `Страница входа: ${loginCredentials.loginUrl}`,
      `Почта аккаунта: ${loginCredentials.email}`,
      `Пароль: ${loginCredentials.password}`,
    ].join("\n");
    const mailtoUrl = `mailto:${encodeURIComponent(loginCredentials.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
  };

  if (isLoadingPage) {
    return (
      <div className="svp-root">
        <style>{STUDENT_VIEW_CSS}</style>
        <div className="svp-state-page">
          <div className="svp-spinner" />
          <p>Загрузка профиля ученика...</p>
        </div>
      </div>
    );
  }

  if (pageError || !student) {
    return (
      <div className="svp-root">
        <style>{STUDENT_VIEW_CSS}</style>
        <div className="svp-state-page">
          <p style={{ color: STUDENT_VIEW_THEME.red, fontWeight: 700 }}>
            {pageError ?? "Не удалось отобразить ученика"}
          </p>
          <button onClick={() => navigate(-1)} className="svp-primary-btn" style={{ marginTop: 14 }}>
            Вернуться назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="svp-root">
      <style>{STUDENT_VIEW_CSS}</style>
      <div className="svp-page">
        <div className="svp-header">
          <div className="svp-header-left">
            <button
              onClick={() => navigate(-1)}
              className="svp-back-btn"
              aria-label="Назад"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="svp-profile">
              <div className="svp-avatar">{avatarLetter}</div>
              <div>
                <h1 className="svp-name">{studentFullName}</h1>
                <div className="svp-meta">
                  <span className="svp-meta-item">
                    <Phone size={13} />
                    {studentPhone}
                  </span>
                  <span className="svp-meta-item">
                    <Mail size={13} />
                    {student.email}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setUpdateError(null);
              setIsEditModalOpen(true);
            }}
            className="svp-ghost-btn"
          >
            Редактировать
          </button>
        </div>

        {enrollSuccess && <div className="svp-success">{enrollSuccess}</div>}

        <div className="svp-info">
          <span className="svp-info-text">
            <Info size={14} />
            {loginStatusMessage}
          </span>
          <button onClick={() => setIsLoginModalOpen(true)} className="svp-primary-btn">
            Данные для входа
          </button>
        </div>

        <section className="svp-section">
          {enrollments.length > 0 ? (
            <div>
              <div className="svp-section-head">
                <h2 className="svp-section-title">Классы ученика</h2>
                <button
                  onClick={() => {
                    setEnrollError(null);
                    setEnrollSuccess(null);
                    setIsEnrollModalOpen(true);
                  }}
                  className="svp-primary-btn"
                >
                  <Plus size={14} />
                  Добавить класс
                </button>
              </div>
              <div className="svp-grid">
                {enrollments.map((enrollment) => (
                  <div key={enrollment.course_id} className="svp-card">
                    <p className="svp-card-title">{enrollment.title}</p>
                    <p className="svp-card-sub">
                      Уровень: {enrollment.level ?? "—"} · Уроков: {enrollment.total_units}
                    </p>
                    <p className="svp-card-meta">
                      Записан: {formatDateLabel(enrollment.enrolled_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="svp-empty">
              <div className="svp-empty-icon">
                <UserRound size={28} />
              </div>
              <p className="svp-empty-text">
                У ученика нет классов, добавьте ему класс чтобы начать обучение
              </p>
              <button
                onClick={() => {
                  setEnrollError(null);
                  setEnrollSuccess(null);
                  setIsEnrollModalOpen(true);
                }}
                className="svp-primary-btn"
              >
                <Plus size={14} />
                Добавить класс
              </button>
            </div>
          )}
        </section>
      </div>

      <StudentLoginCredentialsModal
        open={isLoginModalOpen}
        credentials={loginCredentials}
        onClose={() => setIsLoginModalOpen(false)}
        onCopy={handleCopyLoginCredentials}
        onSendEmail={handleSendLoginCredentials}
      />

      {isEnrollModalOpen && (
        <div className="svp-overlay">
          <div className="svp-modal">
            <div className="svp-modal-head">
              <h3 className="svp-modal-title">Добавить класс</h3>
              <button
                onClick={() => !isEnrolling && setIsEnrollModalOpen(false)}
                className="svp-close-btn"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <p className="svp-modal-note">
              Выберите курс преподавателя для записи ученика.
            </p>

            {isLoadingCourses ? (
              <div style={{ padding: "8px 0", fontSize: 12.5, color: STUDENT_VIEW_THEME.subText }}>
                Загрузка курсов...
              </div>
            ) : (
              <select
                value={selectedCourseId ?? ""}
                onChange={(event) => setSelectedCourseId(Number(event.target.value))}
                className="svp-select"
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            )}

            {enrollError && <div className="svp-error">{enrollError}</div>}

            <div className="svp-modal-actions">
              <button
                onClick={() => setIsEnrollModalOpen(false)}
                disabled={isEnrolling}
                className="svp-secondary-btn"
              >
                Отмена
              </button>
              <button
                onClick={handleEnrollStudent}
                disabled={isEnrolling || isLoadingCourses || !selectedCourseId}
                className="svp-primary-btn"
              >
                {isEnrolling ? "Сохранение..." : "Добавить"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AddStudentModal
        open={isEditModalOpen}
        onClose={() => {
          if (isUpdatingStudent || isDeletingStudent) return;
          setUpdateError(null);
          setIsEditModalOpen(false);
        }}
        onCreate={handleUpdateStudent}
        onDelete={handleDeleteStudent}
        isSubmitting={isUpdatingStudent}
        isDeleting={isDeletingStudent}
        errorMessage={updateError}
        mode="edit"
        initialData={editModalInitialData}
      />
    </div>
  );
}