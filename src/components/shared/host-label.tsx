"use client";

/**
 * What the active rule template calls the person running the game.
 *
 * Each TRPG system has its own title — COC 7th says "KP", DnD 5e says "DM",
 * Triangle Agency says 经理/Manager — and every other system falls back to the
 * generic 主持人/GM. The title lives in `rule.capabilities.hostLabelKey`
 * (an i18n key under `messages.hostLabels`), so no component ever hardcodes
 * a system-specific word.
 *
 * Two entry points:
 *  - `useHostLabel()` reads the room's rule from context. Use it anywhere
 *    inside a room; `RuleTemplateProvider` wraps the whole room tree so deep
 *    components (chat bubbles, inventory modals) don't need prop threading.
 *  - `useHostLabelFor(ruleTemplate)` takes the id explicitly, for surfaces
 *    outside a room that still render per-room labels (the lobby room cards).
 */

import { createContext, useContext, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { getRule } from "@/lib/rules";

const RuleTemplateContext = createContext<string | null | undefined>(undefined);

export function RuleTemplateProvider({
  ruleTemplate,
  children,
}: {
  ruleTemplate: string | null | undefined;
  children: ReactNode;
}) {
  return <RuleTemplateContext.Provider value={ruleTemplate}>{children}</RuleTemplateContext.Provider>;
}

/**
 * Resolver for lists that render many rooms at once (the lobby grid), where a
 * per-room hook call isn't possible. Call the hook once, then map rule ids.
 */
export function useHostLabelResolver(): (ruleTemplate: string | null | undefined) => string {
  const t = useTranslations("hostLabels");
  return (ruleTemplate) => t(getRule(ruleTemplate).capabilities.hostLabelKey);
}

/** Host title for an explicitly supplied rule id (unknown ids fall back to the default rule). */
export function useHostLabelFor(ruleTemplate: string | null | undefined): string {
  return useHostLabelResolver()(ruleTemplate);
}

/** Host title for the surrounding room's rule template. */
export function useHostLabel(): string {
  return useHostLabelFor(useContext(RuleTemplateContext));
}
