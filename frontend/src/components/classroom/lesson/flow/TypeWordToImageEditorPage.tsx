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
  label = 'Вписать слово к изображению',
  onSave,
  onCancel,
  segmentId,
  onSettingsClick,
}: Props) {
  return (
    <DragWordToImageEditorPage
      initialTitle={initialTitle}
      initialData={initialData}
      label={label}
      showWordsBar={false}
      onSave={onSave}
      onCancel={onCancel}
      exerciseType='type_word_to_image'
      segmentId={segmentId}
      onSettingsClick={onSettingsClick}
    />
  );
}