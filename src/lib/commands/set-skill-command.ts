import { db, sqlNow } from "@/db";
import { roomSkills, rooms, roomMembers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { CharacterData } from "@/lib/character/types";
import { getRuleForRoom } from "@/lib/rules";
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
    // A member who has never opened the character panel has no sheet yet.
    // Seed one (same shape initCharacterAction persists) so the writes below
    // land instead of being silently dropped while chat reports success.
    if (member && !sheet) {
      sheet = rule.initCharacter();
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
