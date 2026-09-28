"use client";

import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import type { CompletionSummary } from "@/lib/character/completion";

/**
 * A member's required-field completion as a small capsule — `3/9`, or a check
 * when everything required is set. Shown to the host in the member lists
 * (sidebar and members dialog). Renders nothing for a rule with no required
 * fields.
 */
export function CompletionMark({ completion, className = "" }: {
  completion: CompletionSummary | null | undefined;
  className?: string;
}) {
  const t = useTranslations("character");
  if (!completion || completion.requiredTotal === 0) return null;
  const complete = completion.requiredSet === completion.requiredTotal;
  const label = complete
    ? t("completionAllSet")
    : `${t("completionRequired")} ${completion.requiredSet}/${completion.requiredTotal}`;
  return (
    <span role="img" title={label} aria-label={label}
      className={`inline-flex items-center font-mono text-[9px] font-bold leading-[13px] px-1 rounded-full border shrink-0 ${complete ? "text-success border-success/45" : "text-warning border-warning/50"} ${className}`}>
      {complete ? <Icons.Check className="w-2.5 h-2.5" aria-hidden /> : `${completion.requiredSet}/${completion.requiredTotal}`}
    </span>
  );
}
