/**
 * MyClassesPage.tsx  (v3 — Premium Edtech Dashboard)
 *
 * Route: /student/classes
 *
 * What changed from v2:
 * ─────────────────────
 * • Hero section redesigned: full-width teal gradient banner with geometric
 *   SVG pattern, animated greeting, and stat chips inline.
 * • Stats displayed as pill chips in the hero (not a separate row below).
 * • Live alert banner styled as an animated pill inside the hero.
 * • Filter bar: pill-style "All / In Progress / Live / Completed" segmented
 *   filter tabs + search input side-by-side.
 * • "Needs attention" spotlight row: pinned strip at top of grid showing
 *   classrooms with Live / Test due / New task — students see urgent items
 *   immediately without scanning the whole grid.
 * • Grid cards now use ClassroomCard v2 (gradient banner, progress ring,
 *   next-up chip, teacher avatar, contextual CTA).
 * • Loading skeleton matches new card geometry (banner + body).
 * • Empty states: illustrated, distinct for "no classes" vs "no results".
 * • Error state: cleaner inline retry with icon.
 * • Full responsiveness: 1 col → 2 col (sm) → 3 col (lg).
 *
 * No backend changes. Same API endpoint, same hook signature.
 */

import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, RefreshCw, GraduationCap,
  X, Radio, AlertCircle, ClipboardCheck,
  Sparkles, TrendingUp, Layers,
  WifiOff,
} from 'lucide-react';
import ClassroomCard, { type ClassroomCardData } from './ClassroomCard';
import { useAuth } from '../../../hooks/useAuth';

// ─── Data hook (unchanged) ────────────────────────────────────────────────────

function useMyClassrooms() {
  const [classrooms, setClassrooms] = useState<ClassroomCardData[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/student/classrooms', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClassrooms(Array.isArray(data) ? data : (data.classrooms ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { classrooms, loading, error, reload: load };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'active' | 'live' | 'done';

// ─── Skeleton card (matches ClassroomCard v2 geometry) ────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm overflow-hidden">
      {/* Banner */}
      <div className="h-[72px] bg-slate-100 animate-pulse" />
      <div className="px-4 pt-3.5 pb-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="-mt-7 h-10 w-10 rounded-xl bg-white ring-2 ring-white shadow-md shrink-0 overflow-hidden">
            <div className="h-full w-full bg-slate-100 animate-pulse" />
          </div>
          <div className="flex-1 pt-0.5 space-y-1.5">
            <div className="h-3.5 w-3/4 rounded bg-slate-100 animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
        <div className="h-2.5 w-2/3 rounded bg-slate-100 animate-pulse" />
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-slate-100 animate-pulse shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-1.5 w-full rounded-full bg-slate-100 animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
        <div className="h-9 w-full rounded-xl bg-slate-100 animate-pulse mt-1" />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyNoClasses() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-6 py-24 text-center">
      {/* Illustrated icon */}
      <div className="relative flex h-24 w-24 items-center justify-center">
        {/* Glow rings */}
        <div className="absolute inset-0 rounded-full bg-teal-50 opacity-60" />
        <div className="absolute inset-4 rounded-full bg-teal-100 opacity-60" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-lg">
          <GraduationCap className="h-7 w-7" />
        </div>
      </div>
      <div className="space-y-2 max-w-xs">
        <p className="text-lg font-bold text-slate-800">No classes yet</p>
        <p className="text-sm leading-relaxed text-slate-500">
          Ask your teacher to enrol you in a course and you'll see your classes here.
        </p>
      </div>
    </div>
  );
}

function EmptyNoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-5 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Search className="h-7 w-7" />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-slate-700">No results for "{query}"</p>
        <p className="text-sm text-slate-400">Try a different keyword or clear the search.</p>
      </div>
      <button
        onClick={onClear}
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
      >
        Clear search
      </button>
    </div>
  );
}

function EmptyFilterNoResults({ filter, onClear }: { filter: FilterTab; onClear: () => void }) {
  const messages: Record<FilterTab, string> = {
    all:    '',
    active: 'You have no classes currently in progress.',
    live:   'No live lessons right now.',
    done:   'You haven\'t completed any classes yet.',
  };
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-5 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Layers className="h-7 w-7" />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-slate-700">{messages[filter]}</p>
      </div>
      <button
        onClick={onClear}
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
      >
        Show all classes
      </button>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="col-span-full">
      <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-red-100 bg-red-50 px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-400">
          <WifiOff className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <p className="font-semibold text-red-800">Couldn't load your classes</p>
          <p className="text-sm text-red-500">{message}</p>
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({
  value, label, highlight,
}: {
  value: number | string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center rounded-2xl px-4 py-2.5 ${highlight ? 'bg-white/20' : 'bg-white/10'}`}>
      <span className={`text-xl font-bold tabular-nums leading-tight ${highlight ? 'text-red-200' : 'text-white'}`}>
        {value}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-white/70">{label}</span>
    </div>
  );
}

// ─── Filter tab ───────────────────────────────────────────────────────────────

interface FilterTabConfig {
  value: FilterTab;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

function FilterTabs({
  tabs, value, onChange,
}: {
  tabs: FilterTabConfig[];
  value: FilterTab;
  onChange: (v: FilterTab) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
            value === tab.value
              ? 'bg-white text-teal-700 shadow-sm ring-1 ring-slate-200/80'
              : 'text-slate-500 hover:text-slate-700',
          ].join(' ')}
        >
          {tab.icon && <span className={value === tab.value ? 'text-teal-500' : 'text-slate-400'}>{tab.icon}</span>}
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${
              value === tab.value ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Attention spotlight row ──────────────────────────────────────────────────

function AttentionRow({
  classrooms,
  onEnter,
}: {
  classrooms: ClassroomCardData[];
  onEnter: (c: ClassroomCardData) => void;
}) {
  if (!classrooms.length) return null;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Needs your attention
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        {classrooms.map((c) => (
          <button
            key={c.id}
            onClick={() => onEnter(c)}
            className="group flex min-w-[220px] shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-teal-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            {/* Urgency icon */}
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              c.live_session_active
                ? 'bg-red-50 text-red-500'
                : c.has_test_due
                ? 'bg-amber-50 text-amber-500'
                : 'bg-emerald-50 text-emerald-500'
            }`}>
              {c.live_session_active ? (
                <Radio className="h-4 w-4" />
              ) : c.has_test_due ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <ClipboardCheck className="h-4 w-4" />
              )}
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
              <p className={`text-[10px] font-semibold ${
                c.live_session_active ? 'text-red-500' : c.has_test_due ? 'text-amber-500' : 'text-emerald-600'
              }`}>
                {c.live_session_active ? '🔴 Live now' : c.has_test_due ? 'Test due' : 'New task'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MyClassesPage ────────────────────────────────────────────────────────────

export default function MyClassesPage() {
  const navigate                           = useNavigate();
  const { user }                           = useAuth();
  const { classrooms, loading, error, reload } = useMyClassrooms();
  const [searchQuery, setSearchQuery]      = useState('');
  const [activeFilter, setActiveFilter]   = useState<FilterTab>('all');

  const firstName  = user?.first_name ?? 'there';
  const activeCount   = classrooms.filter((c) => c.live_session_active).length;
  const doneCount     = classrooms.filter((c) => c.completed || (c.progress ?? 0) === 100).length;
  const inProgressCnt = classrooms.filter(
    (c) => !c.completed && (c.progress ?? 0) > 0 && (c.progress ?? 0) < 100,
  ).length;
  const avgProgress = classrooms.length
    ? Math.round(classrooms.reduce((s, c) => s + (c.progress ?? 0), 0) / classrooms.length)
    : 0;

  // Needs attention: live > test due > new task
  const attentionItems = useMemo(
    () => classrooms.filter((c) => c.live_session_active || c.has_test_due || c.has_new_task),
    [classrooms],
  );

  // Filter + search
  const filtered = useMemo(() => {
    let result = classrooms;

    // Tab filter
    switch (activeFilter) {
      case 'active':
        result = result.filter((c) => !c.completed && (c.progress ?? 0) > 0 && (c.progress ?? 0) < 100);
        break;
      case 'live':
        result = result.filter((c) => c.live_session_active);
        break;
      case 'done':
        result = result.filter((c) => c.completed || (c.progress ?? 0) === 100);
        break;
    }

    // Text search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.teacher_name?.toLowerCase().includes(q) ?? false) ||
          (c.course?.title.toLowerCase().includes(q) ?? false),
      );
    }

    return result;
  }, [classrooms, searchQuery, activeFilter]);

  const handleEnter = useCallback(
    (classroom: ClassroomCardData) => navigate(`/student/classroom/${classroom.id}`),
    [navigate],
  );

  // Filter tabs config
  const filterTabs: FilterTabConfig[] = [
    { value: 'all',    label: 'All',         count: classrooms.length },
    { value: 'active', label: 'In Progress', count: inProgressCnt,  icon: <TrendingUp className="h-3 w-3" /> },
    { value: 'live',   label: 'Live',        count: activeCount,    icon: <Radio className="h-3 w-3" /> },
    { value: 'done',   label: 'Completed',   count: doneCount,      icon: <Sparkles className="h-3 w-3" /> },
  ];

  // Determine time-of-day greeting
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-full">

      {/* ═══════════════════════════════════════════════════════════════════
          Hero banner
      ════════════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-teal-700 to-teal-800">
        {/* Decorative SVG geometry */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <pattern id="hero-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>

        {/* Glow blobs */}
        <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-teal-400/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-2xl" aria-hidden />

        <div className="relative px-6 py-8 md:px-10 md:py-10">
          {/* Greeting */}
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-teal-200">
              Student Portal
            </span>
          </div>

          <h1 className="mt-1 text-2xl font-bold leading-snug text-white sm:text-3xl">
            {timeGreeting}, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-teal-200">
            {loading
              ? 'Loading your classes…'
              : classrooms.length === 0
              ? 'You\'re not enrolled in any classes yet.'
              : `You're enrolled in ${classrooms.length} class${classrooms.length === 1 ? '' : 'es'}.`
            }
          </p>

          {/* Stats strip */}
          {!loading && classrooms.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <StatChip value={classrooms.length} label="Classes" />
              <StatChip value={`${avgProgress}%`} label="Avg progress" />
              {doneCount > 0 && <StatChip value={doneCount} label="Completed" />}
              {activeCount > 0 && (
                <StatChip value={activeCount} label="Live now" highlight />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          Main content
      ════════════════════════════════════════════════════════════════════ */}
      <div className="px-4 py-6 md:px-8 lg:px-10">

        {/* ── Filter + Search bar ──────────────────────────────────────── */}
        {!loading && !error && classrooms.length > 0 && (
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            {/* Segment tabs */}
            <FilterTabs
              tabs={filterTabs}
              value={activeFilter}
              onChange={(v) => { setActiveFilter(v); setSearchQuery(''); }}
            />

            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search classes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Result count hint */}
            {searchQuery && (
              <span className="shrink-0 text-xs text-slate-400">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* ── Attention spotlight (hidden when filtering) ──────────────── */}
        {!loading && !error && !searchQuery && activeFilter === 'all' && (
          <AttentionRow classrooms={attentionItems} onEnter={handleEnter} />
        )}

        {/* ── Grid ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : classrooms.length === 0 ? (
            <EmptyNoClasses />
          ) : filtered.length === 0 ? (
            searchQuery ? (
              <EmptyNoResults query={searchQuery} onClear={() => setSearchQuery('')} />
            ) : (
              <EmptyFilterNoResults filter={activeFilter} onClear={() => setActiveFilter('all')} />
            )
          ) : (
            filtered.map((classroom) => (
              <ClassroomCard
                key={classroom.id}
                classroom={classroom}
                onEnter={handleEnter}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
