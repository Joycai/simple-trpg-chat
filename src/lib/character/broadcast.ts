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
 *   { type, userId, vital, completion, origin }
 *
 * `vital` is the member list's headline number, `completion` the required
 * set/total (and what's missing) against the room's rule, `origin` the
 * writing tab as `<caller id>:<tab id>` (`lib/ui/tab-id.ts`), or null for a
 * write no tab made (the AI, a join). A tab skips reloading only for its own
 * writes, which refresh themselves where they happen — the same user's other
 * tabs and devices still reload.
 *
 * The tab id comes from the client and reaches every member, so the server
 * prefixes the session caller: a member who replays someone else's tab id
 * gets an origin with their own user id, which that tab doesn't match.
 */
export interface CharacterUpdateEvent {
  type: "character_updated";
  userId: number;
  vital: StatusEntry | null;
  completion: CompletionSummary;
  origin: string | null;
}

/**
 * The event's `origin`: the session caller bound to the tab id they sent, or
 * null when either is missing or the tab id isn't one (it is untrusted).
 */
export function writeOrigin(by: number | null | undefined, tab: unknown): string | null {
  if (!Number.isInteger(by)) return null;
  return typeof tab === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(tab) ? `${by}:${tab}` : null;
}

export function characterUpdatePayload(
  userId: number,
  sheet: CharacterData | null,
  skillNames: ReadonlyArray<string>,
  roomRuleId: string,
  origin: string | null,
): CharacterUpdateEvent {
  return {
    type: "character_updated",
    userId,
    vital: primaryVital(sheet),
    completion: memberCompletionSummary(sheet, skillNames, roomRuleId),
    origin,
  };
}

/**
 * Read what the event needs — the member's sheet, the room rule, the
 * member's skills — and broadcast it, all while holding the member's row lock.
 *
 * Sheet writes take the same lock (`updateSheetRow`), so one member's events
 * go out one at a time, each reading what was committed when it ran: the
 * last event a client gets always matches the database, whatever order two
 * writers' broadcasts started in. The payload is always read here, never
 * handed in, so a caller can't send a copy that a later write has replaced.
 * `broadcastToRoom` emits synchronously, before the lock is released.
 *
 * Call it after the write's own transaction has committed. Never throws: a
 * failed broadcast only leaves other clients a refresh behind.
 */
export async function broadcastCharacterUpdate(
  roomId: number,
  userId: number,
  /** `by`: the session caller (never a client value); `tab`: the tab id they sent. */
  opts: { by?: number | null; tab?: unknown } = {},
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const [member] = await tx.select({ characterData: roomMembers.characterData })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
        .for("update");
      const [room] = await tx.select({ ruleTemplate: rooms.ruleTemplate }).from(rooms).where(eq(rooms.id, roomId));
      if (!room) return;
      const roomRuleId = room.ruleTemplate ?? "basic";
      const skills = await tx.select({ skillName: roomSkills.skillName })
        .from(roomSkills)
        .where(and(eq(roomSkills.roomId, roomId), eq(roomSkills.userId, userId)));
      broadcastToRoom(roomId, characterUpdatePayload(
        userId,
        parseSheetOrNull(member?.characterData, roomRuleId),
        skills.map((s) => s.skillName),
        roomRuleId,
        writeOrigin(opts.by, opts.tab),
      ));
    });
  } catch (e) {
    console.error("character_updated broadcast failed", e);
  }
}
