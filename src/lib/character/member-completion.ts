import { getRule } from "@/lib/rules/registry";
import { sheetCompletion, summarize, type Completion, type CompletionSummary } from "./completion";
import { emptySheet } from "./sheet-v2";
import type { CharacterData } from "./types";

/**
 * A member's completion against the room's rule. A missing sheet, or one
 * still built for another rule, counts as empty — every required field of
 * the room's rule is missing until the member sets (or rebuilds) it.
 * Standard skills match through the rule's alias candidates (侦查/侦察).
 */
export function memberCompletion(
  sheet: CharacterData | null | undefined,
  skillNames: ReadonlyArray<string>,
  roomRuleId: string,
): Completion {
  const rule = getRule(roomRuleId);
  const current = sheet && sheet.ruleTemplate === rule.id ? sheet : emptySheet(rule.id);
  return sheetCompletion(rule, current, skillNames, rule.skillAliasCandidates?.bind(rule));
}

export function memberCompletionSummary(
  sheet: CharacterData | null | undefined,
  skillNames: ReadonlyArray<string>,
  roomRuleId: string,
): CompletionSummary {
  return summarize(memberCompletion(sheet, skillNames, roomRuleId));
}
