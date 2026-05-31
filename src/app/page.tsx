import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { rooms, roomMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LobbyClient } from "@/components/LobbyClient";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { AiSettingsButton } from "@/components/AiSettingsButton";

export default async function HomePage() {
  const t = await getTranslations("nav");
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as any;
  const userId = parseInt(user.id);
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
      <header className="bg-header-bg border-b border-header-border p-4 text-text shadow-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">🎲 Simple TRPG Chat</h1>
            {isAdmin && (
              <Link href="/admin" className="text-xs bg-danger/20 text-danger border border-danger/30 px-2 py-1 rounded hover:bg-danger/30 transition">
                {t("admin")}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-4">
            <ThemeSwitcher />
            {isHost && <AiSettingsButton />}
            <div className="h-4 w-px bg-border mx-2 hidden sm:block" />
            <span className="text-sm text-text-muted">
              {user.name || user.username}
              <span
                className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isAdmin ? "bg-danger/20 text-danger" : isHost ? "bg-success/20 text-success" : "bg-primary/20 text-primary"
                }`}
              >
                {user.role}
              </span>
            </span>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button className="text-sm text-text-muted hover:text-text hover:underline transition">
                {t("logout")}
              </button>
            </form>
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
