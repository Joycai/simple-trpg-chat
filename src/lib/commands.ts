import { db, sqlNow } from "@/db";
import { roomSkills, rooms, roomMembers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { dispatchMessage, type MessageType } from "@/lib/messaging/router";
import type { Audience } from "@/lib/messaging/audience";
import type { SystemKind } from "@/db/schema";
import { rollDie } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import type { CharacterData } from "@/lib/character-types";
import { getRuleForRoom, type RuleModule, type VisualGrade } from "@/lib/rules";

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
  /**
   * Host-side proxy roll: the command runs as `userId` (the absent player), but
   * `proxiedBy` carries the host so the resulting dice bubble can render a
   * "代投 by <host>" chip and stay transparent about who actually clicked.
   */
  proxiedBy?: { userId: number; nickname: string };
}

/** Tag a diceDetail JSON string with proxy attribution. No-op when not proxied. */
function attachProxy(detailJson: string, proxiedBy?: { userId: number; nickname: string }): string {
  if (!proxiedBy) return detailJson;
  try {
    const obj = JSON.parse(detailJson) as Record<string, unknown>;
    obj.proxiedByUserId = proxiedBy.userId;
    obj.proxiedByNickname = proxiedBy.nickname;
    return JSON.stringify(obj);
  } catch {
    return detailJson;
  }
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
  diceDetail?: string,
  systemKind?: SystemKind | null
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
    systemKind,
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
    // Content is a flat fallback; the client renders the structured table from
    // `commands.helpTitle` + `commands.helpEntries` i18n keys when system_kind === 'help'.
    const helpText = t("helpTitle");
    const vis = visibilityFor(ctx, userId, "self");
    const msg = await emitCommandMessage(roomId, userId, helpText, "system", vis, undefined, "help");
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
    // No args → use the rule's default die (COC/basic = 1d100, dnd5e = 1d20).
    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    args = getRuleForRoom(room || {}).capabilities.defaultRollExpression;
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

  const taggedDetail = attachProxy(diceDetail, ctx?.proxiedBy);
  const msg = await emitCommandMessage(roomId, userId, rollMsgContent, "dice", vis, taggedDetail);
  return { success: true, isCommand: true, message: msg };
}

/**
 * Persist a `.st` attribute or resource write into room_members.character_data
 * by delegating to the active rule module's `applyStatWrite`. The engine no
 * longer knows about COC/d20-specific sheet shapes — each rule handles its
 * own clamping, derivation, and field layout.
 *
 * Returns the value actually stored (rules may clamp resources). When the
 * member has no parsed sheet, returns the input value unchanged.
 */
export async function syncCharacterStat(
  roomId: number,
  userId: number,
  resolution: { kind: "attribute"; key: string } | { kind: "resource"; key: string },
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
  if (!data) return value;

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return value;
  const rule = getRuleForRoom(room);

  const route =
    resolution.kind === "attribute"
      ? ({ kind: "attribute", key: resolution.key, canonical: resolution.key } as const)
      : ({ kind: "resource", key: resolution.key, canonical: resolution.key } as const);

  const { sheet, finalValue } = rule.applyStatWrite(data, route, value);

  await db
    .update(roomMembers)
    .set({ characterData: JSON.stringify(sheet) })
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
  const rule = getRuleForRoom(room);

  // Route every parsed item once so we can decide whether the sheet needs to
  // be loaded at all, and whether more than one item targets it (e.g.
  // `.st STR 80 DEX 70 HP 12` — three sheet writes that used to each do
  // SELECT room + SELECT roomMembers + UPDATE roomMembers).
  const routes = parsed.map(item => ({ item, route: rule.routeStat(item.name) }));
  const needsSheet = routes.some(r => r.route.kind === "attribute" || r.route.kind === "resource");

  // Load the bot/player's sheet once; rule.applyStatWrite mutates it purely
  // in memory below and we persist a single time at the end.
  let sheet: CharacterData | null = null;
  if (needsSheet) {
    const [member] = await db
      .select({ characterData: roomMembers.characterData })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
    if (member?.characterData) {
      try {
        sheet = JSON.parse(member.characterData) as CharacterData;
      } catch (e) {
        console.error("Failed to parse character data", e);
        sheet = null;
      }
    }
  }

  const summaryParts: string[] = [];
  let sheetDirty = false;

  for (const { item, route } of routes) {
    if (route.kind === "attribute") {
      if (sheet) {
        const { sheet: next } = rule.applyStatWrite(sheet, route, item.value);
        sheet = next;
        sheetDirty = true;
      }
      await cleanupSkillRows(roomId, userId, item.name, route.canonical);
      summaryParts.push(`${route.canonical} ${item.value}`);
      continue;
    }

    if (route.kind === "resource") {
      // Spec: resources set the current value only (max is unaffected). The
      // rule may clamp (e.g. d20 HP to hpMax); we use the clamped value in
      // the user-facing summary.
      let displayValue = item.value;
      if (sheet) {
        const { sheet: next, finalValue } = rule.applyStatWrite(sheet, route, item.value);
        sheet = next;
        displayValue = finalValue;
        sheetDirty = true;
      }
      await cleanupSkillRows(roomId, userId, item.name, route.canonical);
      summaryParts.push(`${route.canonical} ${displayValue}`);
      continue;
    }

    // route.kind === "skill" — generic room_skills write. `canonical` may
    // still be a normalized form (e.g. COC's `san → 理智值`) when the rule
    // recognizes the alias but chose to treat it as a skill.
    const name = route.canonical || item.name;
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

  // Single write for any sheet mutations in this batch.
  if (sheetDirty && sheet) {
    await db.update(roomMembers)
      .set({ characterData: JSON.stringify(sheet) })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  }

  const summary = summaryParts.join(" · ");
  const vis = visibilityFor(ctx, userId, "self");
  const msg = await emitCommandMessage(roomId, userId, t("stSuccess", { summary }), "system", vis, undefined, "st");

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
 * .rc / .ra: Roll Check. Parsing is delegated to the active rule module so
 * each ruleset owns its own syntax:
 *  - COC/basic: `<name>[\s*<int>]` (legacy regex; trailing int = threshold).
 *  - DnD 5e:    `<name>[<±mod-formula>][ <DC>]` (modifier may embed dice;
 *               the space before DC is required).
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
  const rule = getRuleForRoom(room);

  const parsed = rule.parseRcArgs(trimmedArgs);
  if (!parsed) {
    // Pick the rule-flavored usage error when available, else the legacy one.
    const usageKey = rule.id === "dnd5e" ? "d20RcUsage" : "rcUsageError";
    return { success: false, isCommand: true, error: t(usageKey) };
  }

  // Evaluate the modifier formula (rolling any embedded dice) if the rule
  // surfaced one. Result is passed as raw number + display string so the
  // rule's resolveCheck can splice into chat output without re-parsing.
  let modifierValue: number | undefined;
  let modifierDisplay: string | undefined;
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
  }

  // Always load the sheet — rules may inspect it during resolveCheck.
  const sheet = await getCharacterData(roomId, userId);

  // Look up storedValue from room_skills / rule fallback ONLY when no explicit
  // target was supplied. (For explicit-target paths, the spec says ignore
  // stored values.)
  let stored: { name: string; value: number } | null = null;
  if (parsed.explicitTarget === undefined) {
    stored = await lookupCheckTarget(roomId, userId, parsed.skillName, rule);
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
    sheet,
  });
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
  rule: RuleModule
): Promise<{ name: string; value: number } | null> {
  const [skill] = await db.select().from(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      eq(roomSkills.skillName, skillName)
    )
  );
  if (skill) return { name: skillName, value: skill.skillValue };

  // Skill row missing — defer to the rule's fallback strategy.
  const sheet = await getCharacterData(roomId, userId);
  return rule.lookupFallback(skillName, sheet);
}

interface PerformCheckExtras {
  explicitTarget?: number;
  storedValue?: number;
  modifierValue?: number;
  modifierDisplay?: string;
  sheet: CharacterData | null;
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
  extras?: PerformCheckExtras
): Promise<CommandResult> {
  const result = rule.resolveCheck({
    skillName,
    target,
    explicitTarget: extras?.explicitTarget,
    storedValue: extras?.storedValue,
    modifierValue: extras?.modifierValue,
    modifierDisplay: extras?.modifierDisplay,
    sheet: extras?.sheet ?? null,
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
  if (!getRuleForRoom(room).capabilities.supportedCommands.includes("sc")) {
    // Gate via capabilities so future rules can enable/disable `.sc` without
    // touching the engine. Error key stays as-is for i18n continuity.
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

  // The insanity warning is now rendered client-side as a separate banner
  // attached to the sanity card (see ChatMessage.tsx). The `deduction >= 5`
  // signal travels via diceDetail.sanityCheck.deduction, so no trailing text.
  const content = t("scCheckMessage", {
    roll,
    target: currentSan,
    result: resultLabel,
    deductExpr: rollResult.display,
    deductVal,
    oldSan: currentSan,
    newSan: finalNewSan,
  });

  const detail = attachProxy(JSON.stringify({
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
  }), ctx?.proxiedBy);

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
