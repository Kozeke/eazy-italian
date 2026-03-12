/**
 * CreateTestPage.tsx
 *
 * Route: /admin/tests/new
 *
 * Phase 2 update: adds onDone handler (navigates to builder after AI success)
 * and passes unitLevel from URL params to the wizard.
 *
 * URL params:
 *   ?unitId=<number>
 *   ?unitTitle=<string>   (URL-encoded)
 *   ?unitLevel=<string>   (e.g. "B1") — NEW in Phase 2
 */

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CreateTestMethodPicker } from "./CreateTestMethodPicker.tsx";
import { AITestGenerationWizard }  from "./AITestGenerationWizard.tsx";
import { testsApi } from "../../services/api";

export default function CreateTestPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const unitId    = searchParams.get("unitId")    ? parseInt(searchParams.get("unitId")!)    : null;
  const unitTitle = searchParams.get("unitTitle") ?? null;
  const unitLevel = searchParams.get("unitLevel") ?? null;   // Phase 2: forwarded to wizard

  const [pickerOpen, setPickerOpen] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  /* Dismiss without choosing → go back */
  const handleClose = () => navigate(-1);

  /* Manual branch → create test and navigate directly to builder */
  const handleManual = async () => {
    try {
      // Create a new draft test first (unit_id is optional)
      const newTest = await testsApi.createTest({
        unit_id: unitId || undefined,
        title: "New Test",
        status: "draft",
      });
      // Navigate directly to the test builder with the new test ID
      navigate(`/admin/tests/${newTest.id}/builder`);
    } catch (error: any) {
      console.error("Failed to create test:", error);
      const errorMsg = error?.response?.data?.detail || error?.message || "Unknown error";
      alert(`Failed to create test: ${errorMsg}`);
      // Can't navigate without a test ID - the route requires :testId
      // User will need to try again or go back
    }
  };

  const handlePickAI      = () => { setPickerOpen(false); setWizardOpen(true); };
  const handleWizardBack  = () => { setWizardOpen(false); setPickerOpen(true); };
  const handleWizardClose = () => navigate(-1);

  /* Phase 3: navigate to builder with ?ai=1 so TestBuilderPage shows the AI-draft treatment */
  const handleDone = (testId: number) => {
    if (!testId) {
      console.error("[AdminTestCreatePage] handleDone called with invalid testId:", testId);
      return;
    }
    const path = `/admin/tests/${testId}/builder?ai=1`;
    console.log("[AdminTestCreatePage] Navigating to:", path);
    navigate(path);
  };

  return (
    <>
      <CreateTestMethodPicker
        open={pickerOpen}
        onClose={handleClose}
        unitId={unitId}
        unitTitle={unitTitle}
        onManual={handleManual}
        onAI={handlePickAI}
      />

      <AITestGenerationWizard
        open={wizardOpen}
        onClose={handleWizardClose}
        onBack={handleWizardBack}
        unitId={unitId}
        unitTitle={unitTitle}
        unitLevel={unitLevel}
        onDone={handleDone}
      />
    </>
  );
}