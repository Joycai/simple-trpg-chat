import "server-only";
import { cache } from "react";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { eq } from "drizzle-orm";

/** The room id in a `/rooms/[id]` URL, or null when it can't name a room: not a
 *  positive int4, which Postgres would reject (NaN, out of range) instead of
 *  returning no row. */
export function parseRoomId(raw: string): number | null {
  const id = parseInt(raw);
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

/** One room row per request: the `[id]` layout checks existence with it and the
 *  page reuses the same result. */
export const findRoom = cache(async (roomId: number) => {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  return room ?? null;
});
