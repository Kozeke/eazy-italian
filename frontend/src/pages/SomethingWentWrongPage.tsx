/**
 * SomethingWentWrongPage.tsx
 *
 * Full-screen fallback when a client or server error makes the current flow
 * unusable (e.g. missing segment id → POST .../segments/null/... → 422).
 * Public route so teachers and students can land here without extra guards.
 */

import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, Home } from "lucide-react";

/** App path for this screen — shared with callers that navigate here programmatically. */
export const SOMETHING_WENT_WRONG_PATH = "/something-went-wrong";

export default function SomethingWentWrongPage() {
  const { t } = useTranslation();
  // Returns the user to the previous route when history exists (e.g. classroom).
  const navigate = useNavigate();

  // Matches CheckoutCancelPage width for visual consistency across simple static pages.
  const maxWidthClass = "mx-auto w-full max-w-lg";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F7F7FA] via-white to-slate-50 px-4 py-16 text-slate-800">
      <div className={maxWidthClass}>
        <div className="rounded-2xl border border-[#E8E8F0] bg-white px-8 py-10 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden />
          </div>
          <h1 className="text-center text-xl font-black tracking-tight text-slate-900">
            {t("errorPage.title")}
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
            {t("errorPage.subtitle")}
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-violet-600 bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              {t("errorPage.goBack")}
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-violet-700 hover:underline"
            >
              <Home className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t("errorPage.backHome")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
