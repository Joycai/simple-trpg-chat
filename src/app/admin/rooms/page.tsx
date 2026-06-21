import { db } from "@/db";
import { rooms, users, roomMembers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { AdminRoomManager } from "@/components/admin/rooms/AdminRoomManager";

export default async function AdminRoomsPage() {
  const t = await getTranslations("admin");

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
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">{t("roomManagement")}</h1>
          <p className="text-sm text-text-muted mt-1">{t("roomManagementDesc")}</p>
        </div>
      </div>
      <AdminRoomManager rooms={allRooms} />
    </div>
  );
}
