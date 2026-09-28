import "server-only";
import { db } from "@/db";
import { messages, roomDmReads, roomMembers, rooms, roomSkills, storyEvents, storyEventVisibility, inventoryDistributions } from "@/db/schema";
import { eq, and, asc, sql, or, isNull, not, count } from "drizzle-orm";
import { parseEventImages, type EventView } from "@/lib/room/story-events";
import type { CompletionSummary } from "@/lib/character/completion";
import { memberCompletionSummary } from "@/lib/character/member-completion";
import { parseSheetOrNull } from "@/lib/character/sheet-store";

/**
 * The per-viewer reads a room needs for its first paint: unread badges, the
 * event log, and character-sheet completion. The matching read
 * actions call these after `checkRoomAccess`; the room page calls them all at
 * once through `loadMemberSnapshot`, so the badges arrive with the HTML
 * instead of trickling in after hydration.
 *
 * Callers own authorization — every function trusts the `userId` / `isHost`
 * it is given. `isHost` follows `checkRoomAccess`: the room's host or an admin.
 */

export type RoomSkill = typeof roomSkills.$inferSelect;

/** Unread 1:1 DM turns addressed to the viewer, keyed by sender id. */
export async function countUnreadDms(roomId: number, userId: number): Promise<Record<number, number>> {
  // Single SQL query: count unread DMs per sender using a LEFT JOIN against read timestamps
  const rows = await db
    .select({
      senderId: messages.userId,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(messages)
    .leftJoin(
      roomDmReads,
      and(
        eq(roomDmReads.roomId, roomId),
        eq(roomDmReads.userId, userId),
        eq(roomDmReads.partnerUserId, messages.userId)
      )
    )
    .where(
      and(
        eq(messages.roomId, roomId),
        // Only genuine 1:1 DM turns count as unread — inline notices (system/clue
        // directed messages, GM rolls) carry their own indicators, not a DM badge.
        eq(messages.audience, "dm"),
        eq(messages.targetUserId, userId),
        not(eq(messages.userId, userId)),
        or(
          isNull(roomDmReads.lastReadAt),
          sql`${messages.createdAt} > ${roomDmReads.lastReadAt}`
        )
      )
    )
    .groupBy(messages.userId);

  const counts: Record<number, number> = {};
  for (const row of rows) {
    counts[row.senderId] = row.count;
  }
  return counts;
}

/** The viewer's stored skills, by name. */
export async function listMySkills(roomId: number, userId: number): Promise<RoomSkill[]> {
  return await db.select().from(roomSkills)
    .where(and(eq(roomSkills.roomId, roomId), eq(roomSkills.userId, userId)))
    .orderBy(roomSkills.skillName);
}

/** Player-facing list — events this viewer may read, with full content. */
export async function listVisibleEvents(roomId: number, userId: number, isHost: boolean): Promise<EventView[]> {
  const evs = await db
    .select()
    .from(storyEvents)
    .where(eq(storyEvents.roomId, roomId))
    .orderBy(asc(storyEvents.sortOrder), asc(storyEvents.id));

  // Joined to storyEvents and scoped to this room: without it the query pulls
  // the caller's visibility rows across every room they have ever played in.
  const myVis = await db
    .select({ eventId: storyEventVisibility.eventId, viewed: storyEventVisibility.viewed, updated: storyEventVisibility.updated, createdAt: storyEventVisibility.createdAt })
    .from(storyEventVisibility)
    .innerJoin(storyEvents, eq(storyEvents.id, storyEventVisibility.eventId))
    .where(and(eq(storyEventVisibility.userId, userId), eq(storyEvents.roomId, roomId)));
  const visMap = new Map(myVis.map((v) => [v.eventId, v]));

  const out: EventView[] = [];
  for (const e of evs) {
    const canView = isHost || e.status === "full" || (e.status === "partial" && visMap.has(e.id));
    if (!canView) continue;
    // Acquisition time: a partial grant carries its own row timestamp; a full
    // event has none, so fall back to its publish/update time.
    const acquiredAt = visMap.get(e.id)?.createdAt ?? e.updatedAt;
    out.push({
      id: e.id,
      title: e.title,
      description: e.description,
      timePayload: e.timePayload,
      images: parseEventImages(e.imagesJson),
      status: e.status,
      sortOrder: e.sortOrder,
      updated: visMap.get(e.id)?.updated ?? false,
      acquiredAt,
    });
  }
  // Player log orders by acquisition time (most recent first); host keeps the
  // authored order so it mirrors the management panel.
  if (!isHost) {
    out.sort((a, b) => String(b.acquiredAt ?? "").localeCompare(String(a.acquiredAt ?? "")));
  }
  return out;
}

/** Unread event count for the top-bar badge (non-host, from visibility rows). */
export async function countUnreadEvents(roomId: number, userId: number, isHost: boolean): Promise<number> {
  if (isHost) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(storyEventVisibility)
    .innerJoin(storyEvents, eq(storyEvents.id, storyEventVisibility.eventId))
    .where(
      and(
        eq(storyEvents.roomId, roomId),
        eq(storyEventVisibility.userId, userId),
        eq(storyEventVisibility.viewed, false),
      ),
    );
  return Number(row?.n ?? 0);
}

/** Unread inventory count for the backpack badge. */
export async function countUnreadInventory(roomId: number, userId: number): Promise<number> {
  const result = await db.select({ count: count() })
    .from(inventoryDistributions)
    .where(
      and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.toUserId, userId),
        sql`${inventoryDistributions.viewed} = ${false}`
      )
    );

  return (result[0]?.count as number) || 0;
}

/**
 * Required-field completion against the room's rule, keyed by member id: the
 * viewer's own, plus every member's for the host (the member list marks and
 * the overview badge). Two queries regardless of room size.
 */
export async function loadCompletions(roomId: number, userId: number, isHost: boolean): Promise<Record<number, CompletionSummary>> {
  const [room] = await db.select({ ruleTemplate: rooms.ruleTemplate }).from(rooms).where(eq(rooms.id, roomId));
  const roomRuleId = room?.ruleTemplate ?? "basic";
  const memberScope = isHost ? eq(roomMembers.roomId, roomId) : and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId));
  const skillScope = isHost ? eq(roomSkills.roomId, roomId) : and(eq(roomSkills.roomId, roomId), eq(roomSkills.userId, userId));
  const [members, skills] = await Promise.all([
    db.select({ userId: roomMembers.userId, characterData: roomMembers.characterData }).from(roomMembers).where(memberScope),
    db.select({ userId: roomSkills.userId, skillName: roomSkills.skillName }).from(roomSkills).where(skillScope),
  ]);
  const namesByUser = new Map<number, string[]>();
  for (const s of skills) namesByUser.set(s.userId, [...(namesByUser.get(s.userId) ?? []), s.skillName]);
  const out: Record<number, CompletionSummary> = {};
  for (const m of members) {
    out[m.userId] = memberCompletionSummary(
      parseSheetOrNull(m.characterData, roomRuleId), namesByUser.get(m.userId) ?? [], roomRuleId,
    );
  }
  return out;
}

export interface RoomMemberSnapshot {
  unreadDms: Record<number, number>;
  /** See `loadCompletions`. */
  completions: Record<number, CompletionSummary>;
  events: EventView[];
  unreadEvents: number;
  unreadItems: number;
}

/** Everything above in one parallel round, for the room page's server render. */
export async function loadMemberSnapshot(roomId: number, userId: number, isHost: boolean): Promise<RoomMemberSnapshot> {
  const [unreadDms, completions, events, unreadEvents, unreadItems] = await Promise.all([
    countUnreadDms(roomId, userId),
    loadCompletions(roomId, userId, isHost),
    listVisibleEvents(roomId, userId, isHost),
    countUnreadEvents(roomId, userId, isHost),
    countUnreadInventory(roomId, userId),
  ]);
  return { unreadDms, completions, events, unreadEvents, unreadItems };
}
