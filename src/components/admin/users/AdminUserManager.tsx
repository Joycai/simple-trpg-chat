"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Key, Search, Plus, CircleDollarSign } from "lucide-react";
import { deleteUser, toggleBanUser } from "@/app/admin/actions";
import { getRandomColorForUser, getContrastColor } from "@/lib/avatar-colors";
import { useRouter } from "next/navigation";
import { CreateUserModal } from "./CreateUserModal";
import { EditUserModal } from "./EditUserModal";
import { AiPointsModal } from "./AiPointsModal";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { LoginHistoryModal } from "./LoginHistoryModal";
import type { User, RoleFilter } from "./types";

interface AdminUserManagerProps {
  users: User[];
  lastLogins: Record<number, string>;
}

export function AdminUserManager({ users: allUsers, lastLogins }: AdminUserManagerProps) {
  const t = useTranslations("admin");
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  // Captured once on mount so relative-time formatting stays pure across re-renders.
  const [now] = useState(() => Date.now());

  // Which modal is open (by target user id / boolean).
  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [creditTarget, setCreditTarget] = useState<number | null>(null);
  const [historyUser, setHistoryUser] = useState<{ id: number; displayName: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);

  const counts = useMemo(() => ({
    all: allUsers.length,
    admin: allUsers.filter(u => u.role === "admin").length,
    host: allUsers.filter(u => u.role === "host").length,
    player: allUsers.filter(u => u.role === "player").length,
    banned: allUsers.filter(u => u.isBanned).length,
  }), [allUsers]);

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers.filter(u => {
      if (filter === "banned" ? !u.isBanned : filter !== "all" && u.role !== filter) return false;
      if (q && !u.username.toLowerCase().includes(q) && !u.displayName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allUsers, filter, search]);

  const formatRelative = (iso?: string) => {
    if (!iso) return t("loginNever");
    const then = new Date(iso).getTime();
    if (isNaN(then)) return t("loginNever");
    const diffMin = Math.floor((now - then) / 60000);
    if (diffMin < 1) return t("loginJustNow");
    if (diffMin < 60) return t("loginMinutesAgo", { count: diffMin });
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return t("loginHoursAgo", { count: diffHr });
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return t("loginYesterday");
    if (diffDay < 30) return t("loginDaysAgo", { count: diffDay });
    return iso.slice(0, 10);
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(t("deleteUserConfirm", { name: user.username }))) return;
    try {
      await deleteUser(user.id);
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggleBan = async (user: User) => {
    const msg = user.isBanned ? t("confirmUnban", { username: user.username }) : t("confirmBan", { username: user.username });
    if (!confirm(msg)) return;
    try {
      await toggleBanUser(user.id);
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : t("operationFailed"));
    }
  };

  // AI points display: ∞ for admins, tier-colored otherwise (depleted → dim, low → warning, healthy → ai)
  const pointsView = (user: User): { text: string; cls: string } => {
    if (user.role === "admin") return { text: "∞", cls: "text-text" };
    const p = user.aiPoints ?? 0;
    const text = p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (p <= 0) return { text: "0", cls: "text-text-dim" };
    if (p < 100) return { text, cls: "text-warning" };
    return { text, cls: "text-ai" };
  };

  const roleLabel = (role: string): string => {
    const known: Record<string, string> = { admin: t("roleAdmin"), host: t("roleHost"), player: t("rolePlayer") };
    return known[role] ?? role;
  };

  const roleBadgeCls = (role: string) =>
    role === "admin" ? "border-danger/30 bg-danger/10 text-danger"
    : role === "host" ? "border-success/30 bg-success/10 text-success"
    : "border-primary/30 bg-primary/10 text-primary";

  const filterTabs: { key: RoleFilter; label: string; count: number; danger?: boolean }[] = [
    { key: "all", label: t("filterAll"), count: counts.all },
    { key: "admin", label: t("roleAdmin"), count: counts.admin },
    { key: "host", label: t("roleHost"), count: counts.host },
    { key: "player", label: t("rolePlayer"), count: counts.player },
    { key: "banned", label: t("bannedBadge"), count: counts.banned, danger: true },
  ];

  const editUser = editTarget !== null ? allUsers.find(u => u.id === editTarget) : undefined;
  const creditUser = creditTarget !== null ? allUsers.find(u => u.id === creditTarget) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text font-theme-display">{t("userManagement")}</h1>
          <p className="text-sm text-text-muted mt-1">{t("userCount", { count: allUsers.length })}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("searchUser")}
              className="w-44 sm:w-64 pl-9 pr-3 py-2.5 bg-surface border border-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary"
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 bg-gradient-to-b from-primary to-primary/85 hover:brightness-110 text-primary-foreground px-4 py-2.5 rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)] shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t("createUser")}
          </button>
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
                active
                  ? tab.danger
                    ? "bg-danger/15 border-danger/50 text-danger"
                    : "bg-primary/15 border-primary/50 text-primary shadow-[var(--theme-glow)]"
                  : tab.danger
                    ? "border-danger/30 text-danger/80 hover:bg-danger/10"
                    : "border-border text-text-muted hover:text-text hover:bg-surface-alt"
              }`}
            >
              {tab.label} {tab.count}
            </button>
          );
        })}
        <button
          onClick={() => setShowChangePwd(true)}
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition cursor-pointer"
        >
          <Key className="w-3.5 h-3.5" />
          {t("changePassword")}
        </button>
      </div>

      {/* User table */}
      <div className="bg-surface theme-border border border-border rounded-theme shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-text-dim text-xs border-b border-border">
                <th className="px-5 py-3 font-medium">{t("username")}</th>
                <th className="px-5 py-3 font-medium">{t("role")}</th>
                <th className="px-5 py-3 font-medium">{t("status")}</th>
                <th className="px-5 py-3 font-medium">{t("aiPointsColumn")}</th>
                <th className="px-5 py-3 font-medium">{t("lastLogin")}</th>
                <th className="px-5 py-3 font-medium text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center text-text-dim text-sm">{t("noUsers")}</td></tr>
              ) : (
                visibleUsers.map(user => {
                  const color = getRandomColorForUser(user.id);
                  const isProtected = user.username === "admin";
                  const pv = pointsView(user);
                  return (
                    <tr key={user.id} className={`border-b border-border last:border-0 transition hover:bg-surface-alt/50 ${user.isBanned ? "opacity-60" : ""}`}>
                      {/* User */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                            style={{ backgroundColor: color, color: getContrastColor(color) }}
                          >
                            {user.displayName.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-text truncate">{user.displayName}</div>
                            <div className="text-xs text-text-dim font-theme-mono truncate">@{user.username}</div>
                          </div>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-theme text-xs font-bold border ${roleBadgeCls(user.role)}`}>
                          {roleLabel(user.role)}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${user.isBanned ? "text-danger" : "text-success"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.isBanned ? "bg-danger" : "bg-success"}`} />
                          {user.isBanned ? t("bannedBadge") : t("userStatusNormal")}
                        </span>
                      </td>
                      {/* AI points */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-sm font-medium font-theme-mono ${pv.cls}`}>
                          <CircleDollarSign className="w-4 h-4 opacity-80" />
                          {pv.text}
                        </span>
                      </td>
                      {/* Last login */}
                      <td className="px-5 py-3.5 text-sm text-text-muted">{formatRelative(lastLogins[user.id])}</td>
                      {/* Actions — 编辑/解封 · 点数 · 历史 */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {user.isBanned && !isProtected ? (
                            <button
                              onClick={() => handleToggleBan(user)}
                              className="px-3 py-1.5 rounded-theme text-xs font-medium bg-success/15 text-success hover:bg-success/25 transition cursor-pointer"
                            >
                              {t("unban")}
                            </button>
                          ) : (
                            <button
                              onClick={() => setEditTarget(user.id)}
                              className="px-3 py-1.5 rounded-theme text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 transition cursor-pointer"
                            >
                              {t("edit")}
                            </button>
                          )}
                          <button
                            onClick={() => setCreditTarget(user.id)}
                            className="px-3 py-1.5 rounded-theme text-xs font-medium bg-ai/20 text-ai hover:bg-ai/30 transition cursor-pointer"
                          >
                            {t("pointsShort")}
                          </button>
                          <button
                            onClick={() => setHistoryUser({ id: user.id, displayName: user.displayName })}
                            className="px-3 py-1.5 rounded-theme text-xs font-medium bg-border/50 text-text-muted hover:bg-border/80 hover:text-text transition cursor-pointer"
                          >
                            {t("historyShort")}
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

      {/* Modals */}
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditTarget(null)}
          onToggleBan={handleToggleBan}
          onDelete={handleDeleteUser}
        />
      )}
      {creditUser && <AiPointsModal user={creditUser} onClose={() => setCreditTarget(null)} />}
      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
      {historyUser && <LoginHistoryModal user={historyUser} onClose={() => setHistoryUser(null)} />}
    </div>
  );
}
