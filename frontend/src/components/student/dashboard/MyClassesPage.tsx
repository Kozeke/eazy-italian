/**
 * MyClassesPage.tsx
 *
 * Student classes catalog styled to match AdminCoursesCatalog visual design.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useTeacherClassroomTransition } from "../../../contexts/TeacherClassroomTransitionContext";
import { API_V1_BASE } from "../../../services/api";

// Stores theme tokens shared across this catalog page.
const T = {
  violet: "#6C6FEF",
  violetL: "#EEF0FE",
  violetD: "#4F52C2",
  lime: "#0DB85E",
  teal: "#00BCD4",
  white: "#FFFFFF",
  border: "#E8E8F0",
  text: "#18181B",
  sub: "#52525B",
  muted: "#A1A1AA",
  mutedL: "#D4D4D8",
  dFont: "'Nunito', system-ui, sans-serif",
  bFont: "'Inter', system-ui, sans-serif",
};

// Stores pastel backgrounds for cards without thumbnails.
const PASTELS = ["#FADADD", "#DAE8FA", "#DAF5E8", "#FAF0DA", "#E8DAFA", "#DAF5FA"];
// Stores matching text colors for pastel cards.
const PASTEL_TEXT = ["#C97A85", "#6A9AC9", "#5AB88A", "#C9A060", "#8A60C9", "#4AAEC4"];
// Stores gradient swatches for list row avatars.
const GRADS = [
  "linear-gradient(135deg,#6C6FEF,#9B9EF7)",
  "linear-gradient(135deg,#4F52C2,#6C6FEF)",
  "linear-gradient(135deg,#0DB85E,#6C6FEF)",
  "linear-gradient(135deg,#0099E6,#4F52C2)",
];

// Injects page-level CSS so the student page matches admin catalog styling.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');
.cat-root { min-height:100%; font-family:${T.bFont}; color:${T.text}; padding-bottom:80px; }
.cat-root *, .cat-root *::before, .cat-root *::after { box-sizing:border-box; margin:0; padding:0; }
.cat-page {
  background:${T.white};
  border-radius:16px;
  border:1px solid ${T.border};
  margin:28px 20%;
  padding:36px 44px 48px;
  box-shadow:0 1px 4px rgba(108,111,239,.04);
}
.cat-title { font-family:${T.dFont}; font-size:24px; font-weight:900; color:${T.text}; margin-bottom:22px; }
.cat-search {
  display:flex; align-items:center; gap:8px; background:white; border:1.5px solid ${T.border};
  border-radius:10px; padding:9px 14px; margin-bottom:14px; transition:border-color .15s, box-shadow .15s;
}
.cat-search:focus-within { border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL}; }
.cat-search input {
  flex:1; border:none; outline:none; font-family:${T.bFont}; font-size:13.5px; color:${T.text}; background:transparent;
}
.cat-search input::placeholder { color:${T.mutedL}; }
.cat-clear-btn { border:none; background:none; cursor:pointer; color:${T.mutedL}; font-size:18px; line-height:1; padding:0; }
.cat-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:16px; }
.cat-view-toggle {
  display:flex; background:white; border:1.5px solid ${T.border}; border-radius:9px; overflow:hidden; margin-left:auto;
}
.cat-vbtn {
  padding:7px 10px; border:none; background:transparent; color:${T.mutedL}; cursor:pointer;
  display:flex; align-items:center; transition:all .13s;
}
.cat-vbtn.on { background:${T.violetL}; color:${T.violetD}; }
.cat-result-count {
  font-size:12px; color:${T.muted}; font-weight:600; margin-bottom:16px; display:flex; align-items:center; gap:10px;
}
.cat-result-count::after { content:''; flex:1; height:1px; background:${T.border}; }
.cat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,200px)); gap:18px; }
.cat-card {
  background:white; border-radius:12px; border:1px solid ${T.border}; cursor:pointer; display:flex; flex-direction:column;
  overflow:hidden; transition:transform .17s, box-shadow .17s, border-color .17s;
}
.cat-card:hover { transform:translateY(-2px); box-shadow:0 4px 14px rgba(108,111,239,.10); border-color:${T.violet}; }
.cat-card-thumb {
  width:100%; aspect-ratio:1/1; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center;
}
.cat-card-thumb-img { width:100%; height:100%; object-fit:cover; display:block; }
.cat-card-thumb-initial { font-family:${T.dFont}; font-size:clamp(36px,9vw,56px); font-weight:900; opacity:0.75; }
.cat-card-body { padding:11px 13px 13px; border-top:1px solid ${T.border}; }
.cat-card-title {
  font-family:${T.bFont}; font-size:12.5px; font-weight:600; color:${T.text}; line-height:1.35;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}
.cat-card-sub { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:5px; }
.cat-card-sub-item { font-size:10.5px; color:${T.muted}; font-weight:500; display:flex; align-items:center; gap:3px; }
.cat-list { display:flex; flex-direction:column; gap:9px; }
.cat-row {
  background:white; border-radius:12px; border:1.5px solid ${T.border}; display:flex; align-items:center; gap:12px;
  padding:10px 14px; cursor:pointer; transition:all .16s;
}
.cat-row:hover {
  border-color:${T.violet}; box-shadow:0 2px 10px rgba(108,111,239,.08); transform:translateX(2px);
}
.cat-row-swatch {
  width:40px; height:40px; border-radius:11px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
  font-family:${T.dFont}; font-size:17px; font-weight:900; color:white;
}
.cat-row-info { flex:1; min-width:0; }
.cat-row-title {
  font-family:${T.dFont}; font-size:14px; font-weight:800; color:${T.text};
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px;
}
.cat-row-meta { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.cat-row-meta-item { font-size:11.5px; color:${T.muted}; font-weight:500; display:flex; align-items:center; gap:3px; }
.cat-row-prog { width:80px; flex-shrink:0; }
.cat-track { height:3px; background:${T.border}; border-radius:999px; overflow:hidden; }
.cat-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,${T.lime},${T.teal}); transition:width .5s; }
.cat-skeleton { border-radius:12px; overflow:hidden; background:white; border:1px solid ${T.border}; }
.cat-skel-sq { width:100%; aspect-ratio:1/1; background:#eef0fe; opacity:.7; }
.cat-skel-body { padding:11px 13px 13px; border-top:1px solid ${T.border}; }
.cat-skel-line { border-radius:6px; margin-bottom:7px; background:#eef0fe; opacity:.7; }
.cat-empty {
  min-height:42vh; display:flex; align-items:center; justify-content:center; padding:40px; text-align:center;
}
.cat-empty-card {
  background:white; border:1px solid ${T.border}; border-radius:20px; padding:34px 36px; max-width:440px; width:100%;
  box-shadow:0 6px 24px rgba(108,111,239,.07);
}
.cat-empty-title { font-family:${T.dFont}; font-size:22px; font-weight:900; color:${T.text}; margin-bottom:8px; }
.cat-empty-sub { font-size:13px; color:${T.sub}; line-height:1.7; max-width:300px; margin:0 auto; }
.cat-no-res { display:flex; flex-direction:column; align-items:center; padding:50px 24px; text-align:center; }
.cat-no-res-emoji { font-size:34px; margin-bottom:12px; opacity:.35; }
.cat-no-res-title { font-family:${T.dFont}; font-size:17px; font-weight:900; color:${T.text}; margin-bottom:5px; }
.cat-no-res-sub { font-size:12.5px; color:${T.muted}; }
@media(max-width:768px){ .cat-page { margin:16px 16px; padding:22px 20px 28px; } .cat-grid { grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px; } }
@media(max-width:480px){ .cat-grid { grid-template-columns:repeat(2,1fr); gap:10px; } }
`;

// Defines student classroom entity used by this page.
type StudentClassroom = {
  id: number;
  name: string;
  teacher_name?: string;
  course?: {
    id: number;
    title: string;
    thumbnail_url?: string | null;
  };
  progress?: number;
  completed?: boolean;
};

// Renders micro-icons used by the catalog toolbar and metadata rows.
const I = {
  Search: () => <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.7" /><path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>,
  Grid: () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" /></svg>,
  List: () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  Teacher: () => <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" /><path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
};

// Renders loading placeholder card while classrooms are still loading.
const Skel = ({ i }: { i: number }) => (
  <div className="cat-skeleton" style={{ animationDelay: `${i * 0.05}s` }}>
    <div className="cat-skel-sq" />
    <div className="cat-skel-body">
      <div className="cat-skel-line" style={{ height: 12, width: "70%" }} />
      <div className="cat-skel-line" style={{ height: 10, width: "46%" }} />
    </div>
  </div>
);

// Renders catalog card in grid mode.
const Card = ({ classroom, idx, onOpen }: { classroom: StudentClassroom; idx: number; onOpen: (classroom: StudentClassroom) => void }) => {
  // Stores color fill for cards without thumbnail.
  const pastel = PASTELS[idx % PASTELS.length];
  // Stores initial letter color for cards without thumbnail.
  const pastelText = PASTEL_TEXT[idx % PASTEL_TEXT.length];
  // Stores card thumbnail URL when provided by API.
  const thumb = classroom.course?.thumbnail_url ?? null;
  // Stores initial letter shown when no thumbnail exists.
  const initial = (classroom.name || "?")[0].toUpperCase();
  // Stores teacher display name fallback.
  const teacherName = classroom.teacher_name || "Teacher";
  return (
    <div className="cat-card" onClick={() => onOpen(classroom)}>
      <div className="cat-card-thumb" style={{ background: thumb ? "#eee" : pastel }}>
        {thumb
          ? <img className="cat-card-thumb-img" src={thumb} alt={classroom.name} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          : <span className="cat-card-thumb-initial" style={{ color: pastelText }}>{initial}</span>}
      </div>
      <div className="cat-card-body">
        <div className="cat-card-title">{classroom.name}</div>
        <div className="cat-card-sub">
          <span className="cat-card-sub-item"><I.Teacher /> {teacherName}</span>
        </div>
      </div>
    </div>
  );
};

// Renders catalog row in list mode.
const Row = ({ classroom, idx, onOpen }: { classroom: StudentClassroom; idx: number; onOpen: (classroom: StudentClassroom) => void }) => {
  // Stores gradient fill for list row swatch.
  const grad = GRADS[idx % GRADS.length];
  // Stores normalized progress percentage.
  const pct = Math.max(0, Math.min(100, Math.round(classroom.progress ?? 0)));
  // Stores teacher display name fallback.
  const teacherName = classroom.teacher_name || "Teacher";
  return (
    <div className="cat-row" onClick={() => onOpen(classroom)}>
      <div className="cat-row-swatch" style={{ background: grad }}>{(classroom.name || "?")[0].toUpperCase()}</div>
      <div className="cat-row-info">
        <div className="cat-row-title">{classroom.name}</div>
        <div className="cat-row-meta">
          <span className="cat-row-meta-item"><I.Teacher /> {teacherName}</span>
        </div>
      </div>
      <div className="cat-row-prog">
        <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, marginBottom: 3, textAlign: "right" }}>{pct}%</div>
        <div className="cat-track"><div className="cat-fill" style={{ width: `${pct}%` }} /></div>
      </div>
    </div>
  );
};

// Renders student classes page using admin-like catalog visual structure.
export default function MyClassesPage() {
  const navigate = useNavigate();
  // Reuses the global classroom transition trigger so student navigation matches teacher icon transition behavior.
  const { startTeacherClassroomOpen } = useTeacherClassroomTransition();
  const [classrooms, setClassrooms] = useState<StudentClassroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Loads student classrooms from API and updates page state.
    const loadClassrooms = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_V1_BASE}/student/classrooms`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const nextClassrooms = Array.isArray(data) ? data : (data.classrooms ?? []);
        setClassrooms(Array.isArray(nextClassrooms) ? nextClassrooms : []);
      } catch {
        // Prevents hard failure and keeps UX clear when API call fails.
        toast.error("Failed to load classes");
      } finally {
        setLoading(false);
      }
    };
    loadClassrooms();
  }, []);

  useEffect(() => {
    // Adds Cmd/Ctrl+K shortcut to focus page search input quickly.
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Filters classroom collection by text query across classroom and course titles.
  const filtered = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();
    return classrooms.filter((classroom) => {
      const classroomName = classroom.name?.toLowerCase() ?? "";
      const courseName = classroom.course?.title?.toLowerCase() ?? "";
      const teacherName = classroom.teacher_name?.toLowerCase() ?? "";
      return !normalizedQuery || classroomName.includes(normalizedQuery) || courseName.includes(normalizedQuery) || teacherName.includes(normalizedQuery);
    });
  }, [classrooms, query]);

  // Opens selected classroom route in student classroom mode.
  const handleOpen = (classroom: StudentClassroom) => {
    // Starts the same transition animation used by teacher course cards before route change.
    startTeacherClassroomOpen();
    navigate(`/student/classroom/${classroom.id}`);
  };

  // Stores whether user applied active search text.
  const isFiltered = !!query.trim();

  return (
    <>
      <style>{CSS}</style>
      <div className="cat-root">
        <div className="cat-page">
          <div className="cat-title">My Classes</div>

          <div className="cat-search">
            <I.Search />
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search classes..." />
            {query && <button className="cat-clear-btn" onClick={() => setQuery("")}>x</button>}
          </div>

          <div className="cat-toolbar">
            <div className="cat-view-toggle">
              <button className={`cat-vbtn ${view === "grid" ? "on" : ""}`} onClick={() => setView("grid")} title="Grid"><I.Grid /></button>
              <button className={`cat-vbtn ${view === "list" ? "on" : ""}`} onClick={() => setView("list")} title="List"><I.List /></button>
            </div>
          </div>

          {!loading && classrooms.length > 0 && (
            <div className="cat-result-count">
              {isFiltered
                ? `${filtered.length} of ${classrooms.length} classes`
                : `${classrooms.length} class${classrooms.length !== 1 ? "es" : ""}`}
            </div>
          )}

          {loading && (
            <div className="cat-grid">
              {[...Array(6)].map((_, i) => <Skel key={i} i={i + 1} />)}
            </div>
          )}

          {!loading && classrooms.length === 0 && (
            <div className="cat-empty">
              <div className="cat-empty-card">
                <h2 className="cat-empty-title">No classes yet</h2>
                <p className="cat-empty-sub">Ask your teacher to enroll you in a course and it will appear here.</p>
              </div>
            </div>
          )}

          {!loading && classrooms.length > 0 && filtered.length === 0 && (
            <div className="cat-no-res">
              <div className="cat-no-res-emoji">🔍</div>
              <div className="cat-no-res-title">No classes match</div>
              <div className="cat-no-res-sub">Try adjusting your search query.</div>
              <button
                style={{ marginTop: 14, border: "none", background: T.violetL, color: T.violetD, fontFamily: T.dFont, fontSize: 12.5, fontWeight: 700, padding: "7px 16px", borderRadius: 9, cursor: "pointer" }}
                onClick={() => setQuery("")}
              >
                Clear search
              </button>
            </div>
          )}

          {!loading && classrooms.length > 0 && view === "grid" && (
            <div className="cat-grid">
              {filtered.map((classroom, index) => (
                <Card key={classroom.id} classroom={classroom} idx={index} onOpen={handleOpen} />
              ))}
            </div>
          )}

          {!loading && classrooms.length > 0 && view === "list" && (
            <div className="cat-list">
              {filtered.map((classroom, index) => (
                <Row key={classroom.id} classroom={classroom} idx={index} onOpen={handleOpen} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
