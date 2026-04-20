/**
 * AdminTariffsPage.tsx
 *
 * Compact pricing view for instructors: Free / Standard / Pro limits and optional add-ons.
 */

import { useEffect, useMemo, useState } from "react";
import { Crown, HelpCircle } from "lucide-react";
import { coursesApi, teacherTariffsApi } from "../../services/api";
import AdminTariffsPaymentHistory from "./components/AdminTariffsPaymentHistory";
import ConnectPaymentModal from "./components/ConnectPaymentModal";

type BillingDuration = "1m" | "3m" | "6m" | "12m";

// Identifies which pricing card launched the connect checkout.
type ConnectablePlanId = "free" | "standard" | "pro";

// Snapshot passed into the checkout modal and payment POST body builders.
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

// Billing cycle options for paid Standard / Pro rows.
const BILLING_OPTIONS: Array<{ id: BillingDuration; label: string; discount?: string }> = [
  { id: "1m", label: "1 mo" },
  { id: "3m", label: "3 mo", discount: "-5%" },
  { id: "6m", label: "6 mo", discount: "-10%" },
  { id: "12m", label: "1 yr", discount: "-25%" },
];

// Free tier AI generation caps.
const PLAN_FEATURES_FREE = [
  { label: "AI course generations", value: "1" },
  { label: "AI unit generations", value: "2" },
  { label: "AI exercise generations", value: "5" },
] as const;

// Standard tier AI generation caps.
const PLAN_FEATURES_STANDARD = [
  { label: "AI course generations", value: "5" },
  { label: "AI unit generations", value: "10" },
  { label: "AI exercise generations", value: "50" },
] as const;

// Pro tier — unlimited AI generation.
const PLAN_FEATURES_PRO = [
  { label: "AI course generations", value: "Unlimited" },
  { label: "AI unit generations", value: "Unlimited" },
  { label: "AI exercise generations", value: "Unlimited" },
] as const;

// Standard plan headline price on the tariffs grid (USD per selected billing slice).
const STANDARD_PLAN_PRICE_USD = 14.9;

// Pro plan headline price on the tariffs grid (USD per selected billing slice).
const PRO_PLAN_PRICE_USD = 65;

// Optional paid add-ons below the main grid.
const ADDON_PRODUCTS = [
  { title: "AI Assistant", note: "Tokens / mo", value: "200", price: "9 USD" },
  // { title: "White Label", note: "Pro only", value: "—", price: "60 USD" },
  // { title: "Ad block", note: "Pro only", value: "—", price: "30 USD" },
] as const;

// Tiny inline help icon so rows stay compact.
function InfoHint({ title }: { title: string }) {
  return (
    <span title={title} className="inline-flex shrink-0 text-slate-400" role="img" aria-label={title}>
      <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} />
    </span>
  );
}

export default function AdminTariffsPage() {
  // Shared primary action style to keep Tariffs CTAs consistent with other admin catalog pages.
  const primaryActionClass =
    "rounded-xl border border-violet-600 bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-violet-700 hover:shadow-[0_6px_16px_rgba(108,111,239,0.28)]";
  // Shared secondary action style for non-primary tariff actions.
  const secondaryActionClass =
    "rounded-xl border border-[#E8E8F0] bg-white px-3 py-2 text-xs font-bold text-[#4F52C2] shadow-sm transition hover:border-violet-300 hover:bg-violet-50";
  // Top section tab (only Tariffs is fully built; others are placeholders).
  const [activeTab, setActiveTab] = useState<"tariffs" | "payments" | "bonuses" | "certificates">("tariffs");
  // Selected billing window for Standard / Pro display copy.
  const [selectedDuration, setSelectedDuration] = useState<BillingDuration>("1m");
  // Stores total number of teacher courses pulled from admin courses API.
  const [coursesCount, setCoursesCount] = useState<number>(0);
  // Stores loading flag for the course counter widget in the current plan block.
  const [coursesLoading, setCoursesLoading] = useState<boolean>(true);
  // Which plan card (or null) is driving the connect checkout modal.
  const [connectPlanKey, setConnectPlanKey] = useState<ConnectablePlanId | null>(null);
  // Incremented after a successful Pay so the Payments tab refetches ledger rows.
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState<number>(0);

  // Human label for the current-plan strip.
  const durationLabel = useMemo(
    () => BILLING_OPTIONS.find((o) => o.id === selectedDuration)?.label ?? "1 mo",
    [selectedDuration],
  );
  // Tag lines passed into the connect checkout for the Standard column.
  const connectStandardTags = useMemo(
    () =>
      [
        `${PLAN_FEATURES_STANDARD[0].label}: ${PLAN_FEATURES_STANDARD[0].value}`,
        `${PLAN_FEATURES_STANDARD[1].label}: ${PLAN_FEATURES_STANDARD[1].value}`,
      ] as const,
    [],
  );
  // Tag lines passed into the connect checkout for the Pro column.
  const connectProTags = useMemo(
    () =>
      [
        `${PLAN_FEATURES_PRO[0].label}: ${PLAN_FEATURES_PRO[0].value}`,
        `${PLAN_FEATURES_PRO[1].label}: ${PLAN_FEATURES_PRO[1].value}`,
      ] as const,
    [],
  );
  // Tag lines for the Free tier connect flow.
  const connectFreeTags = useMemo(
    () =>
      [
        `${PLAN_FEATURES_FREE[0].label}: ${PLAN_FEATURES_FREE[0].value}`,
        `${PLAN_FEATURES_FREE[1].label}: ${PLAN_FEATURES_FREE[1].value}`,
      ] as const,
    [],
  );
  // Approximate USD saved versus twelve single-month checks when yearly includes -25% (Standard).
  const yearSavingsVersusMonthlyUsd = useMemo(() => {
    if (selectedDuration === "12m") return null;
    const fullYearAtMonthly = STANDARD_PLAN_PRICE_USD * 12;
    const yearlyOffer = fullYearAtMonthly * 0.75;
    return Math.round((fullYearAtMonthly - yearlyOffer) * 10) / 10;
  }, [selectedDuration]);
  // Same yearly savings idea for the Pro monthly list price.
  const proYearSavingsVersusMonthlyUsd = useMemo(() => {
    if (selectedDuration === "12m") return null;
    const fullYearAtMonthly = PRO_PLAN_PRICE_USD * 12;
    const yearlyOffer = fullYearAtMonthly * 0.75;
    return Math.round((fullYearAtMonthly - yearlyOffer) * 10) / 10;
  }, [selectedDuration]);
  // Copy for the yellow upsell row; omitted when yearly billing is already chosen.
  const connectYearSavingsHint = useMemo(() => {
    if (yearSavingsVersusMonthlyUsd == null) return undefined;
    return `If you pay for 1 year you could save: ${yearSavingsVersusMonthlyUsd} USD`;
  }, [yearSavingsVersusMonthlyUsd]);
  // Pro-specific yearly savings line for the modal upsell.
  const connectProYearSavingsHint = useMemo(() => {
    if (proYearSavingsVersusMonthlyUsd == null) return undefined;
    return `If you pay for 1 year you could save: ${proYearSavingsVersusMonthlyUsd} USD`;
  }, [proYearSavingsVersusMonthlyUsd]);
  // Props bundle for ConnectPaymentModal based on the active plan key.
  const connectPaymentPayload = useMemo((): ConnectCheckoutPayload | null => {
    if (!connectPlanKey) return null;
    if (connectPlanKey === "free") {
      return {
        durationLabel: "Forever",
        planName: "Free",
        priceLabel: "0.00 USD",
        planTagLabels: connectFreeTags,
        yearSavingsLabel: undefined,
        amountUsd: 0,
        planCode: "free",
        billingPeriod: null,
      };
    }
    if (connectPlanKey === "standard") {
      return {
        durationLabel,
        planName: "Standard",
        priceLabel: `${STANDARD_PLAN_PRICE_USD.toFixed(2)} USD`,
        planTagLabels: connectStandardTags,
        yearSavingsLabel: connectYearSavingsHint,
        amountUsd: STANDARD_PLAN_PRICE_USD,
        planCode: "standard",
        billingPeriod: selectedDuration,
      };
    }
    return {
      durationLabel,
      planName: "Pro",
      priceLabel: `${PRO_PLAN_PRICE_USD.toFixed(2)} USD`,
      planTagLabels: connectProTags,
      yearSavingsLabel: connectProYearSavingsHint,
      amountUsd: PRO_PLAN_PRICE_USD,
      planCode: "pro",
      billingPeriod: selectedDuration,
    };
  }, [
    connectPlanKey,
    connectFreeTags,
    connectProTags,
    connectProYearSavingsHint,
    connectStandardTags,
    connectYearSavingsHint,
    durationLabel,
    selectedDuration,
  ]);
  // Loads current teacher courses once so tariffs can show actual usage.
  useEffect(() => {
    // Prevents state update if request resolves after unmount.
    let mounted = true;
    // Fetches admin courses and maps result shape into a simple count.
    const loadCoursesCount = async () => {
      setCoursesLoading(true);
      try {
        // Requests course catalog from the same endpoint used by admin courses pages.
        const response: unknown = await coursesApi.getAdminCourses();
        // Supports both plain array and wrapped { items: [...] } shapes.
        // Stores normalized list of courses regardless of API envelope shape.
        const list = Array.isArray(response)
          ? response
          : response &&
              typeof response === "object" &&
              Array.isArray((response as { items?: unknown[] }).items)
            ? (response as { items: unknown[] }).items
            : [];
        if (mounted) setCoursesCount(list.length);
      } catch {
        if (mounted) setCoursesCount(0);
      } finally {
        if (mounted) setCoursesLoading(false);
      }
    };
    void loadCoursesCount();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="mx-auto mt-7 max-w-[1120px] space-y-4 rounded-2xl border border-[#E8E8F0] bg-white px-6 pb-7 pt-6 text-sm text-slate-700 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Tariffs</h1>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-[#E8E8F0] text-xs font-semibold text-slate-400">
          {(
            [
              ["tariffs", "Tariffs"],
              ["payments", "Payments"],
              ["bonuses", "Bonuses & promos"],
              ["certificates", "Gift certificates"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`pb-2 transition ${
                activeTab === id
                  ? "border-b-2 border-violet-600 text-slate-900"
                  : "border-b-2 border-transparent hover:text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "tariffs" ? (
        <>
          <section className="rounded-2xl border border-[#E8E8F0] bg-white p-4 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">Your current plan</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800">
                    Standard
                  </span>
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                    Trial
                  </span>
                  <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">{durationLabel}</span>
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="text-slate-400">Courses</p>
                <p className="text-lg font-bold text-slate-800">
                  {coursesLoading ? "..." : coursesCount}
                </p>
              </div>
            </div>
          </section>

          {/* <section className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-rose-100 bg-rose-50/80 px-3 py-2.5"> */}
            {/* <div className="min-w-0 flex-1"> */}
              {/* <p className="text-xs font-medium text-rose-600">
                No connected products. Connect products to use the platform fully.
              </p> */}
              {/* <p className="mt-1 text-[11px] text-rose-700">
                Recommended: connect <span className="font-semibold">White Label</span> and{" "}
                <span className="font-semibold">Ad block</span>.
              </p> */}
            {/* </div> */}
            {/* <button
              type="button"
              onClick={() => setConnectPlanKey("standard")}
              className={`shrink-0 ${primaryActionClass}`}
            >
              Connect
            </button> */}
          {/* </section> */}

          <section className="rounded-2xl border border-[#E8E8F0] bg-white p-4 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
            <p className="mb-2 text-center text-[11px] font-medium text-slate-500">Billing (Standard &amp; Pro)</p>
            <div className="mx-auto mb-3 flex w-fit flex-wrap justify-center gap-1 rounded-full bg-slate-100 p-0.5">
              {BILLING_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedDuration(option.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    selectedDuration === option.id
                      ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-100"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {option.label}
                  {option.discount ? <span className="ml-0.5 text-slate-400">{option.discount}</span> : null}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Free plan — fixed limits, no paid cycle. */}
              <article className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3 shadow-sm">
                <div className="mb-2 text-center">
                  <span className="text-sm font-bold text-slate-800">Free</span>
                  <p className="mt-0.5 text-[10px] text-slate-500">AI starter</p>
                </div>
                <ul className="flex-1 space-y-1.5">
                  {PLAN_FEATURES_FREE.map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="flex items-center gap-1 text-slate-600">
                        {row.label}
                        <InfoHint title="Maximum creations included on the free tier." />
                      </span>
                      <span className="font-semibold text-slate-900">{row.value}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-center text-base font-bold text-slate-800">0 USD</p>
                <p className="text-center text-[10px] text-slate-500">Forever</p>
                <button
                  type="button"
                  onClick={() => setConnectPlanKey("free")}
                  className={`mt-2 w-full ${secondaryActionClass}`}
                >
                  Connect
                </button>
              </article>

              {/* Standard plan — paid caps. */}
              <article className="flex flex-col rounded-xl border border-emerald-200/80 bg-white p-3 shadow-sm">
                <div className="mb-2 text-center">
                  <span className="text-sm font-bold text-slate-800">Standard</span>
                  <p className="mt-0.5 text-[10px] text-slate-500">AI growth</p>
                </div>
                <ul className="flex-1 space-y-1.5">
                  {PLAN_FEATURES_STANDARD.map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="flex items-center gap-1 text-slate-600">
                        {row.label}
                        <InfoHint title="Included quota for this plan." />
                      </span>
                      <span className="font-semibold text-slate-900">{row.value}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-center text-base font-bold text-slate-800">{STANDARD_PLAN_PRICE_USD} USD</p>
                <p className="text-center text-[10px] text-slate-500">per {durationLabel.toLowerCase()}</p>
                <button
                  type="button"
                  onClick={() => setConnectPlanKey("standard")}
                  className={`mt-2 w-full ${primaryActionClass}`}
                >
                  Connect
                </button>
              </article>

              {/* Pro plan — unlimited + crown accent. */}
              <article className="flex flex-col rounded-xl border border-violet-200/80 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-center gap-1">
                  <Crown className="h-3.5 w-3.5 text-violet-600" aria-hidden />
                  <span className="text-sm font-bold text-slate-800">Pro</span>
                </div>
                <p className="mb-1.5 text-center text-[10px] text-slate-500">No caps on AI generation</p>
                <ul className="flex-1 space-y-1.5">
                  {PLAN_FEATURES_PRO.map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="flex items-center gap-1 text-slate-600">
                        {row.label}
                        <InfoHint title="Unlimited creations on the Pro plan." />
                      </span>
                      <span className="font-semibold text-violet-700">{row.value}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-center text-base font-bold text-slate-800">{PRO_PLAN_PRICE_USD} USD</p>
                <p className="text-center text-[10px] text-slate-500">per {durationLabel.toLowerCase()}</p>
                <button
                  type="button"
                  onClick={() => setConnectPlanKey("pro")}
                  className={`mt-2 w-full ${primaryActionClass}`}
                >
                  Connect
                </button>
              </article>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E8E8F0] bg-white p-4 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
            <h2 className="mb-2 text-sm font-bold text-slate-800">Additional features</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {ADDON_PRODUCTS.map((addon) => (
                <article
                  key={addon.title}
                  className="rounded-lg border border-slate-100 bg-slate-50/40 p-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="text-xs font-bold text-slate-800">{addon.title}</h3>
                    <InfoHint title="Add-on details can be expanded later." />
                  </div>
                  <p className="mt-0.5 text-[10px] font-medium text-teal-600">{addon.note}</p>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Included</span>
                    <span className="font-semibold text-slate-800">{addon.value}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-800">{addon.price}</p>
                  <p className="text-[10px] text-slate-500">per month</p>
                  <button
                    type="button"
                    className={`mt-2 w-full ${secondaryActionClass}`}
                  >
                    Details
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : activeTab === "payments" ? (
        <AdminTariffsPaymentHistory refreshKey={paymentsRefreshKey} />
      ) : (
        <section className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
          This section is not implemented yet.
        </section>
      )}

      {connectPaymentPayload ? (
        <ConnectPaymentModal
          key={connectPlanKey ?? "connect"}
          open
          onClose={() => setConnectPlanKey(null)}
          // ── display props (unchanged) ──────────────────────────────────────
          durationLabel={connectPaymentPayload.durationLabel}
          planName={connectPaymentPayload.planName}
          priceLabel={connectPaymentPayload.priceLabel}
          planTagLabels={connectPaymentPayload.planTagLabels}
          yearSavingsLabel={connectPaymentPayload.yearSavingsLabel}
          // ── new props required for Stripe integration ──────────────────────
          amountUsd={connectPaymentPayload.amountUsd}
          planCode={connectPaymentPayload.planCode}
          billingPeriod={connectPaymentPayload.billingPeriod}
          // ── onPay now receives the Stripe PaymentIntent ID ─────────────────
          onPay={async (providerRef: string) => {
            await teacherTariffsApi.recordPayment({
              amount: connectPaymentPayload.amountUsd,
              currency: "USD",
              status: "succeeded",
              plan_code: connectPaymentPayload.planCode,
              ...(connectPaymentPayload.billingPeriod
                ? { billing_period: connectPaymentPayload.billingPeriod }
                : {}),
              description: `Checkout — ${connectPaymentPayload.planName} (${connectPaymentPayload.durationLabel})`,
              provider_ref: providerRef,
            });
            setPaymentsRefreshKey((k) => k + 1);
            setConnectPlanKey(null);
          }}
        />
      ) : null}
    </div>
  );
}
