/**
 * AdminTariffsConnectPage.tsx
 *
 * Dedicated route wrapper for tariff checkout so Connect no longer opens from the tariffs grid directly.
 */

import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { teacherTariffsApi } from "../../services/api";
import ConnectPaymentModal from "./components/ConnectPaymentModal";

// Supported billing windows for paid plans.
type BillingDuration = "1m" | "3m" | "6m" | "12m";
// Supported plan identifiers accepted from query params.
type ConnectablePlanId = "free" | "standard" | "pro";
// Normalized display + payment payload consumed by the checkout modal.
type ConnectCheckoutPayload = {
  durationLabel: string;
  planName: string;
  priceLabel: string;
  planTagLabels: readonly string[];
  yearSavingsLabel?: string;
  amountUsd: number;
  planCode: ConnectablePlanId;
  billingPeriod: BillingDuration | null;
};

// Base monthly display price for Standard checkout.
const STANDARD_PLAN_PRICE_USD = 14.9;
// Base monthly display price for Pro checkout.
const PRO_PLAN_PRICE_USD = 65;
// Label lookup used in the checkout summary header.
const BILLING_DURATION_LABELS: Record<BillingDuration, string> = {
  "1m": "1 mo",
  "3m": "3 mo",
  "6m": "6 mo",
  "12m": "1 yr",
};
// Feature highlights shown for Free checkout.
const PLAN_FEATURES_FREE = [
  "AI course generations: 1",
  "AI unit generations: 2",
] as const;
// Feature highlights shown for Standard checkout.
const PLAN_FEATURES_STANDARD = [
  "AI course generations: 5",
  "AI unit generations: 10",
] as const;
// Feature highlights shown for Pro checkout.
const PLAN_FEATURES_PRO = [
  "AI course generations: Unlimited",
  "AI unit generations: Unlimited",
] as const;

// Narrows unknown query value to a valid billing duration.
function isBillingDuration(value: string | null): value is BillingDuration {
  return value === "1m" || value === "3m" || value === "6m" || value === "12m";
}

// Narrows unknown query value to a valid tariff plan code.
function isConnectablePlan(value: string | null): value is ConnectablePlanId {
  return value === "free" || value === "standard" || value === "pro";
}

// Builds checkout data from URL params so the route can be opened directly.
function buildConnectPayload(
  planCode: ConnectablePlanId,
  selectedDuration: BillingDuration,
): ConnectCheckoutPayload {
  if (planCode === "free") {
    return {
      durationLabel: "Forever",
      planName: "Free",
      priceLabel: "0.00 USD",
      planTagLabels: PLAN_FEATURES_FREE,
      yearSavingsLabel: undefined,
      amountUsd: 0,
      planCode: "free",
      billingPeriod: null,
    };
  }
  // Calculates yearly savings hint for non-annual billing selections.
  const yearSavingsHint =
    selectedDuration === "12m"
      ? undefined
      : `If you pay for 1 year you could save: ${
          Math.round(
            ((planCode === "standard" ? STANDARD_PLAN_PRICE_USD : PRO_PLAN_PRICE_USD) * 12 * 0.25) *
              10,
          ) / 10
        } USD`;
  if (planCode === "standard") {
    return {
      durationLabel: BILLING_DURATION_LABELS[selectedDuration],
      planName: "Standard",
      priceLabel: `${STANDARD_PLAN_PRICE_USD.toFixed(2)} USD`,
      planTagLabels: PLAN_FEATURES_STANDARD,
      yearSavingsLabel: yearSavingsHint,
      amountUsd: STANDARD_PLAN_PRICE_USD,
      planCode: "standard",
      billingPeriod: selectedDuration,
    };
  }
  return {
    durationLabel: BILLING_DURATION_LABELS[selectedDuration],
    planName: "Pro",
    priceLabel: `${PRO_PLAN_PRICE_USD.toFixed(2)} USD`,
    planTagLabels: PLAN_FEATURES_PRO,
    yearSavingsLabel: yearSavingsHint,
    amountUsd: PRO_PLAN_PRICE_USD,
    planCode: "pro",
    billingPeriod: selectedDuration,
  };
}

export default function AdminTariffsConnectPage() {
  // Navigation helper for returning to tariffs after cancel/success.
  const navigate = useNavigate();
  // Parsed URL params used to reconstruct selected plan and billing period.
  const [searchParams] = useSearchParams();
  // Raw plan key from `?plan=` query param.
  const rawPlanCode = searchParams.get("plan");
  // Raw duration key from `?duration=` query param.
  const rawDuration = searchParams.get("duration");
  // Normalized checkout payload consumed by ConnectPaymentModal.
  const connectPayload = useMemo(() => {
    if (!isConnectablePlan(rawPlanCode)) return null;
    const selectedDuration = isBillingDuration(rawDuration) ? rawDuration : "1m";
    return buildConnectPayload(rawPlanCode, selectedDuration);
  }, [rawDuration, rawPlanCode]);
  // Returns to the tariffs overview when checkout is canceled.
  const handleClose = () => {
    navigate("/admin/tariffs", { replace: true });
  };
  // Records successful payment and redirects to the Payments tab with a refresh token.
  const handlePay = async (providerRef: string) => {
    if (!connectPayload) return;
    await teacherTariffsApi.recordPayment({
      amount: connectPayload.amountUsd,
      currency: "USD",
      status: "succeeded",
      plan_code: connectPayload.planCode,
      ...(connectPayload.billingPeriod ? { billing_period: connectPayload.billingPeriod } : {}),
      description: `Checkout — ${connectPayload.planName} (${connectPayload.durationLabel})`,
      provider_ref: providerRef,
    });
    navigate(`/admin/tariffs?tab=payments&refresh=${Date.now()}`, { replace: true });
  };

  if (!connectPayload) {
    return (
      <section className="mx-auto mt-7 max-w-[760px] rounded-2xl border border-[#E8E8F0] bg-white px-6 py-6 text-sm text-slate-700 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
        <h1 className="text-xl font-black tracking-tight text-slate-900">Subscription setup</h1>
        <p className="mt-2 text-sm text-slate-600">
          Please choose a valid plan from the tariffs page before starting checkout.
        </p>
        <button
          type="button"
          onClick={handleClose}
          className="mt-4 rounded-xl border border-violet-600 bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-violet-700"
        >
          Back to Tariffs
        </button>
      </section>
    );
  }

  return (
    <ConnectPaymentModal
      open
      onClose={handleClose}
      durationLabel={connectPayload.durationLabel}
      planName={connectPayload.planName}
      priceLabel={connectPayload.priceLabel}
      planTagLabels={connectPayload.planTagLabels}
      yearSavingsLabel={connectPayload.yearSavingsLabel}
      amountUsd={connectPayload.amountUsd}
      planCode={connectPayload.planCode}
      billingPeriod={connectPayload.billingPeriod}
      onPay={handlePay}
    />
  );
}
