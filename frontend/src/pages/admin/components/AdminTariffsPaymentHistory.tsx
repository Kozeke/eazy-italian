/**
 * AdminTariffsPaymentHistory.tsx
 *
 * Read-only payment ledger table for the admin Tariffs → Payments tab.
 */

import { useCallback, useEffect, useState } from "react";
import { teacherTariffsApi } from "../../../services/api";
import type { TeacherPaymentRecord } from "../../../types";

type AdminTariffsPaymentHistoryProps = {
  // Bumped after a simulated checkout so the list refetches from the API.
  refreshKey: number;
};

// Formats ISO timestamps for the history grid without pulling in date-fns.
function formatPaidAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminTariffsPaymentHistory({
  refreshKey,
}: AdminTariffsPaymentHistoryProps) {
  // Rows returned from GET /admin/tariffs/payments.
  const [rows, setRows] = useState<TeacherPaymentRecord[]>([]);
  // True while the first fetch or a refresh is in flight.
  const [loading, setLoading] = useState<boolean>(true);
  // Stores load failure text for inline error display.
  const [error, setError] = useState<string | null>(null);

  // Pulls the latest ledger snapshot whenever the tab mounts or refreshKey changes.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await teacherTariffsApi.listPayments({ limit: 100 });
      setRows(data);
    } catch {
      setError("Could not load payment history. Try again later.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800">Payment history</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-100 bg-rose-50/80 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-xs text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-500">No payments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full min-w-[640px] border-collapse text-left text-[11px] text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Plan</th>
                <th className="px-2 py-2">Billing</th>
                <th className="px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2">Currency</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="whitespace-nowrap px-2 py-2 text-slate-800">{formatPaidAt(row.created_at)}</td>
                  <td className="px-2 py-2 capitalize text-slate-800">{row.plan_code ?? "—"}</td>
                  <td className="px-2 py-2 text-slate-600">{row.billing_period ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {row.amount.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-slate-600">{row.currency}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        row.status === "succeeded"
                          ? "bg-emerald-50 text-emerald-800"
                          : row.status === "pending"
                            ? "bg-amber-50 text-amber-800"
                            : row.status === "refunded"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate px-2 py-2 text-slate-500" title={row.description ?? ""}>
                    {row.description ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
