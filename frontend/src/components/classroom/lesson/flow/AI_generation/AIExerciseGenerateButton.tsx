/**
 * AIExerciseGenerateButton.tsx
 *
 * Shared “Generate” control for exercise editors — same outlined primary style as
 * ImageEditorPage (border, white fill, Sparkles + label).
 */

import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

// Border, surface, and label color — same tokens as ImageEditorPage
const C = {
  border: "#E8EAFD",
  white: "#FFFFFF",
  primary: "#6C6FEF",
};

export interface AIExerciseGenerateButtonProps {
  /** Opens the AI exercise generator modal (or parent handler). */
  onClick: () => void;
  /** When true, clicks are ignored and the control is de-emphasized. */
  disabled?: boolean;
  /** Optional extra classes (e.g. layout helpers from parent). */
  className?: string;
  /** Optional layout overrides (margins, full width, etc.). */
  style?: CSSProperties;
}

export default function AIExerciseGenerateButton({
  onClick,
  disabled = false,
  className,
  style,
}: AIExerciseGenerateButtonProps) {
  const { t } = useTranslation();

  // Outlined pill matching image editors (padding, weight, primary on white)
  const baseStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 14px",
    borderRadius: 9,
    border: `1.5px solid ${C.border}`,
    background: C.white,
    color: C.primary,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
    opacity: disabled ? 0.5 : 1,
    ...style,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={baseStyle}
    >
      <Sparkles size={14} strokeWidth={2} />
      {t("exerciseHeader.generateButton")}
    </button>
  );
}
