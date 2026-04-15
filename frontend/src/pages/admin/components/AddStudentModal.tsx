import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

/**
 * MODAL_THEME stores color and typography tokens aligned with courses catalog styling.
 */
const MODAL_THEME = {
  violet: '#6C6FEF',
  violetLight: '#EEF0FE',
  violetDark: '#4F52C2',
  white: '#FFFFFF',
  border: '#E8E8F0',
  text: '#18181B',
  subText: '#52525B',
  muted: '#A1A1AA',
  red: '#EF4444',
  redDark: '#DC2626',
  redLight: '#FEE2E2',
  displayFont: "'Nunito', system-ui, sans-serif",
  bodyFont: "'Inter', system-ui, sans-serif",
} as const;

/**
 * ADD_STUDENT_MODAL_CSS stores scoped styles for the create/edit student dialog.
 */
const ADD_STUDENT_MODAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

.asm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(24,24,27,.35);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.asm-modal {
  width: 100%;
  max-width: 760px;
  border-radius: 18px;
  background: ${MODAL_THEME.white};
  border: 1px solid ${MODAL_THEME.border};
  box-shadow: 0 20px 54px rgba(0,0,0,.15);
  color: ${MODAL_THEME.text};
  font-family: ${MODAL_THEME.bodyFont};
}
.asm-content {
  padding: 26px 28px;
}
.asm-head {
  position: relative;
  margin-bottom: 14px;
}
.asm-close {
  position: absolute;
  right: 0;
  top: 0;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: ${MODAL_THEME.muted};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .13s, color .13s;
}
.asm-close:hover {
  background: #f1f5f9;
  color: ${MODAL_THEME.subText};
}
.asm-close:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.asm-title-wrap {
  text-align: center;
}
.asm-emoji {
  font-size: 34px;
  line-height: 1;
}
.asm-title {
  margin-top: 8px;
  font-family: ${MODAL_THEME.displayFont};
  font-size: 28px;
  font-weight: 900;
  color: ${MODAL_THEME.text};
}
.asm-rows {
  border-top: 1px solid ${MODAL_THEME.border};
  border-bottom: 1px solid ${MODAL_THEME.border};
}
.asm-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  align-items: center;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid ${MODAL_THEME.border};
}
.asm-row:last-child {
  border-bottom: none;
}
.asm-label {
  font-size: 14px;
  font-weight: 700;
  color: ${MODAL_THEME.subText};
  font-family: ${MODAL_THEME.displayFont};
}
.asm-input,
.asm-select {
  width: 100%;
  height: 42px;
  border-radius: 10px;
  border: 1.5px solid ${MODAL_THEME.border};
  padding: 0 13px;
  font-size: 13px;
  color: ${MODAL_THEME.text};
  background: white;
  outline: none;
  font-family: ${MODAL_THEME.bodyFont};
  transition: border-color .13s, box-shadow .13s;
}
.asm-input::placeholder {
  color: #d4d4d8;
}
.asm-input:focus,
.asm-select:focus {
  border-color: ${MODAL_THEME.violet};
  box-shadow: 0 0 0 3px ${MODAL_THEME.violetLight};
}
.asm-select-wrap {
  position: relative;
}
.asm-select {
  appearance: none;
  padding-right: 36px;
}
.asm-select-icon {
  pointer-events: none;
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: ${MODAL_THEME.muted};
}
.asm-delete-btn {
  height: 42px;
  min-width: 150px;
  border: none;
  border-radius: 10px;
  background: ${MODAL_THEME.red};
  color: white;
  font-size: 13px;
  font-weight: 800;
  font-family: ${MODAL_THEME.displayFont};
  padding: 0 15px;
  cursor: pointer;
  transition: background .13s;
}
.asm-delete-btn:hover {
  background: ${MODAL_THEME.redDark};
}
.asm-delete-btn:disabled {
  opacity: .7;
  cursor: not-allowed;
}
.asm-error {
  margin-top: 12px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 12.5px;
  padding: 10px 11px;
}
.asm-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.asm-btn-secondary {
  height: 40px;
  min-width: 152px;
  border-radius: 10px;
  border: 1.5px solid ${MODAL_THEME.border};
  background: white;
  color: ${MODAL_THEME.subText};
  font-family: ${MODAL_THEME.displayFont};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .13s;
}
.asm-btn-secondary:hover {
  border-color: ${MODAL_THEME.violet};
  color: ${MODAL_THEME.violetDark};
  background: ${MODAL_THEME.violetLight};
}
.asm-btn-primary {
  height: 40px;
  min-width: 152px;
  border: none;
  border-radius: 10px;
  background: ${MODAL_THEME.violet};
  color: white;
  font-family: ${MODAL_THEME.displayFont};
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background .13s;
}
.asm-btn-primary:hover {
  background: ${MODAL_THEME.violetDark};
}
.asm-btn-secondary:disabled,
.asm-btn-primary:disabled {
  opacity: .65;
  cursor: not-allowed;
}
@media (max-width: 768px) {
  .asm-content {
    padding: 20px;
  }
  .asm-row {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 10px 0;
  }
}
`;

/**
 * Stores the shape of data entered in the create-student modal form.
 */
export type AddStudentFormData = {
  email: string;
  phone: string;
  firstName: string;
  nativeLanguage: string;
  timezone: string;
};

/**
 * Defines the external controls and callbacks for the create-student modal.
 */
type AddStudentModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate?: (data: AddStudentFormData) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  errorMessage?: string | null;
  mode?: 'create' | 'edit';
  initialData?: Partial<AddStudentFormData>;
};

/**
 * Provides a curated set of native language options for quick selection.
 */
const NATIVE_LANGUAGE_OPTIONS = [
  'Русский',
  'Қазақша',
  'English',
  'Italiano',
  'Español',
  'Français',
];

/**
 * Provides common timezone presets displayed in the form dropdown.
 */
const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC (UTC+0)' },
  { value: 'Asia/Almaty', label: 'Asia/Almaty (UTC+5)' },
  { value: 'Asia/Astana', label: 'Asia/Astana (UTC+5)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow (UTC+3)' },
  { value: 'Europe/Rome', label: 'Europe/Rome (UTC+1)' },
  { value: 'America/New_York', label: 'America/New_York (UTC-5)' },
];

/**
 * Renders a centered modal for creating a student with the requested fields.
 */
export default function AddStudentModal({
  open,
  onClose,
  onCreate,
  onDelete,
  isSubmitting = false,
  isDeleting = false,
  errorMessage = null,
  mode = 'create',
  initialData,
}: AddStudentModalProps) {
  /**
   * Tracks all editable field values displayed in the modal form.
   */
  const [formData, setFormData] = useState<AddStudentFormData>({
    email: '',
    phone: '',
    firstName: '',
    nativeLanguage: NATIVE_LANGUAGE_OPTIONS[0],
    timezone: TIMEZONE_OPTIONS[0].value,
  });
  // Stores combined pending state so modal locks during save/delete requests.
  const isBusy = isSubmitting || isDeleting;

  /**
   * Resets modal form fields every time the modal is reopened.
   */
  useEffect(() => {
    if (!open) return;
    // Stores the fallback blank form used for create mode and missing edit fields.
    const emptyFormData: AddStudentFormData = {
      email: '',
      phone: '',
      firstName: '',
      nativeLanguage: NATIVE_LANGUAGE_OPTIONS[0],
      timezone: TIMEZONE_OPTIONS[0].value,
    };
    // Stores merged initial state so edit mode opens with prefilled values.
    const mergedInitialData: AddStudentFormData = {
      ...emptyFormData,
      ...initialData,
    };
    setFormData({
      email: mergedInitialData.email,
      phone: mergedInitialData.phone,
      firstName: mergedInitialData.firstName,
      nativeLanguage: mergedInitialData.nativeLanguage,
      timezone: mergedInitialData.timezone,
    });
  }, [open, initialData]);

  /**
   * Closes the modal when Escape is pressed for expected dialog UX.
   */
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose, isBusy]);

  /**
   * Updates one specific field while keeping all other form values intact.
   */
  const updateField = <K extends keyof AddStudentFormData>(
    key: K,
    value: AddStudentFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Sends the entered modal data to the parent handler and closes the dialog.
   */
  const handleCreate = async () => {
    if (!onCreate) return;
    await onCreate(formData);
  };

  /**
   * Sends delete request to the parent edit handler.
   */
  const handleDelete = async () => {
    if (!onDelete) return;
    await onDelete();
  };

  // Stores title text so one modal supports both create and edit flows.
  const modalTitle = mode === 'edit' ? 'Редактировать ученика' : 'Создать ученика';
  // Stores submit button label for the selected modal mode.
  const submitButtonLabel = mode === 'edit' ? 'Сохранить' : 'Создать';
  // Stores dialog aria label for accessibility tools.
  const dialogAriaLabel = mode === 'edit' ? 'Редактировать ученика' : 'Создать ученика';

  if (!open) return null;

  return createPortal(
    <div
      className="asm-overlay"
      onClick={() => {
        if (!isBusy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={dialogAriaLabel}
    >
      <style>{ADD_STUDENT_MODAL_CSS}</style>
      <div
        className="asm-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="asm-content">
          <div className="asm-head">
            <button
              onClick={onClose}
              disabled={isBusy}
              className="asm-close"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="asm-title-wrap">
              <div className="asm-emoji" aria-hidden>
                🙋🏻‍♂️
              </div>
              <h2 className="asm-title">{modalTitle}</h2>
            </div>
          </div>

          <div className="asm-rows">
            <div className="asm-row">
              <label className="asm-label">Почта</label>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="Эл. почта ученика"
                className="asm-input"
              />
            </div>

            <div className="asm-row">
              <label className="asm-label">Телефон</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                placeholder="Номер телефона ученика"
                className="asm-input"
              />
            </div>

            <div className="asm-row">
              <label className="asm-label">Имя</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(event) => updateField('firstName', event.target.value)}
                placeholder="Имя ученика"
                className="asm-input"
              />
            </div>

            <div className="asm-row">
              <label className="asm-label">Родной язык</label>
              <div className="asm-select-wrap">
                <select
                  value={formData.nativeLanguage}
                  onChange={(event) => updateField('nativeLanguage', event.target.value)}
                  className="asm-select"
                >
                  {NATIVE_LANGUAGE_OPTIONS.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
                <ChevronDown className="asm-select-icon h-5 w-5" />
              </div>
            </div>

            <div className="asm-row">
              <label className="asm-label">Часовой пояс</label>
              <div className="asm-select-wrap">
                <select
                  value={formData.timezone}
                  onChange={(event) => updateField('timezone', event.target.value)}
                  className="asm-select"
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="asm-select-icon h-5 w-5" />
              </div>
            </div>
            {mode === 'edit' && (
              <div className="asm-row">
                <label className="asm-label">Удалить ученика</label>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isBusy}
                  className="asm-delete-btn"
                >
                  {isDeleting ? 'Удаление...' : 'Удалить'}
                </button>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="asm-error">
              {errorMessage}
            </div>
          )}

          <div className="asm-actions">
            <button
              onClick={onClose}
              disabled={isBusy}
              className="asm-btn-secondary"
            >
              Отмена
            </button>
            <button
              onClick={handleCreate}
              disabled={isBusy}
              className="asm-btn-primary"
            >
              {isSubmitting ? 'Сохранение...' : submitButtonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
