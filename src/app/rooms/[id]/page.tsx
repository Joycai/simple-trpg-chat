import { auth } from "@/auth";
import { db } from "@/db";
import { rooms, roomMembers, messages, users, systemConfig, aiProviders } from "@/db/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { messageVisibilityWhere } from "@/lib/messaging/router";
import { redirect } from "next/navigation";
import { RoomClient } from "@/components/room/RoomClient";
import { RoomThemeSetter } from "@/components/theme/RoomThemeSetter";
import { parseTimelinePayload, resolvedModeFromDivider } from "@/lib/messaging/timeline-payload";
import type { ThemeId, StoredThemeMode, ResolvedMode } from "@/themes/types";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getRandomColorForUser } from "@/lib/avatar-colors";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("room");
  const { id } = await params;
  const roomId = parseInt(id);

  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user;
  const userId = parseInt(user.id);

  // Get room
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-bg">
        <h1 className="text-2xl font-bold text-text-muted">{t("notFound")}</h1>
        <Link href="/" className="text-primary hover:underline">
          {t("backToLobby")}
        </Link>
      </div>
    );
  }

  const isHost = room.hostId === userId;
  const isAdmin = user.role === "admin";

  // 1. Get all room members (for player list)
  let members;
  try {
    members = await db
      .select({
        room_members: {
          id: roomMembers.id,
          roomId: roomMembers.roomId,
          userId: roomMembers.userId,
          nickname: roomMembers.nickname,
          joinedAt: roomMembers.joinedAt,
          characterData: roomMembers.characterData,
          avatarColor: roomMembers.avatarColor,
          avatar: roomMembers.avatar,
        },
        users: users,
      })
      .from(roomMembers)
      .innerJoin(users, eq(roomMembers.userId, users.id))
      .where(eq(roomMembers.roomId, roomId));
  } catch {
    // Fallback if avatar column doesn't exist yet
    members = await db
      .select()
      .from(roomMembers)
      .innerJoin(users, eq(roomMembers.userId, users.id))
      .where(eq(roomMembers.roomId, roomId));
  }

  // 2. Check if user is a member (lookup in memory first to save DB query)
  let currentMemberJoint = members.find(m => m.room_members.userId === userId);
  let currentMember = currentMemberJoint?.room_members || null;

  if (!currentMember && isHost) {
    // Auto-join the host if they weren't added as member
    await db.insert(roomMembers).values({
      roomId,
      userId,
      nickname: user.name || user.username || "Host",
      avatarColor: getRandomColorForUser(userId),
    });
    
    // Re-fetch members to include the host
    members = await db
      .select()
      .from(roomMembers)
      .innerJoin(users, eq(roomMembers.userId, users.id))
      .where(eq(roomMembers.roomId, roomId));
    currentMemberJoint = members.find(m => m.room_members.userId === userId);
    currentMember = currentMemberJoint?.room_members || null;
  } else if (!currentMember && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-bg">
        <h1 className="text-2xl font-bold text-text-muted">{t("notJoined")}</h1>
        <Link href="/" className="text-primary hover:underline">
          {t("backToJoin")}
        </Link>
      </div>
    );
  }

  // Admin viewing a room they haven't joined: silent observer mode.
  // No member row is created — read-only, not shown in the player list.
  // Matches the SSE endpoint, where checkRoomAccess already lets admins through.
  const isObserver = !currentMember;

  const currentNickname = currentMember?.nickname || user.name || user.username || "Player";

  // Get visible messages: SQL-level visibility filter (R8) — see messaging/router.
  // Admins get host-level visibility (consistent with SSE, where checkRoomAccess
  // returns isHost: true for admins).
  const visibilityCondition = messageVisibilityWhere(roomId, userId, isHost || isAdmin);

  // 3. Parallelized queries (P9)
  const [roomMessages, [aiConfig], [hostUser], roomProviders] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(visibilityCondition)
      .orderBy(desc(messages.id))
      .limit(100),
    db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "ai_enabled")),
    db
      .select({ role: users.role, aiPoints: users.aiPoints })
      .from(users)
      .where(eq(users.id, room.hostId))
      .limit(1),
    db
      .select({ id: aiProviders.id, isShared: aiProviders.isShared })
      .from(aiProviders)
      .where(
        or(
          eq(aiProviders.ownerId, room.hostId),
          eq(aiProviders.isShared, true)
        )
      )
  ]);

  const visibleMessages = roomMessages.reverse();
  const aiEnabled = aiConfig?.value === "true";
  const isHostQuotaOk = !hostUser || hostUser.role === "admin" || Number(hostUser.aiPoints || 0) > 0;
  
  const validProviderIds = roomProviders
    .filter(p => !p.isShared || isHostQuotaOk)
    .map(p => p.id);

  // "Follow timeline" mode: resolve the concrete light/dark from the room's most
  // recent timeline divider so the very first paint is right even when that
  // divider predates the loaded message window.
  const storedMode = (room.themeMode as StoredThemeMode) || "auto";
  const followsTimeline = storedMode === "timeline";
  let initialTimelineMode: ResolvedMode = "light";
  if (followsTimeline) {
    const [lastDivider] = await db
      .select({ diceDetail: messages.diceDetail })
      .from(messages)
      .where(and(eq(messages.roomId, roomId), eq(messages.systemKind, "timeline-divider")))
      .orderBy(desc(messages.id))
      .limit(1);
    if (lastDivider) {
      initialTimelineMode = resolvedModeFromDivider(parseTimelinePayload(lastDivider.diceDetail)) ?? "light";
    }
  }
  return (
    <>
      <RoomThemeSetter roomId={roomId} theme={(room.theme as ThemeId) || "default"} />
      <RoomClient
        room={room as Parameters<typeof RoomClient>[0]["room"]}
        players={members}
        messages={visibleMessages as Parameters<typeof RoomClient>[0]["messages"]}
        userId={userId}
        isHost={isHost}
        currentNickname={currentNickname}
        characterData={currentMember?.characterData || null}
        roomTheme={(room.theme as ThemeId) || "default"}
        roomThemeMode={storedMode}
        initialTimelineMode={initialTimelineMode}
        aiEnabled={aiEnabled}
        validProviderIds={validProviderIds}
        userName={user.name || user.username}
        userRole={user.role}
        isObserver={isObserver}
      />
    </>
  );
}
