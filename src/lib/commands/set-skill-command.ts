import { db, sqlNow } from "@/db";
import { roomSkills, rooms } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { CharacterData } from "@/lib/character/types";
import { applySheetEdit, statEdit, statValue } from "@/lib/character/sheet-model";
import { parseSheetOrNull } from "@/lib/character/sheet-store";
import { updateSheetRow } from "@/lib/character/sheet-row";
import { emptySheet } from "@/lib/character/sheet-v2";
import { getRuleForRoom } from "@/lib/rules";
import { broadcastCharacterUpdate } from "@/lib/character/broadcast";
import type { CommandResult, CommandContext } from "./command-types";
import { visibilityFor, emitCommandMessage } from "./command-message";

/** .st: Set/Update Skills, Attributes, and Resources */
export async function handleSetSkill(
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

  // Route every parsed item once; the attribute/resource ones share a single
  // sheet write (`.st STR 80 DEX 70 HP 12` is one read-modify-write).
  const routes = parsed.map(item => ({ item, route: rule.routeStat(item.name) }));
  const sheetItems = routes.flatMap(({ item, route }, index) =>
    route.kind === "attribute" || route.kind === "resource" ? [{ item, route, index }] : []);

  // The value each sheet item actually stored (attributes clamp to their
  // range, resources to their max), for the summary.
  const storedValues = new Map<number, number>();
  let writtenSheet: CharacterData | null = null;
  if (sheetItems.length > 0) {
    const out = await updateSheetRow(roomId, userId, (raw) => {
      // A member who has never opened the character panel has no sheet yet.
      // Start an empty one so the writes land instead of being silently
      // dropped while chat reports success.
      let sheet = parseSheetOrNull(raw, rule.id) ?? emptySheet(rule.id);
      // Names were routed by the room's rule; a sheet still built for another
      // rule (the player declined the rebuild) has other fields, so writing it
      // would drop or misplace values. Ask for the rebuild instead.
      if (sheet.ruleTemplate !== rule.id) return { result: null };
      const values: number[] = [];
      for (const { item, route } of sheetItems) {
        sheet = applySheetEdit(rule, sheet, statEdit(route, item.value)).sheet;
        values.push(statValue(rule, sheet, route) ?? item.value);
      }
      return { sheet, result: values };
    });
    if (out.status !== "notMember") {
      if (out.result === null) return { success: false, isCommand: true, error: t("stSheetRuleMismatch") };
      sheetItems.forEach((r, k) => storedValues.set(r.index, out.result![k]));
      if (out.status === "ok") writtenSheet = out.sheet;
    }
  }

  const summaryParts: string[] = [];

  for (const [index, { item, route }] of routes.entries()) {
    if (route.kind === "attribute" || route.kind === "resource") {
      await cleanupSkillRows(roomId, userId, item.name, route.canonical);
      summaryParts.push(`${route.canonical} ${storedValues.get(index) ?? item.value}`);
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

  // Skills and/or the sheet changed: members' lists, badges and open panels follow.
  await broadcastCharacterUpdate(roomId, userId, { sheet: writtenSheet ?? undefined, by: ctx?.proxiedBy?.userId ?? userId });

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
