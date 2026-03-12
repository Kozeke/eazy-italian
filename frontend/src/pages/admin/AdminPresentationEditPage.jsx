/**
 * AdminPresentationEditPage.jsx
 *
 * Full-screen slide editor for an existing saved presentation.
 * URL: /admin/presentations/:presId/edit
 *
 * Flow:
 *   1. Load  GET /api/v1/admin/presentations/:presId  (returns pres + slides[])
 *   2. Mount SlideEditorPage with loaded slides
 *   3. onSave(editedSlides):
 *      a. PATCH  /api/v1/admin/presentations/:presId          (title / metadata)
 *      b. DELETE /api/v1/admin/presentations/:presId/slides   (bulk-clear)
 *         — falls back to individual DELETE per slide if bulk fails
 *      c. POST   /api/v1/admin/presentations/:presId/slides   (recreate each)
 *   4. onBack → navigate to /admin/units/:unitId
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import SlideEditorPage from "./SlideEditorPage.jsx";
import toast from "react-hot-toast";

/* ── Design tokens (loading screen only) ────────────────────────────────── */
const T = {
  violet:"#6C35DE", violetL:"#EDE9FF",
  bg:"#F7F6FF", border:"#E5DEFF",
  text:"#1A1035", muted:"#9188C4",
  dFont:"'Nunito', system-ui, sans-serif",
  bFont:"'Inter', system-ui, sans-serif",
};

const LOAD_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600&display=swap');
@keyframes pep-spin  { to { transform:rotate(360deg) } }
@keyframes pep-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }

.pep-center {
  display:flex; align-items:center; justify-content:center;
  min-height:100vh; background:${T.bg};
  font-family:${T.bFont}; flex-direction:column; gap:16px;
  color:${T.muted};
}
.pep-spinner {
  width:28px; height:28px;
  border:3px solid ${T.border};
  border-top-color:${T.violet};
  border-radius:50%;
  animation:pep-spin .8s linear infinite;
}
.pep-orb {
  width:72px; height:72px; border-radius:22px;
  background:linear-gradient(135deg,${T.violet},#F0447C);
  display:flex; align-items:center; justify-content:center;
  font-size:32px; margin-bottom:8px;
  box-shadow:0 12px 36px rgba(108,53,222,.32);
  animation:pep-float 2.4s ease-in-out infinite;
}
.pep-msg  { font-family:${T.dFont}; font-size:17px; font-weight:900; color:${T.text}; }
.pep-sub  { font-size:13px; color:${T.muted}; }
.pep-err  { color:#EF4444; font-weight:700; }
.pep-back {
  margin-top:8px; border:none; background:none;
  cursor:pointer; color:${T.violet}; font-weight:700;
  font-size:14px; text-decoration:underline; font-family:${T.bFont};
}
`;

/* ── Auth helper ─────────────────────────────────────────────────────────── */
const authH = () => {
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

/* ── Normalise a raw DB slide → SlideEditorPage shape ────────────────────── */
const toEditorSlide = (s) => ({
  id:           String(s.id),
  title:        s.title      || "Untitled slide",
  bullets:      Array.isArray(s.bullet_points) ? s.bullet_points : (s.bullets || []),
  examples:     s.examples   || [],
  exercise:     s.exercise   ?? null,
  teacher_notes:s.teacher_notes ?? null,
  image_url:    s.image_url  ?? null,
  imageType:    s.image_type ?? "auto",
  _dbId:        s.id,          // keep original numeric id for delete
});

/* ── Convert editor slide back to DB shape for POST ─────────────────────── */
const toDbSlide = (s, orderIndex) => ({
  title:         s.title        || "",
  bullet_points: s.bullets      || [],
  examples:      s.examples     || [],
  exercise:      s.exercise     ?? null,
  teacher_notes: s.teacher_notes ?? null,
  image_url:     s.image_url    ?? null,
  image_alt:     null,
  order_index:   orderIndex,
});

/* ════════════════════════════════════════════════════════════════════════════
   PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function AdminPresentationEditPage() {
  const { presId }        = useParams();
  const [searchParams]    = useSearchParams();
  const navigate          = useNavigate();

  const unitIdParam = searchParams.get("unit_id") || searchParams.get("unitId");

  const [pres,    setPres]    = useState(null);   // full presentation object
  const [slides,  setSlides]  = useState([]);     // editor-shaped slides
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [saving,  setSaving]  = useState(false);

  /* ── Load ── */
  useEffect(() => {
    if (!presId) return;
    setLoading(true); setError(null);

    fetch(`/api/v1/admin/presentations/${presId}`, { headers: authH() })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setPres(data);
        const rawSlides = data.slides || data.presentation_slides || [];
        const sorted = [...rawSlides].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        setSlides(sorted.map(toEditorSlide));
      })
      .catch(e => setError(e.message || "Failed to load presentation"))
      .finally(() => setLoading(false));
  }, [presId]);

  /* ── Back ── */
  const handleBack = useCallback(() => {
    const unitId = unitIdParam || pres?.unit_id;
    if (unitId) navigate(`/admin/units/${unitId}`);
    else navigate(-1);
  }, [unitIdParam, pres, navigate]);

  /* ── Save ── */
  const handleSave = useCallback(async (editedSlides) => {
    setSaving(true);
    const toastId = toast.loading("Saving slides…");
    try {
      // 1. PATCH presentation metadata (title)
      const newTitle = editedSlides?.[0]?.title || pres?.title || "Presentation";
      await fetch(`/api/v1/admin/presentations/${presId}`, {
        method: "PATCH",
        headers: authH(),
        body: JSON.stringify({ title: pres?.title || newTitle }),
      }).then(r => { if (!r.ok) console.warn("PATCH pres failed, continuing"); });

      // 2. Bulk-delete existing slides — try bulk endpoint first
      const bulkDel = await fetch(`/api/v1/admin/presentations/${presId}/slides`, {
        method: "DELETE",
        headers: authH(),
      });

      // If bulk-delete not available (404/405), delete individually
      if (!bulkDel.ok) {
        await Promise.all(
          slides
            .filter(s => s._dbId)
            .map(s =>
              fetch(`/api/v1/admin/presentations/${presId}/slides/${s._dbId}`, {
                method: "DELETE",
                headers: authH(),
              })
            )
        );
      }

      // 3. Re-create slides in order
      const source = editedSlides?.length ? editedSlides : slides;
      for (let i = 0; i < source.length; i++) {
        const body = toDbSlide(source[i], i);
        const res = await fetch(`/api/v1/admin/presentations/${presId}/slides`, {
          method: "POST",
          headers: authH(),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Slide ${i + 1} save failed: ${txt}`);
        }
      }

      toast.success("Slides saved", { id: toastId });

      // Reload fresh slide data into state so ids stay current
      const fresh = await fetch(`/api/v1/admin/presentations/${presId}`, { headers: authH() });
      if (fresh.ok) {
        const d = await fresh.json();
        const rawSlides = d.slides || d.presentation_slides || [];
        const sorted = [...rawSlides].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        setSlides(sorted.map(toEditorSlide));
      }
    } catch (e) {
      toast.error(e.message || "Save failed", { id: toastId });
    } finally {
      setSaving(false);
    }
  }, [presId, pres, slides]);

  /* ── Loading / error ── */
  if (loading || error) return (
    <>
      <style>{LOAD_CSS}</style>
      <div className="pep-center">
        <div className="pep-orb">🖼️</div>
        {loading && (
          <>
            <div className="pep-msg">Loading slides…</div>
            <div className="pep-sub">Fetching your slide deck</div>
            <div className="pep-spinner" />
          </>
        )}
        {error && (
          <>
            <div className="pep-msg pep-err">⚠️ {error}</div>
            <button className="pep-back" onClick={handleBack}>← Go back</button>
          </>
        )}
      </div>
    </>
  );

  const meta = [
    slides.length > 0 ? `${slides.length} slide${slides.length !== 1 ? "s" : ""}` : "Empty deck",
    pres?.language,
    pres?.level,
  ].filter(Boolean).join(" · ");

  return (
    <SlideEditorPage
      slides={slides}
      title={pres?.title || "Presentation"}
      meta={meta}
      saveLabel="Save slides"
      onSave={handleSave}
      onBack={handleBack}
    />
  );
}
