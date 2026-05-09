import { useTranslation } from 'react-i18next';
import DragWordToImageEditorPage, {
  type DragToImageCard as TypeWordToImageCard,
  type DragToImageData as TypeWordToImageData,
} from './DragWordToImageEditorPage';

interface Props {
  initialTitle?: string;
  initialData?: TypeWordToImageData;
  label?: string;
  onSave: (data: TypeWordToImageData, blockId?: string) => void;
  onCancel: () => void;
  segmentId?: string | number | null;
  /** Header cog: return to exercise template gallery (ExerciseDraftsPage). */
  onSettingsClick?: () => void;
}

export type { TypeWordToImageCard, TypeWordToImageData };

export default function TypeWordToImageEditorPage({
  initialTitle = '',
  initialData,
  label,
  onSave,
  onCancel,
  segmentId,
  onSettingsClick,
}: Props) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t('exerciseTemplates.labels.visual-input');
  return (
    <DragWordToImageEditorPage
      initialTitle={initialTitle}
      initialData={initialData}
      label={resolvedLabel}
      showWordsBar={false}
      onSave={onSave}
      onCancel={onCancel}
      exerciseType='type_word_to_image'
      segmentId={segmentId}
      onSettingsClick={onSettingsClick}
    />
  );
}