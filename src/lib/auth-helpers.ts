import { auth } from "@/auth";
import { db } from "@/db";
import { rooms, roomMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface UserAccess {
  userId: number;
  isHost: boolean;
  isAdmin: boolean;
}

/**
 * Checks if the current authenticated user has access to the specified room.
 *
 * @param roomId - The room ID to check
 * @param requireHost - If true, checks if the user is the room host. If false, checks membership.
 * @returns An object containing the userId, isHost status, and isAdmin status.
 * @throws Error if not authenticated, room not found, or unauthorized.
 */
export async function checkRoomAccess(
  roomId: number,
  requireHost = false,
  opts?: { requireWritable?: boolean }
): Promise<UserAccess> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt(session.user.id);
  if (isNaN(userId)) throw new Error("Invalid user ID in session");

  const userRole = session.user.role;
  const isAdmin = userRole === "admin";

  // Admins bypass all room membership/host checks
  if (isAdmin) {
    return { userId, isHost: true, isAdmin: true };
  }

  // Retrieve room
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) throw new Error("Room not found");

  const isHost = room.hostId === userId;

  // Frozen rooms are read-only for everyone except the host (and admins, who returned above)
  if (opts?.requireWritable && room.frozen && !isHost) {
    throw new Error("Room is frozen (read-only)");
  }

  if (requireHost) {
    if (!isHost) {
      throw new Error("Unauthorized: Host access required for this room");
    }
    return { userId, isHost: true, isAdmin: false };
  }

  // For general access, user must be either the host or a member of the room
  if (!isHost) {
    const [membership] = await db
      .select()
      .from(roomMembers)
      .where(
        and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, userId)
        )
      );

    if (!membership) {
      throw new Error("Unauthorized: Not a member of this room");
    }
  }

  return { userId, isHost, isAdmin: false };
}
