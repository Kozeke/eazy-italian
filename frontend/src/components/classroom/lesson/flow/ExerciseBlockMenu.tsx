/**
 * ExerciseBlockMenu.tsx  (v3 — teacher broadcast reset confirmation)
 *
 * Changes from v2:
 * ─────────────────
 * • Added `resetIsTeacherBroadcast` prop.
 *   When true, clicking "Сбросить ответы" shows an inline two-step
 *   confirmation inside the dropdown ("Сбросить у всех учеников?") before
 *   firing onResetAnswers. Pressing Cancel or Escape returns to the normal menu.
 *   This prevents accidental mass-reset of all students' work.
 *
 *   Student reset (resetIsTeacherBroadcast omitted / false) fires immediately
 *   with no confirmation — only their own answers are affected.
 *
 * All prior changes from v2 (onCopyToHomework) are preserved unchanged.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  EyeOff,
  Focus,
  RotateCcw,
  Home,
  ArrowUp,
  ArrowDown,
  Pencil,
  Sparkles,
  Trash2,
  Copy,
  MoreHorizontal,
  BookMarked,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ExerciseBlockMenuProps {
  children: React.ReactNode;

  /** All callbacks are optional — missing ones hide that row */
  onHideFromStudent?: () => void;
  onFocusExercise?: () => void;
  onResetAnswers?: () => void;
  /**
   * When true, clicking "Сбросить ответы" shows an inline confirmation
   * ("Сбросить у всех учеников?") before firing onResetAnswers.
   * Pass this only in teacher mode when the reset will broadcast to all students.
   */
  resetIsTeacherBroadcast?: boolean;
  onSendToHomework?: () => void;
  /** Copies this exercise block into the homework panel */
  onCopyToHomework?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onEdit?: () => void;    // "Редактировать упражнение"
  onEditNew?: () => void; // "Редактировать" + "Новая версия" badge
  onDelete?: () => void;
  onDuplicate?: () => void;
}

// ─── Menu item shape ──────────────────────────────────────────────────────────

interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  danger?: boolean;
  highlight?: boolean;
  dividerBefore?: boolean;
  action: (() => void) | undefined;
}

// ─── Portal dropdown ──────────────────────────────────────────────────────────

interface DropdownPortalProps {
  anchorRef: React.RefObject<HTMLButtonElement>;
  menuRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
  onItemClick: (action: (() => void) | undefined) => void;
}

function DropdownPortal({ anchorRef, menuRef, children }: Omit<DropdownPortalProps, 'onItemClick'>) {
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "fixed",
    top: 0,
    right: 0,
    opacity: 0,
    pointerEvents: "none",
  });

  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setStyle({
      position: "fixed",
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
      opacity: 1,
      pointerEvents: "auto",
    });
  }, [anchorRef]);

  return createPortal(
    <div ref={menuRef} className="ebm-menu" role="menu" style={style}>
      {children}
    </div>,
    document.body,
  );
}

// ─── Inline menu items renderer ───────────────────────────────────────────────

function MenuItems({
  items,
  onItemClick,
}: {
  items: MenuItem[];
  onItemClick: (action: (() => void) | undefined) => void;
}) {
  return (
    <>
      {items.map((item) => (
        <React.Fragment key={item.key}>
          {item.dividerBefore && <div className="ebm-divider" role="separator" />}
          <button
            type="button"
            className={[
              "ebm-item",
              item.danger    ? "ebm-item--danger"    : "",
              item.highlight ? "ebm-item--highlight" : "",
            ].filter(Boolean).join(" ")}
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onItemClick(item.action);
            }}
          >
            <span className="ebm-item-icon">{item.icon}</span>
            <span className="ebm-item-label">{item.label}</span>
            {item.badge && (
              <span className="ebm-item-badge">{item.badge}</span>
            )}
          </button>
        </React.Fragment>
      ))}
    </>
  );
}

// ─── Reset confirmation panel (teacher-only) ──────────────────────────────────

function ResetConfirmPanel({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="ebm-confirm">
      <div className="ebm-confirm__header">
        <span className="ebm-confirm__icon">
          <AlertTriangle size={14} strokeWidth={2} />
        </span>
        <span className="ebm-confirm__title">Сбросить у всех учеников?</span>
      </div>
      <p className="ebm-confirm__body">
        Ответы всех подключённых учеников будут очищены.
      </p>
      <div className="ebm-confirm__actions">
        <button
          type="button"
          className="ebm-confirm__btn ebm-confirm__btn--cancel"
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
        >
          <X size={13} strokeWidth={2.2} />
          Отмена
        </button>
        <button
          type="button"
          className="ebm-confirm__btn ebm-confirm__btn--confirm"
          onClick={(e) => { e.stopPropagation(); onConfirm(); }}
        >
          <Check size={13} strokeWidth={2.5} />
          Сбросить
        </button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExerciseBlockMenu({
  children,
  onHideFromStudent,
  onFocusExercise,
  onResetAnswers,
  resetIsTeacherBroadcast,
  onSendToHomework,
  onCopyToHomework,
  onMoveUp,
  onMoveDown,
  onEdit,
  onEditNew,
  onDelete,
  onDuplicate,
}: ExerciseBlockMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const btnRef  = useRef<HTMLButtonElement>(null) as React.RefObject<HTMLButtonElement>;

  // Close (and clear confirmation state) when menu closes
  const closeMenu = () => {
    setOpen(false);
    setConfirmingReset(false);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmingReset) {
          // Escape from confirm → back to normal menu, don't close
          setConfirmingReset(false);
        } else {
          closeMenu();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, confirmingReset]);

  // Close on scroll
  useEffect(() => {
    if (!open) return;
    const handler = () => closeMenu();
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [open]);

  const menuItems: MenuItem[] = [
    {
      key: "copy-to-homework",
      icon: <BookMarked size={15} strokeWidth={1.8} />,
      label: "Скопировать в дом. работу",
      highlight: true,
      action: onCopyToHomework,
    },
    {
      key: "hide",
      icon: <EyeOff size={15} strokeWidth={1.8} />,
      label: "Скрыть от ученика",
      dividerBefore: !!onCopyToHomework,
      action: onHideFromStudent,
    },
    {
      key: "focus",
      icon: <Focus size={15} strokeWidth={1.8} />,
      label: "Внимание на упражнение",
      action: onFocusExercise,
    },
    {
      key: "reset",
      icon: <RotateCcw size={15} strokeWidth={1.8} />,
      label: "Сбросить ответы",
      // Teacher broadcast → show confirm panel first; student → fire directly
      action: onResetAnswers
        ? (resetIsTeacherBroadcast
            ? () => setConfirmingReset(true)
            : onResetAnswers)
        : undefined,
    },
    {
      key: "homework",
      icon: <Home size={15} strokeWidth={1.8} />,
      label: "В домашнюю работу",
      action: onSendToHomework,
    },
    {
      key: "move-up",
      icon: <ArrowUp size={15} strokeWidth={1.8} />,
      label: "Переместить вверх",
      action: onMoveUp,
    },
    {
      key: "move-down",
      icon: <ArrowDown size={15} strokeWidth={1.8} />,
      label: "Переместить вниз",
      action: onMoveDown,
    },
    {
      key: "edit-exercise",
      icon: <Pencil size={15} strokeWidth={1.8} />,
      label: "Редактировать упражнение",
      dividerBefore: true,
      action: onEdit,
    },
    {
      key: "edit-new",
      icon: <Sparkles size={15} strokeWidth={1.8} />,
      label: "Редактировать",
      badge: "Новая версия",
      action: onEditNew,
    },
    {
      key: "delete",
      icon: <Trash2 size={15} strokeWidth={1.8} />,
      label: "Удалить упражнение",
      danger: true,
      dividerBefore: true,
      action: onDelete,
    },
    {
      key: "duplicate",
      icon: <Copy size={15} strokeWidth={1.8} />,
      label: "Копировать упражнение в…",
      action: onDuplicate,
    },
  ].filter((item) => item.action !== undefined);

  return (
    <div className="ebm-wrapper">
      {children}

      {/* ⋯ trigger */}
      <button
        ref={btnRef}
        type="button"
        className={`ebm-trigger${open ? " ebm-trigger--active" : ""}`}
        aria-label="Block options"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          if (open) setConfirmingReset(false);
        }}
      >
        <MoreHorizontal size={16} strokeWidth={2} />
      </button>

      {/* Dropdown via portal */}
      {open && menuItems.length > 0 && (
        <DropdownPortal anchorRef={btnRef} menuRef={menuRef}>
          {confirmingReset ? (
            <ResetConfirmPanel
              onConfirm={() => {
                closeMenu();
                onResetAnswers?.();
              }}
              onCancel={() => setConfirmingReset(false)}
            />
          ) : (
            <MenuItems
              items={menuItems}
              onItemClick={(action) => {
                // If the action will open the confirm panel (teacher broadcast),
                // fire it WITHOUT closing the menu.
                if (resetIsTeacherBroadcast && action === menuItems.find(i => i.key === "reset")?.action) {
                  action?.();
                  return;
                }
                setOpen(false);
                action?.();
              }}
            />
          )}
        </DropdownPortal>
      )}
    </div>
  );
}

export default ExerciseBlockMenu;