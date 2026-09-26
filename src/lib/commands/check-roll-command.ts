import { db } from "@/db";
import { roomSkills, rooms } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { parseAndRollExpression } from "@/lib/commands/expression";
import type { CharacterData } from "@/lib/character/types";
import { getRuleForRoom, type CheckRequest, type RuleModule, type VisualGrade } from "@/lib/rules";
import type { CommandResult, CommandContext } from "./command-types";
import { attachProxy, visibilityFor, emitCommandMessage } from "./command-message";
import { getCharacterData } from "./character-stat-sync";

/** Map a rule's visual grade to the player-facing label + icon. */
function gradeDisplay(
  grade: VisualGrade,
  t: (key: string, opts?: Record<string, string | number | Date>) => string
): { successLevel: string; icon: string } {
  switch (grade) {
    case "critical": return { successLevel: t("critical"), icon: "🟢" };
    case "fumble":   return { successLevel: t("fumble"),   icon: "🔴" };
    case "success":  return { successLevel: t("success"),  icon: "✅" };
    case "failure":  return { successLevel: t("failure"),  icon: "❌" };
  }
}

/**
 * .rc / .ra: Roll Check. Parsing is delegated to the active rule module so
 * each ruleset owns its own syntax:
 *  - COC/basic: `<name>[\s*<int>]` (legacy regex; trailing int = threshold).
 *  - DnD 5e:    `<name>[<±mod-formula>][ <DC>]` (modifier may embed dice;
 *               the space before DC is required).
 */
export async function handleRollCheck(
  roomId: number,
  userId: number,
  args: string,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  ctx: CommandContext | undefined,
  rawCommand: string,
  hidden = false
): Promise<CommandResult> {
  const trimmedArgs = args.trim();
  if (!trimmedArgs) return { success: false, isCommand: true, error: t("rcUsageError") };

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, isCommand: true, error: t("roomNotFound") };
  const rule = getRuleForRoom(room);

  const parsed = rule.parseRcArgs(trimmedArgs);
  if (!parsed) {
    // Pick the rule-flavored usage error when available, else the legacy one.
    return { success: false, isCommand: true, error: t(rule.rcUsageKey ?? "rcUsageError") };
  }

  return await runRuleCheck(roomId, userId, parsed, rule, t, ctx, rawCommand, hidden);
}

/**
 * Shared tail of the check flow: evaluate the modifier formula, resolve the
 * target, and hand off to `performSkillCheck`. Reached from `.rc/.ra` (via
 * `parseRcArgs`) and from `.r/.rd` when the rule claims the args as a
 * shorthand check (via `parseQuickCheckArgs`, e.g. 狩魂者's `.r+x±y [DC]`).
 */
export async function runRuleCheck(
  roomId: number,
  userId: number,
  parsed: { skillName: string; explicitTarget?: number; modifierExpression?: string; ruleData?: Record<string, unknown> },
  rule: RuleModule,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  ctx: CommandContext | undefined,
  rawCommand: string,
  hidden = false
): Promise<CommandResult> {
  // Evaluate the modifier formula (rolling any embedded dice) if the rule
  // surfaced one. Result is passed as raw number + display string so the
  // rule's resolveCheck can splice into chat output without re-parsing;
  // the structured per-term breakdown travels alongside so rules can show
  // individual die faces.
  let modifierValue: number | undefined;
  let modifierDisplay: string | undefined;
  let modifierTerms: PerformCheckExtras["modifierTerms"];
  if (parsed.modifierExpression) {
    const evalRes = parseAndRollExpression(parsed.modifierExpression, t);
    if (!evalRes.success) {
      return { success: false, isCommand: true, error: evalRes.error };
    }
    modifierValue = evalRes.totalSum;
    // Render like "+1+1d6([3])=+4" — keep the leading sign explicit so the
    // chat bubble reads as a clear adjustment.
    const signedTotal = modifierValue >= 0 ? `+${modifierValue}` : `${modifierValue}`;
    modifierDisplay = `${parsed.modifierExpression.startsWith("-") ? "" : "+"}${evalRes.display.replace(/^\+/, "")}=${signedTotal}`;
    modifierTerms = evalRes.terms.map((term) => ({
      sign: term.sign,
      count: term.count,
      faces: term.faces,
      rolls: term.rolls,
      sum: term.sum,
      isConstant: term.type === "constant",
    }));
  }

  // Always load the sheet — rules may inspect it during resolveCheck.
  const sheet = await getCharacterData(roomId, userId);

  // Look up storedValue from room_skills / rule fallback ONLY when no explicit
  // target was supplied. (For explicit-target paths, the spec says ignore
  // stored values.)
  let stored: { name: string; value: number } | null = null;
  if (parsed.explicitTarget === undefined) {
    stored = await lookupCheckTarget(roomId, userId, parsed.skillName, rule, sheet);
    if (stored === null && rule.capabilities.requiresStoredTarget) {
      return {
        success: false,
        isCommand: true,
        error: t("rcSkillNotSet", { skillName: parsed.skillName }),
        code: "STAT_NOT_SET",
      };
    }
  }

  const displayName = stored?.name ?? rule.canonicalStatName(parsed.skillName);
  // `target` keeps its legacy "the value to display" role: explicit > stored
  // > 0 (rule may overwrite via its own default, e.g. d20 DC=10).
  const target = parsed.explicitTarget ?? stored?.value ?? 0;

  return await performSkillCheck(roomId, userId, displayName, target, rule, t, ctx, rawCommand, {
    explicitTarget: parsed.explicitTarget,
    storedValue: stored?.value,
    modifierValue,
    modifierDisplay,
    modifierTerms,
    sheet,
    ruleData: parsed.ruleData,
  }, hidden);
}

/**
 * Resolve a check target by name, honoring "skill takes priority over attribute".
 * Order: room_skills (exact name) → rule-specific fallback (e.g. COC sheet
 * attribute or resource current value). Basic rules return null on miss,
 * yielding STAT_NOT_SET upstream.
 */
async function lookupCheckTarget(
  roomId: number,
  userId: number,
  skillName: string,
  rule: RuleModule,
  sheet: CharacterData | null
): Promise<{ name: string; value: number } | null> {
  // One round-trip for the name plus every alias (COC's 侦查/侦察 — the rule
  // owns the alias table). This is the hottest command in play: the previous
  // shape was one sequential SELECT per candidate.
  const candidates = [skillName, ...(rule.skillAliasCandidates?.(skillName) ?? [])];
  const rows = await db.select().from(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      inArray(roomSkills.skillName, candidates)
    )
  );
  // Preserve the old priority: exact name first, then alias order.
  for (const name of candidates) {
    const hit = rows.find((r) => r.skillName === name);
    if (hit) return { name: hit.skillName, value: hit.skillValue };
  }

  // Skill row missing — defer to the rule's fallback strategy against the
  // sheet the caller already loaded (this used to re-fetch it).
  return rule.lookupFallback(skillName, sheet);
}

interface PerformCheckExtras {
  explicitTarget?: number;
  storedValue?: number;
  modifierValue?: number;
  modifierDisplay?: string;
  modifierTerms?: CheckRequest["modifierTerms"];
  sheet: CharacterData | null;
  ruleData?: Record<string, unknown>;
}

/**
 * Roll a skill check via the active rule module, format the result, and
 * broadcast it. The rule fully owns dice mechanics (which die, comparison
 * direction, crit/fumble grading); this function only does the i18n + chat
 * plumbing.
 */
async function performSkillCheck(
  roomId: number,
  userId: number,
  skillName: string,
  target: number,
  rule: RuleModule,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  ctx: CommandContext | undefined,
  rawCommand: string,
  extras?: PerformCheckExtras,
  hidden = false
): Promise<CommandResult> {
  const result = rule.resolveCheck({
    skillName,
    target,
    explicitTarget: extras?.explicitTarget,
    storedValue: extras?.storedValue,
    modifierValue: extras?.modifierValue,
    modifierDisplay: extras?.modifierDisplay,
    modifierTerms: extras?.modifierTerms,
    sheet: extras?.sheet ?? null,
    ruleData: extras?.ruleData,
  });
  const { successLevel, icon } = gradeDisplay(result.grade, t);

  const detail = attachProxy(
    JSON.stringify({ ...result.detail, command: rawCommand }),
    ctx?.proxiedBy
  );

  // Pick chat template per rule. d20 renders "d20+3=18 vs DC 15"; others use
  // the legacy d100 form. Rules without their own template fall back to it.
  const useD20Template = result.detail && typeof result.detail === "object"
    && (result.detail as Record<string, unknown>).dice === "d20";
  const content = useD20Template
    ? t("d20CheckMessage", {
        skillName: result.skillName,
        roll: result.total,
        target: result.target,
        modifierDisplay: extras?.modifierDisplay ? ` (${extras.modifierDisplay})` : "",
        successLevel,
        icon,
      })
    : t("checkMessage", {
        skillName: result.skillName,
        roll: result.total,
        target: result.target,
        successLevel,
        icon,
      });
  // `.rch/.rah` keep the result to the roller (same "self" semantics as `.rh`),
  // still pinned to the channel the command was issued in.
  const vis = visibilityFor(ctx, userId, hidden ? "self" : "channel");
  const msg = await emitCommandMessage(roomId, userId, content, "dice", vis, detail, undefined, {
    skillName: result.skillName,
    notation: result.notation,
    resultText: content,
    grade: result.grade,
  });
  return { success: true, isCommand: true, message: msg };
}
