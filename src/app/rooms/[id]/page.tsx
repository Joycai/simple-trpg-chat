import { auth } from "@/auth";
import { db } from "@/db";
import { rooms, roomMembers, messages, users, systemConfig, aiProviders } from "@/db/schema";
import { eq, and, or, desc, isNull, not } from "drizzle-orm";
import { redirect } from "next/navigation";
import { RoomClient } from "@/components/RoomClient";
import { RoomThemeSetter } from "@/components/RoomThemeSetter";
import type { ThemeId } from "@/themes/types";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getRandomColorForUser } from "@/lib/avatar-colors";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("room");
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
        <h1 className="text-2xl font-bold text-text-muted">{t("notFound")}</h1>
        <Link href="/" className="text-primary hover:underline">
          {t("backToLobby")}
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

  if (!member && isHost) {
    // Auto-join the host if they weren't added as member
    await db.insert(roomMembers).values({
      roomId,
      userId,
      nickname: user.name || user.username || "Host",
      avatarColor: getRandomColorForUser(userId),
    });
  } else if (!member) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-bg">
        <h1 className="text-2xl font-bold text-text-muted">{t("notJoined")}</h1>
        <Link href="/" className="text-primary hover:underline">
          {t("backToJoin")}
        </Link>
      </div>
    );
  }

  // Get updated member info
  const [currentMember] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  const currentNickname = currentMember?.nickname || user.name || user.username || "Player";

  // Get visible messages: SQL-level visibility filter (R8)
  const visibilityCondition = isHost
    ? and(
        eq(messages.roomId, roomId),
        or(
          not(eq(messages.isPrivate, true)),
          not(eq(messages.type, "system")),
          isNull(messages.targetUserId),
          eq(messages.targetUserId, userId)
        )
      )
    : and(
        eq(messages.roomId, roomId),
        or(
          eq(messages.isPrivate, false),
          eq(messages.targetUserId, userId),
          and(
            eq(messages.userId, userId),
            not(eq(messages.type, "system"))
          )
        )
      );

  // Load latest 100 messages initially (R8)
  const roomMessages = await db
    .select()
    .from(messages)
    .where(visibilityCondition)
    .orderBy(desc(messages.id))
    .limit(100);

  const visibleMessages = roomMessages.reverse();

  // Load global AI enabled toggle
  const [aiConfig] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, "ai_enabled"));
  const aiEnabled = aiConfig?.value === "true";

  // Load room host user info to verify credits
  const [hostUser] = await db
    .select({ role: users.role, aiPoints: users.aiPoints })
    .from(users)
    .where(eq(users.id, room.hostId))
    .limit(1);

  const isHostQuotaOk = !hostUser || hostUser.role === "admin" || Number(hostUser.aiPoints || 0) > 0;

  // Load valid providers for this room (either owned by the room's host or isShared is true and host has quota)
  const roomProviders = await db
    .select({ id: aiProviders.id, isShared: aiProviders.isShared })
    .from(aiProviders)
    .where(
      or(
        eq(aiProviders.ownerId, room.hostId),
        eq(aiProviders.isShared, true)
      )
    );
  
  const validProviderIds = roomProviders
    .filter(p => !p.isShared || isHostQuotaOk)
    .map(p => p.id);

  return (
    <>
      <RoomThemeSetter roomId={roomId} theme={(room.theme as ThemeId) || "default"} />
      <RoomClient
        room={room as any}
        players={members as any[]}
        messages={visibleMessages as any[]}
        userId={userId}
        isHost={isHost}
        currentNickname={currentNickname}
        characterData={currentMember?.characterData || null}
        roomTheme={(room.theme as ThemeId) || "default"}
        roomDiceRules={(room as any).diceRules || "basic"}
        aiEnabled={aiEnabled}
        validProviderIds={validProviderIds}
      />
    </>
  );
}
