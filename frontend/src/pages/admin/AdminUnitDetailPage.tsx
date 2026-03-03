import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Edit2, Save, X, Eye, EyeOff, BookOpen, Video,
  ClipboardList, FileText, Calendar, Tag, Clock, CheckCircle,
  AlertCircle, ChevronRight, Globe, Lock, Layers, Plus, ExternalLink,
  BarChart2, Upload, Download, Trash2, AlertTriangle,
} from "lucide-react";
import { unitsApi } from "../../services/api";

// ─── Types ─────────────────────────────────────────────────────────────────

type UnitStatus = "draft" | "scheduled" | "published" | "archived";
type UnitLevel  = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

interface VideoItem  { id: number; title: string; status: string; order_index: number; duration_sec: number | null; source_type: string; }
interface TaskItem   { id: number; title: string; status: string; order_index: number; type: string; }
interface TestItem   { id: number; title: string; status: string; order_index: number; time_limit_minutes: number | null; passing_score?: number; }

interface RagFile {
  filename: string;
  size_bytes: number | null;
  size_human: string | null;
  chunk_count: number;
  has_chunks: boolean;
  file_missing?: boolean;
}

interface RagFilesData {
  lesson_id: number;
  total_files: number;
  files: RagFile[];
}

interface UnitDetail {
  id: number; title: string; level: UnitLevel; description: string | null;
  goals: string | null; tags: string[]; status: UnitStatus;
  publish_at: string | null; order_index: number; is_visible_to_students: boolean;
  slug: string | null; course_id: number | null; course_title?: string;
  created_by: number; created_at: string; updated_at: string | null;
  content_count: { videos: number; tasks: number; tests: number; published_videos: number; published_tasks: number; published_tests: number };
  videos: VideoItem[]; tasks: TaskItem[]; tests: TestItem[];
}

// ─── Config ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<UnitStatus, { label: string; color: string; bg: string; dot: string }> = {
  published: { label: "Published", color: "text-emerald-700", bg: "bg-emerald-50",  dot: "bg-emerald-500" },
  draft:     { label: "Draft",     color: "text-slate-600",   bg: "bg-slate-100",   dot: "bg-slate-400"  },
  scheduled: { label: "Scheduled", color: "text-violet-700",  bg: "bg-violet-50",   dot: "bg-violet-500" },
  archived:  { label: "Archived",  color: "text-amber-700",   bg: "bg-amber-50",    dot: "bg-amber-500"  },
};

const LEVEL_CFG: Record<UnitLevel, { color: string; bg: string }> = {
  A1: { color: "text-sky-700",     bg: "bg-sky-50"     },
  A2: { color: "text-blue-700",    bg: "bg-blue-50"    },
  B1: { color: "text-indigo-700",  bg: "bg-indigo-50"  },
  B2: { color: "text-violet-700",  bg: "bg-violet-50"  },
  C1: { color: "text-purple-700",  bg: "bg-purple-50"  },
  C2: { color: "text-fuchsia-700", bg: "bg-fuchsia-50" },
};

const TASK_LABELS: Record<string, string> = {
  manual: "Manual", auto_mcq: "Multiple Choice", gap_fill: "Gap Fill", essay: "Essay",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDuration = (s: number | null) => {
  if (!s) return "—";
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};

const timeAgo = (iso: string | null) => {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30)  return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} years ago`;
};

const FILE_ICONS: Record<string, string> = {
  pdf:  "📄",
  docx: "📝",
  vtt:  "🎬",
  srt:  "🎬",
};

const getFileIcon = (filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? "📎";
};

function _fmtSizeClient(n: number): string {
  for (const unit of ["B", "KB", "MB", "GB"]) {
    if (n < 1024) return `${n.toFixed(0)} ${unit}`;
    n /= 1024;
  }
  return `${n.toFixed(1)} GB`;
}

// ─── Small components ─────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: UnitStatus }) => {
  const c = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
};

const LevelBadge = ({ level }: { level: UnitLevel }) => {
  const c = LEVEL_CFG[level];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.color}`}>
      {level}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value, sub, color = "text-slate-500" }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
    <div className="p-2 bg-slate-50 rounded-lg flex-shrink-0">
      <Icon className={`w-4 h-4 ${color}`} />
    </div>
    <div>
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className="text-xl font-semibold text-slate-800 leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const EmptySlot = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
  <div className="flex flex-col items-center justify-center py-12 text-slate-300">
    <Icon className="w-9 h-9 mb-2" />
    <p className="text-sm">{label}</p>
  </div>
);

// ─── Content panels ────────────────────────────────────────────────────────────

const VideosPanel = ({ videos }: { videos: VideoItem[] }) => {
  if (!videos.length) return <EmptySlot icon={Video} label="No videos yet" />;
  return (
    <div className="divide-y divide-slate-100">
      {videos.map((v) => (
        <div key={v.id} className="flex items-center gap-3 py-3 px-1 rounded-lg hover:bg-slate-50 group transition-colors">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Video className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{v.title}</p>
            <p className="text-xs text-slate-400">{v.source_type === "file" ? "File" : "External"} · {fmtDuration(v.duration_sec)}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={v.status as UnitStatus} />
            <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-slate-200 text-slate-400 transition-all">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const TasksPanel = ({ tasks }: { tasks: TaskItem[] }) => {
  if (!tasks.length) return <EmptySlot icon={ClipboardList} label="No tasks yet" />;
  return (
    <div className="divide-y divide-slate-100">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-3 py-3 px-1 rounded-lg hover:bg-slate-50 group transition-colors">
          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-4 h-4 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
            <p className="text-xs text-slate-400">{TASK_LABELS[t.type] ?? t.type}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={t.status as UnitStatus} />
            <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-slate-200 text-slate-400 transition-all">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const TestsPanel = ({ tests }: { tests: TestItem[] }) => {
  if (!tests.length) return <EmptySlot icon={FileText} label="No tests yet" />;
  return (
    <div className="divide-y divide-slate-100">
      {tests.map((t) => (
        <div key={t.id} className="flex items-center gap-3 py-3 px-1 rounded-lg hover:bg-slate-50 group transition-colors">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
            <p className="text-xs text-slate-400">
              {t.time_limit_minutes ? `${t.time_limit_minutes} min` : "No time limit"}
              {t.passing_score ? ` · Pass at ${t.passing_score}%` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={t.status as UnitStatus} />
            <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-slate-200 text-slate-400 transition-all">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

function RagDocsPanel({
  unitId,
  courseId,
}: {
  unitId: number;
  courseId: number | null;
}) {
  const [data,    setData]    = useState<RagFilesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/v1/ingest/lesson/${unitId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleDownload = (filename: string) => {
    const token = localStorage.getItem("token");
    // Open in new tab — browser handles the download header
    const url = `/api/v1/ingest/lesson/${unitId}/file/${encodeURIComponent(filename)}`;
    // Use fetch to add auth header, then trigger download
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert("Download failed"));
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete "${filename}" from disk? Vector chunks are kept.`)) return;
    setDeleting(filename);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `/api/v1/ingest/lesson/${unitId}/file/${encodeURIComponent(filename)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      await fetchFiles();
    } catch {
      alert("Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !courseId) return;
    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      const form = new FormData();
      form.append("file", file);
      form.append("lesson_id", String(unitId));
      form.append("course_id", String(courseId));
      form.append("wipe_existing", "false");
      const res = await fetch("/api/v1/ingest/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Upload failed");
      }
      await fetchFiles();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-14 gap-3 text-slate-400">
      <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">Loading documents…</span>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-slate-400">
      <AlertCircle className="w-7 h-7 text-red-300" />
      <p className="text-sm text-red-500">{error}</p>
    </div>
  );

  const files = data?.files ?? [];

  return (
    <div className="space-y-4">

      {/* Upload bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {files.length > 0
            ? `${files.length} file${files.length !== 1 ? "s" : ""} · ${
                files.reduce((s, f) => s + (f.size_bytes ?? 0), 0) > 0
                  ? _fmtSizeClient(files.reduce((s, f) => s + (f.size_bytes ?? 0), 0))
                  : ""
              }`
            : "No files uploaded yet"}
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.vtt,.srt"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading || !courseId}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !courseId}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {uploading
              ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Uploading…</>
              : <><Upload className="w-3.5 h-3.5" />Upload file</>
            }
          </button>
        </div>
      </div>

      {/* File list */}
      {files.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
          <FileText className="w-9 h-9 opacity-30" />
          <p className="text-sm font-medium">No RAG source files yet</p>
          <p className="text-xs text-slate-300 text-center">
            Upload PDF, DOCX, VTT, or SRT files to power the AI Q&A
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !courseId}
            className="mt-2 text-xs text-indigo-600 hover:underline disabled:opacity-50"
          >
            Upload first file
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {files.map((f) => (
            <div key={f.filename} className={`flex items-center gap-3 px-4 py-3 group hover:bg-slate-50 transition-colors
              ${f.file_missing ? "opacity-60" : ""}`}>

              {/* Icon */}
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 text-lg">
                {getFileIcon(f.filename)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{f.filename}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {f.size_human && (
                    <span className="text-xs text-slate-400">{f.size_human}</span>
                  )}
                  <span className={`text-xs flex items-center gap-1 ${
                    f.has_chunks ? "text-emerald-600" : "text-slate-400"
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      f.has_chunks ? "bg-emerald-500" : "bg-slate-300"
                    }`} />
                    {f.chunk_count} chunk{f.chunk_count !== 1 ? "s" : ""} indexed
                  </span>
                  {f.file_missing && (
                    <span className="text-xs text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      File not saved (pre-feature upload)
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                {!f.file_missing && (
                  <button
                    onClick={() => handleDownload(f.filename)}
                    className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(f.filename)}
                  disabled={deleting === f.filename}
                  className="p-1.5 rounded-md hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                  title="Delete file from disk"
                >
                  {deleting === f.filename
                    ? <div className="w-3.5 h-3.5 border border-red-400 border-t-transparent rounded-full animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info note */}
      <p className="text-xs text-slate-400 flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        Deleting a file only removes it from disk — the AI can still answer from indexed chunks.
        To remove from AI knowledge, use the delete chunks option.
      </p>
    </div>
  );
}

// ─── Editable field ────────────────────────────────────────────────────────────

const EditableField = ({
  label, value, editing, onChange, type = "text", options,
}: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void;
  type?: "text" | "textarea" | "select"; options?: { value: string; label: string }[];
}) => {
  const base = "w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-slate-800";
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-1.5">{label}</p>
      {editing ? (
        type === "textarea" ? (
          <textarea className={`${base} resize-none`} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
        ) : type === "select" ? (
          <select className={base} value={value} onChange={(e) => onChange(e.target.value)}>
            {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input className={base} value={value} onChange={(e) => onChange(e.target.value)} />
        )
      ) : (
        <p className="text-sm text-slate-700 leading-relaxed">
          {value || <span className="text-slate-300 italic">Not set</span>}
        </p>
      )}
    </div>
  );
};

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function AdminUnitDetailPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate    = useNavigate();

  const [unit,       setUnit]       = useState<UnitDetail | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<"videos" | "tasks" | "tests" | "analytics" | "rag">("videos");
  const [editing,    setEditing]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [editForm,   setEditForm]   = useState<Partial<UnitDetail>>({});
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchUnit = useCallback(async () => {
    if (!unitId) return;
    setLoading(true); setError(null);
    try {
      const data = await unitsApi.getAdminUnit(Number(unitId));
      setUnit(data as unknown as UnitDetail);
      setEditForm({ title: data.title, description: data.description ?? "", goals: data.goals ?? "", level: data.level, status: data.status as UnitStatus });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load unit");
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { fetchUnit(); }, [fetchUnit]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!unit) return;
    setSaving(true);
    try {
      const updateData: any = { ...editForm };
      // Convert null to undefined for fields that don't accept null
      if (updateData.description === null) updateData.description = undefined;
      if (updateData.goals === null) updateData.goals = undefined;
      const updated = await unitsApi.updateUnit(unit.id, updateData);
      setUnit({ ...unit, ...updated } as unknown as UnitDetail);
      setEditing(false);
      showToast("Changes saved");
    } catch (e: any) {
      showToast(e?.response?.data?.detail || e?.message || "Save failed", false);
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle visibility ──────────────────────────────────────────────────────
  const toggleVisibility = async () => {
    if (!unit) return;
    try {
      const updated = await unitsApi.updateUnit(unit.id, { is_visible_to_students: !unit.is_visible_to_students });
      setUnit({ ...unit, ...updated } as unknown as UnitDetail);
      showToast(unit.is_visible_to_students ? "Hidden from students" : "Visible to students");
    } catch {
      showToast("Could not update visibility", false);
    }
  };

  const field    = (k: keyof UnitDetail) => String(editForm[k] ?? unit?.[k] ?? "");
  const setField = (k: keyof UnitDetail) => (v: string) => setEditForm((p) => ({ ...p, [k]: v }));

  // ── States ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading unit…</p>
      </div>
    </div>
  );

  if (error || !unit) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-sm text-center shadow-sm">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="font-medium text-slate-700">Could not load unit</p>
        <p className="text-sm text-slate-400 mt-1">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-5 text-sm text-indigo-600 hover:underline">← Go back</button>
      </div>
    </div>
  );

  const tabs = [
    { id: "videos"    as const, label: "Videos",    icon: Video,         count: unit.videos.length },
    { id: "tasks"     as const, label: "Tasks",     icon: ClipboardList, count: unit.tasks.length  },
    { id: "tests"     as const, label: "Tests",     icon: FileText,      count: unit.tests.length  },
    { id: "analytics" as const, label: "Analytics", icon: BarChart2,     count: null               },
    { id: "rag"       as const, label: "AI Docs",   icon: BookOpen,      count: null               },
  ];

  const headerBand =
    unit.status === "published" ? "from-emerald-400 to-teal-400"   :
    unit.status === "scheduled" ? "from-violet-400 to-purple-400"  :
    unit.status === "archived"  ? "from-amber-300 to-orange-300"   :
                                  "from-slate-300 to-slate-400";

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-1 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Sticky header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <nav className="flex items-center gap-1.5 text-sm text-slate-500 min-w-0">
              <span className="hover:text-slate-700 cursor-pointer" onClick={() => navigate("/admin/units")}>Units</span>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
              {unit.course_title && (
                <><span className="truncate max-w-[140px]">{unit.course_title}</span><ChevronRight className="w-3.5 h-3.5 flex-shrink-0" /></>
              )}
              <span className="text-slate-800 font-medium truncate max-w-[180px]">{unit.title}</span>
            </nav>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={toggleVisibility}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {unit.is_visible_to_students
                ? <><Eye className="w-3.5 h-3.5 text-emerald-500" />Visible</>
                : <><EyeOff className="w-3.5 h-3.5 text-slate-400" />Hidden</>}
            </button>

            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                >
                  {saving
                    ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                    : <><Save className="w-3.5 h-3.5" />Save</>}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Page body */}
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* Hero card */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className={`h-1.5 bg-gradient-to-r ${headerBand}`} />
          <div className="p-6 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  className="w-full text-xl font-semibold text-slate-800 border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
                  value={field("title")}
                  onChange={(e) => setField("title")(e.target.value)}
                />
              ) : (
                <h1 className="text-xl font-semibold text-slate-800 mb-2">{unit.title}</h1>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                {editing ? (
                  <>
                    <select
                      className="text-xs border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={field("level")} onChange={(e) => setField("level")(e.target.value)}
                    >
                      {(["A1","A2","B1","B2","C1","C2"] as UnitLevel[]).map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select
                      className="text-xs border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={field("status")} onChange={(e) => setField("status")(e.target.value)}
                    >
                      {(["draft","scheduled","published","archived"] as UnitStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <LevelBadge level={unit.level} />
                    <StatusBadge status={unit.status} />
                  </>
                )}
                {unit.course_title && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
                    <Layers className="w-3 h-3" />{unit.course_title}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${
                  unit.is_visible_to_students
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : "text-slate-500 bg-slate-50 border-slate-200"}`}>
                  {unit.is_visible_to_students ? <><Globe className="w-3 h-3" />Students can see</> : <><Lock className="w-3 h-3" />Hidden</>}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Layers}      label="Total content" value={unit.content_count.videos + unit.content_count.tasks + unit.content_count.tests} sub={`${unit.videos.length}v · ${unit.tasks.length}t · ${unit.tests.length}q`} color="text-indigo-500" />
          <StatCard icon={Video}       label="Videos"        value={unit.videos.length}  color="text-blue-500"    />
          <StatCard icon={ClipboardList} label="Tasks"       value={unit.tasks.length}   color="text-violet-500"  />
          <StatCard icon={FileText}    label="Tests"         value={unit.tests.length}   color="text-emerald-500" />
        </div>

        {/* Two-column */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left col */}
          <div className="space-y-4">

            {/* Details */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold text-slate-700">Unit details</h2>
              <EditableField label="Description"    value={field("description")} editing={editing} onChange={setField("description")} type="textarea" />
              <EditableField label="Learning goals" value={field("goals")}       editing={editing} onChange={setField("goals")}       type="textarea" />
            </div>

            {/* Meta */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-semibold text-slate-700">Metadata</h2>
              <div className="space-y-2.5 text-sm">
                {[
                  { icon: Calendar, label: "Created",  value: timeAgo(unit.created_at)  },
                  { icon: Clock,    label: "Updated",  value: timeAgo(unit.updated_at)  },
                  { icon: BookOpen, label: "Order",    value: `#${unit.order_index + 1}` },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</span>
                    <span className="text-slate-600 font-medium">{value}</span>
                  </div>
                ))}
                {unit.publish_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Publish at</span>
                    <span className="text-slate-600 font-medium">{new Date(unit.publish_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                )}
                {unit.slug && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-400 flex items-center gap-1.5 flex-shrink-0"><Globe className="w-3.5 h-3.5" />Slug</span>
                    <span className="text-slate-600 font-mono text-xs bg-slate-50 px-2 py-0.5 rounded truncate max-w-[140px]">{unit.slug}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tags */}
            {unit.tags?.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {unit.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                      <Tag className="w-3 h-3" />{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right col: content tabs */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Tab bar */}
              <div className="flex items-end border-b border-slate-200 px-4 pt-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px
                      ${activeTab === tab.id
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200"}`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.count !== null && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
                        ${activeTab === tab.id ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                {(activeTab === "videos" || activeTab === "tasks" || activeTab === "tests") && (
                  <div className="pb-2 pr-1">
                    <button className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                      Add {activeTab.slice(0, -1)}
                    </button>
                  </div>
                )}
              </div>
              <div className="p-4 min-h-[300px]">
                {activeTab === "videos" && <VideosPanel videos={unit.videos} />}
                {activeTab === "tasks"  && <TasksPanel  tasks={unit.tasks}   />}
                {activeTab === "tests"  && <TestsPanel  tests={unit.tests}   />}
                {activeTab === "analytics" && (
                  <div className="flex items-center justify-center py-14 text-slate-400">
                    <p className="text-sm">Analytics coming soon</p>
                  </div>
                )}
                {activeTab === "rag" && (
                  <RagDocsPanel unitId={unit.id} courseId={unit.course_id} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}