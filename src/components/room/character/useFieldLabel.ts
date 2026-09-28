"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { SheetRule } from "@/lib/rules/sheet-schema";
import type { FieldStatus } from "@/lib/character/completion";

/**
 * A sheet field's display name under `rule`: attributes and resources by
 * their schema label, skills and custom attributes by their own name (as is
 * a key the rule no longer declares). For completion chips, the overview's
 * "缺：…" and the top bar's missing-field tooltip.
 */
export function useFieldLabel(rule: SheetRule): (kind: FieldStatus["kind"], key: string) => string {
  const t = useTranslations("character");
  return useCallback((kind, key) => {
    const field = kind === "attribute" ? rule.sheet.attributes.find((f) => f.key === key)
      : kind === "resource" ? rule.sheet.resources.find((f) => f.key === key) : undefined;
    return field ? t(field.labelKey) : key;
  }, [rule, t]);
}
