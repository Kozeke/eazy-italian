/**
 * ExerciseEditorPage.tsx — LinguAI v2 (unchanged thin route wrapper)
 *
 * No breadcrumb, no outer shell, no route chrome.
 * Workspace rendered full-viewport with mode="standalone".
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import ExerciseEditorWorkspace from '../../components/classroom/lesson/exercise/ExerciseEditorWorkspace';
import { QuestionDraft } from '../../components/classroom/lesson/editors/QuestionEditorRenderer';

interface ExerciseEditorPageProps {
  initialTitle?: string;
  initialQuestions?: QuestionDraft[];
  onBack?: () => void;
  onSave?: (
    title: string,
    payloads: Record<string, unknown>[],
    drafts: QuestionDraft[],
  ) => Promise<void> | void;
}

export default function ExerciseEditorPage({
  initialTitle,
  initialQuestions,
  onBack,
  onSave,
}: ExerciseEditorPageProps) {
  const navigate = useNavigate();
  const handleCancel = onBack ?? (() => navigate(-1));

  return (
    <ExerciseEditorWorkspace
      mode="standalone"
      initialTitle={initialTitle}
      initialQuestions={initialQuestions}
      onCancel={handleCancel}
      onSave={onSave}
    />
  );
}