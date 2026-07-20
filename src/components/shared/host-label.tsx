"use client";

/**
 * What the active rule template calls the people at the table.
 *
 * Each TRPG system has its own titles — COC 7th says "KP" and 调查员/
 * Investigator, DnD 5e says "DM", Triangle Agency says 经理/Manager, 狩魂者
 * calls its players 狩魂者/Soul Hunter — and every other system falls back to
 * the generic 主持人/GM and 玩家/Player. The titles live in
 * `rule.capabilities.hostLabelKey` / `.playerLabelKey` (i18n keys under
 * `messages.hostLabels` / `messages.playerLabels`), so no component ever
 * hardcodes a system-specific word.
 *
 * Two entry points per role:
 *  - `useHostLabel()` / `usePlayerLabel()` read the room's rule from context.
 *    Use them anywhere inside a room; `RuleTemplateProvider` wraps the whole
 *    room tree so deep components (chat bubbles, inventory modals) don't need
 *    prop threading.
 *  - `useHostLabelFor(ruleTemplate)` / `usePlayerLabelFor(ruleTemplate)` take
 *    the id explicitly, for surfaces outside a room that still render
 *    per-room labels (the lobby room cards).
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

/**
 * Resolver variant for the player title (lobby grids etc.) — mirrors
 * `useHostLabelResolver`, reading `capabilities.playerLabelKey`.
 */
export function usePlayerLabelResolver(): (ruleTemplate: string | null | undefined) => string {
  const t = useTranslations("playerLabels");
  return (ruleTemplate) => t(getRule(ruleTemplate).capabilities.playerLabelKey);
}

/** Player title for an explicitly supplied rule id (unknown ids fall back to the default rule). */
export function usePlayerLabelFor(ruleTemplate: string | null | undefined): string {
  return usePlayerLabelResolver()(ruleTemplate);
}

/** Player title for the surrounding room's rule template. */
export function usePlayerLabel(): string {
  return usePlayerLabelFor(useContext(RuleTemplateContext));
}
