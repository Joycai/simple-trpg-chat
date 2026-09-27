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
 * Whether `user` gets host-level access to `room`: its host, or any admin.
 * `checkRoomAccess` reports this as `isHost`; the room page uses it to read the
 * same per-viewer data the read actions would return.
 */
export function isRoomHostOrAdmin(room: { hostId: number }, user: { id: number; role: string }): boolean {
  return user.role === "admin" || room.hostId === user.id;
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

  const isHost = isRoomHostOrAdmin(room, { id: userId, role: userRole });

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

/**
 * `checkRoomAccess` for actions that return result objects: `null` instead of
 * a throw. Callers map it to `noRoomAccess()` (`roomActions.errorNoAccess`) or
 * their module's own key (`errorNotHost` …) — the thrown reasons
 * (signed out, not a member, frozen) were never shown to users anyway.
 */
export async function tryRoomAccess(
  roomId: number,
  requireHost = false,
  opts?: { requireWritable?: boolean }
): Promise<UserAccess | null> {
  try {
    return await checkRoomAccess(roomId, requireHost, opts);
  } catch {
    return null;
  }
}
