import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { analyticsApi } from '../../services/api';
import {
  ArrowLeft,
  BarChart2,
  Users,
  TrendingUp,
  Percent,
  Brain,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Award,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WrongAnswer {
  answer: string;
  count: number;
  frequency_pct: number;
}

interface QuestionStat {
  question_id: number;
  prompt: string;
  type: string;
  attempt_count: number;
  correct_count: number;
  fail_rate: number;
  avg_score_pct: number | null;
  most_common_wrong_answer: WrongAnswer | null;
}

interface ScoreBucket {
  bucket: string;
  count: number;
}

interface Summary {
  total_attempts: number;
  unique_students: number;
  avg_score: number | null;
  min_score: number | null;
  max_score: number | null;
  pass_rate: number | null;
  passing_score: number;
}

interface AnalyticsData {
  test_id: number;
  test_title: string;
  summary: Summary;
  score_distribution: ScoreBucket[];
  questions: QuestionStat[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Выбор ответа',
  open_answer:     'Открытый ответ',
  cloze:           'Пропуски',
};

function failColor(rate: number): string {
  if (rate >= 70) return 'text-red-600 bg-red-50';
  if (rate >= 40) return 'text-amber-600 bg-amber-50';
  return 'text-green-600 bg-green-50';
}

function failBarColor(rate: number): string {
  if (rate >= 70) return 'bg-red-400';
  if (rate >= 40) return 'bg-amber-400';
  return 'bg-green-400';
}

function scoreBarColor(score: number | null): string {
  if (score === null) return 'bg-gray-300';
  if (score >= 70) return 'bg-green-400';
  if (score >= 40) return 'bg-amber-400';
  return 'bg-red-400';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-gray-600',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${color}`} />
        <p className="text-xs font-medium text-gray-500">{label}</p>
      </div>
      <p className={`text-2xl font-bold text-gray-900`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function ScoreDistributionChart({ data, passingScore }: { data: ScoreBucket[]; passingScore: number }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-5">Распределение баллов</h3>
      <div className="flex items-end gap-2 h-40">
        {data.map(({ bucket, count }) => {
          const bucketStart = parseInt(bucket.split('-')[0]);
          const isPassing   = bucketStart >= passingScore;
          const heightPct   = Math.round((count / maxCount) * 100);
          return (
            <div key={bucket} className="flex-1 flex flex-col items-center gap-1 group">
              {/* Tooltip */}
              <div className="relative flex flex-col items-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 bg-gray-800 text-white text-xs rounded px-2 py-0.5 whitespace-nowrap z-10">
                  {count} попыток
                </span>
                <div
                  className={`w-full rounded-t-md transition-all ${isPassing ? 'bg-green-400' : 'bg-gray-300'}`}
                  style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400 mt-1">{bucket}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-3 h-3 rounded-sm bg-green-400 inline-block" />
          Зачёт (≥{passingScore}%)
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-3 h-3 rounded-sm bg-gray-300 inline-block" />
          Не зачёт
        </span>
      </div>
    </div>
  );
}

function QuestionRow({ q, rank }: { q: QuestionStat; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* Main row */}
      <div
        className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Rank */}
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold flex items-center justify-center">
          {rank}
        </span>

        {/* Prompt */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 truncate">{q.prompt || 'Без текста'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{TYPE_LABELS[q.type] || q.type}</p>
        </div>

        {/* Fail rate badge */}
        <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${failColor(q.fail_rate)}`}>
          {q.fail_rate}% ошибок
        </span>

        {/* Correct / Total */}
        <span className="flex-shrink-0 text-xs text-gray-400 hidden sm:block">
          {q.correct_count}/{q.attempt_count}
        </span>

        {/* Fail bar */}
        <div className="hidden md:block w-24 bg-gray-100 rounded-full h-2 flex-shrink-0">
          <div
            className={`h-2 rounded-full ${failBarColor(q.fail_rate)}`}
            style={{ width: `${q.fail_rate}%` }}
          />
        </div>

        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Avg score */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1.5">Средний балл за вопрос</p>
            {q.avg_score_pct !== null ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${scoreBarColor(q.avg_score_pct)}`}
                    style={{ width: `${q.avg_score_pct}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700">{q.avg_score_pct}%</span>
              </div>
            ) : (
              <span className="text-sm text-gray-400">Нет данных</span>
            )}
          </div>

          {/* Correct vs Wrong */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1.5">Правильные / Неверные</p>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-green-600 font-semibold">
                <CheckCircle className="w-4 h-4" />
                {q.correct_count}
              </span>
              <span className="text-gray-300">/</span>
              <span className="flex items-center gap-1 text-red-500 font-semibold">
                <XCircle className="w-4 h-4" />
                {q.attempt_count - q.correct_count}
              </span>
            </div>
          </div>

          {/* Most common wrong answer */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1.5">Самый частый неверный ответ</p>
            {q.most_common_wrong_answer ? (
              <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <p className="text-sm text-red-800 font-medium truncate">
                  "{q.most_common_wrong_answer.answer}"
                </p>
                <p className="text-xs text-red-500 mt-0.5">
                  {q.most_common_wrong_answer.count}× · {q.most_common_wrong_answer.frequency_pct}% от ошибок
                </p>
              </div>
            ) : (
              <span className="text-sm text-gray-400">Нет данных</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminTestAnalyticsPage() {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();

  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchAnalytics();
  }, [id]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const json = await analyticsApi.getTestAnalytics(parseInt(id!));
      setData(json);
    } catch (err) {
      console.error(err);
      toast.error('Ошибка загрузки аналитики');
    } finally {
      setLoading(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-sm text-gray-500">Загрузка аналитики…</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, score_distribution, questions } = data;
  const hasData = summary.total_attempts > 0;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/admin/tests/${id}`)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-primary-600" />
                <h1 className="text-lg font-semibold text-gray-900">Аналитика теста</h1>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{data.test_title}</p>
            </div>
          </div>

          <button
            onClick={() => navigate(`/admin/tests/${id}/edit`)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            Редактировать тест
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* No data state */}
        {!hasData && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <BarChart2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-gray-700">Нет данных</h3>
            <p className="text-sm text-gray-400 mt-1">
              Студенты ещё не проходили этот тест. Аналитика появится после первых попыток.
            </p>
          </div>
        )}

        {hasData && (
          <>
            {/* Summary cards */}
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Сводка</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={Users}
                  label="Уникальных студентов"
                  value={summary.unique_students}
                  sub={`${summary.total_attempts} попыток`}
                  color="text-blue-500"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Средний балл"
                  value={summary.avg_score !== null ? `${summary.avg_score}%` : '—'}
                  sub={summary.min_score !== null ? `мин ${summary.min_score}% / макс ${summary.max_score}%` : undefined}
                  color="text-purple-500"
                />
                <StatCard
                  icon={Award}
                  label="Сдали тест"
                  value={summary.pass_rate !== null ? `${summary.pass_rate}%` : '—'}
                  sub={`Проходной балл: ${summary.passing_score}%`}
                  color="text-green-500"
                />
                <StatCard
                  icon={Brain}
                  label="Вопросов"
                  value={questions.length}
                  sub={`Самый сложный: ${questions[0]?.fail_rate ?? '—'}% ошибок`}
                  color="text-orange-500"
                />
              </div>
            </div>

            {/* Score distribution */}
            <ScoreDistributionChart
              data={score_distribution}
              passingScore={summary.passing_score}
            />

            {/* Questions breakdown */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                  Вопросы — по частоте ошибок
                </h2>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />≥70% сложные
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />40–69% средние
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />&lt;40% лёгкие
                  </span>
                </div>
              </div>

              {questions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">
                  Нет данных по вопросам
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Difficult questions first */}
                  {questions.filter(q => q.fail_rate >= 70).length > 0 && (
                    <div className="mb-1">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs font-semibold text-red-500 uppercase tracking-wide">
                          Сложные вопросы
                        </span>
                      </div>
                      {questions
                        .filter(q => q.fail_rate >= 70)
                        .map((q, i) => (
                          <QuestionRow key={q.question_id} q={q} rank={i + 1} />
                        ))}
                    </div>
                  )}

                  {questions.filter(q => q.fail_rate >= 40 && q.fail_rate < 70).length > 0 && (
                    <div className="mb-1">
                      <div className="flex items-center gap-2 mb-2 mt-4">
                        <Percent className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                          Средней сложности
                        </span>
                      </div>
                      {questions
                        .filter(q => q.fail_rate >= 40 && q.fail_rate < 70)
                        .map((q, i) => (
                          <QuestionRow key={q.question_id} q={q} rank={i + 1} />
                        ))}
                    </div>
                  )}

                  {questions.filter(q => q.fail_rate < 40).length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 mt-4">
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                          Лёгкие вопросы
                        </span>
                      </div>
                      {questions
                        .filter(q => q.fail_rate < 40)
                        .map((q, i) => (
                          <QuestionRow key={q.question_id} q={q} rank={i + 1} />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}