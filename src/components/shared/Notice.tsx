import type { ReactNode } from "react";
import { Check, AlertTriangle, Info, X, type LucideIcon } from "lucide-react";

export type NoticeVariant = "success" | "error" | "info";

const VARIANTS: Record<NoticeVariant, { Icon: LucideIcon; cls: string }> = {
  success: { Icon: Check, cls: "border-success/40 bg-success/10 text-success" },
  error: { Icon: AlertTriangle, cls: "border-danger/40 bg-danger/10 text-danger" },
  info: { Icon: Info, cls: "border-primary/40 bg-primary/10 text-primary" },
};

/**
 * Inline notice / toast bar — success | error | info.
 * Colored outline + tinted bg + leading icon (rainglass design spec).
 * The icon takes the variant color; the message text stays `text-text`.
 *
 * Passing `onDismiss` appends a close button, which turns this into the themed
 * stand-in for a blocking `alert()`. The label is a prop rather than a
 * `useTranslations` call so this stays hook-free and usable from a server
 * component.
 */
export function Notice({
  variant,
  children,
  className = "",
  onDismiss,
  dismissLabel = "Close",
}: {
  variant: NoticeVariant;
  children: ReactNode;
  className?: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const { Icon, cls } = VARIANTS[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-center gap-2.5 px-4 py-3 rounded-theme border text-sm ${cls} ${className}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0 text-text">{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="shrink-0 hover:opacity-70 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
