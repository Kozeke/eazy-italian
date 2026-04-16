/**
 * AdminTaskCreatePage.tsx  —  Updated with AI Task Generation flow
 *
 * Route: /admin/tasks/new
 *
 * This is a thin routing shell that:
 *   1. Shows TaskGenerationMethodPicker on mount
 *   2a. Manual → renders the existing task creation form inline
 *   2b. AI     → opens AITaskGenerationWizard
 *   3. On AI success → navigate to Task Builder with generated IDs
 *      /admin/tasks/builder?generated=41,42,43&ai=1
 *
 * URL params forwarded from caller:
 *   ?unitId=<number>
 *   ?unitTitle=<string>   (URL-encoded)
 */

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CreateTaskMethodPicker } from "./CreateTaskMethodPicker";
import { AITaskGenerationWizard } from "./AITaskGenerationWizard";

export default function AdminTaskCreatePage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const unitId    = searchParams.get("unitId")    ? parseInt(searchParams.get("unitId")!)    : null;
  const unitTitle = searchParams.get("unitTitle") ?? null;

  const [pickerOpen, setPickerOpen] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  /* ── Dismiss without choosing → go back ── */
  const handleClose = () => navigate(-1);

  /* ── Manual branch → navigate directly to task builder ── */
  const handleManual = () => {
    const q = new URLSearchParams();
    if (unitId)    q.set("unitId",    String(unitId));
    if (unitTitle) q.set("unitTitle", unitTitle);
    // Navigate to task builder for new task creation
    navigate(`/admin/tasks/builder/new${q.toString() ? `?${q}` : ""}`);
  };

  /* ── AI branch ── */
  const handlePickAI      = () => { setPickerOpen(false); setWizardOpen(true); };
  const handleWizardBack  = () => { setWizardOpen(false); setPickerOpen(true); };
  const handleWizardClose = () => navigate(-1);

  /**
   * Called by AITaskGenerationWizard on success.
   * resp.tasks = [41, 42, 43]   (draft task IDs from backend)
   *
   * Navigate to Task Builder with generated IDs in query params.
   * The Task Builder reads ?generated=41,42,43&ai=1 and loads the drafts.
   */
  const handleDone = (taskIds: number[]) => {
    if (!taskIds || taskIds.length === 0) {
      console.error("[AdminTaskCreatePage] handleDone called with empty taskIds:", taskIds);
      // Fall back to tasks list
      navigate("/admin/tasks");
      return;
    }

    const path = `/admin/tasks/builder?generated=${taskIds.join(",")}&ai=1`;
    console.log("[AdminTaskCreatePage] Navigating to Task Builder:", path);
    navigate(path);
  };

  return (
    <>
      <CreateTaskMethodPicker
        open={pickerOpen}
        onClose={handleClose}
        unitId={unitId}
        unitTitle={unitTitle}
        onManual={handleManual}
        onAI={handlePickAI}
      />

      <AITaskGenerationWizard
        open={wizardOpen}
        onClose={handleWizardClose}
        onBack={handleWizardBack}
        unitId={unitId}
        unitTitle={unitTitle}
        onDone={handleDone}
      />
    </>
  );
}