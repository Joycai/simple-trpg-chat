import { notFound } from "next/navigation";
import { findRoom, parseRoomId } from "@/lib/room/room-lookup";

/**
 * Checks the room exists before the segment's loading.tsx can start streaming.
 * Once a skeleton has been sent the status is already 200, so a `notFound()`
 * from the page alone would answer a missing room with a soft 404; here it
 * still gets a real one. The 404 UI is `rooms/not-found.tsx` — a segment's own
 * not-found boundary sits inside its layout, so it can't catch this one.
 */
export default async function RoomLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const roomId = parseRoomId((await params).id);
  if (roomId === null || !(await findRoom(roomId))) notFound();
  return children;
}
