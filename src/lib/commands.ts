import { db, sqlNow } from "@/db";
import { roomSkills, rooms, roomMembers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { dispatchMessage, type MessageType } from "@/lib/messaging/router";
import type { Audience } from "@/lib/messaging/audience";
import { rollDie } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import {
  resolveCocStat,
  type CocAttributeKey,
  type CocResourceKey,
} from "@/lib/coc-stats";
import { COC_DEFAULT_ATTRIBUTES, COC_MAX_SANITY, computeCocDerived, type CharacterData, type CocDerived } from "@/lib/character-types";

/** Command Execution Result */
export interface CommandResult {
  success: boolean;
  message?: unknown;
  error?: string;
  isCommand: boolean;
  /** Machine-readable failure code for callers that branch on the reason (e.g. STAT_NOT_SET). */
  code?: string;
}

/**
 * Channel context in which a command was issued.
 * Used to keep command feedback inside the channel it came from:
 * - public channel → results broadcast to everyone
 * - private channel (isPrivate + targetUserId) → results only the DM pair sees
 */
export interface CommandContext {
  isPrivate?: boolean;
  targetUserId?: number;
}

export interface TermResult {
  type: "dice" | "constant";
  sign: "+" | "-";
  count: number;
  faces: number;
  keep?: number;
  rolls: number[];
  keptRolls: number[];
  sum: number;
  display: string;
}

/** Known commands, used for "did you mean …?" suggestions on typos. */
const KNOWN_COMMANDS = ["help", "st", "rc", "ra", "rh", "rd", "r", "sc"];

/** True when the room runs the COC 7th rule template (either column may carry it). */
function isCoc7th(room: { diceRules: string | null; ruleTemplate: string | null }): boolean {
  return room.ruleTemplate === "coc7th" || room.diceRules === "coc7th";
}

/**
 * Resolve the audience of a command's feedback message.
 * - "self": only the issuing user sees it, regardless of channel (.help, .st, .rh).
 * - "channel": follows where the command was issued — public stays public (everyone),
 *   a DM keeps the result between the two participants (dm).
 */
function visibilityFor(
  ctx: CommandContext | undefined,
  userId: number,
  mode: "self" | "channel"
): { audience: Audience; targetUserId?: number; channelPartnerId?: number } {
  if (mode === "self") {
    // Self-visible, but stays in the channel it was issued in: carry the DM partner
    // as the channel (so e.g. .rh in a DM renders in that DM, not the public feed).
    return { audience: "self", channelPartnerId: ctx?.isPrivate ? ctx.targetUserId : undefined };
  }
  if (ctx?.isPrivate && ctx.targetUserId) {
    return { audience: "dm", targetUserId: ctx.targetUserId };
  }
  return { audience: "everyone" };
}

/**
 * Emit a command-feedback message through the central router, carrying the
 * issuer's nickname (dice/check results read as "<player> 🎲 …").
 */
async function emitCommandMessage(
  roomId: number,
  userId: number,
  content: string,
  type: MessageType,
  vis: { audience: Audience; targetUserId?: number; channelPartnerId?: number },
  diceDetail?: string
) {
  const [m] = await db
    .select({ nickname: roomMembers.nickname })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  return dispatchMessage({
    roomId,
    actorUserId: userId,
    nickname: m?.nickname || "SYSTEM",
    type,
    audience: vis.audience,
    targetUserId: vis.targetUserId,
    channelPartnerId: vis.channelPartnerId,
    content,
    diceDetail,
  });
}

/** Minimal edit distance for typo suggestions. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Build the "unknown command" error, appending a guess when the typo is close. */
function unknownCommandError(rawInput: string, t: (key: string, opts?: Record<string, string | number | Date>) => string): string {
  const token = (rawInput.match(/^[a-zA-Z]+/)?.[0] || "").toLowerCase();
  if (token) {
    let best = "";
    let bestDist = Infinity;
    for (const cmd of KNOWN_COMMANDS) {
      const d = levenshtein(token, cmd);
      if (d < bestDist) { bestDist = d; best = cmd; }
    }
    if (best && bestDist > 0 && bestDist <= 2) {
      return t("unknownCommandGuess", { guess: `.${best}` });
    }
  }
  return t("unknownCommand");
}

/**
 * Command Engine
 * Handles .st, .rc, .ra, .rd, .r, .rh, .sc, .help
 */
export async function executeCommand(
  roomId: number,
  userId: number,
  content: string,
  ctx?: CommandContext
): Promise<CommandResult> {
  const trimmed = content.trim();
  if (!trimmed.startsWith(".") && !trimmed.startsWith("。")) {
    return { success: true, isCommand: false };
  }

  const t = await getTranslations("commands");

  const body = trimmed.slice(1);
  // Regex matches: command prefix + optional spaces + arguments.
  // NOTE: order matters — alternation is left-to-right. Multi-letter variants
  // (`ra`, `rh`, `rd`) must precede the bare `r` so `.ra侦查` / `.rh100` aren't
  // swallowed by the `.r` dice command.
  const match = body.match(/^(help|st|rc|sc|rd|ra|rh|r)\s*(.*)$/i);
  if (!match) {
    return { success: false, isCommand: true, error: unknownCommandError(body, t) };
  }

  const cmd = match[1].toLowerCase();
  const args = match[2] || "";

  // --- .rd / .r / .rh (Dice roll expressions) ---
  if (cmd === "rd" || cmd === "r" || cmd === "rh") {
    return await handleDiceRoll(roomId, userId, args, t, ctx, cmd === "rh", trimmed);
  }

  // --- .st (Set Skill / Attribute / Resource) ---
  if (cmd === "st") {
    return await handleSetSkill(roomId, userId, args, t, ctx);
  }

  // --- .rc / .ra (Roll Check — identical variants per spec) ---
  if (cmd === "rc" || cmd === "ra") {
    return await handleRollCheck(roomId, userId, args, t, ctx, trimmed);
  }

  // --- .sc (Sanity Check) ---
  if (cmd === "sc") {
    return await handleSanityCheck(roomId, userId, args, t, ctx, trimmed);
  }

  // --- .help ---
  if (cmd === "help") {
    const helpText = t("helpText");
    const vis = visibilityFor(ctx, userId, "self");
    const msg = await emitCommandMessage(roomId, userId, helpText, "system", vis);
    return { success: true, isCommand: true, message: msg };
  }

  return { success: false, isCommand: true, error: t("unknownCommand") };
}

/** .rd / .r / .rh — roll a dice expression. `.rh` is hidden (only the roller sees it). */
async function handleDiceRoll(
  roomId: number,
  userId: number,
  rawArgs: string,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  ctx: CommandContext | undefined,
  hidden: boolean,
  rawCommand: string
): Promise<CommandResult> {
  let args = rawArgs;
  if (!args.trim()) {
    args = "1d100";
  } else if (/^\d+(?![dD])/.test(args.trim())) {
    args = "1d" + args.trim();
  }

  const rollResult = parseAndRollExpression(args, t);
  if (!rollResult.success) {
    return { success: false, isCommand: true, error: rollResult.error };
  }

  const { content: rollMsgContent, diceDetail } = formatDiceRollMessage(
    rollResult.notation,
    rollResult.terms,
    rollResult.totalSum,
    t,
    rawCommand
  );

  const vis = hidden
    ? visibilityFor(ctx, userId, "self")
    : visibilityFor(ctx, userId, "channel");

  const msg = await emitCommandMessage(roomId, userId, rollMsgContent, "dice", vis, diceDetail);
  return { success: true, isCommand: true, message: msg };
}

/**
 * Sync a COC 7th attribute or resource into room_members.character_data.
 * - attribute: set cocAttributes[key] and recompute derived (preserving current
 *   resource adjustments, re-clamped to new maxes).
 * - resource: set the *current* value (both the base field read by exports and the
 *   `${key}_current` field read by the character panel), capped at its max.
 * Returns the value actually stored (resources are clamped). No-op (returns the
 * input) when the member has no coc7th character sheet.
 */
export async function syncCharacterStat(
  roomId: number,
  userId: number,
  resolution: { kind: "attribute"; key: CocAttributeKey } | { kind: "resource"; key: CocResourceKey },
  value: number
): Promise<number> {
  const [member] = await db
    .select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  if (!member?.characterData) return value;

  let data: CharacterData;
  try {
    data = JSON.parse(member.characterData) as CharacterData;
  } catch (e) {
    console.error("Failed to parse character data", e);
    return value;
  }
  if (!data || data.ruleTemplate !== "coc7th") return value;

  let finalValue = value;

  if (resolution.kind === "attribute") {
    if (!data.cocAttributes) data.cocAttributes = { ...COC_DEFAULT_ATTRIBUTES };
    data.cocAttributes[resolution.key] = value;

    const prev: Partial<CocDerived> = data.cocDerived || {};
    const recomputed = computeCocDerived(data.cocAttributes!);
    // Preserve player-set current values across a single-attribute change.
    const clampOpt = (v: unknown, max: number) =>
      typeof v === "number" ? Math.min(Math.max(0, v), max) : undefined;
    const hpCur = clampOpt(prev.hp_current, recomputed.hpMax);
    const sanCur = clampOpt(prev.san_current ?? prev.san, recomputed.sanMax);
    const mpCur = clampOpt(prev.mp_current, recomputed.mpMax);
    if (hpCur !== undefined) recomputed.hp_current = hpCur;
    if (sanCur !== undefined) { recomputed.san_current = sanCur; recomputed.san = sanCur; }
    if (mpCur !== undefined) recomputed.mp_current = mpCur;
    data.cocDerived = recomputed;
  } else {
    if (!data.cocDerived) {
      data.cocDerived = computeCocDerived(data.cocAttributes || COC_DEFAULT_ATTRIBUTES);
    }
    const d = data.cocDerived as CocDerived & Record<string, number | undefined>;
    const maxKey = `${resolution.key}Max`;
    let max: number;
    if (resolution.key === "san") {
      // COC 7th: Sanity is always capped at 99, never by POW. Also correct any
      // stale stored sanMax (older characters had it derived from POW).
      max = COC_MAX_SANITY;
      d[maxKey] = max;
    } else if (typeof d[maxKey] === "number") {
      max = d[maxKey];
    } else {
      max = value; // no cap info available — accept as-is
      d[maxKey] = max;
    }
    finalValue = Math.min(Math.max(0, value), max);
    d[resolution.key] = finalValue;            // base field (read by export.ts)
    d[`${resolution.key}_current`] = finalValue; // current field (read by CharacterPanel)
  }

  await db
    .update(roomMembers)
    .set({ characterData: JSON.stringify(data) })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  return finalValue;
}

/**
 * Backward-compatible wrapper kept for skills.ts (manual skill form).
 * Syncs the sanity resource and returns the capped value.
 */
export async function syncCharacterSanity(roomId: number, userId: number, newSan: number): Promise<number> {
  return syncCharacterStat(roomId, userId, { kind: "resource", key: "san" }, newSan);
}

/** Read a member's parsed character_data (or null). */
async function getCharacterData(roomId: number, userId: number): Promise<CharacterData | null> {
  const [member] = await db
    .select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  if (!member?.characterData) return null;
  try {
    return JSON.parse(member.characterData);
  } catch {
    return null;
  }
}

/** .st: Set/Update Skills, Attributes, and Resources */
async function handleSetSkill(
  roomId: number,
  userId: number,
  args: string,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  ctx?: CommandContext
): Promise<CommandResult> {
  // Regex to match "SkillName Value" or "SkillNameValue" (compact)
  const regex = /([^0-9\s\.]+)\s*([0-9]+)/g;
  const parsed: { name: string; value: number }[] = [];
  let match;

  while ((match = regex.exec(args)) !== null) {
    let name = match[1].trim();
    const value = parseInt(match[2]);

    if (name.length > 50) name = name.slice(0, 50);
    if (value < 0 || value > 999) continue;

    parsed.push({ name, value });
  }

  if (parsed.length === 0) {
    return { success: false, isCommand: true, error: t("stUsageError") };
  }

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, isCommand: true, error: t("roomNotFound") };
  const coc7th = isCoc7th(room);

  const summaryParts: string[] = [];

  for (const item of parsed) {
    const resolved = resolveCocStat(item.name);

    if (coc7th && resolved.kind === "attribute") {
      // Spec: COC attributes are set on the character sheet, not as skills.
      await syncCharacterStat(roomId, userId, { kind: "attribute", key: resolved.key }, item.value);
      await cleanupSkillRows(roomId, userId, item.name, resolved.canonical);
      summaryParts.push(`${resolved.canonical} ${item.value}`);
      continue;
    }

    if (coc7th && resolved.kind === "resource") {
      // Spec: resources set the current value only (max is unaffected).
      const stored = await syncCharacterStat(roomId, userId, { kind: "resource", key: resolved.key }, item.value);
      await cleanupSkillRows(roomId, userId, item.name, resolved.canonical);
      summaryParts.push(`${resolved.canonical} ${stored}`);
      continue;
    }

    // Plain skill (or non-COC room). Normalize known stat aliases to a canonical
    // display name (e.g. san → 理智值) so the skill list stays tidy.
    const name = resolved.kind === "skill" ? item.name : resolved.canonical;
    await db.insert(roomSkills).values({
      roomId,
      userId,
      skillName: name,
      skillValue: item.value,
    }).onConflictDoUpdate({
      target: [roomSkills.roomId, roomSkills.userId, roomSkills.skillName],
      set: { skillValue: item.value, updatedAt: sqlNow() },
    });
    summaryParts.push(`${name} ${item.value}`);
  }

  const summary = summaryParts.join(", ");
  const vis = visibilityFor(ctx, userId, "self");
  const msg = await emitCommandMessage(roomId, userId, t("stSuccess", { summary }), "system", vis);

  return { success: true, isCommand: true, message: msg };
}

/** Remove any legacy room_skills rows for a name now routed to an attribute/resource. */
async function cleanupSkillRows(roomId: number, userId: number, rawName: string, canonical: string) {
  const names = Array.from(new Set([rawName, canonical]));
  await db.delete(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      inArray(roomSkills.skillName, names)
    )
  );
}

/**
 * .rc / .ra: Roll Check (d100 vs target). Identical variants per spec.
 * - `.rc 侦查90` → one-off check against 90, ignoring stored values (not persisted).
 * - `.rc 侦查`  → check against the stored skill; falls back to a COC attribute/resource.
 */
async function handleRollCheck(
  roomId: number,
  userId: number,
  args: string,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  ctx: CommandContext | undefined,
  rawCommand: string
): Promise<CommandResult> {
  const trimmedArgs = args.trim();
  if (!trimmedArgs) return { success: false, isCommand: true, error: t("rcUsageError") };

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, isCommand: true, error: t("roomNotFound") };
  const coc7th = isCoc7th(room);

  // Optional trailing value: "侦查90" / "侦查 90" → name="侦查", value=90
  const m = trimmedArgs.match(/^(.+?)\s*([0-9]+)$/);

  if (m) {
    let skillName = m[1].trim();
    const value = parseInt(m[2], 10);
    if (skillName.length > 50) skillName = skillName.slice(0, 50);
    if (value < 0 || value > 999) {
      return { success: false, isCommand: true, error: t("rcUsageError") };
    }
    // One-off check at the supplied value (spec: ignore stored values, do not persist).
    const displayName = displayStatName(skillName);
    return await performSkillCheck(roomId, userId, displayName, value, coc7th, t, ctx, rawCommand);
  }

  // No value → look up the stored target.
  const skillName = trimmedArgs;
  const target = await lookupCheckTarget(roomId, userId, skillName, coc7th);
  if (target === null) {
    return { success: false, isCommand: true, error: t("rcSkillNotSet", { skillName }), code: "STAT_NOT_SET" };
  }

  return await performSkillCheck(roomId, userId, target.name, target.value, coc7th, t, ctx, rawCommand);
}

/** Canonicalize a stat name for display (san → 理智值, str → 力量, …). */
function displayStatName(name: string): string {
  const resolved = resolveCocStat(name);
  return resolved.kind === "skill" ? name : resolved.canonical;
}

/**
 * Resolve a check target by name, honoring "skill takes priority over attribute".
 * Order: room_skills (exact name) → COC attribute → COC resource (current value).
 */
async function lookupCheckTarget(
  roomId: number,
  userId: number,
  skillName: string,
  coc7th: boolean
): Promise<{ name: string; value: number } | null> {
  const [skill] = await db.select().from(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      eq(roomSkills.skillName, skillName)
    )
  );
  if (skill) return { name: skillName, value: skill.skillValue };

  if (!coc7th) return null;

  const resolved = resolveCocStat(skillName);
  if (resolved.kind === "skill") return null;

  const data = await getCharacterData(roomId, userId);
  if (!data) return null;

  if (resolved.kind === "attribute") {
    const v = data.cocAttributes?.[resolved.key];
    if (typeof v === "number") return { name: resolved.canonical, value: v };
    return null;
  }

  // resource → current value
  const d = data.cocDerived;
  const cur = d?.[`${resolved.key}_current`] ?? d?.[resolved.key];
  if (typeof cur === "number") return { name: resolved.canonical, value: cur };
  return null;
}

/** Roll a d100 skill check against a target value, format the result, and broadcast it. */
async function performSkillCheck(
  roomId: number,
  userId: number,
  skillName: string,
  target: number,
  coc7th: boolean,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  ctx: CommandContext | undefined,
  rawCommand: string
): Promise<CommandResult> {
  const roll = rollDie(100);

  let successLevel = roll <= target ? t("success") : t("failure");
  let icon = roll <= target ? "✅" : "❌";
  let grade: "success" | "failure" | "critical" | "fumble" = roll <= target ? "success" : "failure";

  // Apply COC 7th crit/fumble rules if enabled
  if (coc7th) {
    if (roll <= 5) { successLevel = t("critical"); icon = "🟢"; grade = "critical"; }
    else if (roll >= 96) { successLevel = t("fumble"); icon = "🔴"; grade = "fumble"; }
  }

  const detail = JSON.stringify({
    dice: "d100",
    count: 1,
    results: [roll],
    sum: roll,
    notation: "1d100",
    command: rawCommand,
    check: { skillName, target, roll, success: roll <= target, grade }
  });

  const content = t("checkMessage", { skillName, roll, target, successLevel, icon });
  const vis = visibilityFor(ctx, userId, "channel");
  const msg = await emitCommandMessage(roomId, userId, content, "dice", vis, detail);
  return { success: true, isCommand: true, message: msg };
}

/** .sc: Sanity Check */
async function handleSanityCheck(
  roomId: number,
  userIdArg: number,
  args: string,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  ctx: CommandContext | undefined,
  rawCommand: string
): Promise<CommandResult> {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, isCommand: true, error: t("roomNotFound") };
  if (!isCoc7th(room)) {
    return { success: false, isCommand: true, error: t("scNotCoc7th") };
  }

  // Parse arguments: success_deduction/failure_deduction
  const scMatch = args.trim().match(/^([0-9a-zA-Z+\-d\s]+)\s*\/\s*([0-9a-zA-Z+\-d\s]+)$/i);
  if (!scMatch) {
    return { success: false, isCommand: true, error: t("scUsageError") };
  }

  const successExpr = scMatch[1].trim();
  const failureExpr = scMatch[2].trim();

  // Current sanity: character sheet (current) → legacy room_skills(理智值).
  const currentSan = await readCurrentSanity(roomId, userIdArg);
  if (currentSan === null) {
    return { success: false, isCommand: true, error: t("scNoSanity"), code: "STAT_NOT_SET" };
  }

  const roll = rollDie(100);
  const isSuccess = roll <= currentSan;
  const resultLabel = isSuccess ? t("success") : t("failure");

  const deductExpr = isSuccess ? successExpr : failureExpr;
  const rollResult = parseAndRollExpression(deductExpr, t);
  if (!rollResult.success) {
    return { success: false, isCommand: true, error: rollResult.error };
  }

  const deductVal = rollResult.totalSum;
  const clampedDeduct = Math.max(0, deductVal);

  // Write the new sanity to the character sheet (current value) and keep any
  // legacy room_skills(理智值) row in sync for backward compatibility.
  const finalNewSan = await syncCharacterStat(roomId, userIdArg, { kind: "resource", key: "san" }, currentSan - clampedDeduct);
  await syncLegacySanitySkill(roomId, userIdArg, finalNewSan);

  let warning = "";
  if (deductVal >= 5) {
    warning = t("scWarningInsanity");
  }

  const content = t("scCheckMessage", {
    roll,
    target: currentSan,
    result: resultLabel,
    deductExpr: rollResult.display,
    deductVal,
    oldSan: currentSan,
    newSan: finalNewSan,
  }) + warning;

  const detail = JSON.stringify({
    dice: "d100",
    count: 1,
    results: [roll],
    sum: roll,
    notation: "1d100",
    command: rawCommand,
    check: {
      skillName: "理智值",
      target: currentSan,
      roll,
      success: isSuccess,
      grade: isSuccess ? "success" : "failure",
    },
    sanityCheck: {
      successExpression: successExpr,
      failureExpression: failureExpr,
      deductExpression: rollResult.display,
      deduction: deductVal,
      oldSanity: currentSan,
      newSanity: finalNewSan,
      isSuccess,
    }
  });

  const vis = visibilityFor(ctx, userIdArg, "channel");
  const msg = await emitCommandMessage(roomId, userIdArg, content, "dice", vis, detail);
  return { success: true, isCommand: true, message: msg };
}

/** Read the current sanity value: character sheet current → base → legacy room_skills. */
async function readCurrentSanity(roomId: number, userId: number): Promise<number | null> {
  const data = await getCharacterData(roomId, userId);
  if (data?.ruleTemplate === "coc7th") {
    const d = data.cocDerived;
    const cur = d?.san_current ?? d?.san;
    if (typeof cur === "number") return cur;
  }
  const [sanSkill] = await db.select().from(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      eq(roomSkills.skillName, "理智值")
    )
  );
  return sanSkill ? sanSkill.skillValue : null;
}

/** Keep a legacy room_skills(理智值) row in sync, only if one already exists. */
async function syncLegacySanitySkill(roomId: number, userId: number, value: number) {
  const [existing] = await db.select({ id: roomSkills.id }).from(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      eq(roomSkills.skillName, "理智值")
    )
  );
  if (!existing) return;
  await db.update(roomSkills)
    .set({ skillValue: value, updatedAt: sqlNow() })
    .where(eq(roomSkills.id, existing.id));
}

/** Parse and roll complex dice expressions (e.g. 3d100k2 + 2d20 - 1d6 + 5) */
export function parseAndRollExpression(expr: string, t?: (key: string, opts?: Record<string, string | number | Date>) => string): {
  success: boolean;
  error?: string;
  terms: TermResult[];
  totalSum: number;
  display: string;
  notation: string;
} {
  const trimmed = expr.replace(/\s+/g, "");
  // Validate characters: only allow digits, d, k, +, -
  if (/[^0-9dkDK+-]/.test(trimmed)) {
    return {
      success: false,
      error: t ? t("invalidDiceExpression") : "Invalid dice expression",
      terms: [],
      totalSum: 0,
      display: "",
      notation: ""
    };
  }

  // Regex to find terms
  const termRegex = /([+-]?)(?:([0-9]*)d([0-9]+)(?:k([0-9]+))?|([0-9]+))/gi;
  const terms: TermResult[] = [];
  let totalSum = 0;

  let match;
  let lastIndex = 0;

  while ((match = termRegex.exec(trimmed)) !== null) {
    if (match.index !== lastIndex) {
      return {
        success: false,
        error: t ? t("invalidDiceExpression") : "Invalid dice expression",
        terms: [],
        totalSum: 0,
        display: "",
        notation: ""
      };
    }
    lastIndex = termRegex.lastIndex;

    const signStr = match[1];
    const sign: "+" | "-" = signStr === "-" ? "-" : "+";

    if (match[5] !== undefined) {
      // Constant term
      const val = parseInt(match[5]);
      terms.push({
        type: "constant",
        sign,
        count: 0,
        faces: 0,
        rolls: [],
        keptRolls: [],
        sum: val,
        display: val.toString()
      });
      totalSum = sign === "+" ? totalSum + val : totalSum - val;
    } else {
      // Dice term
      const countStr = match[2];
      const count = countStr ? parseInt(countStr) : 1;
      const faces = parseInt(match[3]);
      const keepStr = match[4];
      const keep = keepStr ? parseInt(keepStr) : undefined;

      if (count <= 0 || count > 100) {
        return {
          success: false,
          error: t ? t("diceCountRangeError") : "Dice count must be between 1 and 100",
          terms: [],
          totalSum: 0,
          display: "",
          notation: ""
        };
      }
      if (faces <= 0 || faces > 1000) {
        return {
          success: false,
          error: t ? t("diceFacesRangeError") : "Dice faces must be between 1 and 1000",
          terms: [],
          totalSum: 0,
          display: "",
          notation: ""
        };
      }
      if (keep !== undefined && (keep <= 0 || keep > count)) {
        return {
          success: false,
          error: t ? t("diceKeepRangeError") : "Keep count must be between 1 and total dice count",
          terms: [],
          totalSum: 0,
          display: "",
          notation: ""
        };
      }

      // Roll the dice
      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        rolls.push(rollDie(faces));
      }

      let keptRolls = [...rolls];
      if (keep !== undefined) {
        // Sort descending and keep the highest `keep` rolls
        keptRolls.sort((a, b) => b - a);
        keptRolls = keptRolls.slice(0, keep);
      }

      const sum = keptRolls.reduce((a, b) => a + b, 0);
      totalSum = sign === "+" ? totalSum + sum : totalSum - sum;

      const keptLabel = t ? t("keptLabel") || "kept" : "kept";
      let termDisplay = "";
      if (keep !== undefined) {
        termDisplay = `${count}d${faces}k${keep}([${rolls.join(", ")}], ${keptLabel}[${keptRolls.join(", ")}])`;
      } else {
        termDisplay = `${count}d${faces}([${rolls.join(", ")}])`;
      }

      terms.push({
        type: "dice",
        sign,
        count,
        faces,
        keep,
        rolls,
        keptRolls,
        sum,
        display: termDisplay
      });
    }
  }

  if (lastIndex !== trimmed.length || terms.length === 0) {
    return {
      success: false,
      error: t ? t("invalidDiceExpression") : "Invalid dice expression",
      terms: [],
      totalSum: 0,
      display: "",
      notation: ""
    };
  }

  let notation = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const sign = term.sign;
    const termNotation = term.type === "constant"
      ? term.sum.toString()
      : `${term.count}d${term.faces}${term.keep !== undefined ? `k${term.keep}` : ""}`;

    if (i === 0) {
      notation += sign === "-" ? `-${termNotation}` : termNotation;
    } else {
      notation += ` ${sign} ${termNotation}`;
    }
  }

  let display = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    if (i === 0) {
      display += term.sign === "-" ? `-${term.display}` : term.display;
    } else {
      display += ` ${term.sign} ${term.display}`;
    }
  }

  return {
    success: true,
    terms,
    totalSum,
    display,
    notation
  };
}

/** Format complex dice roll details for the message output */
function formatDiceRollMessage(
  notation: string,
  terms: TermResult[],
  totalSum: number,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  rawCommand?: string
): { content: string; diceDetail: string } {
  // If there's only one term and it's a dice term
  if (terms.length === 1 && terms[0].type === "dice") {
    const term = terms[0];
    const keptLabel = t("keptLabel") || "保留";
    let content = "";
    if (term.keep !== undefined) {
      content = `🎲 ${term.count}d${term.faces}k${term.keep}: [${term.rolls.join(", ")}](${keptLabel}[${term.keptRolls.join(", ")}]) = ${totalSum}`;
    } else {
      content = `🎲 ${term.count}d${term.faces}: [${term.rolls.join(", ")}] = ${totalSum}`;
    }

    const detail = JSON.stringify({
      notation: term.keep !== undefined ? `${term.count}d${term.faces}k${term.keep}` : `${term.count}d${term.faces}`,
      sum: totalSum,
      results: term.rolls,
      keptRolls: term.keptRolls,
      command: rawCommand,
    });

    return { content, diceDetail: detail };
  }

  // For compound or constant terms
  let notationStr = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const sign = term.sign;
    const termNotation = term.type === "constant"
      ? term.sum.toString()
      : `${term.count}d${term.faces}${term.keep !== undefined ? `k${term.keep}` : ""}`;

    if (i === 0) {
      notationStr += sign === "-" ? `-${termNotation}` : termNotation;
    } else {
      notationStr += ` ${sign} ${termNotation}`;
    }
  }

  let displayStr = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    let termDisplay = "";
    if (term.type === "constant") {
      termDisplay = term.sum.toString();
    } else {
      const keptLabel = t("keptLabel") || "保留";
      if (term.keep !== undefined) {
        termDisplay = `${term.count}d${term.faces}k${term.keep}([${term.rolls.join(", ")}]${keptLabel}[${term.keptRolls.join(", ")}])`;
      } else {
        termDisplay = `${term.count}d${term.faces}([${term.rolls.join(", ")}])`;
      }
    }

    if (i === 0) {
      displayStr += term.sign === "-" ? `-${termDisplay}` : termDisplay;
    } else {
      displayStr += ` ${term.sign} ${termDisplay}`;
    }
  }

  const content = `🎲 ${notationStr}: ${displayStr} = ${totalSum}`;

  const detail = JSON.stringify({
    notation: displayStr,
    sum: totalSum,
    results: [],
    command: rawCommand,
  });

  return { content, diceDetail: detail };
}
