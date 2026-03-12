/**
 * StudentUnitWorkspace.tsx
 *
 * The single reusable component that renders a unit's full student-facing
 * content: intro card, videos, tasks, and tests.
 *
 * Reuse strategy
 * ──────────────
 * All content-rendering logic is derived from what already exists in the
 * admin pages.  Specifically:
 *
 *   • VideosPanel    — mirrors AdminUnitDetailPage's VideosPanel, adapted
 *                      for student interaction (inline player, YouTube embed,
 *                      file download link).  Same field names: source_type,
 *                      external_url, file_path, duration_sec.
 *
 *   • TaskCard       — mirrors AdminTaskDetailPage's content display block:
 *                      instructions (HTML), content (file/text/URL),
 *                      questions list.  Read-only for now; "Start task"
 *                      navigates to the dedicated task submission route.
 *
 *   • TestCard       — mirrors AdminTestDetailsPage's title card: title,
 *                      description, instructions, time/questions/pass stats.
 *                      "Start test" navigates to the test runner route.
 *
 *   • Tab bar design — same pattern as AdminUnitDetailPage's tab bar but
 *                      student-calmer: no "Analytics" or "AI Docs" tabs,
 *                      uses bottom-border active indicator.
 *
 * This component is intentionally presentation-only.  It receives resolved
 * data from useStudentUnit and exposes navigation callbacks so the parent
 * (ClassroomPage) decides where to send the user.
 *
 * Props
 * ─────
 *   unit        — full unit detail from useStudentUnit (nullable while loading)
 *   course      — parent course (for breadcrumb/context)
 *   loading     — show skeleton while unit is fetching
 *   error       — show error state
 *   onStartVideo  (videoId) → void
 *   onOpenTask    (taskId)  → void
 *   onStartTest   (testId)  → void
 */

import React, { useState } from 'react';
import {
  Video, FileText, ClipboardList, BookOpen,
  Play, ExternalLink, Download, Clock, Percent,
  Brain, ChevronRight, AlertCircle, CheckCircle2,
} from 'lucide-react';
import type { StudentUnitDetail, StudentVideo, StudentTask, StudentTest } from '../../hooks/useStudentUnit';
import type { ClassroomCourse } from '../../hooks/useClassroom';

// ─── Shared config (mirrors AdminUnitDetailPage) ──────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  manual:   'Written task',
  auto_mcq: 'Multiple choice',
  gap_fill: 'Gap fill',
  essay:    'Essay',
  writing:  'Writing',
  listening:'Listening',
  reading:  'Reading',
};

const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-sky-100 text-sky-700',
  A2: 'bg-blue-100 text-blue-700',
  B1: 'bg-indigo-100 text-indigo-700',
  B2: 'bg-violet-100 text-violet-700',
  C1: 'bg-purple-100 text-purple-700',
  C2: 'bg-fuchsia-100 text-fuchsia-700',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(s: number | null | undefined): string | null {
  if (!s) return null;
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function resolveVideoUrl(v: StudentVideo): string | null {
  if (v.external_url) return v.external_url;
  if (v.file_path) {
    const base = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:8000';
    const cleanBase = base.replace(/\/api\/v1$/, '');
    const path = v.file_path.startsWith('/') ? v.file_path : `/${v.file_path}`;
    return `${cleanBase}/api/v1/static${path}`;
  }
  return null;
}

function isYouTube(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url);
}

function youTubeEmbedUrl(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

function isVimeo(url: string): boolean {
  return /vimeo\.com/.test(url);
}

function vimeoEmbedUrl(url: string): string {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? `https://player.vimeo.com/video/${match[1]}` : url;
}

function resolveTaskContentUrl(content: string): string {
  const base = ((import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/api\/v1$/, '');
  if (content.startsWith('http')) return content;
  if (content.startsWith('/api/v1/static')) return `${base}${content}`;
  if (content.startsWith('/static')) return `${base}/api/v1${content}`;
  if (content.startsWith('static/') || content.startsWith('tasks/')) return `${base}/api/v1/static/${content}`;
  return `${base}/api/v1/static/${content}`;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function WorkspaceSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-28 rounded-2xl bg-slate-200" />
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-9 w-28 rounded-full bg-slate-200" />)}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-200" />)}
      </div>
    </div>
  );
}

// ─── Unit intro card ──────────────────────────────────────────────────────────

function UnitIntroCard({ unit }: { unit: StudentUnitDetail }) {
  const levelCls = unit.level ? (LEVEL_COLORS[unit.level] ?? 'bg-slate-100 text-slate-600') : null;

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {levelCls && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${levelCls}`}>
            {unit.level}
          </span>
        )}
        {unit.course_title && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <BookOpen className="h-3 w-3" />
            {unit.course_title}
          </span>
        )}
      </div>

      <h1 className="text-xl font-bold text-slate-900 leading-snug">{unit.title}</h1>

      {unit.description && (
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{unit.description}</p>
      )}

      {unit.goals && (
        <div className="mt-3 rounded-xl bg-primary-50 border border-primary-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-1">
            What you'll learn
          </p>
          <p className="text-sm text-primary-900 leading-relaxed">{unit.goals}</p>
        </div>
      )}

      {/* Content summary pills */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {unit.videos.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
            <Video className="h-3.5 w-3.5" />
            {unit.videos.length} video{unit.videos.length !== 1 ? 's' : ''}
          </span>
        )}
        {unit.tasks.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            <FileText className="h-3.5 w-3.5" />
            {unit.tasks.length} task{unit.tasks.length !== 1 ? 's' : ''}
          </span>
        )}
        {unit.tests.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <ClipboardList className="h-3.5 w-3.5" />
            {unit.tests.length} test{unit.tests.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Video player card ────────────────────────────────────────────────────────

function VideoCard({
  video,
  onStart,
}: {
  video: StudentVideo;
  onStart: (v: StudentVideo) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rawUrl = resolveVideoUrl(video);
  const dur = fmtDuration(video.duration_sec);

  const canEmbed = rawUrl && (isYouTube(rawUrl) || isVimeo(rawUrl));
  const embedUrl = rawUrl
    ? isYouTube(rawUrl)
      ? youTubeEmbedUrl(rawUrl)
      : isVimeo(rawUrl)
      ? vimeoEmbedUrl(rawUrl)
      : null
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Video className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{video.title}</p>
          <p className="text-xs text-slate-400">
            {video.source_type === 'file' ? 'Video file' : 'External video'}
            {dur && ` · ${dur}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEmbed && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 transition-colors"
            >
              {expanded ? 'Hide' : 'Watch'}
            </button>
          )}
          {rawUrl && !canEmbed && (
            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            >
              Open
            </a>
          )}
          {!rawUrl && (
            <button
              onClick={() => onStart(video)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              Play
            </button>
          )}
        </div>
      </div>

      {/* Inline embed */}
      {expanded && embedUrl && (
        <div className="border-t border-slate-100">
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={embedUrl}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={video.title}
            />
          </div>
        </div>
      )}

      {/* Description */}
      {video.description && !expanded && (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <p className="text-xs text-slate-500 leading-relaxed">{video.description}</p>
        </div>
      )}
    </div>
  );
}

function VideosSection({
  videos,
  onStart,
}: {
  videos: StudentVideo[];
  onStart: (v: StudentVideo) => void;
}) {
  if (!videos.length)
    return <EmptySection icon={Video} label="No videos in this unit yet." />;
  return (
    <div className="space-y-3">
      {videos.map((v) => (
        <VideoCard key={v.id} video={v} onStart={onStart} />
      ))}
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskContentBlock({ task }: { task: StudentTask }) {
  const needsContentBlock =
    (task.type === 'listening' || task.type === 'reading') && task.content;

  if (!needsContentBlock) return null;

  const content = task.content!;
  const isFilePath =
    content.startsWith('/api/v1/static') ||
    content.startsWith('/static') ||
    content.startsWith('static/') ||
    content.startsWith('tasks/') ||
    /\.(pdf|doc|docx|mp3|mp4|wav|avi|mov)$/i.test(content);

  if (isFilePath) {
    const fileUrl = resolveTaskContentUrl(content);
    const fileName = content.split('/').pop() || 'File';
    return (
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <FileText className="h-6 w-6 shrink-0 text-primary-500" />
        <p className="min-w-0 flex-1 truncate text-sm text-slate-700">{fileName}</p>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </div>
    );
  }

  if (task.type === 'listening' && content.startsWith('http')) {
    return (
      <a
        href={content}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary-600 underline"
      >
        <ExternalLink className="h-4 w-4" />
        {content}
      </a>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
        {content}
      </p>
    </div>
  );
}

function TaskCard({
  task,
  onOpen,
}: {
  task: StudentTask;
  onOpen: (t: StudentTask) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = TASK_TYPE_LABELS[task.type] ?? task.type;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <FileText className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{task.title}</p>
          <p className="text-xs text-slate-400">{typeLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-amber-300 hover:text-amber-700 transition-colors"
          >
            {expanded ? 'Hide' : 'Preview'}
          </button>
          <button
            onClick={() => onOpen(task)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
          >
            Start
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expandable preview — mirrors AdminTaskDetailPage content display */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-3">
          {task.description && (
            <p className="text-sm text-slate-600 leading-relaxed">{task.description}</p>
          )}
          {task.instructions && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1.5">
                Instructions
              </p>
              <div
                className="prose prose-sm max-w-none text-slate-700"
                dangerouslySetInnerHTML={{ __html: task.instructions }}
              />
            </div>
          )}
          <TaskContentBlock task={task} />
          {task.questions && task.questions.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">
                Questions ({task.questions.length})
              </p>
              <ol className="space-y-2">
                {task.questions.slice(0, 3).map((q, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="shrink-0 font-medium text-slate-400">{i + 1}.</span>
                    <span>{q.question}</span>
                  </li>
                ))}
                {task.questions.length > 3 && (
                  <li className="text-xs text-slate-400 pl-5">
                    + {task.questions.length - 3} more question{task.questions.length - 3 !== 1 ? 's' : ''}…
                  </li>
                )}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TasksSection({
  tasks,
  onOpen,
}: {
  tasks: StudentTask[];
  onOpen: (t: StudentTask) => void;
}) {
  if (!tasks.length)
    return <EmptySection icon={FileText} label="No tasks in this unit yet." />;
  return (
    <div className="space-y-3">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} onOpen={onOpen} />
      ))}
    </div>
  );
}

// ─── Test card ────────────────────────────────────────────────────────────────

function TestCard({
  test,
  onStart,
}: {
  test: StudentTest;
  onStart: (t: StudentTest) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <ClipboardList className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{test.title}</p>
          {/* Quick stats — mirrors AdminTestDetailsPage stats row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            {test.time_limit_minutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {test.time_limit_minutes} min
              </span>
            )}
            {(test.questions_count ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <Brain className="h-3 w-3" />
                {test.questions_count} questions
              </span>
            )}
            {test.passing_score != null && (
              <span className="flex items-center gap-1">
                <Percent className="h-3 w-3" />
                Pass: {test.passing_score}%
              </span>
            )}
            {test.settings?.max_attempts && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {test.settings.max_attempts} attempt{test.settings.max_attempts !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(test.description || test.instructions) && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
            >
              {expanded ? 'Hide' : 'Info'}
            </button>
          )}
          <button
            onClick={() => onStart(test)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            Begin
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expandable detail — mirrors AdminTestDetailsPage title card */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-3">
          {test.description && (
            <p className="text-sm text-slate-600 leading-relaxed">{test.description}</p>
          )}
          {test.instructions && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3">
              <p className="text-xs font-medium text-blue-700 mb-1">Instructions</p>
              <p className="text-sm text-blue-900">{test.instructions}</p>
            </div>
          )}
          {test.settings && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-500 pt-1">
              {test.settings.shuffle_questions && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  Shuffled questions
                </span>
              )}
              {test.settings.show_results_immediately && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Results shown immediately
                </span>
              )}
              {test.settings.allow_review && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  Review allowed
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TestsSection({
  tests,
  onStart,
}: {
  tests: StudentTest[];
  onStart: (t: StudentTest) => void;
}) {
  if (!tests.length)
    return <EmptySection icon={ClipboardList} label="No tests in this unit yet." />;
  return (
    <div className="space-y-3">
      {tests.map((t) => (
        <TestCard key={t.id} test={t} onStart={onStart} />
      ))}
    </div>
  );
}

// ─── Empty section ────────────────────────────────────────────────────────────

function EmptySection({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center text-slate-400">
      <Icon className="mb-3 h-10 w-10 opacity-20" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type TabId = 'videos' | 'tasks' | 'tests';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  count: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface StudentUnitWorkspaceProps {
  unit: StudentUnitDetail | null;
  course?: ClassroomCourse | null;
  loading?: boolean;
  error?: string | null;
  onStartVideo?: (video: StudentVideo) => void;
  onOpenTask?: (task: StudentTask) => void;
  onStartTest?: (test: StudentTest) => void;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function StudentUnitWorkspace({
  unit,
  loading,
  error,
  onStartVideo,
  onOpenTask,
  onStartTest,
}: StudentUnitWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabId>('videos');

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return <WorkspaceSkeleton />;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-red-300" />
        <p className="text-sm font-medium text-slate-700">Couldn't load this unit</p>
        <p className="mt-1 text-sm text-slate-400">{error}</p>
      </div>
    );
  }

  // ── No unit ────────────────────────────────────────────────────────────────
  if (!unit) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
        <BookOpen className="mb-4 h-14 w-14 opacity-15" />
        <p className="text-base font-medium text-slate-600">No unit selected</p>
        <p className="mt-1 text-sm">Choose a unit from the header to start learning.</p>
      </div>
    );
  }

  // ── Build tabs ─────────────────────────────────────────────────────────────
  const tabs: TabDef[] = [
    { id: 'videos', label: 'Videos', icon: Video,         count: unit.videos.length },
    { id: 'tasks',  label: 'Tasks',  icon: FileText,      count: unit.tasks.length  },
    { id: 'tests',  label: 'Tests',  icon: ClipboardList, count: unit.tests.length  },
  ];

  // Auto-select first non-empty tab if current tab is empty
  const effectiveTab =
    unit[activeTab]?.length > 0
      ? activeTab
      : (tabs.find((t) => t.count > 0)?.id ?? 'videos');

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Unit intro */}
      <UnitIntroCard unit={unit} />

      {/* Tab bar — calm student variant: no underline, pill-style active */}
      <div className="mb-5 flex gap-1 rounded-2xl bg-slate-100 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = effectiveTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                active
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    active
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {effectiveTab === 'videos' && (
        <VideosSection
          videos={unit.videos}
          onStart={onStartVideo ?? (() => {})}
        />
      )}
      {effectiveTab === 'tasks' && (
        <TasksSection
          tasks={unit.tasks}
          onOpen={onOpenTask ?? (() => {})}
        />
      )}
      {effectiveTab === 'tests' && (
        <TestsSection
          tests={unit.tests}
          onStart={onStartTest ?? (() => {})}
        />
      )}
    </div>
  );
}
