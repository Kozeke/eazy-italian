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

const MODAL_CSS = `
.pep-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 999;
}
.pep-modal {
  width: 100%;
  max-width: 460px;
  background: #FFFFFF;
  border: 1px solid ${T.border};
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
  padding: 28px;
  font-family: ${T.bFont};
}
.pep-modal-title {
  font-family: ${T.dFont};
  font-size: 22px;
  font-weight: 900;
  color: ${T.text};
  margin-bottom: 10px;
}
.pep-modal-sub {
  font-size: 14px;
  line-height: 1.55;
  color: ${T.muted};
}
.pep-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
.pep-modal-btn {
  border: none;
  border-radius: 12px;
  padding: 11px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
}
.pep-modal-btn:disabled {
  opacity: .6;
  cursor: not-allowed;
}
.pep-modal-btn--ghost {
  background: #F8FAFC;
  color: ${T.text};
  border: 1px solid ${T.border};
}
.pep-modal-btn--primary {
  background: linear-gradient(135deg, ${T.violet}, #8B5CF6);
  color: #FFFFFF;
  box-shadow: 0 12px 28px rgba(108,53,222,.24);
}
.pep-modal-btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
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
  const [publishing, setPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);

  const refreshPresentation = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/presentations/${presId}`, { headers: authH() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setPres(data);
    const rawSlides = data.slides || data.presentation_slides || [];
    const sorted = [...rawSlides].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    setSlides(sorted.map(toEditorSlide));
    return data;
  }, [presId]);

  /* ── Load ── */
  useEffect(() => {
    if (!presId) return;
    setLoading(true); setError(null);

    refreshPresentation()
      .catch(e => setError(e.message || "Failed to load presentation"))
      .finally(() => setLoading(false));
  }, [refreshPresentation]);

  /* ── Back ── */
  const handleBack = useCallback(() => {
    const unitId = unitIdParam || pres?.unit_id;
    if (unitId) navigate(`/admin/units/${unitId}`);
    else navigate(-1);
  }, [unitIdParam, pres, navigate]);

  const navigateToUnitDetails = useCallback(() => {
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
      await refreshPresentation();
      setShowPublishModal(true);
    } catch (e) {
      toast.error(e.message || "Save failed", { id: toastId });
    } finally {
      setSaving(false);
    }
  }, [presId, pres, slides, refreshPresentation]);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    const toastId = toast.loading("Publishing presentation…");
    try {
      const res = await fetch(`/api/v1/admin/presentations/${presId}`, {
        method: "PATCH",
        headers: authH(),
        body: JSON.stringify({
          status: "published",
          is_visible_to_students: true,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }

      await refreshPresentation();
      setShowPublishModal(false);
      toast.success("Presentation published", { id: toastId });
      navigateToUnitDetails();
    } catch (e) {
      toast.error(e.message || "Publish failed", { id: toastId });
    } finally {
      setPublishing(false);
    }
  }, [presId, refreshPresentation, navigateToUnitDetails]);

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
    <>
      <style>{MODAL_CSS}</style>
      <SlideEditorPage
        slides={slides}
        title={pres?.title || "Presentation"}
        meta={meta}
        saveLabel="Save slides"
        onSave={handleSave}
        onBack={handleBack}
      />

      {showPublishModal && (
        <div className="pep-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="publish-modal-title">
          <div className="pep-modal">
            <div id="publish-modal-title" className="pep-modal-title">
              Publish this presentation?
            </div>
            <div className="pep-modal-sub">
              Slides were saved successfully. You can publish now to make this presentation visible to students, or keep it as a draft for later.
            </div>
            <div className="pep-modal-actions">
              <button
                type="button"
                className="pep-modal-btn pep-modal-btn--ghost"
                onClick={() => {
                  setShowPublishModal(false);
                  navigateToUnitDetails();
                }}
                disabled={publishing}
              >
                Leave as draft
              </button>
              <button
                type="button"
                className="pep-modal-btn pep-modal-btn--primary"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
