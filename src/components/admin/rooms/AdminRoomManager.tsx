"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteRoom } from "@/app/admin/actions";

interface Room {
  id: number;
  name: string;
  status: string;
  frozen: boolean;
  createdAt: string;
  hostId: number;
  hostName: string | null;
  memberCount: number;
}

interface AdminRoomManagerProps {
  rooms: Room[];
}

export function AdminRoomManager({ rooms }: AdminRoomManagerProps) {
  const t = useTranslations("admin");
  const router = useRouter();

  const handleDelete = async (id: number, name: string) => {
    if (confirm(t("confirmDeleteRoom", { roomName: name }))) {
      try {
        await deleteRoom(id);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : t("roomDeletionFailed"));
      }
    }
  };

  return (
    <section className="bg-surface p-5 rounded-xl border border-border shadow-lg">
      {rooms.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">{t("noRooms")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">{t("roomName")}</th>
                <th className="py-2 pr-3 font-medium">{t("host")}</th>
                <th className="py-2 pr-3 font-medium">{t("members")}</th>
                <th className="py-2 pr-3 font-medium">{t("status")}</th>
                <th className="py-2 pr-3 font-medium">{t("createdAt")}</th>
                <th className="py-2 pr-3 font-medium text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id} className="border-b border-border/50 hover:bg-surface-alt/50 transition">
                  <td className="py-2.5 pr-3 font-mono text-text-dim">#{room.id}</td>
                  <td className="py-2.5 pr-3 font-medium text-text">
                    <Link href={`/rooms/${room.id}`} target="_blank" className="hover:text-primary transition">{room.name}</Link>
                  </td>
                  <td className="py-2.5 pr-3 text-text-muted">{room.hostName || `#${room.hostId}`}</td>
                  <td className="py-2.5 pr-3 text-text-muted">{room.memberCount}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      room.frozen ? "bg-accent/10 text-accent" : room.status === "active" ? "bg-success/10 text-success" : "bg-text-dim/10 text-text-dim"
                    }`}>
                      {room.frozen ? t("statusFrozen") : room.status === "active" ? t("statusActive") : t("statusClosed")}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-text-dim font-mono text-xs">{room.createdAt?.slice(0, 10)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <button
                      onClick={() => handleDelete(room.id, room.name)}
                      className="inline-flex items-center gap-1 text-danger/70 hover:text-danger text-xs transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {t("delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
