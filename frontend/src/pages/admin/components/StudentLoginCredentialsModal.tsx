/**
 * Student login credentials modal shown right after student creation succeeds.
 */
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

/**
 * Stores credentials data rendered inside the shareable student login card.
 */
export type StudentLoginCredentials = {
  loginUrl: string;
  email: string;
  password: string;
};

/**
 * Defines external controls and callbacks for the credentials modal.
 */
type StudentLoginCredentialsModalProps = {
  open: boolean;
  credentials: StudentLoginCredentials | null;
  onClose: () => void;
  onCopy: () => Promise<void> | void;
  onSendEmail: () => Promise<void> | void;
};

/**
 * Renders a centered credentials modal matching the add-student success design.
 */
export default function StudentLoginCredentialsModal({
  open,
  credentials,
  onClose,
  onCopy,
  onSendEmail,
}: StudentLoginCredentialsModalProps) {
  const { t } = useTranslation();

  if (!open || !credentials) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("admin.studentsPage.loginModal.aria")}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl bg-[#f7f8fc] p-3.5 shadow-2xl ring-1 ring-slate-200 sm:p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="ml-auto block rounded-lg p-1 text-slate-300 transition hover:bg-slate-200/60 hover:text-slate-500"
          aria-label={t("admin.studentsPage.loginModal.close")}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mt-1 text-center">
          <div className="text-[40px] leading-none sm:text-[44px]" aria-hidden>
            👨🏻‍💻
          </div>
          <h2 className="mt-1.5 text-[26px] font-black leading-[1.05] tracking-[-0.01em] text-[#4c4e68] sm:text-[28px]">
            {t("admin.studentsPage.loginModal.title")}
            <br />
            {t("admin.studentsPage.loginModal.titleLine2")}
          </h2>
          <p className="mt-2 text-[14px] font-medium leading-snug text-[#575a73] sm:text-[15px]">
            {t("admin.studentsPage.loginModal.subtitle")}
            <br />
            {t("admin.studentsPage.loginModal.subtitleLine2")}
          </p>
        </div>

        <div className="mt-4 rounded-2xl bg-[#f3f4f8] px-3 py-3 shadow-[0_10px_25px_rgba(27,35,58,0.06)] ring-1 ring-[#eceef6] sm:px-4">
          <p className="text-center text-[16px] font-bold leading-tight text-[#5a5c76] sm:text-[17px]">
            {t("admin.studentsPage.loginModal.cardTitle")}
            <br />
            {t("admin.studentsPage.loginModal.cardTitleLine2")}
          </p>
          <div className="mt-3 divide-y divide-[#e1e4ef]">
            <div className="pb-1.5">
              <p className="text-[12px] font-semibold text-[#afb4cb]">
                {t("admin.studentsPage.loginModal.loginPage")}
              </p>
              <p className="mt-0.5 break-all text-[14px] font-medium text-[#5d6079]">
                {credentials.loginUrl}
              </p>
            </div>
            <div className="py-1.5">
              <p className="text-[12px] font-semibold text-[#afb4cb]">
                {t("admin.studentsPage.loginModal.accountEmail")}
              </p>
              <p className="mt-0.5 break-all text-[14px] font-medium text-[#5d6079]">
                {credentials.email}
              </p>
            </div>
            <div className="py-1.5">
              <p className="text-[12px] font-semibold text-[#afb4cb]">
                {t("admin.studentsPage.loginModal.password")}
              </p>
              <p className="mt-0.5 text-[16px] font-semibold tracking-wide text-[#5d6079]">
                {credentials.password}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCopy}
            className="mt-2.5 w-full rounded-lg py-1.5 text-[14px] font-bold text-[#2ec8ff] transition hover:text-[#00b2f0]"
          >
            {t("admin.studentsPage.loginModal.copy")}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl bg-[#eceef5] px-3 text-[14px] font-bold text-[#8c8fa6] transition hover:bg-[#e2e5ef]"
          >
            {t("admin.studentsPage.loginModal.close")}
          </button>
          <button
            type="button"
            onClick={onSendEmail}
            className="h-10 rounded-xl bg-[#2ec8ff] px-3 text-[14px] font-bold text-white transition hover:bg-[#19bdf7]"
          >
            {t("admin.studentsPage.loginModal.sendEmail")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
