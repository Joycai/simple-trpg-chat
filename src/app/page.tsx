import { auth } from "@/auth";
import { db } from "@/db";
import { rooms, roomMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { getCachedSiteTitle } from "@/lib/config";
import { APP_VERSION } from "@/lib/version";
import { LobbyClient } from "@/components/lobby/LobbyClient";
import { Dices } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { ThemeModeSwitcher } from "@/components/theme/ThemeModeSwitcher";
import { UserDropdown } from "@/components/lobby/UserDropdown";

export default async function HomePage() {
  const t = await getTranslations("nav");
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user;
  const userId = parseInt(user.id) || 0;
  const isHost = user.role === "host";
  const isAdmin = user.role === "admin";

  // Get site title
  const siteTitle = await getCachedSiteTitle();

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
      <header className="bg-header-bg border-b border-header-border px-4 py-3 text-text shadow-sm overflow-visible">
        <div className="max-w-6xl mx-auto flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl font-bold inline-flex items-center gap-1.5 min-w-0">
              <Dices className="w-5 h-5 shrink-0" />
              <span className="truncate">{siteTitle}</span>
            </h1>
            {isAdmin && (
              <Link href="/admin" className="shrink-0 text-xs bg-danger/20 text-danger border border-danger/30 px-2 py-1 rounded hover:bg-danger/30 transition">
                {t("admin")}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <ThemeModeSwitcher />
            <ThemeSwitcher />
            <UserDropdown
              userName={user.name || user.username}
              userRole={user.role}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <LobbyClient
            rooms={allRooms}
            joinedRoomIds={joinedRoomIds}
            isHost={isHost}
            userId={userId}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 px-4 text-center text-[11px] text-text-dim border-t border-border">
        <a
          href="https://github.com/Joycai/simple-trpg-chat"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {siteTitle}
        </a>
        <span className="mx-1.5 text-text-dim/50">·</span>
        <span>v{APP_VERSION}</span>
      </footer>
    </div>
  );
}
