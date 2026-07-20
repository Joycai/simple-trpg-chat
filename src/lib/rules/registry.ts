/**
 * Rule-module registry.
 *
 * Single source of truth for which rulesets exist. Call sites look up a
 * module by id via `getRule(...)`; UI dropdowns and DB validation enumerate
 * via `listRules()`. Adding a new ruleset (e.g. DnD 5e) is a one-line
 * change here plus the module file — no other code needs to know.
 *
 * `getRule` is forgiving: unknown ids, `null`, and `undefined` all resolve
 * to `basic`, which keeps legacy rooms and stale character JSON working
 * after schema-level changes land.
 */

import { basicRule } from "./basic";
import { coc7thRule } from "./coc7th";
import { dnd5eRule } from "./dnd5e";
import { triangleRule } from "./triangle";
import type { RuleModule } from "./types";

const REGISTRY = new Map<string, RuleModule>();

function register(rule: RuleModule): void {
  if (REGISTRY.has(rule.id)) {
    throw new Error(`Duplicate rule id: ${rule.id}`);
  }
  REGISTRY.set(rule.id, rule);
}

// --- Built-in registrations -------------------------------------------------
// NOTE: When adding a rule here, also append its id to `RULE_TEMPLATES`
// in `src/db/schema.ts` so the server-side room-settings validator
// accepts it.
register(basicRule);
register(coc7thRule);
register(dnd5eRule);
register(triangleRule);

export const DEFAULT_RULE_ID = "basic";

/**
 * Resolve a rule by id. `null` / `undefined` / unknown ids all fall back
 * to the default rule rather than throwing — call sites are read paths
 * (chat commands, character UI, exports) where degrading gracefully is
 * safer than crashing on legacy data.
 */
export function getRule(id: string | null | undefined): RuleModule {
  if (id == null) return REGISTRY.get(DEFAULT_RULE_ID)!;
  return REGISTRY.get(id) ?? REGISTRY.get(DEFAULT_RULE_ID)!;
}

/** All registered rules, in registration order. Drives UI dropdowns. */
export function listRules(): ReadonlyArray<RuleModule> {
  return [...REGISTRY.values()];
}

/** All registered rule ids. Used to seed DB-level `RULE_TEMPLATES` validation. */
export function listRuleIds(): ReadonlyArray<string> {
  return [...REGISTRY.keys()];
}

/** Resolve a rule from a room row by its `ruleTemplate` column. */
export function getRuleForRoom(room: { ruleTemplate?: string | null }): RuleModule {
  return getRule(room.ruleTemplate);
}
