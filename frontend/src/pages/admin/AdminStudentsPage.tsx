/**
 * Admin students page renders a compact list-style roster with search and quick actions.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ChevronDown,
  Grid2X2,
  List,
  Mail,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { progressApi, usersApi } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import AddStudentModal, { AddStudentFormData } from "./components/AddStudentModal";
import StudentLoginCredentialsModal, {
  StudentLoginCredentials,
} from "./components/StudentLoginCredentialsModal";

/**
 * STUDENTS_THEME stores design tokens aligned with the courses catalog page.
 */
const STUDENTS_THEME = {
  violet: "#6C6FEF",
  violetLight: "#EEF0FE",
  violetDark: "#4F52C2",
  white: "#FFFFFF",
  border: "#E8E8F0",
  text: "#18181B",
  subText: "#52525B",
  muted: "#A1A1AA",
  mutedLight: "#D4D4D8",
  red: "#EF4444",
  redLight: "#FEE2E2",
  bg: "#F7F7FA",
  lime: "#0DB85E",
  teal: "#00BCD4",
  displayFont: "'Nunito', system-ui, sans-serif",
  bodyFont: "'Inter', system-ui, sans-serif",
} as const;

/**
 * STUDENTS_PAGE_CSS stores component-scoped CSS to match catalog styling.
 */
const STUDENTS_PAGE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

.std-root {
  min-height: 100%;
  font-family: ${STUDENTS_THEME.bodyFont};
  color: ${STUDENTS_THEME.text};
  padding-bottom: 80px;
}
.std-root *, .std-root *::before, .std-root *::after {
  box-sizing: border-box;
}
.std-page {
  background: ${STUDENTS_THEME.white};
  border-radius: 16px;
  border: 1px solid ${STUDENTS_THEME.border};
  margin: 28px 20%;
  padding: 36px 44px 48px;
  box-shadow: 0 1px 4px rgba(108, 111, 239, 0.04);
}
.std-title {
  font-family: ${STUDENTS_THEME.displayFont};
  font-size: 24px;
  font-weight: 900;
  color: ${STUDENTS_THEME.text};
  margin-bottom: 18px;
}
.std-warning {
  margin-bottom: 14px;
  border: 1.5px solid #ffd8e3;
  border-radius: 12px;
  background: #fff1f5;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}
.std-warning-text {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #d64568;
  font-size: 12.5px;
  font-weight: 700;
}
.std-warning-btn {
  border: none;
  border-radius: 10px;
  background: ${STUDENTS_THEME.violet};
  color: white;
  font-family: ${STUDENTS_THEME.displayFont};
  font-size: 12px;
  font-weight: 800;
  padding: 8px 14px;
  cursor: pointer;
  transition: background .14s;
}
.std-warning-btn:hover {
  background: ${STUDENTS_THEME.violetDark};
}
.std-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  border: 1.5px solid ${STUDENTS_THEME.border};
  border-radius: 10px;
  padding: 9px 14px;
  margin-bottom: 14px;
  color: ${STUDENTS_THEME.mutedLight};
  transition: border-color .15s, box-shadow .15s;
}
.std-search:focus-within {
  border-color: ${STUDENTS_THEME.violet};
  box-shadow: 0 0 0 3px ${STUDENTS_THEME.violetLight};
}
.std-search input {
  flex: 1;
  border: none;
  outline: none;
  font-family: ${STUDENTS_THEME.bodyFont};
  font-size: 13.5px;
  color: ${STUDENTS_THEME.text};
  background: transparent;
}
.std-search input::placeholder {
  color: ${STUDENTS_THEME.mutedLight};
}
.std-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.std-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.std-tab {
  border: none;
  border-radius: 999px;
  padding: 7px 13px;
  background: #f1f5f9;
  color: #64748b;
  font-family: ${STUDENTS_THEME.bodyFont};
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background .14s, color .14s;
}
.std-tab:hover {
  background: #e2e8f0;
}
.std-tab.on {
  background: ${STUDENTS_THEME.violetLight};
  color: ${STUDENTS_THEME.violetDark};
}
.std-controls {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.std-view-toggle {
  display: flex;
  background: white;
  border: 1.5px solid ${STUDENTS_THEME.border};
  border-radius: 9px;
  overflow: hidden;
}
.std-vbtn {
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: ${STUDENTS_THEME.mutedLight};
  cursor: pointer;
  display: flex;
  align-items: center;
}
.std-vbtn.on {
  background: ${STUDENTS_THEME.violetLight};
  color: ${STUDENTS_THEME.violetDark};
}
.std-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1.5px solid ${STUDENTS_THEME.border};
  background: white;
  color: ${STUDENTS_THEME.muted};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .12s;
}
.std-icon-btn:hover {
  color: ${STUDENTS_THEME.violetDark};
  border-color: ${STUDENTS_THEME.violet};
  background: ${STUDENTS_THEME.violetLight};
}
.std-select-wrap {
  position: relative;
}
.std-select {
  background: white;
  border: 1.5px solid ${STUDENTS_THEME.border};
  border-radius: 9px;
  padding: 7px 28px 7px 11px;
  font-family: ${STUDENTS_THEME.bodyFont};
  font-size: 12.5px;
  color: ${STUDENTS_THEME.subText};
  outline: none;
  cursor: pointer;
  appearance: none;
}
.std-select:focus {
  border-color: ${STUDENTS_THEME.violet};
  box-shadow: 0 0 0 3px ${STUDENTS_THEME.violetLight};
}
.std-select-icon {
  position: absolute;
  right: 9px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: ${STUDENTS_THEME.muted};
}
.std-result-count {
  font-size: 12px;
  color: ${STUDENTS_THEME.muted};
  font-weight: 600;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.std-result-count::after {
  content: "";
  flex: 1;
  height: 1px;
  background: ${STUDENTS_THEME.border};
}
.std-list {
  border: 1px solid ${STUDENTS_THEME.border};
  border-radius: 12px;
  background: white;
  overflow: hidden;
}
.std-create-btn {
  margin: 10px;
  width: calc(100% - 20px);
  border: 1.5px dashed ${STUDENTS_THEME.border};
  border-radius: 11px;
  background: white;
  color: ${STUDENTS_THEME.violetDark};
  font-family: ${STUDENTS_THEME.displayFont};
  font-size: 13px;
  font-weight: 700;
  padding: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background .15s, border-color .15s;
}
.std-create-btn:hover {
  background: ${STUDENTS_THEME.violetLight};
  border-color: ${STUDENTS_THEME.violet};
}
.std-row {
  border-top: 1px solid #eff1f7;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.std-row-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.std-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}
.std-name {
  font-family: ${STUDENTS_THEME.displayFont};
  font-size: 16px;
  font-weight: 800;
  color: ${STUDENTS_THEME.text};
  line-height: 1.15;
  margin-bottom: 4px;
}
.std-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.std-meta-item {
  font-size: 11.5px;
  color: ${STUDENTS_THEME.muted};
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.std-profile-btn {
  border: none;
  border-radius: 10px;
  background: ${STUDENTS_THEME.violet};
  color: white;
  font-family: ${STUDENTS_THEME.displayFont};
  font-size: 12px;
  font-weight: 800;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  white-space: nowrap;
  transition: background .14s;
}
.std-profile-btn:hover {
  background: ${STUDENTS_THEME.violetDark};
}
.std-empty {
  border-top: 1px solid #eff1f7;
  padding: 34px 18px;
  text-align: center;
  color: ${STUDENTS_THEME.muted};
  font-size: 13px;
}
@media (max-width: 1024px) {
  .std-page {
    margin: 20px 8%;
  }
}
@media (max-width: 768px) {
  .std-page {
    margin: 16px 16px;
    padding: 22px 20px 28px;
  }
  .std-controls {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }
  .std-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;

/**
 * ProgressData stores progress statistics received from the backend.
 */
type ProgressData = {
  id: number;
  passed_tests: number;
  progress_percent: number;
  total_tests: number;
};

/**
 * StudentRow stores normalized data used by the UI list.
 */
type StudentRow = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  registrationDate: string;
  completedUnits: number;
  totalTests: number;
};

/**
 * StudentFilterTab defines available UI tabs in the students toolbar.
 */
type StudentFilterTab = "all" | "online" | "marathons";

/**
 * SORT_OPTIONS defines available sorting presets in the toolbar select.
 */
const SORT_OPTIONS = [
  { value: "created_desc", label: "По дате создания" },
  { value: "created_asc", label: "По дате создания (старые)" },
  { value: "name_asc", label: "По имени (А-Я)" },
  { value: "name_desc", label: "По имени (Я-А)" },
] as const;

/**
 * createAvatarToneClass returns a deterministic pastel color for avatar bubbles.
 */
function createAvatarToneClass(studentId: number) {
  const tones = [
    { background: "#DCFCE7", color: "#16A34A" },
    { background: "#DAEEFF", color: "#0099E6" },
    { background: "#EEF0FE", color: "#4F52C2" },
    { background: "#FFECE5", color: "#F76D3C" },
  ];
  return tones[studentId % tones.length];
}

/**
 * buildDisplayName joins first and last names while handling empty values.
 */
function buildDisplayName(student: StudentRow) {
  return `${student.firstName} ${student.lastName}`.trim() || "Без имени";
}

/**
 * resolveInitial generates the first avatar letter based on available identity fields.
 */
function resolveInitial(student: StudentRow) {
  const fullName = buildDisplayName(student);
  if (fullName !== "Без имени") {
    return fullName[0].toUpperCase();
  }
  return student.email?.[0]?.toUpperCase() || "?";
}

export default function AdminStudentsPage() {
  // Stores authenticated user info so create-student payload can include teacher id.
  const { user } = useAuth();
  /**
   * navigate enables route transitions to student profile pages.
   */
  const navigate = useNavigate();
  /**
   * students keeps normalized roster entries fetched from the backend.
   */
  const [students, setStudents] = useState<StudentRow[]>([]);
  /**
   * searchQuery stores free-text filter input from the toolbar search.
   */
  const [searchQuery, setSearchQuery] = useState("");
  /**
   * selectedTab keeps active tab state for the segmented filters UI.
   */
  const [selectedTab, setSelectedTab] = useState<StudentFilterTab>("all");
  /**
   * selectedSort stores selected sort mode from the dropdown.
   */
  const [selectedSort, setSelectedSort] =
    useState<(typeof SORT_OPTIONS)[number]["value"]>("created_desc");
  /**
   * isListView toggles between list and grid icons (list is default as in screenshot).
   */
  const [isListView, setIsListView] = useState(true);
  /**
   * isAddStudentModalOpen controls visibility of create-student modal.
   */
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  /**
   * isCreatingStudent tracks pending create-student API request state.
   */
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);
  /**
   * createStudentError keeps backend errors returned from creation request.
   */
  const [createStudentError, setCreateStudentError] = useState<string | null>(
    null,
  );
  /**
   * isLoginCredentialsModalOpen controls visibility of post-create credentials modal.
   */
  const [isLoginCredentialsModalOpen, setIsLoginCredentialsModalOpen] =
    useState(false);
  /**
   * createdStudentCredentials stores login payload shown after successful student creation.
   */
  const [createdStudentCredentials, setCreatedStudentCredentials] =
    useState<StudentLoginCredentials | null>(null);

  /**
   * fetchStudents loads student roster and merges progress metadata.
   */
  const fetchStudents = async () => {
    try {
      const data = await usersApi.getStudents();
      const normalized: StudentRow[] = data.map((s: any) => ({
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        email: s.email,
        registrationDate: s.created_at,
        completedUnits: 0,
        totalTests: 0,
      }));

      const progressData: ProgressData[] =
        await progressApi.getStudentsProgress();
      const progressMap = new Map(progressData.map((p) => [p.id, p]));

      const merged: StudentRow[] = normalized.map((student) => {
        const progress = progressMap.get(student.id);
        if (progress) {
          return {
            ...student,
            completedUnits: progress.passed_tests || 0,
            totalTests: progress.total_tests || 0,
          };
        }
        return student;
      });

      setStudents(merged);
    } catch (error) {
      console.error(error);
    }
  };
  useEffect(() => {
    fetchStudents();
  }, []);

  /**
   * handleCreateStudent creates a new student and then refreshes roster.
   */
  const handleCreateStudent = async (formData: AddStudentFormData) => {
    setCreateStudentError(null);
    setIsCreatingStudent(true);
    try {
      // Stores response payload so UI can show login details in follow-up modal.
      const createdStudent = await usersApi.createStudent({
        email: formData.email.trim(),
        first_name: formData.firstName.trim(),
        phone: formData.phone.trim() || undefined,
        native_language: formData.nativeLanguage,
        timezone: formData.timezone,
        teacher_id: user?.id,
      });
      // Stores absolute login URL with frontend origin for easier sharing.
      const shareableLoginUrl = createdStudent.login_url.startsWith("http")
        ? createdStudent.login_url
        : `${window.location.origin}${createdStudent.login_url}`;
      setCreatedStudentCredentials({
        loginUrl: shareableLoginUrl,
        email: createdStudent.email,
        password: createdStudent.temporary_password,
      });
      setIsAddStudentModalOpen(false);
      setIsLoginCredentialsModalOpen(true);
      await fetchStudents();
    } catch (error: any) {
      const backendMessage = error?.response?.data?.detail;
      setCreateStudentError(
        typeof backendMessage === "string"
          ? backendMessage
          : "Не удалось сохранить ученика. Проверьте данные и попробуйте снова.",
      );
    } finally {
      setIsCreatingStudent(false);
    }
  };
  /**
   * handleCopyStudentCredentials copies formatted login details into clipboard.
   */
  const handleCopyStudentCredentials = async () => {
    if (!createdStudentCredentials) return;
    // Stores multiline share text matching fields displayed in credentials modal.
    const shareMessage = [
      "Данные для входа ученика в личный кабинет:",
      `Страница входа: ${createdStudentCredentials.loginUrl}`,
      `Почта аккаунта: ${createdStudentCredentials.email}`,
      `Пароль: ${createdStudentCredentials.password}`,
    ].join("\n");
    await navigator.clipboard.writeText(shareMessage);
  };
  /**
   * handleSendCredentialsEmail opens default mail app with prefilled credentials body.
   */
  const handleSendCredentialsEmail = () => {
    if (!createdStudentCredentials) return;
    // Stores email subject used in prefilled outbound message.
    const emailSubject = "Данные для входа в личный кабинет";
    // Stores email body with credentials so teacher can send it immediately.
    const emailBody = [
      "Здравствуйте!",
      "",
      "Отправляю данные для входа ученика в личный кабинет:",
      `Страница входа: ${createdStudentCredentials.loginUrl}`,
      `Почта аккаунта: ${createdStudentCredentials.email}`,
      `Пароль: ${createdStudentCredentials.password}`,
    ].join("\n");
    const mailtoUrl = `mailto:${encodeURIComponent(createdStudentCredentials.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
  };
  /**
   * filteredStudents applies search and tab filtering for list rendering.
   */
  const filteredStudents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return students.filter((student) => {
      const displayName = buildDisplayName(student).toLowerCase();
      const matchesSearch =
        normalizedQuery.length === 0 ||
        displayName.includes(normalizedQuery) ||
        student.email.toLowerCase().includes(normalizedQuery) ||
        `${student.id}`.includes(normalizedQuery);

      if (!matchesSearch) return false;

      // Keep tabs as UI-compatible categories until dedicated backend fields are available.
      if (selectedTab === "online") return student.completedUnits > 0;
      if (selectedTab === "marathons") return student.totalTests > 0;
      return true;
    });
  }, [searchQuery, selectedTab, students]);

  /**
   * sortedStudents orders filtered roster based on selected toolbar sort mode.
   */
  const sortedStudents = useMemo(() => {
    const nextStudents = [...filteredStudents];
    nextStudents.sort((left, right) => {
      if (selectedSort === "name_asc") {
        return buildDisplayName(left).localeCompare(
          buildDisplayName(right),
          "ru",
        );
      }
      if (selectedSort === "name_desc") {
        return buildDisplayName(right).localeCompare(
          buildDisplayName(left),
          "ru",
        );
      }
      const leftDate = new Date(left.registrationDate).getTime();
      const rightDate = new Date(right.registrationDate).getTime();
      if (selectedSort === "created_asc") return leftDate - rightDate;
      return rightDate - leftDate;
    });
    return nextStudents;
  }, [filteredStudents, selectedSort]);

  return (
    <div className="std-root">
      <style>{STUDENTS_PAGE_CSS}</style>
      <div className="std-page">
        <h1 className="std-title">Ученики</h1>

        <div className="std-warning">
          <div className="std-warning-text">
            <AlertCircle size={16} />
            <span>
              Тариф не оплачен. Оплатите тариф для возобновления доступа к
              платформе.
            </span>
          </div>
          <button
            type="button"
            className="std-warning-btn"
          >
            Выбрать тариф
          </button>
        </div>

        <div className="std-search">
          <Search size={14} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск учеников"
          />
        </div>

        <div className="std-toolbar">
          <div className="std-tabs">
            <button
              type="button"
              onClick={() => setSelectedTab("all")}
              className={`std-tab ${selectedTab === "all" ? "on" : ""}`}
            >
              Все
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab("online")}
              className={`std-tab ${selectedTab === "online" ? "on" : ""}`}
            >
              Онлайн-уроки
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab("marathons")}
              className={`std-tab ${selectedTab === "marathons" ? "on" : ""}`}
            >
              Марафоны
            </button>
          </div>

          <div className="std-controls">
            <div className="std-view-toggle">
              <button
                type="button"
                onClick={() => setIsListView(false)}
                className={`std-vbtn ${!isListView ? "on" : ""}`}
                title="Сетка"
              >
                <Grid2X2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => setIsListView(true)}
                className={`std-vbtn ${isListView ? "on" : ""}`}
                title="Список"
              >
                <List size={14} />
              </button>
            </div>
            <button type="button" className="std-icon-btn" title="Фильтры">
              <SlidersHorizontal size={14} />
            </button>
            <div className="std-select-wrap">
              <select
                value={selectedSort}
                onChange={(event) =>
                  setSelectedSort(
                    event.target.value as (typeof SORT_OPTIONS)[number]["value"],
                  )
                }
                className="std-select"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="std-select-icon" />
            </div>
          </div>
        </div>

        <p className="std-result-count">Кол-во учеников {sortedStudents.length}</p>

        <div className="std-list">
          <button
            type="button"
            onClick={() => setIsAddStudentModalOpen(true)}
            className="std-create-btn"
          >
            <Plus size={14} />
            <span>Создать ученика</span>
          </button>

          {sortedStudents.map((student) => (
            <div key={student.id} className="std-row">
              <div className="std-row-main">
                <div
                  className="std-avatar"
                  style={createAvatarToneClass(student.id)}
                >
                  {resolveInitial(student)}
                </div>
                <div>
                  <p className="std-name">{buildDisplayName(student)}</p>
                  <div className="std-meta">
                    <span className="std-meta-item">
                      <UserRound size={13} />
                      ID {student.id}
                    </span>
                    <span className="std-meta-item">
                      <Mail size={13} />
                      {student.email}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/admin/students/${student.id}`)}
                className="std-profile-btn"
              >
                <UserRound size={14} />
                Профиль ученика
              </button>
            </div>
          ))}

          {sortedStudents.length === 0 && (
            <div className="std-empty">
              Ученики не найдены. Попробуйте изменить поиск.
            </div>
          )}
        </div>
      </div>

      <AddStudentModal
        open={isAddStudentModalOpen}
        onClose={() => {
          if (isCreatingStudent) return;
          setCreateStudentError(null);
          setIsAddStudentModalOpen(false);
        }}
        onCreate={handleCreateStudent}
        isSubmitting={isCreatingStudent}
        errorMessage={createStudentError}
      />
      <StudentLoginCredentialsModal
        open={isLoginCredentialsModalOpen}
        credentials={createdStudentCredentials}
        onClose={() => setIsLoginCredentialsModalOpen(false)}
        onCopy={handleCopyStudentCredentials}
        onSendEmail={handleSendCredentialsEmail}
      />
    </div>
  );
}
