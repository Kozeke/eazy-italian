/**
 * MyClassesPage.tsx
 *
 * Route: /student/classes
 *
 * Shows all classrooms the student is enrolled in.
 * Uses the existing classrooms/courses API — no new endpoints.
 *
 * Data shape expected from your API:
 *   GET /api/v1/student/classrooms
 *   → { classrooms: ClassroomCardData[] }
 *
 * If your endpoint shape differs, adapt the `useMyClassrooms` hook below.
 *
 * Layout:
 *   Page header (greeting + stats)
 *   Search input
 *   Classroom cards grid (3 cols on lg, 2 on md, 1 on sm)
 *   Empty / error / loading states
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, RefreshCw, GraduationCap } from 'lucide-react';
import ClassroomCard, { type ClassroomCardData } from './ClassroomCard';
import { useAuth } from '../../hooks/useAuth';

// ─── Simple data hook ─────────────────────────────────────────────────────────
// Replace the fetch URL / response shape to match your actual endpoint.

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
      // Accept both { classrooms: [...] } and a bare array
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

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-l-4 border-l-slate-200">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-slate-100 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-slate-100" />
          <div className="h-3 w-1/2 rounded bg-slate-100" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-1/3 rounded bg-slate-100" />
        <div className="h-1.5 w-full rounded-full bg-slate-100" />
      </div>
      <div className="mt-5 h-10 w-full rounded-xl bg-slate-100" />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        {filtered ? <Search className="h-7 w-7" /> : <BookOpen className="h-7 w-7" />}
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-slate-700">
          {filtered ? 'No classes match your search' : 'No classes yet'}
        </p>
        <p className="text-sm text-slate-400">
          {filtered
            ? 'Try a different keyword or clear the search.'
            : 'Ask your teacher to enrol you in a course.'}
        </p>
      </div>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="col-span-full rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
      <p className="text-sm font-medium text-red-700">Couldn't load your classes</p>
      <p className="mt-1 text-xs text-red-400">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}

// ─── MyClassesPage ────────────────────────────────────────────────────────────

export default function MyClassesPage() {
  const navigate                           = useNavigate();
  const { user }                           = useAuth();
  const { classrooms, loading, error, reload } = useMyClassrooms();
  const [searchQuery, setSearchQuery]      = useState('');

  const firstName = user?.first_name ?? 'there';

  // Filter by name, teacher name, or course title
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return classrooms;
    return classrooms.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.teacher_name?.toLowerCase().includes(q) ?? false) ||
        (c.course?.title.toLowerCase().includes(q) ?? false),
    );
  }, [classrooms, searchQuery]);

  // Stats
  const activeCount = classrooms.filter((c) => c.live_session_active).length;
  const avgProgress = classrooms.length
    ? Math.round(
        classrooms.reduce((s, c) => s + (c.progress ?? 0), 0) / classrooms.length,
      )
    : 0;

  const handleEnter = useCallback(
    (classroom: ClassroomCardData) => {
      navigate(`/student/classroom/${classroom.id}`);
    },
    [navigate],
  );

  return (
    <div className="min-h-full px-4 py-8 md:px-8 lg:px-10">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary-600">Student Portal</p>
            <h1 className="mt-0.5 text-2xl font-bold text-slate-900 sm:text-3xl">
              Hello, {firstName} 👋
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Here are your enrolled classes.
            </p>
          </div>

          {/* Quick stats */}
          {!loading && classrooms.length > 0 && (
            <div className="mt-4 flex items-center gap-4 sm:mt-0">
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums text-slate-900">{classrooms.length}</p>
                <p className="text-xs font-medium text-slate-400">Classes</p>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums text-slate-900">{avgProgress}%</p>
                <p className="text-xs font-medium text-slate-400">Avg progress</p>
              </div>
              {activeCount > 0 && (
                <>
                  <div className="h-8 w-px bg-slate-200" />
                  <div className="text-right">
                    <p className="text-2xl font-bold tabular-nums text-red-500">{activeCount}</p>
                    <p className="text-xs font-medium text-slate-400">Live now</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Live sessions alert */}
        {!loading && activeCount > 0 && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <p className="text-sm font-medium text-red-800">
              {activeCount === 1
                ? '1 live lesson is happening right now!'
                : `${activeCount} live lessons are happening right now!`}
            </p>
          </div>
        )}
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search classes, teachers, courses…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {searchQuery && !loading && (
          <p className="mt-2 text-xs text-slate-500">
            {filtered.length === 0
              ? 'No results'
              : `${filtered.length} result${filtered.length === 1 ? '' : 's'} for "${searchQuery}"`}
          </p>
        )}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          // Skeletons
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : error ? (
          <ErrorBanner message={error} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState filtered={!!searchQuery} />
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
  );
}
