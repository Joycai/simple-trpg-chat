"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";

interface ConfirmDialogProps {
  /** Short question — "删除这篇手札？". */
  title: string;
  /** The consequence, spelled out. */
  description: ReactNode;
  confirmLabel: string;
  /** Defaults to `common.cancel`. */
  cancelLabel?: string;
  /** `danger` for destructive actions (default), `primary` otherwise. */
  tone?: "danger" | "primary";
  /** Badge glyph; defaults to a warning triangle. */
  icon?: ReactNode;
  /** Shows a spinner and blocks the confirm button while the action runs. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Themed replacement for `window.confirm` — the native one ignores the theme
 * (font, radius, palette, motion all come from the OS) and blocks the main
 * thread on mobile.
 *
 * Always portals: it is opened from inside a drawer/modal whose enter/exit
 * `transform` would otherwise become the containing block for `position: fixed`
 * and center this dialog inside that ancestor instead of the screen.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  icon,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const tCommon = useTranslations("common");
  const badge =
    tone === "danger"
      ? "bg-danger/12 text-danger border-danger/30"
      : "bg-primary/12 text-primary border-primary/30";
  const action =
    tone === "danger"
      ? "bg-danger text-white hover:opacity-90"
      : "bg-primary text-primary-foreground hover:bg-primary-hover";

  return (
    <OverlayShell
      onClose={onCancel}
      portal
      panelClassName="w-full max-w-sm mx-4 bg-surface theme-border rounded-theme shadow-2xl overflow-hidden font-theme"
    >
      {(close) => (
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className={`w-11 h-11 rounded-theme shrink-0 flex items-center justify-center border ${badge}`}>
              {icon ?? <Icons.AlertTriangle className="w-5 h-5" />}
            </span>
            <h4 className="font-bold text-text text-lg font-theme-display">{title}</h4>
          </div>
          <p className="text-sm text-text-muted leading-6 mb-5">{description}</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={close}
              className="px-4 py-2 rounded-theme border border-border text-text text-sm font-bold hover:bg-surface-alt transition cursor-pointer"
            >
              {cancelLabel ?? tCommon("cancel")}
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-theme text-sm font-bold transition disabled:opacity-50 cursor-pointer ${action}`}
            >
              {busy && <Icons.Loader2 className="w-4 h-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </OverlayShell>
  );
}
