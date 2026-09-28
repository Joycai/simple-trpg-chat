"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { missingFields, type Completion, type FieldStatus } from "@/lib/character/completion";

/**
 * The panel's completion strip (UI spec ①): required set / total with a bar,
 * plus the unset required fields as chips that jump to the field. Rules with
 * no required field (basic, Triangle) show how many fields are set instead.
 */
export function SheetCompletionBar({ completion, labelOf, onJump, compact = false }: {
  completion: Completion;
  labelOf: (field: FieldStatus) => string;
  onJump: (field: FieldStatus) => void;
  /** One line (skills tab): count + bar + "查看缺失". */
  compact?: boolean;
}) {
  const t = useTranslations("character");
  const { requiredTotal, requiredSet } = completion;
  const missing = missingFields(completion);

  if (requiredTotal === 0) {
    const setCount = completion.fields.filter((f) => f.state === "set").length;
    return (
      <section className="shrink-0 px-6 py-2.5 border-b border-border bg-surface-alt/60 text-xs text-text-muted">
        {t("completionSetCount", { count: setCount })}
      </section>
    );
  }

  const done = requiredSet === requiredTotal;
  const pct = Math.round((requiredSet / requiredTotal) * 100);
  const tone = done ? "text-success" : "text-warning";
  const fill = done ? "bg-success" : "bg-warning";
  const bar = (
    <div className="flex-1 h-1.5 rounded-full bg-bg overflow-hidden">
      <div className={`h-full rounded-full transition-[width] duration-300 ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );

  if (compact) {
    return (
      <section aria-label={t("completionRequired")} className="shrink-0 px-6 py-2.5 border-b border-border bg-surface-alt/60 flex items-center gap-3">
        <span className="text-[13px] font-semibold">{t("completionRequired")}</span>
        <span className={`font-theme-mono text-[15px] font-bold ${tone}`}>{requiredSet} / {requiredTotal}</span>
        {bar}
        {missing.length > 0 && (
          <button type="button" onClick={() => onJump(missing[0])} className="text-xs text-primary cursor-pointer">{t("completionViewMissing")}</button>
        )}
      </section>
    );
  }

  return (
    <section aria-label={t("completionRequired")} className="shrink-0 px-6 py-3 border-b border-border bg-surface-alt/60 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold">{t("completionRequired")}</span>
          <span className={`font-theme-mono text-[15px] font-bold ${tone}`}>{requiredSet} / {requiredTotal}</span>
          <span className="text-xs text-text-muted">
            {done ? <span className="inline-flex items-center gap-1 text-success"><Check className="w-3.5 h-3.5" />{t("completionAllSet")}</span>
              : `· ${t("completionRemaining", { count: missing.length })}`}
          </span>
        </span>
        {completion.skills.standardTotal + completion.skills.custom > 0 && (
          <span className="text-xs text-text-muted">
            {t("skillsSummary", { set: completion.skills.standardSet + completion.skills.custom, custom: completion.skills.custom })}
          </span>
        )}
      </div>
      <div className="flex">{bar}</div>
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-muted">{t("completionMissing")}</span>
          {missing.map((f) => (
            <button key={`${f.kind}:${f.key}`} type="button" onClick={() => onJump(f)}
              className="text-xs leading-[22px] px-2.5 rounded-full border border-danger/50 text-danger hover:bg-danger/10 transition cursor-pointer">
              {labelOf(f)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
