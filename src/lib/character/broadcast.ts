import "server-only";
import { db } from "@/db";
import { roomMembers, rooms, roomSkills } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { broadcastToRoom } from "@/lib/server/events";
import { primaryVital, type StatusEntry } from "@/lib/rules";
import type { CompletionSummary } from "./completion";
import { memberCompletionSummary } from "./member-completion";
import { parseSheetOrNull } from "./sheet-store";
import type { CharacterData } from "./types";

/**
 * The one `character_updated` event every sheet or skill write sends, so the
 * member list, the badges and any open panel stay current no matter who wrote
 * (the member, the host, `.st` / `.sc`, the AI):
 *
 *   { type, userId, vital, completion, by }
 *
 * `vital` is the member list's headline number, `completion` the required
 * set/total against the room's rule, `by` the writer (clients skip reloading
 * what they just saved themselves).
 */
export interface CharacterUpdateEvent {
  type: "character_updated";
  userId: number;
  vital: StatusEntry | null;
  completion: CompletionSummary;
  by: number | null;
}

export function characterUpdatePayload(
  userId: number,
  sheet: CharacterData | null,
  skillNames: ReadonlyArray<string>,
  roomRuleId: string,
  by: number | null,
): CharacterUpdateEvent {
  return {
    type: "character_updated",
    userId,
    vital: primaryVital(sheet),
    completion: memberCompletionSummary(sheet, skillNames, roomRuleId),
    by,
  };
}

/**
 * Read what the event needs (room rule, the member's skills, and the sheet
 * unless the caller just wrote it) and broadcast. Never throws: a failed
 * broadcast only leaves other clients a refresh behind.
 */
export async function broadcastCharacterUpdate(
  roomId: number,
  userId: number,
  opts: { sheet?: CharacterData | null; by?: number | null } = {},
): Promise<void> {
  try {
    const [room] = await db.select({ ruleTemplate: rooms.ruleTemplate }).from(rooms).where(eq(rooms.id, roomId));
    if (!room) return;
    const roomRuleId = room.ruleTemplate ?? "basic";
    let sheet = opts.sheet;
    if (sheet === undefined) {
      const [member] = await db.select({ characterData: roomMembers.characterData })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
      sheet = parseSheetOrNull(member?.characterData, roomRuleId);
    }
    const skills = await db.select({ skillName: roomSkills.skillName })
      .from(roomSkills)
      .where(and(eq(roomSkills.roomId, roomId), eq(roomSkills.userId, userId)));
    broadcastToRoom(roomId, characterUpdatePayload(
      userId, sheet, skills.map((s) => s.skillName), roomRuleId, opts.by ?? null,
    ));
  } catch (e) {
    console.error("character_updated broadcast failed", e);
  }
}
