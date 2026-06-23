import type { ReactNode } from "react";
import { Check, AlertTriangle, Info, type LucideIcon } from "lucide-react";

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
 */
export function Notice({
  variant,
  children,
  className = "",
}: {
  variant: NoticeVariant;
  children: ReactNode;
  className?: string;
}) {
  const { Icon, cls } = VARIANTS[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-center gap-2.5 px-4 py-3 rounded-theme border text-sm ${cls} ${className}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0 text-text">{children}</span>
    </div>
  );
}
