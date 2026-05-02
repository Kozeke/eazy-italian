/**
 * CheckoutSuccessPage.tsx
 *
 * Public page shown after Stripe Checkout success (e.g. /success).
 * Matches admin violet/slate styling; CTAs route teachers to the main admin surfaces.
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function CheckoutSuccessPage() {
  const { t } = useTranslation();

  // Shared shell width so the card aligns with other marketing/admin surfaces.
  const maxWidthClass = "mx-auto w-full max-w-lg";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F7F7FA] via-white to-[#EEF0FE]/40 px-4 py-16 text-slate-800">
      <div className={maxWidthClass}>
        <div
          className="rounded-2xl border border-[#E8E8F0] bg-white px-8 py-10 shadow-[0_1px_4px_rgba(108,111,239,0.06),0_12px_40px_rgba(108,111,239,0.08)]"
        >
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <CheckCircle2 className="h-9 w-9" strokeWidth={2} aria-hidden />
          </div>

          <h1 className="text-center text-2xl font-black tracking-tight text-slate-900">
            {t("subscriptionCheckout.successTitle")}
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
            {t("subscriptionCheckout.successSubtitle")}
          </p>
          <p className="mt-2 text-center text-xs text-slate-500">
            {t("subscriptionCheckout.successHint")}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/admin/courses"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-violet-600 bg-violet-600 px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:-translate-y-px hover:bg-violet-700 hover:shadow-[0_6px_16px_rgba(108,111,239,0.28)] sm:flex-initial sm:min-w-[200px]"
            >
              {t("subscriptionCheckout.goToCourses")}
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
            <Link
              to="/admin/tariffs"
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#E8E8F0] bg-white px-4 py-3 text-center text-sm font-bold text-[#4F52C2] shadow-sm transition hover:border-violet-300 hover:bg-violet-50 sm:flex-initial sm:min-w-[160px]"
            >
              {t("subscriptionCheckout.goToPlans")}
            </Link>
          </div>

          <p className="mt-8 text-center">
            <Link to="/" className="text-xs font-semibold text-slate-500 underline-offset-4 hover:text-violet-700 hover:underline">
              {t("subscriptionCheckout.backHome")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
