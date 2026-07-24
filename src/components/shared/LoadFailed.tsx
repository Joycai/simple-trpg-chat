"use client";

import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";

/**
 * Error state for a panel whose fetch failed.
 *
 * Panels used to swallow the rejection and fall through to their empty state,
 * so an expired session or a blip read as "you have no events / no notes" —
 * which invites the user to recreate content they still have. Say the load
 * failed, and give them a way to try again.
 */
export function LoadFailed({ onRetry, className = "" }: { onRetry: () => void; className?: string }) {
  const t = useTranslations("common");
  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center gap-3 text-text-dim ${className}`}>
      <Icons.AlertTriangle className="w-10 h-10 opacity-50" />
      <p className="text-sm">{t("loadFailed")}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-primary border border-primary/40 rounded-theme px-3 py-1.5 hover:bg-primary/10 transition cursor-pointer"
      >
        <Icons.RefreshCw className="w-3.5 h-3.5" />
        {t("retry")}
      </button>
    </div>
  );
}
