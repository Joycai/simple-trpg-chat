"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

/** Shown while a host edits another member's card (UI spec ③). */
export function HostEditBanner({ hostLabel, memberName }: { hostLabel: string; memberName: string }) {
  const t = useTranslations("character");
  return (
    <div className="mx-6 mb-3 px-3 py-2 rounded-theme border border-accent/45 bg-accent/8 flex items-center gap-2 text-[13px] text-text">
      <span className="shrink-0 text-[11px] font-bold text-accent-foreground bg-accent rounded-md px-1.5">{hostLabel}</span>
      <span className="min-w-0">{t("hostEditBanner", { host: hostLabel, name: memberName })}</span>
    </div>
  );
}

/**
 * Someone else changed fields the draft also changes. The newer card is
 * already the baseline; the user picks whose values win for these fields.
 */
export function SheetConflictNotice({ fields, onTakeTheirs, onKeepMine }: {
  fields: string[];
  onTakeTheirs: () => void;
  onKeepMine: () => void;
}) {
  const t = useTranslations("character");
  return (
    <div role="status" className="mx-6 mb-3 px-3 py-2.5 rounded-theme border border-warning/50 bg-warning/8 flex flex-col gap-2 text-[13px]">
      <span className="flex items-center gap-2 font-semibold text-warning">
        <AlertCircle className="w-4 h-4 shrink-0" />{t("conflictTitle")}
      </span>
      <span className="text-xs text-text-muted">{t("conflictFields", { fields: fields.join(t("listSeparator")) })}</span>
      <span className="text-xs text-text-muted">{t("conflictBody")}</span>
      <span className="flex gap-2">
        <button type="button" onClick={onTakeTheirs}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-warning text-bg cursor-pointer">{t("conflictTakeTheirs")}</button>
        <button type="button" onClick={onKeepMine}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-input-border text-text hover:bg-surface-alt cursor-pointer">{t("conflictKeepMine")}</button>
      </span>
    </div>
  );
}
