import { db } from "@/db";
import { rooms, users, roomMembers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { AdminRoomManager } from "@/components/admin/rooms/AdminRoomManager";

export default async function AdminRoomsPage() {
  const allRooms = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      status: rooms.status,
      frozen: rooms.frozen,
      createdAt: rooms.createdAt,
      hostId: rooms.hostId,
      hostName: users.displayName,
      memberCount: sql<number>`(select count(*) from ${roomMembers} where ${roomMembers.roomId} = ${rooms.id})`.mapWith(Number),
    })
    .from(rooms)
    .leftJoin(users, eq(rooms.hostId, users.id))
    .orderBy(rooms.createdAt);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <AdminRoomManager rooms={allRooms} />
    </div>
  );
}
