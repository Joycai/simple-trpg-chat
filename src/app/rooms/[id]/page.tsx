import { auth } from "@/auth";
import { db } from "@/db";
import { rooms, roomMembers, messages, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { RoomClient } from "@/components/RoomClient";
import { RoomThemeSetter } from "@/components/RoomThemeSetter";
import type { ThemeId } from "@/themes/types";
import Link from "next/link";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roomId = parseInt(id);

  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as any;
  const userId = parseInt(user.id);

  // Get room
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-bg">
        <h1 className="text-2xl font-bold text-text-muted">房间不存在</h1>
        <Link href="/" className="text-primary hover:underline">
          返回大厅
        </Link>
      </div>
    );
  }

  const isHost = room.hostId === userId;

  // Get all room members (for player list)
  const members = await db
    .select()
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(eq(roomMembers.roomId, roomId));

  // Check if user is a member
  const [member] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  if (!member && !isHost) {
    // Auto-join the host if they weren't added as member
    if (isHost) {
      await db.insert(roomMembers).values({
        roomId,
        userId,
        nickname: user.name || user.username || "Host",
      });
    } else {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-bg">
          <h1 className="text-2xl font-bold text-text-muted">你还没有加入这个房间</h1>
          <Link href="/" className="text-primary hover:underline">
            返回大厅加入
          </Link>
        </div>
      );
    }
  }

  // Get messages
  const roomMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.roomId, roomId))
    .orderBy(messages.createdAt);

  // Get updated member info
  const [currentMember] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  const currentNickname = currentMember?.nickname || user.name || user.username || "Player";

  // Filter messages: non-private messages + own private messages + (if host) all private messages
  const visibleMessages = roomMessages.filter((msg) => {
    if (!msg.isPrivate) return true;
    if (msg.userId === userId) return true;
    if (isHost) return true;
    return false;
  });

  return (
    <>
      <RoomThemeSetter theme={(room.theme as ThemeId) || "default"} />
      <RoomClient
        room={room as any}
        players={members as any[]}
        messages={visibleMessages as any[]}
        userId={userId}
        isHost={isHost}
        currentNickname={currentNickname}
        roomTheme={(room.theme as ThemeId) || "default"}
        roomDiceRules={(room as any).diceRules || "basic"}
      />
    </>
  );
}
