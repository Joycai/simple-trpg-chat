"use server";

import { db } from "@/db";
import { storyEvents, storyEventVisibility, roomMembers, users, messages } from "@/db/schema";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { getTranslations } from "next-intl/server";
import { broadcastToRoom } from "@/lib/events";
import { dispatchMessage } from "@/lib/messaging/router";
import { parseTimelinePayload } from "@/lib/messaging/timeline-payload";
import { resolveChatImagePath } from "@/lib/uploads";
import {
  buildEventCardPayload,
  buildEventReceiptPayload,
  parseEventImages,
  serializeEventImages,
  type EventCardPayload,
} from "@/lib/story-events";

/* ------------------------------------------------------------------ helpers */

/** Fire a lightweight refresh signal so every open events panel / chat card re-evaluates. */
function signalUpdate(roomId: number, eventId?: number) {
  broadcastToRoom(roomId, { type: "events_updated", eventId });
}

/** Non-bot member ids of the room, optionally excluding one user (e.g. the host). */
async function roomAudienceIds(roomId: number, excludeUserId?: number): Promise<number[]> {
  const rows = await db
    .select({ userId: roomMembers.userId, isBot: users.isBot })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(eq(roomMembers.roomId, roomId));
  return rows
    .filter((r) => !r.isBot && r.userId !== excludeUserId)
    .map((r) => r.userId);
}

/** The host's in-room display name, used as the actor nickname on system messages. */
async function hostNickname(roomId: number, hostId: number): Promise<string> {
  const [m] = await db
    .select({ nickname: roomMembers.nickname })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, hostId)));
  if (m?.nickname) return m.nickname;
  const [u] = await db.select({ name: users.displayName, username: users.username }).from(users).where(eq(users.id, hostId));
  return u?.name || u?.username || "KP";
}

/** Best-effort removal of an event's image files from the on-disk cache. */
async function unlinkImages(urls: string[]) {
  if (urls.length === 0) return;
  const fs = await import("node:fs/promises");
  for (const url of urls) {
    const m = url.match(/\/images\/([^/?#]+)$/);
    if (!m) continue;
    const p = resolveChatImagePath(decodeURIComponent(m[1]));
    if (p) {
      try {
        await fs.unlink(p);
      } catch {
        /* already gone — cache is disposable */
      }
    }
  }
}

/** Validate a timeline payload string; return the cleaned JSON or null. */
function cleanTimePayload(raw: string | null | undefined): string | null {
  const data = parseTimelinePayload(raw);
  return data ? JSON.stringify({ timelineDivider: data }) : null;
}

/** Post (or repost) the public-channel announcement card. Returns the message row. */
async function postCard(
  roomId: number,
  hostId: number,
  nickname: string,
  payload: EventCardPayload,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  return dispatchMessage({
    roomId,
    actorUserId: hostId,
    nickname,
    type: "system",
    audience: "everyone",
    systemKind: "event-card",
    content: t("cardFallback", { title: payload.title }),
    diceDetail: buildEventCardPayload(payload),
  });
}

/** Send a personal "new event" receipt pill to each recipient (visible to them only). */
async function sendReceipts(
  roomId: number,
  hostId: number,
  nickname: string,
  eventId: number,
  title: string,
  recipientIds: number[],
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  for (const uid of recipientIds) {
    await dispatchMessage({
      roomId,
      actorUserId: hostId,
      nickname,
      type: "system",
      audience: "recipient",
      targetUserId: uid,
      systemKind: "event-receipt",
      content: t("receiptFallback", { title }),
      diceDetail: buildEventReceiptPayload({ eventId, title }),
    });
  }
}

async function requireEvent(roomId: number, eventId: number) {
  const [ev] = await db.select().from(storyEvents).where(eq(storyEvents.id, eventId));
  if (!ev || ev.roomId !== roomId) throw new Error("Event not found");
  return ev;
}

/* ------------------------------------------------------------------ mutations */

export interface EventInput {
  title: string;
  description?: string;
  timePayload?: string | null;
  images?: string[];
}

/** Create a new (unpublished) event. Host only. */
export async function createEventAction(roomId: number, data: EventInput) {
  const { userId } = await checkRoomAccess(roomId, true);
  const title = (data.title ?? "").trim();
  if (!title) throw new Error("Title required");

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${storyEvents.sortOrder}), 0)` })
    .from(storyEvents)
    .where(eq(storyEvents.roomId, roomId));

  const [row] = await db
    .insert(storyEvents)
    .values({
      roomId,
      creatorId: userId,
      title,
      description: data.description ?? "",
      timePayload: cleanTimePayload(data.timePayload),
      imagesJson: serializeEventImages(data.images ?? []),
      status: "unpublished",
      sortOrder: (maxOrder ?? 0) + 1,
    })
    .returning();

  signalUpdate(roomId, row.id);
  return row;
}

/** Edit an event's fields. Host only. Published, already-viewed recipients are
 *  re-flagged "updated" and pinged so the change is noticed (Q4). */
export async function updateEventAction(roomId: number, eventId: number, data: EventInput) {
  const { userId } = await checkRoomAccess(roomId, true);
  const ev = await requireEvent(roomId, eventId);

  const title = (data.title ?? "").trim();
  if (!title) throw new Error("Title required");

  const oldImages = parseEventImages(ev.imagesJson);
  const newImages = serializeEventImages(data.images ?? []);
  const kept = new Set(parseEventImages(newImages));
  await unlinkImages(oldImages.filter((u) => !kept.has(u)));

  await db
    .update(storyEvents)
    .set({
      title,
      description: data.description ?? "",
      timePayload: cleanTimePayload(data.timePayload),
      imagesJson: newImages,
      updatedAt: sql`now()`,
    })
    .where(eq(storyEvents.id, eventId));

  // Re-flag already-viewed recipients + ping them, mirroring inventory edits.
  if (ev.status === "partial" || ev.status === "full") {
    const viewedRows = await db
      .select({ userId: storyEventVisibility.userId })
      .from(storyEventVisibility)
      .where(and(eq(storyEventVisibility.eventId, eventId), eq(storyEventVisibility.viewed, true)));
    const viewedIds = viewedRows.map((r) => r.userId);
    if (viewedIds.length > 0) {
      await db
        .update(storyEventVisibility)
        .set({ updated: true, viewed: false })
        .where(and(eq(storyEventVisibility.eventId, eventId), inArray(storyEventVisibility.userId, viewedIds)));
      const t = await getTranslations("eventActions");
      const nickname = await hostNickname(roomId, userId);
      await sendReceipts(roomId, userId, nickname, eventId, title, viewedIds, t);
    }
  }

  signalUpdate(roomId, eventId);
  return { success: true };
}

/** Delete an event (visibility rows cascade) and its card + image files. Host only. */
export async function deleteEventAction(roomId: number, eventId: number) {
  await checkRoomAccess(roomId, true);
  const ev = await requireEvent(roomId, eventId);

  await unlinkImages(parseEventImages(ev.imagesJson));
  if (ev.cardMessageId != null) {
    await db.delete(messages).where(eq(messages.id, ev.cardMessageId));
    broadcastToRoom(roomId, { type: "message_deleted", messageId: ev.cardMessageId });
  }
  await db.delete(storyEvents).where(eq(storyEvents.id, eventId));

  signalUpdate(roomId, eventId);
  return { success: true };
}

export type ReorderOp = "up" | "down" | "top" | "bottom" | { index: number };

/** Move an event within the host-controlled order. Host only. */
export async function reorderEventAction(roomId: number, eventId: number, op: ReorderOp) {
  await checkRoomAccess(roomId, true);
  const list = await db
    .select({ id: storyEvents.id })
    .from(storyEvents)
    .where(eq(storyEvents.roomId, roomId))
    .orderBy(asc(storyEvents.sortOrder), asc(storyEvents.id));

  const ids = list.map((e) => e.id);
  const from = ids.indexOf(eventId);
  if (from < 0) throw new Error("Event not found");

  const len = ids.length;
  let to: number;
  if (op === "top") to = 0;
  else if (op === "bottom") to = len - 1;
  else if (op === "up") to = Math.max(0, from - 1);
  else if (op === "down") to = Math.min(len - 1, from + 1);
  else to = Math.min(Math.max((op.index | 0) - 1, 0), len - 1); // 1-based input

  if (to !== from) {
    ids.splice(to, 0, ids.splice(from, 1)[0]);
  }

  // Reassign dense sortOrder for the whole room.
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(storyEvents).set({ sortOrder: i }).where(eq(storyEvents.id, ids[i]));
    }
  });

  signalUpdate(roomId, eventId);
  return { success: true };
}

/** Publish an unpublished event. `target` = "all" (or []) → full; a user-id list → partial. */
export async function publishEventAction(roomId: number, eventId: number, target: "all" | number[]) {
  const { userId } = await checkRoomAccess(roomId, true);
  const ev = await requireEvent(roomId, eventId);
  if (ev.status !== "unpublished") throw new Error("Event already published");

  const wantAll = target === "all" || (Array.isArray(target) && target.length === 0);
  const t = await getTranslations("eventActions");
  const nickname = await hostNickname(roomId, userId);

  let recipientIds: number[];
  if (wantAll) {
    recipientIds = await roomAudienceIds(roomId, userId);
  } else {
    const members = await roomAudienceIds(roomId, userId);
    const allowed = new Set(members);
    recipientIds = [...new Set(target as number[])].filter((id) => allowed.has(id));
    if (recipientIds.length === 0) throw new Error("No valid recipients");
  }

  const status = wantAll ? "full" : "partial";

  if (recipientIds.length > 0) {
    await db
      .insert(storyEventVisibility)
      .values(recipientIds.map((uid) => ({ eventId, userId: uid, viewed: false })))
      .onConflictDoNothing();
  }

  const images = parseEventImages(ev.imagesJson);
  const payload: EventCardPayload = {
    eventId,
    title: ev.title,
    mode: status === "full" ? "full" : "partial",
    time: parseTimelinePayload(ev.timePayload),
    cover: images[0] ?? null,
  };
  const card = await postCard(roomId, userId, nickname, payload, t);

  await db
    .update(storyEvents)
    .set({ status, cardMessageId: card.id, updatedAt: sql`now()` })
    .where(eq(storyEvents.id, eventId));

  // Personal pings only for a limited publish (everyone already sees a full card).
  if (status === "partial") {
    await sendReceipts(roomId, userId, nickname, eventId, ev.title, recipientIds, t);
  }

  signalUpdate(roomId, eventId);
  return { success: true };
}

/** Add more knowers to a partial event. Host only. */
export async function addEventViewersAction(roomId: number, eventId: number, userIds: number[]) {
  const { userId } = await checkRoomAccess(roomId, true);
  const ev = await requireEvent(roomId, eventId);
  if (ev.status !== "partial") throw new Error("Event is not partially published");

  const members = new Set(await roomAudienceIds(roomId, userId));
  const existing = await db
    .select({ userId: storyEventVisibility.userId })
    .from(storyEventVisibility)
    .where(eq(storyEventVisibility.eventId, eventId));
  const have = new Set(existing.map((r) => r.userId));
  const fresh = [...new Set(userIds)].filter((id) => members.has(id) && !have.has(id));
  if (fresh.length === 0) return { success: true, added: 0 };

  await db
    .insert(storyEventVisibility)
    .values(fresh.map((uid) => ({ eventId, userId: uid, viewed: false })))
    .onConflictDoNothing();

  const t = await getTranslations("eventActions");
  const nickname = await hostNickname(roomId, userId);
  await sendReceipts(roomId, userId, nickname, eventId, ev.title, fresh, t);

  signalUpdate(roomId, eventId);
  return { success: true, added: fresh.length };
}

/** Convert a partial event to full. Host only. Newly-eligible members' cards unlock live. */
export async function promoteEventToFullAction(roomId: number, eventId: number) {
  const { userId } = await checkRoomAccess(roomId, true);
  const ev = await requireEvent(roomId, eventId);
  if (ev.status !== "partial") throw new Error("Event is not partially published");

  const members = await roomAudienceIds(roomId, userId);
  if (members.length > 0) {
    await db
      .insert(storyEventVisibility)
      .values(members.map((uid) => ({ eventId, userId: uid, viewed: false })))
      .onConflictDoNothing();
  }

  await db.update(storyEvents).set({ status: "full", updatedAt: sql`now()` }).where(eq(storyEvents.id, eventId));

  const t = await getTranslations("eventActions");
  const nickname = await hostNickname(roomId, userId);
  await dispatchMessage({
    roomId,
    actorUserId: userId,
    nickname,
    type: "system",
    audience: "everyone",
    systemKind: "room-event",
    content: t("promotedToFull", { title: ev.title }),
  });

  signalUpdate(roomId, eventId);
  return { success: true };
}

/** Retract a published event back to unpublished. Host only (client double-confirms). */
export async function retractEventAction(roomId: number, eventId: number) {
  const { userId } = await checkRoomAccess(roomId, true);
  const ev = await requireEvent(roomId, eventId);
  if (ev.status === "unpublished") throw new Error("Event is not published");

  await db.delete(storyEventVisibility).where(eq(storyEventVisibility.eventId, eventId));

  // Replace the live card with a fresh "已撤回" card (same-id re-broadcast is deduped
  // client-side, so we delete the old message and post a new one).
  if (ev.cardMessageId != null) {
    await db.delete(messages).where(eq(messages.id, ev.cardMessageId));
    broadcastToRoom(roomId, { type: "message_deleted", messageId: ev.cardMessageId });
  }
  const t = await getTranslations("eventActions");
  const nickname = await hostNickname(roomId, userId);
  const card = await postCard(
    roomId,
    userId,
    nickname,
    { eventId, title: ev.title, mode: "partial", time: parseTimelinePayload(ev.timePayload), retracted: true },
    t,
  );

  await db
    .update(storyEvents)
    .set({ status: "unpublished", cardMessageId: card.id, updatedAt: sql`now()` })
    .where(eq(storyEvents.id, eventId));

  signalUpdate(roomId, eventId);
  return { success: true };
}

/** Mark the caller's visible events as read (clears unread badge + updated flags). */
export async function markEventsViewedAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);
  await db
    .update(storyEventVisibility)
    .set({ viewed: true, updated: false })
    .from(storyEvents)
    .where(
      and(
        eq(storyEventVisibility.eventId, storyEvents.id),
        eq(storyEvents.roomId, roomId),
        eq(storyEventVisibility.userId, userId),
        eq(storyEventVisibility.viewed, false),
      ),
    );
  return { success: true };
}

/* ------------------------------------------------------------------ reads */

export interface EventView {
  id: number;
  title: string;
  description: string;
  timePayload: string | null;
  images: string[];
  status: "unpublished" | "partial" | "full";
  sortOrder: number;
  updated: boolean;
  /** When this viewer gained access (partial → grant time; full → publish time).
   *  Drives the player log's "by acquisition time" ordering. */
  acquiredAt?: string | null;
  /** Host-only: last publish/update time, shown as the detail modal's "公开时间". */
  updatedAt?: string;
  /** Host-only: who currently knows a partial event (empty for full/unpublished). */
  knowers?: { userId: number; nickname: string }[];
}

/** Host management list — every event (incl. unpublished) + who knows each. */
export async function getRoomEventsAction(roomId: number) {
  await checkRoomAccess(roomId, true);
  const evs = await db
    .select()
    .from(storyEvents)
    .where(eq(storyEvents.roomId, roomId))
    .orderBy(asc(storyEvents.sortOrder), asc(storyEvents.id));

  const ids = evs.map((e) => e.id);
  const vis = ids.length
    ? await db
        .select({ eventId: storyEventVisibility.eventId, userId: storyEventVisibility.userId, nickname: roomMembers.nickname })
        .from(storyEventVisibility)
        .leftJoin(roomMembers, and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, storyEventVisibility.userId)))
        .where(inArray(storyEventVisibility.eventId, ids))
    : [];

  const knowers = new Map<number, { userId: number; nickname: string }[]>();
  for (const v of vis) {
    const arr = knowers.get(v.eventId) ?? [];
    arr.push({ userId: v.userId, nickname: v.nickname ?? "" });
    knowers.set(v.eventId, arr);
  }

  return evs.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    timePayload: e.timePayload,
    images: parseEventImages(e.imagesJson),
    status: e.status,
    sortOrder: e.sortOrder,
    knowers: knowers.get(e.id) ?? [],
  }));
}

/** Player-facing list — events this viewer may read, with full content. */
export async function getMyEventsAction(roomId: number): Promise<EventView[]> {
  const { userId, isHost } = await checkRoomAccess(roomId, false);

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

/** Fetch a single event's full content if the caller may read it, else null.
 *  Backs the detail modal opened from the events panel or a chat card. */
export async function getEventForViewerAction(roomId: number, eventId: number): Promise<EventView | null> {
  const { userId, isHost } = await checkRoomAccess(roomId, false);
  const [e] = await db.select().from(storyEvents).where(and(eq(storyEvents.id, eventId), eq(storyEvents.roomId, roomId)));
  if (!e) return null;

  let updated = false;
  let visible = isHost || e.status === "full";
  if (!isHost) {
    const [row] = await db
      .select({ viewed: storyEventVisibility.viewed, updated: storyEventVisibility.updated })
      .from(storyEventVisibility)
      .where(and(eq(storyEventVisibility.eventId, eventId), eq(storyEventVisibility.userId, userId)));
    if (row) {
      updated = row.updated;
      if (e.status === "partial") visible = true;
    }
  }
  if (!visible) return null;

  // Host gets the extra control-surface data the detail modal's footer needs:
  // who currently knows a partial event, and when it was last published/updated.
  let knowers: { userId: number; nickname: string }[] | undefined;
  if (isHost && e.status === "partial") {
    const rows = await db
      .select({ userId: storyEventVisibility.userId, nickname: roomMembers.nickname })
      .from(storyEventVisibility)
      .leftJoin(roomMembers, and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, storyEventVisibility.userId)))
      .where(eq(storyEventVisibility.eventId, eventId));
    knowers = rows.map((r) => ({ userId: r.userId, nickname: r.nickname ?? "" }));
  }

  return {
    id: e.id, title: e.title, description: e.description, timePayload: e.timePayload,
    images: parseEventImages(e.imagesJson), status: e.status, sortOrder: e.sortOrder, updated,
    updatedAt: isHost ? e.updatedAt : undefined,
    knowers,
  };
}

/** Mark a single event read for the caller (clears its unread/updated flags). */
export async function markEventViewedAction(roomId: number, eventId: number) {
  const { userId } = await checkRoomAccess(roomId, false);
  // The room check authorizes the caller, but the UPDATE must also confirm the
  // event belongs to that room — otherwise any member of any room could clear
  // their flags on an arbitrary event id.
  const [ev] = await db
    .select({ id: storyEvents.id })
    .from(storyEvents)
    .where(and(eq(storyEvents.id, eventId), eq(storyEvents.roomId, roomId)));
  if (!ev) return { success: true };
  await db
    .update(storyEventVisibility)
    .set({ viewed: true, updated: false })
    .where(and(eq(storyEventVisibility.eventId, eventId), eq(storyEventVisibility.userId, userId)));
  return { success: true };
}

/** Unread event count for the top-bar badge (non-host, from visibility rows). */
export async function getUnreadEventCountAction(roomId: number): Promise<number> {
  const { userId, isHost } = await checkRoomAccess(roomId, false);
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
