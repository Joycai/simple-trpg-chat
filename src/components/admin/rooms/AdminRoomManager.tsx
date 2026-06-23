"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { deleteRoom, adminSetRoomFrozen, adminSetRoomStatus } from "@/app/admin/actions";

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

type RoomState = "active" | "frozen" | "closed";
type RoomFilter = "all" | RoomState;

// Closed wins over frozen; a live room is "frozen" only while still active.
const roomState = (r: Room): RoomState =>
  r.status !== "active" ? "closed" : r.frozen ? "frozen" : "active";

export function AdminRoomManager({ rooms }: AdminRoomManagerProps) {
  const t = useTranslations("admin");
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoomFilter>("all");
  const [busy, setBusy] = useState<number | null>(null);

  const counts = useMemo(() => {
    const c = { all: rooms.length, active: 0, frozen: 0, closed: 0 };
    for (const r of rooms) c[roomState(r)]++;
    return c;
  }, [rooms]);

  const visibleRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter(r => {
      if (filter !== "all" && roomState(r) !== filter) return false;
      if (q && !r.name.toLowerCase().includes(q) && !String(r.id).includes(q.replace("#", ""))) return false;
      return true;
    });
  }, [rooms, filter, search]);

  const handleFreeze = async (room: Room) => {
    setBusy(room.id);
    try {
      await adminSetRoomFrozen(room.id, !room.frozen);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("operationFailed"));
    } finally {
      setBusy(null);
    }
  };

  const handleClose = async (room: Room) => {
    if (!confirm(t("confirmCloseRoom", { roomName: room.name }))) return;
    setBusy(room.id);
    try {
      await adminSetRoomStatus(room.id, "closed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("operationFailed"));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (room: Room) => {
    if (!confirm(t("confirmDeleteRoom", { roomName: room.name }))) return;
    setBusy(room.id);
    try {
      await deleteRoom(room.id);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("roomDeletionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const statusBadge: Record<RoomState, { label: string; cls: string; dot: string }> = {
    active: { label: t("statusActive"), cls: "text-success", dot: "bg-success" },
    frozen: { label: t("statusFrozen"), cls: "text-warning", dot: "bg-warning" },
    closed: { label: t("statusClosed"), cls: "text-text-dim", dot: "bg-text-dim" },
  };

  const filterTabs: { key: RoomFilter; label: string; count: number; tone: "primary" | "success" | "warning" | "muted" }[] = [
    { key: "all", label: t("filterAll"), count: counts.all, tone: "primary" },
    { key: "active", label: t("statusActive"), count: counts.active, tone: "success" },
    { key: "frozen", label: t("statusFrozen"), count: counts.frozen, tone: "warning" },
    { key: "closed", label: t("statusClosed"), count: counts.closed, tone: "muted" },
  ];

  const tabActive: Record<string, string> = {
    primary: "bg-primary/15 border-primary/50 text-primary shadow-[var(--theme-glow)]",
    success: "bg-success/15 border-success/50 text-success",
    warning: "bg-warning/15 border-warning/50 text-warning",
    muted: "bg-text-dim/15 border-text-dim/40 text-text-muted",
  };
  const tabIdle: Record<string, string> = {
    primary: "border-border text-text-muted hover:text-text hover:bg-surface-alt",
    success: "border-success/30 text-success/80 hover:bg-success/10",
    warning: "border-warning/30 text-warning/80 hover:bg-warning/10",
    muted: "border-border text-text-muted hover:text-text hover:bg-surface-alt",
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text font-theme-display">{t("roomManagement")}</h1>
          <p className="text-sm text-text-muted mt-1">{t("roomSummary", { total: counts.all, active: counts.active })}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("searchRoom")}
            className="w-52 sm:w-72 pl-9 pr-3 py-2.5 bg-surface border border-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary"
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterTabs.map(tab => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-theme text-sm font-medium border transition cursor-pointer ${
                active ? tabActive[tab.tone] : tabIdle[tab.tone]
              }`}
            >
              {tab.label} {tab.count}
            </button>
          );
        })}
      </div>

      {/* Room table */}
      <div className="bg-surface theme-border border border-border rounded-theme shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-text-dim text-xs border-b border-border">
                <th className="px-5 py-3 font-medium">{t("roomName")}</th>
                <th className="px-5 py-3 font-medium">{t("host")}</th>
                <th className="px-5 py-3 font-medium">{t("members")}</th>
                <th className="px-5 py-3 font-medium">{t("status")}</th>
                <th className="px-5 py-3 font-medium text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRooms.length === 0 ? (
                <tr><td colSpan={5} className="py-14 text-center text-text-dim text-sm">{t("noRooms")}</td></tr>
              ) : (
                visibleRooms.map(room => {
                  const state = roomState(room);
                  const badge = statusBadge[state];
                  const isClosed = state === "closed";
                  const disabled = busy === room.id;
                  return (
                    <tr key={room.id} className={`border-b border-border last:border-0 transition hover:bg-surface-alt/50 ${isClosed ? "opacity-60" : ""}`}>
                      {/* Room */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Link href={`/rooms/${room.id}`} target="_blank" className="text-sm font-bold text-text hover:text-primary transition truncate">
                            {room.name}
                          </Link>
                          <span className="text-xs text-text-dim font-theme-mono shrink-0">#{room.id}</span>
                        </div>
                      </td>
                      {/* Host */}
                      <td className="px-5 py-3.5 text-sm text-text-muted">{room.hostName || `#${room.hostId}`}</td>
                      {/* Members */}
                      <td className="px-5 py-3.5 text-sm text-text-muted font-theme-mono">{room.memberCount}</td>
                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${badge.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {!isClosed && (
                            <button
                              onClick={() => handleFreeze(room)}
                              disabled={disabled}
                              className={`px-3 py-1.5 rounded-theme text-xs font-medium border transition cursor-pointer disabled:opacity-50 ${
                                room.frozen
                                  ? "border-success/40 text-success hover:bg-success/10"
                                  : "border-warning/40 text-warning hover:bg-warning/10"
                              }`}
                            >
                              {room.frozen ? t("unfreeze") : t("freeze")}
                            </button>
                          )}
                          {!isClosed && (
                            <button
                              onClick={() => handleClose(room)}
                              disabled={disabled}
                              className="px-3 py-1.5 rounded-theme text-xs font-medium border border-border text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer disabled:opacity-50"
                            >
                              {t("close")}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(room)}
                            disabled={disabled}
                            className="px-3 py-1.5 rounded-theme text-xs font-medium border border-danger/40 text-danger hover:bg-danger/10 transition cursor-pointer disabled:opacity-50"
                          >
                            {t("delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
