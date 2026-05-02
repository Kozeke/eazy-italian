/**
 * AdditionalMaterialsModal.tsx
 *
 * Modal for viewing and managing per-unit downloadable materials.
 * Teachers can upload files; students can only download available files.
 */

import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Download, Upload, X } from "lucide-react";
import { resolveStaticAssetUrl, type UnitMaterialAttachment } from "../../../services/api";

// Maps stored attachment type strings to display labels; genericLabel covers empty/unknown types.
function formatMaterialType(type: string, genericLabel: string): string {
  const normalizedType = String(type || "").toLowerCase();
  if (!normalizedType) return genericLabel;
  if (normalizedType === "pdf") return "PDF";
  if (normalizedType === "docx") return "DOCX";
  if (normalizedType === "doc") return "DOC";
  if (normalizedType === "txt") return "TXT";
  if (normalizedType === "rtf") return "RTF";
  return normalizedType.toUpperCase();
}

type AdditionalMaterialsModalProps = {
  open: boolean;
  isTeacher: boolean;
  unitTitle?: string;
  materials: UnitMaterialAttachment[];
  loading?: boolean;
  uploading: boolean;
  onClose: () => void;
  onUploadFiles?: (files: File[]) => Promise<void>;
};

export default function AdditionalMaterialsModal({
  open,
  isTeacher,
  unitTitle,
  materials,
  loading = false,
  uploading,
  onClose,
  onUploadFiles,
}: AdditionalMaterialsModalProps) {
  // Provides localized copy for the materials modal (en / ru).
  const { t } = useTranslation();
  // Stores hidden input ref so the styled upload button can trigger the native picker.
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Builds a sorted material list so newest names appear consistently in the modal.
  const sortedMaterials = useMemo(
    () => [...materials].sort((a, b) => a.name.localeCompare(b.name)),
    [materials],
  );

  // Prevents rendering the modal markup when closed.
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center px-4"
      style={{ background: "rgba(15, 17, 35, 0.40)", backdropFilter: "blur(4px)" }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="additional-materials-title"
        className="w-full max-w-2xl p-6 sm:p-7"
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(108, 111, 239, 0.12), 0 2px 8px rgba(0,0,0,0.08)",
          maxHeight: "85vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="additional-materials-title" className="text-lg font-semibold text-slate-900">
              {t("classroom.additionalMaterialsModal.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {unitTitle
                ? t("classroom.additionalMaterialsModal.unitLabel", { title: unitTitle })
                : t("classroom.additionalMaterialsModal.unitMaterialsFallback")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={t("classroom.additionalMaterialsModal.closeAria")}
          >
            <X size={16} />
          </button>
        </div>

        {isTeacher && (
          <div
            className="mb-4 rounded-xl border border-dashed p-4"
            style={{ borderColor: "#CBD5E1", background: "#F7F7FA" }}
          >
            {/* Accepts document formats teachers can share with students. */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.rtf"
              multiple
              onChange={(event) => {
                const selectedFiles = event.target.files ? Array.from(event.target.files) : [];
                if (selectedFiles.length > 0 && onUploadFiles) {
                  void onUploadFiles(selectedFiles);
                }
                // Clears the input so re-selecting the same file triggers onChange again.
                event.currentTarget.value = "";
              }}
            />
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {t("classroom.additionalMaterialsModal.uploadTitle")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("classroom.additionalMaterialsModal.uploadFormats")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || loading}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                style={{ background: "#6C6FEF" }}
              >
                <Upload size={14} />
                {uploading
                  ? t("classroom.additionalMaterialsModal.uploading")
                  : loading
                    ? t("classroom.additionalMaterialsModal.refreshing")
                    : t("classroom.additionalMaterialsModal.uploadFiles")}
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading && (
            <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {t("classroom.additionalMaterialsModal.loading")}
            </div>
          )}
          {sortedMaterials.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-600">{t("classroom.additionalMaterialsModal.empty")}</p>
              {!isTeacher && (
                <p className="mt-1 text-xs text-slate-500">
                  {t("classroom.additionalMaterialsModal.emptyStudentHint")}
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {sortedMaterials.map((material) => {
                // Resolves server paths into absolute URLs so downloads work in all environments.
                const materialUrl = resolveStaticAssetUrl(material.path);
                return (
                  <li
                    key={`${material.path}-${material.name}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg"
                        style={{ background: "#EEF0FE", color: "#6C6FEF" }}
                      >
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{material.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatMaterialType(material.type, t("classroom.additionalMaterialsModal.fileTypeGeneric"))}
                        </p>
                      </div>
                    </div>
                    <a
                      href={materialUrl}
                      download={material.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-100"
                      style={{ color: "#4F52C2" }}
                    >
                      <Download size={13} />
                      {t("classroom.additionalMaterialsModal.download")}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
