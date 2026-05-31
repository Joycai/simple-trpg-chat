"use server";

import { db } from "@/db";
import { messages, roomMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { broadcastToRoom } from "@/lib/events";

export async function sendMessage(roomId: number, content: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const [member] = await db.select().from(roomMembers).where(
    and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, parseInt((session.user as any).id))
    )
  );

  if (!member) throw new Error("Not a member of this room");

  const [newMessage] = await db.insert(messages).values({
    roomId,
    userId: parseInt((session.user as any).id),
    nickname: member.nickname,
    content,
    type: "text",
  }).returning();

  broadcastToRoom(roomId, newMessage);
  return newMessage;
}

export async function rollDice(roomId: number, diceType: string, count: number, isPrivate: boolean = false) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const [member] = await db.select().from(roomMembers).where(
    and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, parseInt((session.user as any).id))
    )
  );

  if (!member) throw new Error("Not a member of this room");

  const sides = parseInt(diceType.replace("d", ""));
  const results = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const sum = results.reduce((a, b) => a + b, 0);

  const diceDetail = {
    dice: diceType,
    count,
    results,
    sum,
    modifier: 0
  };

  const [newMessage] = await db.insert(messages).values({
    roomId,
    userId: parseInt((session.user as any).id),
    nickname: member.nickname,
    content: `${count}${diceType}=${sum}`,
    type: "dice",
    diceDetail: JSON.stringify(diceDetail),
    isPrivate,
  }).returning();

  broadcastToRoom(roomId, newMessage);
  return newMessage;
}
