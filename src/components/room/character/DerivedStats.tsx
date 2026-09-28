"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ResolvedDerived } from "@/lib/character/sheet-model";

/**
 * Derived values — computed by the rule from the attributes, never stored,
 * never editable. Hidden ones (inputs to resource maxes) are left out.
 */
export function DerivedStats({ derived }: { derived: ReadonlyArray<ResolvedDerived> }) {
  const t = useTranslations("character");
  const shown = derived.filter((d) => d.field.display === "sheet" || d.field.display === "both");
  if (shown.length === 0) return null;
  const cols = shown.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3";
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-text-muted">
        <span className="flex items-center gap-1.5">{t("derivedTitle")} <Lock className="w-3 h-3" /></span>
        <span className="font-normal text-text-dim">{t("derivedHint")}</span>
      </div>
      <div className={`grid ${cols} gap-2.5`}>
        {shown.map(({ field, value }) => (
          <div key={field.key} className="rounded-theme bg-surface-alt px-3 py-2.5 flex flex-col gap-1"
            title={field.formulaKey ? t(field.formulaKey) : undefined}>
            <span className="text-xs text-text-muted truncate">{t(field.labelKey)}</span>
            <span className="text-lg font-bold font-theme-mono text-text-muted">{value}</span>
            {field.formulaKey && <span className="text-[10px] text-text-dim leading-tight">{t(field.formulaKey)}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
