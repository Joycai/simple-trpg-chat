import { auth } from "@/auth";
import { db } from "@/db";
import { rooms, roomMembers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { isRoomHostOrAdmin } from "./room-access";

/**
 * Who may write a member's character sheet (attributes, resources, skills,
 * custom attributes, background) — one rule for every sheet writer, so a
 * host editing another member's card and a player editing their own go
 * through the same check:
 *
 *  - the member themself, the room host, or an admin;
 *  - in a frozen room, only the host or an admin;
 *  - the target must be a member of the room (bots included).
 *
 * Failure keys live under `messages.character`.
 */
export type SheetWriteDenial =
  | "errorNotAuthenticated"
  | "errorNotMember"
  | "errorRoomNotFound"
  | "errorUnauthorizedResource"
  | "errorRoomFrozen"
  | "errorTargetNotMember";

export interface SheetWriteFacts {
  callerId: number;
  callerRole: string;
  room: { hostId: number; frozen: boolean } | null;
  callerIsMember: boolean;
  targetId: number;
  targetIsMember: boolean;
}

/** The pure decision behind `resolveSheetWriter`. */
export function sheetWriteDenial(f: SheetWriteFacts): SheetWriteDenial | null {
  if (!f.room) return "errorRoomNotFound";
  const hostLevel = isRoomHostOrAdmin(f.room, { id: f.callerId, role: f.callerRole });
  // Admins may act in rooms they never joined; everyone else must be a member.
  if (!f.callerIsMember && f.callerRole !== "admin") return "errorNotMember";
  if (f.callerId !== f.targetId && !hostLevel) return "errorUnauthorizedResource";
  if (f.room.frozen && !hostLevel) return "errorRoomFrozen";
  if (!f.targetIsMember) return "errorTargetNotMember";
  return null;
}

export type SheetWriter =
  | {
      ok: true;
      callerId: number;
      /** Whether the caller acts with host-level rights (host or admin). */
      hostLevel: boolean;
      room: typeof rooms.$inferSelect;
      /** The target's stored `character_data` (raw column value). */
      targetSheet: string | null;
    }
  | { ok: false; key: SheetWriteDenial };

/** Resolve the session caller's right to write `targetUserId`'s sheet in `roomId`. */
export async function resolveSheetWriter(roomId: number, targetUserId: number): Promise<SheetWriter> {
  const session = await auth();
  if (!session) return { ok: false, key: "errorNotAuthenticated" };
  const callerId = parseInt(session.user.id);
  if (isNaN(callerId)) return { ok: false, key: "errorNotAuthenticated" };
  const callerRole = session.user.role;

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const memberRows = await db
    .select({ userId: roomMembers.userId, characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, [callerId, targetUserId])));
  const target = memberRows.find((m) => m.userId === targetUserId);

  const denial = sheetWriteDenial({
    callerId,
    callerRole,
    room: room ? { hostId: room.hostId, frozen: !!room.frozen } : null,
    callerIsMember: memberRows.some((m) => m.userId === callerId),
    targetId: targetUserId,
    targetIsMember: !!target,
  });
  if (denial || !room || !target) return { ok: false, key: denial ?? "errorTargetNotMember" };
  return {
    ok: true,
    callerId,
    hostLevel: isRoomHostOrAdmin(room, { id: callerId, role: callerRole }),
    room,
    targetSheet: target.characterData,
  };
}
