// pages/admin/students/AdminStudentViewPage.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { analyticsApi } from "../../services/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScoreTrendPoint {
  date: string | null;
  score: number;
  test_title: string;
  unit_title: string | null;
  attempt_id: number;
}

interface WeakUnit {
  unit_id: number;
  unit_title: string;
  avg_score: number;
  attempt_count: number;
}

interface WeakType {
  type: string;
  avg_score_pct: number;
  question_count: number;
}

interface StruggleQuestion {
  question_id: number;
  prompt: string;
  type: string;
  fail_rate: number;
  attempt_count: number;
}

interface StudentAnalytics {
  student_id: number;
  student_name: string;
  overall_avg_score: number | null;
  total_attempts: number;
  score_trend: ScoreTrendPoint[];
  weakest_units: WeakUnit[];
  weakest_question_types: WeakType[];
  struggle_questions: StruggleQuestion[];
  message?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple Choice",
  open: "Open Answer",
  cloze: "Fill in the Blank",
  matching: "Matching",
  unknown: "Unknown",
};

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(score: number): string {
  if (score >= 75) return "bg-emerald-50 border-emerald-200";
  if (score >= 50) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function scoreBarColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-400";
  return "bg-red-400";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  colorClass = "text-gray-900",
}: {
  label: string;
  value: string | number;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${colorClass}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function ScoreTrendChart({ data }: { data: ScoreTrendPoint[] }) {
  const chartData = data.map((p) => ({
    label: formatDate(p.date),
    score: p.score,
    tooltip: p.test_title,
  }));

  const avg =
    data.length > 0
      ? Math.round(data.reduce((s, p) => s + p.score, 0) / data.length)
      : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Score Trend</h3>
        {avg !== null && (
          <span className={`text-sm font-medium ${scoreColor(avg)}`}>
            avg {avg}%
          </span>
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">No attempts yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            {avg !== null && (
              <ReferenceLine
                y={avg}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{ value: `avg`, position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }}
              />
            )}
            <Tooltip
              formatter={(val: number, _: string, entry: any) => [
                `${val}%`,
                entry.payload.tooltip,
              ]}
              labelFormatter={(l) => `Date: ${l}`}
              contentStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 4, fill: "#6366f1" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function WeakUnitsPanel({ units }: { units: WeakUnit[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Weak Units</h3>
      {units.length === 0 ? (
        <p className="text-sm text-gray-400">No unit data available</p>
      ) : (
        <ul className="space-y-3">
          {units.map((u) => (
            <li key={u.unit_id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-700 truncate max-w-[70%]">{u.unit_title}</span>
                <span className={`text-sm font-semibold ${scoreColor(u.avg_score)}`}>
                  {u.avg_score}%
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${scoreBarColor(u.avg_score)}`}
                  style={{ width: `${u.avg_score}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{u.attempt_count} attempt{u.attempt_count !== 1 ? "s" : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WeakTopicsPanel({ types }: { types: WeakType[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Weak Topics by Type</h3>
      {types.length === 0 ? (
        <p className="text-sm text-gray-400">No question data available</p>
      ) : (
        <ul className="space-y-3">
          {types.map((t) => (
            <li key={t.type} className={`rounded-lg border px-4 py-3 ${scoreBg(t.avg_score_pct)}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {QUESTION_TYPE_LABELS[t.type] ?? t.type}
                </span>
                <span className={`text-sm font-bold ${scoreColor(t.avg_score_pct)}`}>
                  {t.avg_score_pct}%
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {t.question_count} question{t.question_count !== 1 ? "s" : ""} attempted
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StruggleQuestionsPanel({ questions }: { questions: StruggleQuestion[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-800 mb-1">Struggling Questions</h3>
      <p className="text-xs text-gray-400 mb-4">Failed more than 50% of attempts</p>
      {questions.length === 0 ? (
        <p className="text-sm text-gray-400">No struggling questions — great job!</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {questions.map((q) => (
            <li key={q.question_id} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm text-gray-700 leading-snug line-clamp-2">{q.prompt}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5">
                  {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                </span>
                <span className="text-xs text-red-500 font-medium">
                  {q.fail_rate}% fail rate
                </span>
                <span className="text-xs text-gray-400">
                  {q.attempt_count} attempt{q.attempt_count !== 1 ? "s" : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminStudentViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState<StudentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    analyticsApi
      .getStudentAnalytics(parseInt(id))
      .then((data: StudentAnalytics) => setAnalytics(data))
      .catch((err: any) => setError(err?.response?.data?.detail ?? "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !analytics) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 font-medium">{error ?? "No data"}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-sm text-indigo-600 hover:underline"
        >
          ← Back
        </button>
      </div>
    );
  }

  const { student_name, overall_avg_score, total_attempts, score_trend,
          weakest_units, weakest_question_types, struggle_questions } = analytics;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition"
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{student_name}</h1>
          <p className="text-sm text-gray-400">Student Analytics</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard
          label="Avg Score"
          value={overall_avg_score !== null ? `${overall_avg_score}%` : "—"}
          colorClass={overall_avg_score !== null ? scoreColor(overall_avg_score) : "text-gray-400"}
        />
        <StatCard
          label="Attempts"
          value={total_attempts}
          sub="completed tests"
        />
        <StatCard
          label="Weak Units"
          value={weakest_units.length}
          sub={weakest_units.length > 0 ? `worst: ${weakest_units[0]?.avg_score}%` : "none detected"}
          colorClass={weakest_units.length > 0 ? "text-amber-500" : "text-emerald-600"}
        />
      </div>

      {/* Score trend */}
      <ScoreTrendChart data={score_trend} />

      {/* Weak units + Weak topics side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <WeakUnitsPanel units={weakest_units} />
        <WeakTopicsPanel types={weakest_question_types} />
      </div>

      {/* Struggling questions */}
      <StruggleQuestionsPanel questions={struggle_questions} />
    </div>
  );
}