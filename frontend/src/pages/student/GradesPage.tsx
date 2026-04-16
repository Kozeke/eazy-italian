/**
 * GradesPage.tsx  (v1 — Student Design System)
 *
 * Student grades overview page.
 *
 * Layout:
 *   Page Header → Summary Cards → Filters → Grades List
 *
 * Features:
 * • Summary cards: avg score, completed tests, completed tasks, pending
 * • Filter bar: classroom, type (Test/Task), status
 * • Grade items with score bar, status chip, teacher feedback preview
 * • Loading (skeleton), empty, and error states
 * • Fully responsive
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  FileText,
  CheckCircle2,
  Clock,
  TrendingUp,
  ChevronDown,
  MessageSquare,
  Award,
  BookOpen,
  Filter,
  X,
} from 'lucide-react';

import {
  PageContainer,
  PageHeader,
  Card,
  CardBody,
  Badge,
  StatusBadge,
  EmptyState,
  ErrorBanner,
  SkeletonBlock,
  SkeletonText,
} from '../../components/student/design-system/student-design-system';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GradeItemType = 'test' | 'task';
export type GradeItemStatus = 'graded' | 'submitted' | 'pending' | 'missed';

export interface GradeItem {
  id: number;
  title: string;
  type: GradeItemType;
  status: GradeItemStatus;
  classroom_name: string;
  course_title?: string;
  score?: number | null;
  max_score?: number | null;
  submitted_at?: string | null;
  teacher_feedback?: string | null;
}

// ─── Mock data hook (replace with real API) ───────────────────────────────────

function useGrades() {
  const [grades, setGrades]   = useState<GradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/student/grades', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGrades(Array.isArray(data) ? data : (data.grades ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grades');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { grades, loading, error, reload: load };
}

// ─── Summary card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent: string;
  iconBg: string;
}

function SummaryCard({ icon, label, value, sub, accent, iconBg }: SummaryCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
        <p className={`mt-0.5 text-2xl font-bold tabular-nums leading-none ${accent}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const color =
    pct >= 80 ? 'from-emerald-400 to-emerald-600' :
    pct >= 60 ? 'from-teal-400 to-teal-600' :
    pct >= 40 ? 'from-amber-400 to-amber-500' :
                'from-red-400 to-red-500';

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-bold text-slate-800 tabular-nums">
            {score}<span className="text-slate-400 font-normal">/{maxScore}</span>
          </span>
          <span className={`text-xs font-semibold tabular-nums ${
            pct >= 80 ? 'text-emerald-600' :
            pct >= 60 ? 'text-teal-600' :
            pct >= 40 ? 'text-amber-600' : 'text-red-500'
          }`}>
            {pct}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Grade item card ──────────────────────────────────────────────────────────

function GradeCard({ item }: { item: GradeItem }) {
  const [expanded, setExpanded] = useState(false);

  const typeConfig = item.type === 'test'
    ? { icon: ClipboardList, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', label: 'Test' }
    : { icon: FileText,      iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   label: 'Task' };

  const TypeIcon = typeConfig.icon;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-shadow hover:shadow-md overflow-hidden">
      <div className="flex items-start gap-4 p-4 sm:p-5">
        {/* Type icon */}
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${typeConfig.iconBg}`}>
          <TypeIcon className={`h-5 w-5 ${typeConfig.iconColor}`} />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-snug text-slate-900 line-clamp-1">
                {item.title}
              </h3>
              <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{item.classroom_name}</p>
            </div>

            {/* Status chip */}
            <div className="shrink-0">
              <StatusBadge status={item.status} size="sm" />
            </div>
          </div>

          {/* Score bar (if graded) */}
          {item.status === 'graded' && item.score != null && item.max_score != null && (
            <div className="mt-3">
              <ScoreBar score={item.score} maxScore={item.max_score} />
            </div>
          )}

          {/* Footer row */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Badge color={item.type === 'test' ? 'emerald' : 'amber'} size="sm">
                {typeConfig.label}
              </Badge>
              {item.submitted_at && (
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Clock className="h-3 w-3" />
                  {formatDate(item.submitted_at)}
                </span>
              )}
            </div>

            {/* Feedback toggle */}
            {item.teacher_feedback && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
              >
                <MessageSquare className="h-3 w-3" />
                Feedback
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          {/* Teacher feedback (expandable) */}
          {expanded && item.teacher_feedback && (
            <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400 mb-1">
                Teacher feedback
              </p>
              <p className="text-sm leading-relaxed text-indigo-800">{item.teacher_feedback}</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function GradeCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-slate-100 animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-32 rounded bg-slate-100 animate-pulse" />
          <div className="mt-3 h-2 w-full rounded bg-slate-100 animate-pulse" />
          <div className="flex gap-2 mt-2">
            <div className="h-5 w-12 rounded-full bg-slate-100 animate-pulse" />
            <div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" />
          </div>
        </div>
        <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse shrink-0" />
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface FilterState {
  type:   '' | 'test' | 'task';
  status: '' | 'graded' | 'submitted' | 'pending' | 'missed';
}

function FilterBar({
  filters,
  onChange,
  classrooms,
  classroom,
  onClassroomChange,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  classrooms: string[];
  classroom: string;
  onClassroomChange: (v: string) => void;
}) {
  const typeOptions: { value: FilterState['type']; label: string }[] = [
    { value: '', label: 'All types' },
    { value: 'test', label: 'Tests' },
    { value: 'task', label: 'Tasks' },
  ];

  const statusOptions: { value: FilterState['status']; label: string }[] = [
    { value: '', label: 'All statuses' },
    { value: 'graded', label: 'Graded' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'pending', label: 'Pending' },
    { value: 'missed', label: 'Missed' },
  ];

  const hasActive = filters.type !== '' || filters.status !== '' || classroom !== '';
  const selectBase =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-all focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 appearance-none cursor-pointer pr-8';

  const SelectWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="relative">{children}<ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" /></div>
  );

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-slate-400 shrink-0">
        <Filter className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Filter</span>
      </div>

      {/* Classroom filter */}
      <SelectWrapper>
        <select
          value={classroom}
          onChange={e => onClassroomChange(e.target.value)}
          className={selectBase}
        >
          <option value="">All classes</option>
          {classrooms.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </SelectWrapper>

      {/* Type filter */}
      <SelectWrapper>
        <select
          value={filters.type}
          onChange={e => onChange({ ...filters, type: e.target.value as FilterState['type'] })}
          className={selectBase}
        >
          {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </SelectWrapper>

      {/* Status filter */}
      <SelectWrapper>
        <select
          value={filters.status}
          onChange={e => onChange({ ...filters, status: e.target.value as FilterState['status'] })}
          className={selectBase}
        >
          {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </SelectWrapper>

      {/* Clear */}
      {hasActive && (
        <button
          onClick={() => { onChange({ type: '', status: '' }); onClassroomChange(''); }}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}

// ─── GradesPage ───────────────────────────────────────────────────────────────

export default function GradesPage() {
  const { grades, loading, error, reload } = useGrades();
  const [filters, setFilters]     = useState<FilterState>({ type: '', status: '' });
  const [classroom, setClassroom] = useState('');

  // Derive unique classrooms for filter
  const classrooms = useMemo(
    () => [...new Set(grades.map(g => g.classroom_name))].sort(),
    [grades],
  );

  // Summary stats
  const stats = useMemo(() => {
    const graded   = grades.filter(g => g.status === 'graded');
    const avgScore = graded.length
      ? Math.round(
          graded.reduce((sum, g) => {
            if (g.score != null && g.max_score) return sum + (g.score / g.max_score) * 100;
            return sum;
          }, 0) / graded.length,
        )
      : null;
    return {
      avgScore,
      completedTests:  grades.filter(g => g.type === 'test' && g.status !== 'pending').length,
      completedTasks:  grades.filter(g => g.type === 'task' && g.status !== 'pending').length,
      pending:         grades.filter(g => g.status === 'pending').length,
    };
  }, [grades]);

  // Filter grades
  const filtered = useMemo(() => {
    return grades.filter(g => {
      if (classroom && g.classroom_name !== classroom) return false;
      if (filters.type && g.type !== filters.type) return false;
      if (filters.status && g.status !== filters.status) return false;
      return true;
    });
  }, [grades, filters, classroom]);

  return (
    <PageContainer>
      {/* ── Page header ───────────────────────────────────────────────── */}
      <PageHeader
        eyebrow="Student Portal"
        title="My Grades"
        subtitle="Track your scores, submissions, and teacher feedback."
      />

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      {!loading && !error && (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5 text-teal-600" />}
            iconBg="bg-teal-50"
            label="Avg Score"
            value={stats.avgScore != null ? `${stats.avgScore}%` : '—'}
            sub="across graded work"
            accent="text-teal-700"
          />
          <SummaryCard
            icon={<ClipboardList className="h-5 w-5 text-emerald-600" />}
            iconBg="bg-emerald-50"
            label="Tests Done"
            value={stats.completedTests}
            sub="completed or graded"
            accent="text-emerald-700"
          />
          <SummaryCard
            icon={<FileText className="h-5 w-5 text-amber-600" />}
            iconBg="bg-amber-50"
            label="Tasks Done"
            value={stats.completedTasks}
            sub="submitted or graded"
            accent="text-amber-700"
          />
          <SummaryCard
            icon={<Clock className="h-5 w-5 text-slate-500" />}
            iconBg="bg-slate-100"
            label="Pending"
            value={stats.pending}
            sub="awaiting submission"
            accent={stats.pending > 0 ? 'text-red-600' : 'text-slate-700'}
          />
        </div>
      )}

      {/* ── Loading skeletons for summary cards ──────────────────────── */}
      {loading && (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="h-12 w-12 rounded-xl bg-slate-100 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
                <div className="h-7 w-12 rounded bg-slate-100 animate-pulse" />
                <div className="h-3 w-24 rounded bg-slate-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <ErrorBanner
          title="Couldn't load your grades"
          message={error}
          onRetry={reload}
          className="mb-8"
        />
      )}

      {/* ── Filters ───────────────────────────────────────────────────── */}
      {!loading && !error && grades.length > 0 && (
        <FilterBar
          filters={filters}
          onChange={setFilters}
          classrooms={classrooms}
          classroom={classroom}
          onClassroomChange={setClassroom}
        />
      )}

      {/* ── Result count ──────────────────────────────────────────────── */}
      {!loading && !error && grades.length > 0 && (
        <p className="mb-4 text-xs font-medium text-slate-400">
          Showing {filtered.length} of {grades.length} items
        </p>
      )}

      {/* ── Grade list ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <GradeCardSkeleton key={i} />)
        ) : !error && filtered.length === 0 ? (
          <EmptyState
            icon={<Award className="h-7 w-7" />}
            title={grades.length === 0 ? 'No grades yet' : 'No matches'}
            description={
              grades.length === 0
                ? 'Complete tasks and tests to see your grades here.'
                : 'Try adjusting the filters above.'
            }
            className="py-20"
          />
        ) : !error ? (
          filtered.map(item => <GradeCard key={item.id} item={item} />)
        ) : null}
      </div>
    </PageContainer>
  );
}
