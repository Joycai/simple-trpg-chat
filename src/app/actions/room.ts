"use server";

import { db } from "@/db";
import { rooms, roomMembers, users, THEMES, THEME_MODES, RULE_TEMPLATES, type Theme, type RuleTemplate } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import crypto from "crypto";
import { broadcastToRoom } from "@/lib/server/events";
import { tryRoomAccess } from "@/lib/auth/room-access";
import { getTranslations } from "next-intl/server";
import { parseAvatarDataUrl, roomAvatarUrl } from "@/lib/media/avatars";
import { getRandomColorForUser } from "@/lib/ui/avatar-colors";
import { getRule, getRuleForRoom } from "@/lib/rules";
import { NICKNAME_MAX_LENGTH, ROOM_NAME_MAX_LENGTH } from "@/lib/room/limits";
import type { Done, Fail } from "@/lib/actions/result";
import { noRoomAccess } from "@/lib/actions/no-room-access";

// --- Room Actions ---

export async function createRoomAction(formData: FormData) {
  const t = await getTranslations("createRoom");
  const tRoom = await getTranslations("room");
  try {
    const session = await auth();
    if (!session || session.user.role !== "host") {
      return { success: false, error: t("errorHostOnly") };
    }

    const name = formData.get("name") as string;
    const customKey = formData.get("key") as string;
    const themeRaw = (formData.get("theme") as string) || "default";
    const ruleTemplateRaw = (formData.get("ruleTemplate") as string) || "basic";

    if (!THEMES.includes(themeRaw as Theme) || !RULE_TEMPLATES.includes(ruleTemplateRaw as RuleTemplate)) {
      return { success: false, error: tRoom("errorInvalidSettings") };
    }
    const theme = themeRaw as Theme;
    const ruleTemplate = ruleTemplateRaw as RuleTemplate;

    if (!name || !name.trim()) return { success: false, error: t("errorNameRequired") };
    if (name.trim().length > ROOM_NAME_MAX_LENGTH) {
      return { success: false, error: tRoom("errorInvalidRoomName", { max: ROOM_NAME_MAX_LENGTH }) };
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
    console.error("[createRoomAction]", err);
    return { success: false, error: (await getTranslations("common"))("error") };
  }
}

export async function joinRoomAction(formData: FormData) {
  const t = await getTranslations("lobby");
  try {
    const session = await auth();
    if (!session) return { success: false, error: t("errorNotAuthenticated") };

    const roomId = parseInt(formData.get("roomId") as string);
    const key = (formData.get("key") as string)?.trim();

    if (!roomId || !key) return { success: false, error: t("errorMissingRoomKey") };

    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room) return { success: false, error: t("errorRoomNotFound") };
    if (room.secretKey !== key) return { success: false, error: t("errorInvalidKey") };

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
    console.error("[joinRoomAction]", err);
    return { success: false, error: (await getTranslations("common"))("error") };
  }
}

// --- Nickname & Character Actions ---
// (Sheet writes live in actions/character.ts — the old updateCharacterDataAction
// here had no callers and accepted unbounded JSON, so it was removed.)

export async function updateNicknameAction(roomId: number, nickname: string): Promise<Done> {
  const access = await tryRoomAccess(roomId, false, { requireWritable: true });
  if (!access) return noRoomAccess();
  const { userId } = access;

  const trimmed = nickname.trim();
  if (!trimmed || trimmed.length > NICKNAME_MAX_LENGTH) {
    return { success: false, error: (await getTranslations("room"))("errorInvalidNickname", { max: NICKNAME_MAX_LENGTH }) };
  }

  await db.update(roomMembers)
    .set({ nickname: trimmed })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  // Member-level delta: clients patch their live player list in place —
  // no router.refresh() fan-out, no revalidatePath (the room page is fully
  // dynamic; the next real navigation re-renders regardless).
  broadcastToRoom(roomId, { type: "member_updated", userId, nickname: trimmed });
  return { success: true };
}

export async function updateRoomMemberColorAction(roomId: number, targetUserId: number, color: string): Promise<Done> {
  const session = await auth();
  if (!session) return noRoomAccess();

  const userId = parseInt(session.user.id);

  // 1. Get the room to check if the caller is the host
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return noRoomAccess();
  const isHost = room.hostId === userId;

  // Frozen rooms are read-only for non-hosts
  if (room.frozen && !isHost) return noRoomAccess();

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

  if (!allowed) return { success: false, error: (await getTranslations("room"))("errorColorNotAllowed") };

  // 3. Update the color in roomMembers
  await db.update(roomMembers)
    .set({ avatarColor: color })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)));

  // Member-level delta — see updateNicknameAction for the rationale.
  broadcastToRoom(roomId, { type: "member_updated", userId: targetUserId, avatarColor: color });
  return { success: true };
}

// --- Room Settings ---

export async function updateRoomSettingsAction(roomId: number, formData: FormData): Promise<Done> {
  if (!(await tryRoomAccess(roomId, true))) return noRoomAccess();

  const themeRaw = ((formData.get("theme") as string) || "default");
  const themeModeRaw = ((formData.get("themeMode") as string) || "auto");
  const ruleTemplateRaw = ((formData.get("ruleTemplate") as string) || "basic");

  // `timeline` is a room-only stored mode (light/dark follows inserted dividers)
  // on top of the user-selectable auto/light/dark.
  const storableModes: string[] = [...THEME_MODES, "timeline"];
  if (
    !THEMES.includes(themeRaw as Theme) ||
    !storableModes.includes(themeModeRaw) ||
    !RULE_TEMPLATES.includes(ruleTemplateRaw as RuleTemplate)
  ) {
    return { success: false, error: (await getTranslations("room"))("errorInvalidSettings") };
  }
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
  return { success: true };
}

export async function updateRoomNameAction(roomId: number, newName: string): Promise<Done> {
  if (!(await tryRoomAccess(roomId, true))) return noRoomAccess();

  const trimmed = newName.trim();
  if (!trimmed || trimmed.length > ROOM_NAME_MAX_LENGTH) {
    return { success: false, error: (await getTranslations("room"))("errorInvalidRoomName", { max: ROOM_NAME_MAX_LENGTH }) };
  }

  await db.update(rooms).set({ name: trimmed }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

/** Host-only: toggle a room between active and frozen (read-only for players). */
export async function setRoomFrozenAction(roomId: number, frozen: boolean): Promise<Done> {
  if (!(await tryRoomAccess(roomId, true))) return noRoomAccess();

  await db.update(rooms).set({ frozen }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

export async function regenerateRoomPasswordAction(roomId: number): Promise<{ success: true; secretKey: string } | Fail> {
  if (!(await tryRoomAccess(roomId, true))) return noRoomAccess();

  const newPassword = crypto.randomBytes(4).toString("hex");
  await db.update(rooms).set({ secretKey: newPassword }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
  return { success: true, secretKey: newPassword };
}

// --- Avatar Actions ---

export async function uploadAvatarAction(
  roomId: number,
  imageData: string
): Promise<Done> {
  // Validate membership + reject when the room is frozen (read-only for non-hosts)
  const access = await tryRoomAccess(roomId, false, { requireWritable: true });
  if (!access) return noRoomAccess();
  const { userId } = access;

  // Strict whitelist: only JPEG data URLs, capped size, real JPEG magic + dims ≤ 512.
  // The avatar cropper (shared ImageCropper) always emits ≤512 JPEG; anything else is rejected so SVG/
  // mislabelled payloads can't reach the DB or downstream <img> renders.
  const parsed = parseAvatarDataUrl(imageData);
  if (!parsed.ok) {
    const t = await getTranslations("room");
    const key =
      parsed.error === "too_large" ? "errorAvatarTooLarge" :
      parsed.error === "bad_dimensions" ? "errorAvatarDimensions" :
      "errorAvatarInvalid";
    return { success: false, error: t(key) };
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
