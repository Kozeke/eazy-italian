/**
 * CheckoutCancelPage.tsx
 *
 * Public page when the user leaves Stripe Checkout without paying (e.g. /cancel).
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

export default function CheckoutCancelPage() {
  const { t } = useTranslation();

  // Keeps layout consistent with CheckoutSuccessPage.
  const maxWidthClass = "mx-auto w-full max-w-lg";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F7F7FA] via-white to-slate-50 px-4 py-16 text-slate-800">
      <div className={maxWidthClass}>
        <div className="rounded-2xl border border-[#E8E8F0] bg-white px-8 py-10 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
          <h1 className="text-center text-xl font-black tracking-tight text-slate-900">
            {t("subscriptionCheckout.cancelTitle")}
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
            {t("subscriptionCheckout.cancelSubtitle")}
          </p>
          <p className="mt-2 text-center text-xs text-slate-500">
            {t("subscriptionCheckout.cancelHint")}
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              to="/admin/tariffs"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-600 bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              {t("subscriptionCheckout.viewPlans")}
            </Link>
            <Link to="/" className="text-xs font-semibold text-slate-500 hover:text-violet-700 hover:underline">
              {t("subscriptionCheckout.backHome")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
