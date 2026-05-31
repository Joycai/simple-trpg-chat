import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { rooms, roomMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LobbyClient } from "@/components/LobbyClient";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

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
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-slate-800 text-white p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">🎲 Simple TRPG Chat</h1>
            {isAdmin && (
              <Link href="/admin" className="text-xs bg-red-600 px-2 py-1 rounded hover:bg-red-700">
                {t("admin")}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-4">
            <ThemeSwitcher />
            <span className="text-sm text-gray-300">
              {user.name || user.username}
              <span
                className={`ml-2 px-2 py-0.5 rounded text-xs font-bold uppercase ${
                  isAdmin ? "bg-red-500" : isHost ? "bg-green-500" : "bg-blue-500"
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
              <button className="text-sm text-gray-400 hover:text-white hover:underline transition">
                {t("logout")}
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 bg-bg p-8">
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
