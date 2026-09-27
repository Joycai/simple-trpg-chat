"use server";

import { db } from "@/db";
import { rooms, roomMembers, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { broadcastToRoom } from "@/lib/server/events";
import { tryRoomAccess } from "@/lib/auth/room-access";
import { getTranslations } from "next-intl/server";

// --- Dice Announcer (投娘) settings — docs/design/dice-announcer.md ---

/** Current selection + the room's bot roster, for the settings dropdown (host only). */
export async function getDiceAnnouncerSettingsAction(roomId: number) {
  const t = await getTranslations("diceAnnouncer");
  if (!Number.isInteger(roomId) || !(await tryRoomAccess(roomId, true))) {
    return { success: false as const, error: t("errorNotHost") };
  }

  const [room] = await db.select({ diceAnnouncerBotId: rooms.diceAnnouncerBotId }).from(rooms).where(eq(rooms.id, roomId));
  const botRows = await db
    .select({ id: users.id, nickname: roomMembers.nickname })
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(and(eq(roomMembers.roomId, roomId), eq(users.isBot, true)));

  return {
    success: true as const,
    botId: room?.diceAnnouncerBotId ?? null,
    bots: botRows,
  };
}

/** Designate (or clear, with `botUserId: null`) the room's dice-announcer bot. */
export async function setDiceAnnouncerAction(roomId: number, botUserId: number | null) {
  const t = await getTranslations("diceAnnouncer");
  if (!Number.isInteger(roomId) || !(await tryRoomAccess(roomId, true))) {
    return { success: false as const, error: t("errorNotHost") };
  }

  if (botUserId !== null) {
    if (!Number.isInteger(botUserId)) {
      return { success: false as const, error: t("errorBotNotFound") };
    }
    const [bot] = await db
      .select({ id: users.id })
      .from(roomMembers)
      .innerJoin(users, eq(roomMembers.userId, users.id))
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, botUserId), eq(users.isBot, true)));
    if (!bot) return { success: false as const, error: t("errorBotNotFound") };
  }

  await db.update(rooms).set({ diceAnnouncerBotId: botUserId }).where(eq(rooms.id, roomId));
  broadcastToRoom(roomId, { type: "room_settings_updated" });
  revalidatePath(`/rooms/${roomId}`);
  return { success: true as const };
}
