"use server";

import { db } from "@/db";
import { rooms, roomMembers, users, THEMES, THEME_MODES, RULE_TEMPLATES, type Theme, type RuleTemplate } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import crypto from "crypto";
import { broadcastToRoom } from "@/lib/server/events";
import { checkRoomAccess } from "@/lib/auth/room-access";
import { parseAvatarDataUrl, roomAvatarUrl } from "@/lib/media/avatars";
import { getRandomColorForUser } from "@/lib/ui/avatar-colors";
import { getRule, getRuleForRoom } from "@/lib/rules";
import { NICKNAME_MAX_LENGTH, ROOM_NAME_MAX_LENGTH } from "@/lib/room/limits";

// --- Room Actions ---

export async function createRoomAction(formData: FormData) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "host") {
      return { success: false, error: "Only hosts can create rooms" };
    }

    const name = formData.get("name") as string;
    const customKey = formData.get("key") as string;
    const themeRaw = (formData.get("theme") as string) || "default";
    const ruleTemplateRaw = (formData.get("ruleTemplate") as string) || "basic";

    if (!THEMES.includes(themeRaw as Theme)) return { success: false, error: "Invalid theme" };
    if (!RULE_TEMPLATES.includes(ruleTemplateRaw as RuleTemplate)) return { success: false, error: "Invalid ruleTemplate" };
    const theme = themeRaw as Theme;
    const ruleTemplate = ruleTemplateRaw as RuleTemplate;

    if (!name || !name.trim()) return { success: false, error: "Room name is required" };
    if (name.trim().length > ROOM_NAME_MAX_LENGTH) {
      return { success: false, error: `Room name must be between 1 and ${ROOM_NAME_MAX_LENGTH} characters` };
    }

    // Use custom key if provided, otherwise generate one
    const secretKey = (customKey && customKey.trim())
      ? customKey.trim()
      : crypto.randomBytes(4).toString("hex");

    const [newRoom] = await db.insert(rooms).values({
      name: name.trim(),
      hostId: parseInt(session.user.id),
      secretKey,
      theme,
      ruleTemplate,
    }).returning();

    // Host automatically joins, with a sheet already shaped by the room's rule.
    await db.insert(roomMembers).values({
      roomId: newRoom.id,
      userId: parseInt(session.user.id),
      nickname: session.user.name || "Host",
      avatarColor: getRandomColorForUser(parseInt(session.user.id)),
      characterData: JSON.stringify(getRule(ruleTemplate).initCharacter()),
    });

    revalidatePath("/");
    return { success: true, roomId: newRoom.id, secretKey };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An error occurred" };
  }
}

export async function joinRoomAction(formData: FormData) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Not authenticated" };

    const roomId = parseInt(formData.get("roomId") as string);
    const key = (formData.get("key") as string)?.trim();

    if (!roomId || !key) return { success: false, error: "Room ID and key are required" };

    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room) return { success: false, error: "Room not found" };
    if (room.secretKey !== key) return { success: false, error: "Invalid key" };

    const userId = parseInt(session.user.id);

    const [existing] = await db
      .select()
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

    if (!existing) {
      await db.insert(roomMembers).values({
        roomId,
        userId,
        nickname: session.user.name || "Player",
        avatarColor: getRandomColorForUser(userId),
        // Seed the sheet for the room's rule up front, so the player never
        // lands on an empty card (and .st writes have something to land on).
        characterData: JSON.stringify(getRuleForRoom(room).initCharacter()),
      });
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An error occurred" };
  }
}

// --- Nickname & Character Actions ---
// (Sheet writes live in actions/character.ts — the old updateCharacterDataAction
// here had no callers and accepted unbounded JSON, so it was removed.)

export async function updateNicknameAction(roomId: number, nickname: string) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });

  const trimmed = nickname.trim();
  if (!trimmed || trimmed.length > NICKNAME_MAX_LENGTH) {
    throw new Error(`Invalid nickname (must be between 1 and ${NICKNAME_MAX_LENGTH} characters)`);
  }

  await db.update(roomMembers)
    .set({ nickname: trimmed })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  // Member-level delta: clients patch their live player list in place —
  // no router.refresh() fan-out, no revalidatePath (the room page is fully
  // dynamic; the next real navigation re-renders regardless).
  broadcastToRoom(roomId, { type: "member_updated", userId, nickname: trimmed });
}

export async function updateRoomMemberColorAction(roomId: number, targetUserId: number, color: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt(session.user.id);

  // 1. Get the room to check if the caller is the host
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) throw new Error("Room not found");
  const isHost = room.hostId === userId;

  // Frozen rooms are read-only for non-hosts
  if (room.frozen && !isHost) throw new Error("Room is frozen (read-only)");

  // 2. Determine if allowed
  let allowed = false;
  if (targetUserId === userId) {
    allowed = true; // Allowed to edit own color
  } else if (isHost) {
    // Host can edit bot colors — verify target is a bot and belongs to this room
    const [targetUser] = await db.select({ isBot: users.isBot }).from(users).where(eq(users.id, targetUserId));
    if (targetUser && targetUser.isBot) {
      const [botInRoom] = await db.select({ id: roomMembers.id })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)));
      if (botInRoom) allowed = true;
    }
  }

  if (!allowed) throw new Error("Unauthorized to change this user's color");

  // 3. Update the color in roomMembers
  await db.update(roomMembers)
    .set({ avatarColor: color })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)));

  // Member-level delta — see updateNicknameAction for the rationale.
  broadcastToRoom(roomId, { type: "member_updated", userId: targetUserId, avatarColor: color });
}

// --- Room Settings ---

export async function updateRoomSettingsAction(roomId: number, formData: FormData) {
  await checkRoomAccess(roomId, true);

  const themeRaw = ((formData.get("theme") as string) || "default");
  const themeModeRaw = ((formData.get("themeMode") as string) || "auto");
  const ruleTemplateRaw = ((formData.get("ruleTemplate") as string) || "basic");

  // `timeline` is a room-only stored mode (light/dark follows inserted dividers)
  // on top of the user-selectable auto/light/dark.
  const storableModes: string[] = [...THEME_MODES, "timeline"];
  if (!THEMES.includes(themeRaw as Theme)) throw new Error("Invalid theme");
  if (!storableModes.includes(themeModeRaw)) throw new Error("Invalid themeMode");
  if (!RULE_TEMPLATES.includes(ruleTemplateRaw as RuleTemplate)) throw new Error("Invalid ruleTemplate");
  const theme = themeRaw as Theme;
  const themeMode = themeModeRaw;
  const ruleTemplate = ruleTemplateRaw as RuleTemplate;

  await db.update(rooms).set({ theme, themeMode, ruleTemplate }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
    theme,
    themeMode,
    ruleTemplate,
  });

  revalidatePath(`/rooms/${roomId}`);
}

export async function updateRoomNameAction(roomId: number, newName: string) {
  await checkRoomAccess(roomId, true);

  const trimmed = newName.trim();
  if (!trimmed || trimmed.length > ROOM_NAME_MAX_LENGTH) {
    throw new Error(`Room name must be between 1 and ${ROOM_NAME_MAX_LENGTH} characters`);
  }

  await db.update(rooms).set({ name: trimmed }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
}

/** Host-only: toggle a room between active and frozen (read-only for players). */
export async function setRoomFrozenAction(roomId: number, frozen: boolean) {
  await checkRoomAccess(roomId, true);

  await db.update(rooms).set({ frozen }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
}

export async function regenerateRoomPasswordAction(roomId: number) {
  await checkRoomAccess(roomId, true);

  const newPassword = crypto.randomBytes(4).toString("hex");
  await db.update(rooms).set({ secretKey: newPassword }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
  return { secretKey: newPassword };
}

// --- Avatar Actions ---

export async function uploadAvatarAction(
  roomId: number,
  imageData: string
) {
  // Validate membership + reject when the room is frozen (read-only for non-hosts)
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });

  // Strict whitelist: only JPEG data URLs, capped size, real JPEG magic + dims ≤ 512.
  // The avatar cropper (shared ImageCropper) always emits ≤512 JPEG; anything else is rejected so SVG/
  // mislabelled payloads can't reach the DB or downstream <img> renders.
  const parsed = parseAvatarDataUrl(imageData);
  if (!parsed.ok) {
    const msg =
      parsed.error === "too_large" ? "Image is too large" :
      parsed.error === "bad_dimensions" ? "Avatar must be 512x512 or smaller" :
      "Invalid image data";
    throw new Error(msg);
  }

  // Update the avatar in the database
  await db.update(roomMembers)
    .set({ avatar: imageData })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  // Member-level delta carrying the new reference URL (fresh `v` hash busts
  // the immutable cache) — this event used to trigger a router.refresh() on
  // every client, re-shipping all members' avatars and sheets for one upload.
  broadcastToRoom(roomId, {
    type: "member_updated",
    userId,
    avatar: roomAvatarUrl(roomId, userId, imageData),
  });
  return { success: true };
}
