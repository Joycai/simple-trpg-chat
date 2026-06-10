import { auth } from "@/auth";
import { db } from "@/db";
import { rooms, roomMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LobbyClient } from "@/components/LobbyClient";
import { Dices } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { UserDropdown } from "@/components/UserDropdown";

export default async function HomePage() {
  const t = await getTranslations("nav");
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as any;
  const userId = parseInt(user.id);
  if (isNaN(userId)) redirect("/login");
  const isHost = user.role === "host";
  const isAdmin = user.role === "admin";

  // Get all active rooms
  const allRooms = await db
    .select()
    .from(rooms)
    .where(eq(rooms.status, "active"))
    .orderBy(rooms.createdAt);

  // Get user's joined room memberships
  const memberships = await db
    .select()
    .from(roomMembers)
    .where(eq(roomMembers.userId, userId));

  const joinedRoomIds = new Set(memberships.map((m) => m.roomId));

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      {/* Header */}
      <header className="bg-header-bg border-b border-header-border p-4 text-text shadow-sm overflow-visible">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold inline-flex items-center gap-1.5"><Dices className="w-5 h-5" /> Simple TRPG Chat</h1>
            {isAdmin && (
              <Link href="/admin" className="text-xs bg-danger/20 text-danger border border-danger/30 px-2 py-1 rounded hover:bg-danger/30 transition">
                {t("admin")}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-4">
            <ThemeSwitcher />
            <div className="h-4 w-px bg-border mx-2 hidden sm:block" />
            <UserDropdown
              userName={user.name || user.username}
              userRole={user.role}
              roleLabel={isAdmin ? "Admin" : isHost ? "Host" : "Player"}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <LobbyClient
            rooms={allRooms as any[]}
            joinedRoomIds={joinedRoomIds}
            isHost={isHost}
            userId={userId}
          />
        </div>
      </main>
    </div>
  );
}
