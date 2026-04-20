/**
 * ConnectPaymentModal.tsx
 *
 * Checkout dialog with real Stripe.js card collection.
 * Flow: load Stripe.js → mount CardElement → POST /payments/intent →
 *       stripe.confirmCardPayment → POST /payments (records + activates plan).
 *
 * Required env var: VITE_STRIPE_PUBLISHABLE_KEY
 * Install note: no extra npm packages — Stripe.js is loaded dynamically.
 */

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, Coins, Lock, X } from "lucide-react";
import { teacherTariffsApi } from "../../../services/api";

// ─── Minimal Stripe.js type shims ────────────────────────────────────────────

type StripeCardElement = {
  mount(container: HTMLElement): void;
  unmount(): void;
  destroy(): void;
  on(
    event: "change",
    handler: (e: { error?: { message: string }; complete: boolean }) => void,
  ): void;
};

type StripeElements = {
  create(
    type: "card",
    options?: {
      style?: {
        base?: Record<string, unknown>;
        invalid?: Record<string, unknown>;
        complete?: Record<string, unknown>;
      };
      hidePostalCode?: boolean;
    },
  ): StripeCardElement;
};

type StripeJs = {
  elements(options?: unknown): StripeElements;
  confirmCardPayment(
    clientSecret: string,
    data: { payment_method: { card: StripeCardElement } },
  ): Promise<{
    paymentIntent?: { id: string; status: string };
    error?: { message: string };
  }>;
};

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Stripe?(publishableKey: string, options?: any): StripeJs;
  }
}

// ─── Stripe.js loader ────────────────────────────────────────────────────────

let stripeScriptPromise: Promise<void> | null = null;

function ensureStripeScript(): Promise<void> {
  if (window.Stripe) return Promise.resolve();
  if (stripeScriptPromise) return stripeScriptPromise;
  stripeScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Could not load Stripe.js – check your connection."));
    document.head.appendChild(script);
  });
  return stripeScriptPromise;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type ConnectPaymentModalProps = {
  open: boolean;
  onClose: () => void;
  durationLabel: string;
  planName: string;
  priceLabel: string;
  planTagLabels: readonly string[];
  // Amount in USD that will be sent to Stripe.
  amountUsd: number;
  // Plan code to activate after payment: "standard" | "pro" | "free".
  planCode: string;
  // Billing cadence to pass to the server: "1m" | "3m" | "6m" | "12m" | null.
  billingPeriod: string | null;
  // Upsell strip label; omit when yearly billing is already selected.
  yearSavingsLabel?: string;
  // Badge percent for the savings strip (default 25).
  yearDiscountPercent?: number;
  /**
   * Called after Stripe confirms the payment AND the server records it.
   * Receives the Stripe PaymentIntent ID so the parent can pass it to
   * POST /payments as provider_ref, then close the modal.
   */
  onPay?: (providerRef: string) => Promise<void>;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ConnectPaymentModal({
  open,
  onClose,
  durationLabel,
  planName,
  priceLabel,
  planTagLabels,
  amountUsd,
  planCode,
  billingPeriod,
  yearSavingsLabel = "",
  yearDiscountPercent = 25,
  onPay,
}: ConnectPaymentModalProps) {
  const titleId = useId();

  // Stripe instance + card element refs (not React state to avoid re-mounts).
  const stripeRef = useRef<StripeJs | null>(null);
  const cardRef = useRef<StripeCardElement | null>(null);
  const mountDivRef = useRef<HTMLDivElement | null>(null);

  // Inline validation message from Stripe's change event.
  const [cardError, setCardError] = useState<string | null>(null);
  // True once the card fields are fully filled (Stripe fires complete: true).
  const [cardComplete, setCardComplete] = useState(false);

  const [promoCode, setPromoCode] = useState("");
  const [showSavingsBanner, setShowSavingsBanner] = useState(true);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState(false);
  // Shown while we inject and initialise the Stripe script.
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeLoadError, setStripeLoadError] = useState<string | null>(null);

  // ── Keyboard / scroll locks ──────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ── Load Stripe + mount CardElement when modal opens ─────────────────────

  useEffect(() => {
    if (!open) return;

    // Reset ephemeral state each time the modal opens.
    setPromoCode("");
    setShowSavingsBanner(Boolean(yearSavingsLabel));
    setPayError(null);
    setPaySuccess(false);
    setCardError(null);
    setCardComplete(false);
    setStripeLoading(true);
    setStripeLoadError(null);

    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
      | string
      | undefined;

    if (!publishableKey) {
      setStripeLoadError(
        "Stripe is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY.",
      );
      setStripeLoading(false);
      return;
    }

    let destroyed = false;

    ensureStripeScript()
      .then(() => {
        if (destroyed) return;
        if (!window.Stripe) throw new Error("Stripe global not found.");

        const stripe = window.Stripe(publishableKey);
        stripeRef.current = stripe;

        const elements = stripe.elements();
        const card = elements.create("card", {
          hidePostalCode: true,
          style: {
            base: {
              fontSize: "14px",
              fontFamily:
                "'Inter', 'SF Pro Text', ui-sans-serif, system-ui, sans-serif",
              color: "#1e293b",
              "::placeholder": { color: "#94a3b8" },
              iconColor: "#6C6FEF",
            },
            invalid: {
              color: "#e11d48",
              iconColor: "#e11d48",
            },
          },
        });

        cardRef.current = card;

        // Retry mount with a small timeout to ensure the DOM node is ready.
        const tryMount = () => {
          if (destroyed) return;
          if (mountDivRef.current) {
            card.mount(mountDivRef.current);
            card.on("change", (e) => {
              setCardError(e.error?.message ?? null);
              setCardComplete(e.complete);
            });
            setStripeLoading(false);
          } else {
            setTimeout(tryMount, 40);
          }
        };
        tryMount();
      })
      .catch((err: unknown) => {
        if (destroyed) return;
        setStripeLoadError(
          err instanceof Error ? err.message : "Failed to load payment form.",
        );
        setStripeLoading(false);
      });

    return () => {
      destroyed = true;
      // Unmount + destroy the card element when the modal unmounts so the
      // next open gets a fresh element with no stale state.
      cardRef.current?.destroy();
      cardRef.current = null;
      stripeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Payment handler ──────────────────────────────────────────────────────

  const handlePay = async () => {
    const stripe = stripeRef.current;
    const card = cardRef.current;
    if (!stripe || !card) return;

    setPayBusy(true);
    setPayError(null);

    try {
      // 1. Create a PaymentIntent on our server.
      const { client_secret: clientSecret, payment_intent_id: intentId } =
        await teacherTariffsApi.createPaymentIntent({
          amount: amountUsd,
          currency: "USD",
          plan_code: planCode,
          billing_period: billingPeriod ?? undefined,
        });

      // 2. Confirm the card with Stripe.
      const { paymentIntent, error } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card } },
      );

      if (error) {
        setPayError(error.message ?? "Payment failed. Please try again.");
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        setPaySuccess(true);
        // 3. Record the payment on our server (which also activates the plan).
        if (onPay) {
          await onPay(intentId);
        }
      } else {
        setPayError("Payment was not completed. Please try again.");
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: unknown } } };
      const detail = ax.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail
                .map((d: { msg?: string }) => d?.msg)
                .filter(Boolean)
                .join(" ")
            : "Payment could not be processed. Please try again.";
      setPayError(message);
    } finally {
      setPayBusy(false);
    }
  };

  if (!open) return null;

  // ── Success screen ───────────────────────────────────────────────────────

  if (paySuccess) {
    return (
      <div
        className="fixed inset-0 z-[1400] flex items-center justify-center px-3 py-6 sm:px-4"
        style={{
          background: "rgba(15, 17, 35, 0.42)",
          backdropFilter: "blur(6px)",
        }}
      >
        <div
          className="flex w-full max-w-sm flex-col items-center gap-4 rounded-[20px] bg-white p-8 text-center shadow-[0_8px_40px_rgba(108,111,239,0.18)]"
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#EEF0FE]">
            <CheckCircle2 className="h-8 w-8 text-[#6C6FEF]" strokeWidth={2} />
          </span>
          <div>
            <p className="text-lg font-bold text-slate-900">Payment successful!</p>
            <p className="mt-1 text-sm text-slate-500">
              Your <span className="font-semibold text-slate-700">{planName}</span>{" "}
              plan is now active.
            </p>
          </div>
          <p className="text-xs text-slate-400">Closing…</p>
        </div>
      </div>
    );
  }

  // ── Main modal ───────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center px-3 py-6 sm:px-4"
      style={{
        background: "rgba(15, 17, 35, 0.42)",
        backdropFilter: "blur(6px)",
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[20px] bg-white shadow-[0_8px_40px_rgba(108,111,239,0.14),0_2px_8px_rgba(0,0,0,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <h2
              id={titleId}
              className="text-lg font-bold tracking-tight text-slate-800"
            >
              Confirm payment
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {/* Plan summary */}
            <div className="rounded-[14px] bg-[#F7F7FA] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Period</span>
                <span className="font-semibold text-slate-800">
                  {durationLabel}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-800">{planName}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {planTagLabels.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200/80"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-sm font-bold text-[#4F52C2]">{priceLabel}</p>
              </div>
            </div>

            {/* Promo code row */}
            <div className="flex items-center justify-between gap-2 rounded-[14px] bg-[#F7F7FA] px-3 py-2.5">
              <span className="text-xs font-medium text-slate-500">
                Promo code
              </span>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Enter code"
                className="max-w-[52%] flex-1 bg-transparent text-right text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            {/* Annual savings upsell */}
            {yearSavingsLabel && showSavingsBanner ? (
              <div className="relative rounded-[14px] bg-[#ffda6a] px-3 py-3 pr-9 text-xs text-slate-800 shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowSavingsBanner(false)}
                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-black/5"
                  aria-label="Dismiss savings tip"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/90 text-amber-950 shadow-sm">
                    <Coins className="h-4 w-4" aria-hidden />
                  </span>
                  <p className="min-w-0 flex-1 font-medium leading-snug">
                    {yearSavingsLabel}
                    <span className="ml-1.5 inline-flex rounded-md bg-[#4F52C2] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      -{yearDiscountPercent}%
                    </span>
                  </p>
                </div>
              </div>
            ) : null}

            {/* Payment form */}
            <div className="rounded-[14px] border border-[#E8E8F0] bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
                {/* Stripe card element */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[11px] font-medium text-slate-600">
                      Card details
                    </label>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Lock className="h-3 w-3" strokeWidth={2} />
                      Secured by Stripe
                    </span>
                  </div>

                  {/* Stripe CardElement mount target */}
                  <div
                    className={`relative min-h-[42px] w-full rounded-[10px] border bg-[#F7F7FA] px-3 py-[11px] transition-all ${
                      cardError
                        ? "border-rose-300 ring-2 ring-rose-100"
                        : cardComplete
                          ? "border-[#6C6FEF] ring-2 ring-[#EEF0FE]"
                          : "border-[#E8E8F0] focus-within:border-[#6C6FEF] focus-within:ring-2 focus-within:ring-[#EEF0FE]"
                    }`}
                  >
                    {stripeLoading && !stripeLoadError && (
                      <div className="pointer-events-none absolute inset-0 flex items-center px-3">
                        <span className="text-xs text-slate-400">
                          Loading payment form…
                        </span>
                      </div>
                    )}
                    {stripeLoadError && (
                      <div className="flex items-center">
                        <span className="text-xs text-rose-600">
                          {stripeLoadError}
                        </span>
                      </div>
                    )}
                    {/* Stripe mounts its iframe into this div */}
                    <div
                      ref={mountDivRef}
                      style={{ opacity: stripeLoading ? 0 : 1 }}
                    />
                  </div>

                  {cardError && (
                    <p className="mt-1.5 text-[11px] text-rose-600">
                      {cardError}
                    </p>
                  )}

                  {/* Accepted card logos */}
                  <div className="mt-2 flex items-center gap-1.5">
                    {["Visa", "MC", "Amex", "Discover"].map((brand) => (
                      <span
                        key={brand}
                        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-500"
                      >
                        {brand}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Summary + Pay button */}
                <div className="flex w-full shrink-0 flex-col justify-between gap-3 border-t border-[#F0F0F7] pt-4 lg:w-44 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <div>
                    <p className="text-[11px] font-medium text-slate-500">
                      Total
                    </p>
                    <p className="mt-0.5 text-xl font-bold text-slate-900">
                      {priceLabel}
                    </p>
                  </div>
                  <div>
                    {payError && (
                      <p className="mb-2 rounded-[10px] border border-rose-100 bg-rose-50/90 px-2 py-1.5 text-[11px] leading-snug text-rose-700">
                        {payError}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={
                        payBusy ||
                        !cardComplete ||
                        !!stripeLoadError ||
                        stripeLoading
                      }
                      onClick={() => void handlePay()}
                      className="w-full rounded-[12px] bg-[#6C6FEF] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4F52C2] disabled:cursor-not-allowed disabled:opacity-55"
                      style={{
                        boxShadow: payBusy
                          ? "none"
                          : "0 4px 14px rgba(108,111,239,0.35)",
                      }}
                    >
                      {payBusy ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg
                            className="h-3.5 w-3.5 animate-spin"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v8H4z"
                            />
                          </svg>
                          Processing…
                        </span>
                      ) : (
                        "Pay now"
                      )}
                    </button>
                    <p className="mt-2 text-[10px] leading-snug text-slate-400">
                      By clicking Pay you agree to the{" "}
                      <button
                        type="button"
                        className="text-[#6C6FEF] underline decoration-[#6C6FEF]/30 hover:text-[#4F52C2]"
                      >
                        terms of service
                      </button>
                      .
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 text-center">
            <button
              type="button"
              className="text-xs font-semibold text-[#6C6FEF] underline decoration-[#6C6FEF]/30 hover:text-[#4F52C2]"
            >
              No bank card or need help?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}