/**
 * AdminTariffsPage.tsx
 *
 * Part D changes (Phase 6):
 *
 * 1. Prices updated: STANDARD_PLAN_PRICE_USD = 12, PRO_PLAN_PRICE_USD = 39.
 * 2. DURATION_MONTHS / DURATION_DISCOUNT lookup tables added.
 * 3. standardTotal / proTotal / standardSavings / proSavings memos replace
 *    the old hardcoded STANDARD_PLAN_PRICE_USD display.
 * 4. Price cards now show `${standardTotal} USD` and `${proTotal} USD`.
 * 5. A green savings badge (bg #EAF3DE, text #3B6D11) appears next to the
 *    price when the selected duration has a non-zero discount.
 * 6. Plan cards read GET /admin/tariffs/me: active tier shows "Current" (no ConnectPaymentModal; free is default).
 * 7. Standard/Pro non-current cards POST /api/v1/admin/tariffs/create-checkout-session (Stripe mode=subscription).
 *
 * UI strings live under `admin.tariffs` in locales (en / ru).
 */

import { useEffect, useMemo, useState } from "react";
import { Crown, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { coursesApi } from "../../services/api";
import AdminTariffsPaymentHistory from "./components/AdminTariffsPaymentHistory";

// Same origin as axios in services/api.ts so tariff requests hit :8000, not the Vite dev server
const API_V1_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

type BillingDuration = "1m" | "3m" | "6m" | "12m";
/** Normalized plan id from GET /admin/tariffs/me `plan`. */
type TariffPlanId = "free" | "standard" | "pro";

// Billing period ids for toggles (labels from i18n: admin.tariffs.billingPeriod.*).
const BILLING_DURATION_IDS: BillingDuration[] = ["1m", "3m", "6m", "12m"];

/** Optional discount badge next to each billing option (numeric, locale-agnostic). */
const BILLING_DISCOUNTS: Partial<Record<BillingDuration, string>> = {
  "3m": "-5%",
  "6m": "-10%",
  "12m": "-20%",
};

// ── Part D: price multiplier tables ──────────────────────────────────────────

/** Number of months covered by each billing period option. */
const DURATION_MONTHS: Record<BillingDuration, number> = {
  "1m":  1,
  "3m":  3,
  "6m":  6,
  "12m": 12,
};

/**
 * Fractional discount applied to the total for each billing period.
 * 0 = no discount (monthly), 0.20 = 20% off (annual).
 */
const DURATION_DISCOUNT: Record<BillingDuration, number> = {
  "1m":  0,
  "3m":  0.05,
  "6m":  0.10,
  "12m": 0.20,
};

// ── Base monthly prices (updated per Phase 6 spec) ────────────────────────────
const STANDARD_PLAN_PRICE_USD = 12;
const PRO_PLAN_PRICE_USD      = 39;

/** Feature row definitions: keys into admin.tariffs.featureLabels / featureValues / hints. */
const PLAN_FEATURES_FREE_DEFS = [
  { labelKey: "aiExerciseGenerations", valueKey: "tenPerMo",    hintKey: "freeQuota"    },
  { labelKey: "aiUnitGenerations",     valueKey: "threePerMo",  hintKey: "freeQuota"    },
  { labelKey: "aiCourseGenerations",   valueKey: "oneTotal",    hintKey: "freeQuota"    },
  { labelKey: "publishToStudents",     valueKey: "dash",        hintKey: "freeQuota"    },
] as const;

const PLAN_FEATURES_STANDARD_DEFS = [
  { labelKey: "aiExerciseGenerations", valueKey: "hundredPerMo", hintKey: "standardQuota" },
  { labelKey: "aiUnitGenerations",     valueKey: "twentyPerMo",  hintKey: "standardQuota" },
  { labelKey: "aiCourseGenerations",   valueKey: "fivePerMo",    hintKey: "standardQuota" },
  { labelKey: "publishToStudents",     valueKey: "check",        hintKey: "standardQuota" },
] as const;

const PLAN_FEATURES_PRO_DEFS = [
  { labelKey: "aiExerciseGenerations", valueKey: "unlimited", hintKey: "proUnlimited" },
  { labelKey: "aiUnitGenerations",     valueKey: "unlimited", hintKey: "proUnlimited" },
  { labelKey: "aiCourseGenerations",   valueKey: "unlimited", hintKey: "proUnlimited" },
  { labelKey: "publishToStudents",     valueKey: "check",     hintKey: "proUnlimited" },
] as const;

/** Payload shape from GET /api/v1/admin/tariffs/me (plan strip + pricing cards). */
type TeacherTariffMeResponse = {
  plan: string;
  period: string;
  period_expired: boolean;
  subscription_ends_at: string | null;
  ai_limits?: Record<string, number | null>;
  ai_usage?: Record<string, number>;
};

/** Formats subscription_ends_at for a compact badge (falls back to raw string). */
function formatSubscriptionEnd(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function InfoHint({ title }: { title: string }) {
  return (
    <span title={title} className="inline-flex shrink-0 text-slate-400" role="img" aria-label={title}>
      <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} />
    </span>
  );
}

/** Small green savings pill shown when discount > 0. */
function SavingsBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        background:   "#EAF3DE",
        color:        "#3B6D11",
        borderRadius: 99,
        padding:      "2px 8px",
        fontSize:     10,
        fontWeight:   700,
        letterSpacing: "0.01em",
        whiteSpace:   "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export default function AdminTariffsPage() {
  const { t } = useTranslation();

  const primaryActionClass =
    "rounded-xl border border-violet-600 bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-violet-700 hover:shadow-[0_6px_16px_rgba(108,111,239,0.28)]";
  const secondaryActionClass =
    "rounded-xl border border-[#E8E8F0] bg-white px-3 py-2 text-xs font-bold text-[#4F52C2] shadow-sm transition hover:border-violet-300 hover:bg-violet-50";

  const [activeTab,          setActiveTab]          = useState<"tariffs" | "payments" | "bonuses" | "certificates">("tariffs");
  const [selectedDuration,   setSelectedDuration]   = useState<BillingDuration>("1m");
  const [coursesCount,       setCoursesCount]       = useState<number>(0);
  const [coursesLoading,     setCoursesLoading]     = useState<boolean>(true);
  /** Current teacher tariff row from /admin/tariffs/me for the header strip. */
  const [tariffMe, setTariffMe] = useState<TeacherTariffMeResponse | null>(null);
  /** Tracks load state for the tariffs/me request so the strip can show a placeholder. */
  const [tariffMeLoad, setTariffMeLoad] = useState<"idle" | "loading" | "ok" | "error">("idle");
  /** Blocks Standard/Pro buttons while POST /create-checkout-session is in flight. */
  const [stripeCheckoutLoading, setStripeCheckoutLoading] = useState(false);

  const durationLabel = useMemo(
    () => t(`admin.tariffs.billingPeriod.${selectedDuration}`),
    [selectedDuration, t],
  );

  // ── Part D: computed totals and savings ──────────────────────────────────

  /** Total charge for the Standard plan at the selected billing period. */
  const standardTotal = useMemo(() => {
    const months   = DURATION_MONTHS[selectedDuration];
    const discount = DURATION_DISCOUNT[selectedDuration];
    return (STANDARD_PLAN_PRICE_USD * months * (1 - discount)).toFixed(2);
  }, [selectedDuration]);

  /** Total charge for the Pro plan at the selected billing period. */
  const proTotal = useMemo(() => {
    const months   = DURATION_MONTHS[selectedDuration];
    const discount = DURATION_DISCOUNT[selectedDuration];
    return (PRO_PLAN_PRICE_USD * months * (1 - discount)).toFixed(2);
  }, [selectedDuration]);

  /**
   * Localized savings label for Standard (e.g. "save $4").
   * Null when the period has no discount (monthly).
   */
  const standardSavings = useMemo((): string | null => {
    const months   = DURATION_MONTHS[selectedDuration];
    const discount = DURATION_DISCOUNT[selectedDuration];
    if (discount === 0) return null;
    const amount = (STANDARD_PLAN_PRICE_USD * months * discount).toFixed(0);
    return t("admin.tariffs.saveAmount", { amount });
  }, [selectedDuration, t]);

  /**
   * Localized savings label for Pro.
   * Null when the period has no discount (monthly).
   */
  const proSavings = useMemo((): string | null => {
    const months   = DURATION_MONTHS[selectedDuration];
    const discount = DURATION_DISCOUNT[selectedDuration];
    if (discount === 0) return null;
    const amount = (PRO_PLAN_PRICE_USD * months * discount).toFixed(0);
    return t("admin.tariffs.saveAmount", { amount });
  }, [selectedDuration, t]);

  /** Normalized plan from /me once loaded; drives "Current" vs subscribe on each card. */
  const currentTariffPlanId = useMemo((): TariffPlanId | null => {
    if (tariffMeLoad !== "ok" || !tariffMe?.plan) return null;
    const normalized = tariffMe.plan.toLowerCase();
    if (normalized === "standard") return "standard";
    if (normalized === "pro") return "pro";
    return "free";
  }, [tariffMe, tariffMeLoad]);

  /** True when /me has succeeded so plan labels match the API. */
  const tariffMeReady = tariffMeLoad === "ok";
  /** True while /me is loading or failed — block plan actions until a known plan exists. */
  const tariffPlanActionsBlocked = tariffMeLoad !== "ok";

  /** True if this tier is the teacher's active plan from /me. */
  const isCurrentPlan = (tier: TariffPlanId): boolean =>
    tariffMeReady && currentTariffPlanId === tier;

  useEffect(() => {
    let mounted = true;
    const loadTariffMe = async () => {
      setTariffMeLoad("loading");
      try {
        const token = localStorage.getItem("token") ?? "";
        const res = await fetch(`${API_V1_BASE}/admin/tariffs/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!mounted) return;
        if (!res.ok) {
          setTariffMeLoad("error");
          return;
        }
        const data = (await res.json()) as TeacherTariffMeResponse;
        setTariffMe(data);
        setTariffMeLoad("ok");
      } catch {
        // Network or parse failure — leave strip in error state instead of wrong defaults
        if (mounted) setTariffMeLoad("error");
      }
    };
    void loadTariffMe();
    return () => { mounted = false; };
  }, []);

  /**
   * Creates a Stripe Checkout Session (mode subscription) and sends the browser to Stripe.
   */
  const startStripeSubscription = async (plan: "standard" | "pro") => {
    const token = localStorage.getItem("token") ?? "";
    setStripeCheckoutLoading(true);
    try {
      const res = await fetch(`${API_V1_BASE}/admin/tariffs/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; detail?: unknown };
      if (!res.ok) {
        const detail = data.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : detail != null
              ? JSON.stringify(detail)
              : res.statusText;
        throw new Error(msg);
      }
      if (!data.url) throw new Error("No checkout URL");
      window.location.href = data.url;
    } catch {
      window.alert(t("admin.tariffs.stripeCheckoutError"));
    } finally {
      setStripeCheckoutLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadCoursesCount = async () => {
      setCoursesLoading(true);
      try {
        const response = await coursesApi.getAdminCourses();
        // Accepts either a raw course array or a paginated wrapper from the API.
        const asList = response as unknown[] | { items?: unknown[] };
        const list = Array.isArray(asList)
          ? asList
          : Array.isArray(asList?.items) ? asList.items : [];
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

  /** Display name for the authenticated teacher's plan (matches API). */
  const currentPlanLabel = useMemo(() => {
    if (tariffMeLoad !== "ok" || !tariffMe) return null;
    const normalized = (tariffMe.plan ?? "free").toLowerCase();
    if (normalized === "standard") return t("admin.tariffs.plans.standard");
    if (normalized === "pro") return t("admin.tariffs.plans.pro");
    return t("admin.tariffs.plans.free");
  }, [tariffMe, tariffMeLoad, t]);

  /** Secondary status next to the plan pill (expiry / paid-through / AI usage month). */
  const currentPlanStatusPill = useMemo(() => {
    if (tariffMeLoad !== "ok" || !tariffMe) return null;
    if (tariffMe.period_expired) {
      return { text: t("admin.tariffs.status.expired"), className: "rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" };
    }
    const endLabel = formatSubscriptionEnd(tariffMe.subscription_ends_at);
    if (endLabel) {
      return { text: t("admin.tariffs.status.until", { date: endLabel }), className: "rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600" };
    }
    return {
      text: t("admin.tariffs.status.aiUsagePeriod", { period: tariffMe.period }),
      className: "rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600",
    };
  }, [tariffMe, tariffMeLoad, t]);

  return (
    <div className="mx-auto mt-7 max-w-[1120px] space-y-4 rounded-2xl border border-[#E8E8F0] bg-white px-6 pb-7 pt-6 text-sm text-slate-700 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">{t("admin.tariffs.title")}</h1>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-[#E8E8F0] text-xs font-semibold text-slate-400">
          {(
            [
              ["tariffs",      "admin.tariffs.tabs.tariffs"],
              ["payments",     "admin.tariffs.tabs.payments"],
              ["bonuses",      "admin.tariffs.tabs.bonuses"],
              ["certificates", "admin.tariffs.tabs.certificates"],
            ] as const
          ).map(([id, labelKey]) => (
            <button
              key={id} type="button"
              onClick={() => setActiveTab(id)}
              className={`pb-2 transition ${activeTab === id ? "border-b-2 border-violet-600 text-slate-900" : "border-b-2 border-transparent hover:text-slate-600"}`}
            >
              {t(labelKey)}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "tariffs" ? (
        <>
          {/* Current plan strip */}
          <section className="rounded-2xl border border-[#E8E8F0] bg-white p-4 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">{t("admin.tariffs.currentPlan")}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800">
                    {tariffMeLoad === "loading" || tariffMeLoad === "idle"
                      ? t("admin.tariffs.loadingShort")
                      : tariffMeLoad === "error"
                        ? t("admin.tariffs.dash")
                        : currentPlanLabel ?? t("admin.tariffs.dash")}
                  </span>
                  {currentPlanStatusPill ? (
                    <span className={currentPlanStatusPill.className}>{currentPlanStatusPill.text}</span>
                  ) : null}
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="text-slate-400">{t("admin.tariffs.courses")}</p>
                <p className="text-lg font-bold text-slate-800">{coursesLoading ? t("admin.tariffs.loadingShort") : coursesCount}</p>
              </div>
            </div>
          </section>

          {/* Pricing grid */}
          <section className="rounded-2xl border border-[#E8E8F0] bg-white p-4 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
            <p className="mb-2 text-center text-[11px] font-medium text-slate-500">{t("admin.tariffs.billingHeading")}</p>

            {/* Billing period toggle */}
            <div className="mx-auto mb-3 flex w-fit flex-wrap justify-center gap-1 rounded-full bg-slate-100 p-0.5">
              {BILLING_DURATION_IDS.map((id) => (
                <button
                  key={id} type="button"
                  onClick={() => setSelectedDuration(id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${selectedDuration === id ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-100" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {t(`admin.tariffs.billingPeriod.${id}`)}
                  {BILLING_DISCOUNTS[id] && <span className="ml-0.5 text-slate-400">{BILLING_DISCOUNTS[id]}</span>}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Free */}
              <article className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3 shadow-sm">
                <div className="mb-2 text-center">
                  <span className="text-sm font-bold text-slate-800">{t("admin.tariffs.plans.free")}</span>
                  <p className="mt-0.5 text-[10px] text-slate-500">{t("admin.tariffs.planSubtitles.free")}</p>
                </div>
                <ul className="flex-1 space-y-1.5">
                  {PLAN_FEATURES_FREE_DEFS.map((row) => {
                    const label = t(`admin.tariffs.featureLabels.${row.labelKey}`);
                    const value = t(`admin.tariffs.featureValues.${row.valueKey}`);
                    const hint  = t(`admin.tariffs.hints.${row.hintKey}`);
                    return (
                      <li key={row.labelKey} className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="flex items-center gap-1 text-slate-600">
                          {label}
                          <InfoHint title={hint} />
                        </span>
                        <span className={`font-semibold ${row.valueKey === "dash" ? "text-slate-400" : "text-slate-900"}`}>{value}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-center text-base font-bold text-slate-800">{t("admin.tariffs.zeroUsd")}</p>
                <p className="text-center text-[10px] text-slate-500">{t("admin.tariffs.forever")}</p>
                <button
                  type="button"
                  disabled={tariffPlanActionsBlocked || isCurrentPlan("free")}
                  className={`mt-2 w-full ${secondaryActionClass} disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  {tariffMeLoad === "loading" || tariffMeLoad === "idle"
                    ? t("admin.tariffs.loadingShort")
                    : tariffMeLoad === "error"
                      ? t("admin.tariffs.dash")
                      : isCurrentPlan("free")
                        ? t("admin.tariffs.current")
                        : t("admin.tariffs.freeTierNote")}
                </button>
              </article>

              {/* Standard — Part D: shows computed total + savings badge */}
              <article className="flex flex-col rounded-xl border border-emerald-200/80 bg-white p-3 shadow-sm">
                <div className="mb-2 text-center">
                  <span className="text-sm font-bold text-slate-800">{t("admin.tariffs.plans.standard")}</span>
                  <p className="mt-0.5 text-[10px] text-slate-500">{t("admin.tariffs.planSubtitles.standard")}</p>
                </div>
                <ul className="flex-1 space-y-1.5">
                  {PLAN_FEATURES_STANDARD_DEFS.map((row) => {
                    const label = t(`admin.tariffs.featureLabels.${row.labelKey}`);
                    const value = t(`admin.tariffs.featureValues.${row.valueKey}`);
                    const hint  = t(`admin.tariffs.hints.${row.hintKey}`);
                    return (
                      <li key={row.labelKey} className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="flex items-center gap-1 text-slate-600">
                          {label}
                          <InfoHint title={hint} />
                        </span>
                        <span className={`font-semibold ${row.valueKey === "check" ? "text-emerald-600" : "text-slate-900"}`}>{value}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 flex items-baseline justify-center gap-1.5 flex-wrap">
                  <p className="text-base font-bold text-slate-800">${standardTotal} USD</p>
                  {standardSavings && <SavingsBadge label={standardSavings} />}
                </div>
                <p className="text-center text-[10px] text-slate-500">{t("admin.tariffs.perPeriod", { period: durationLabel })}</p>
                <button
                  type="button"
                  disabled={tariffPlanActionsBlocked || stripeCheckoutLoading || isCurrentPlan("standard")}
                  onClick={() => void startStripeSubscription("standard")}
                  className={`mt-2 w-full ${primaryActionClass} disabled:opacity-60`}
                >
                  {tariffMeLoad === "loading" || tariffMeLoad === "idle"
                    ? t("admin.tariffs.loadingShort")
                    : tariffMeLoad === "error"
                      ? t("admin.tariffs.dash")
                      : isCurrentPlan("standard")
                        ? t("admin.tariffs.current")
                        : t("admin.tariffs.subscribe", { plan: t("admin.tariffs.plans.standard"), price: standardTotal })}
                </button>
              </article>

              {/* Pro — Part D: shows computed total + savings badge */}
              <article className="flex flex-col rounded-xl border border-violet-200/80 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-center gap-1">
                  <Crown className="h-3.5 w-3.5 text-violet-600" aria-hidden />
                  <span className="text-sm font-bold text-slate-800">{t("admin.tariffs.plans.pro")}</span>
                </div>
                <p className="mb-1.5 text-center text-[10px] text-slate-500">{t("admin.tariffs.planSubtitles.pro")}</p>
                <ul className="flex-1 space-y-1.5">
                  {PLAN_FEATURES_PRO_DEFS.map((row) => {
                    const label = t(`admin.tariffs.featureLabels.${row.labelKey}`);
                    const value = t(`admin.tariffs.featureValues.${row.valueKey}`);
                    const hint  = t(`admin.tariffs.hints.${row.hintKey}`);
                    return (
                      <li key={row.labelKey} className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="flex items-center gap-1 text-slate-600">
                          {label}
                          <InfoHint title={hint} />
                        </span>
                        <span className={`font-semibold ${row.valueKey === "check" ? "text-emerald-600" : "text-violet-700"}`}>{value}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 flex items-baseline justify-center gap-1.5 flex-wrap">
                  <p className="text-base font-bold text-slate-800">${proTotal} USD</p>
                  {proSavings && <SavingsBadge label={proSavings} />}
                </div>
                <p className="text-center text-[10px] text-slate-500">{t("admin.tariffs.perPeriod", { period: durationLabel })}</p>
                <button
                  type="button"
                  disabled={tariffPlanActionsBlocked || stripeCheckoutLoading || isCurrentPlan("pro")}
                  onClick={() => void startStripeSubscription("pro")}
                  className={`mt-2 w-full ${primaryActionClass} disabled:opacity-60`}
                >
                  {tariffMeLoad === "loading" || tariffMeLoad === "idle"
                    ? t("admin.tariffs.loadingShort")
                    : tariffMeLoad === "error"
                      ? t("admin.tariffs.dash")
                      : isCurrentPlan("pro")
                        ? t("admin.tariffs.current")
                        : t("admin.tariffs.subscribe", { plan: t("admin.tariffs.plans.pro"), price: proTotal })}
                </button>
              </article>
            </div>
          </section>

          {/* Add-ons */}
          <section className="rounded-2xl border border-[#E8E8F0] bg-white p-4 shadow-[0_1px_4px_rgba(108,111,239,0.04)]">
            <h2 className="mb-2 text-sm font-bold text-slate-800">{t("admin.tariffs.addons.title")}</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <article className="rounded-lg border border-slate-100 bg-slate-50/40 p-2.5 shadow-sm">
                <div className="flex items-start justify-between gap-1">
                  <h3 className="text-xs font-bold text-slate-800">{t("admin.tariffs.addons.aiAssistant")}</h3>
                  <InfoHint title={t("admin.tariffs.hints.addonPlaceholder")} />
                </div>
                <p className="mt-0.5 text-[10px] font-medium text-teal-600">{t("admin.tariffs.addons.tokensPerMo")}</p>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">{t("admin.tariffs.addons.included")}</span>
                  <span className="font-semibold text-slate-800">200</span>
                </div>
                <p className="mt-2 text-sm font-bold text-slate-800">9 USD</p>
                <p className="text-[10px] text-slate-500">{t("admin.tariffs.addons.perMonth")}</p>
                <button type="button" className={`mt-2 w-full ${secondaryActionClass}`}>{t("admin.tariffs.addons.details")}</button>
              </article>
            </div>
          </section>
        </>
      ) : activeTab === "payments" ? (
        <AdminTariffsPaymentHistory refreshKey={0} />
      ) : (
        <section className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
          {t("admin.tariffs.placeholderSection")}
        </section>
      )}

    </div>
  );
}
