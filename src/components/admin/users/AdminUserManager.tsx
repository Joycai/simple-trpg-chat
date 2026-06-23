"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Key, History, Search, Plus, Trash2, X, ShieldCheck, CircleDollarSign, Pencil } from "lucide-react";
import { createUser, deleteUser, resetPassword, changeOwnPassword, toggleBanUser, updateUserAiPoints, updateUser } from "@/app/admin/actions";
import { getUserLoginHistory } from "@/app/actions/login-history";
import { UserLoginHistory } from "@/components/user/UserLoginHistory";
import { getRandomColorForUser, getContrastColor } from "@/lib/avatar-colors";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  username: string;
  displayName: string;
  role: string;
  isBanned: boolean;
  aiPoints: number;
  createdAt: string;
}

type PointsMode = "add" | "subtract" | "set";

interface AdminUserManagerProps {
  users: User[];
  lastLogins: Record<number, string>;
}

type RoleFilter = "all" | "admin" | "host" | "player" | "banned";

export function AdminUserManager({ users: allUsers, lastLogins }: AdminUserManagerProps) {
  const t = useTranslations("admin");
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  // Captured once on mount so relative-time formatting stays pure across re-renders.
  const [now] = useState(() => Date.now());

  // Per-user edit dialog (profile + reset password / ban / delete)
  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("player");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [editStatus, setEditStatus] = useState<"" | "success" | "error">("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetStatus, setResetStatus] = useState<"" | "success" | "error">("");

  // AI points dialog (add / subtract / set + optional note)
  const [creditTarget, setCreditTarget] = useState<number | null>(null);
  const [creditMode, setCreditMode] = useState<PointsMode>("add");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [creditMsg, setCreditMsg] = useState("");
  const [creditStatus, setCreditStatus] = useState<"" | "success" | "error">("");

  // Create user modal
  const [showCreate, setShowCreate] = useState(false);

  // Change own password
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdStatus, setPwdStatus] = useState<"" | "success" | "error">("");

  // Login history
  const [historyUser, setHistoryUser] = useState<{ id: number; username: string; displayName: string } | null>(null);
  const [historyRecords, setHistoryRecords] = useState<Awaited<ReturnType<typeof getUserLoginHistory>>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  // Resolve the final balance from the chosen mode + entered amount.
  const finalPoints = (current: number, mode: PointsMode, amount: number) =>
    mode === "set" ? Math.max(0, amount)
    : mode === "subtract" ? Math.max(0, current - amount)
    : current + amount;

  const openCredit = (user: User) => {
    setCreditTarget(user.id);
    setCreditMode("add");
    setCreditAmount("");
    setCreditNote("");
    setCreditMsg("");
    setCreditStatus("");
  };

  const handleUpdateCredits = async () => {
    if (creditTarget === null) return;
    const cu = allUsers.find(u => u.id === creditTarget);
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount < 0) {
      setCreditMsg(t("pointsRequireAmount"));
      setCreditStatus("error");
      return;
    }
    const final = finalPoints(Number(cu?.aiPoints ?? 0), creditMode, amount);
    try {
      await updateUserAiPoints(creditTarget, final, creditNote.trim() || undefined);
      setCreditTarget(null);
      setCreditAmount("");
      setCreditNote("");
      router.refresh();
    } catch (e: unknown) {
      setCreditMsg(e instanceof Error ? e.message : t("pointsUpdateFail"));
      setCreditStatus("error");
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (!confirm(t("deleteUserConfirm", { name: username }))) return;
    try {
      await deleteUser(id);
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const openHistory = async (user: User) => {
    setHistoryUser({ id: user.id, username: user.username, displayName: user.displayName });
    setLoadingHistory(true);
    try {
      setHistoryRecords(await getUserLoginHistory(user.id));
    } catch {
      setHistoryRecords([]);
    }
    setLoadingHistory(false);
  };

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) return;
    if (newPwd.length < 3) { setPwdMsg(t("passwordTooShort")); setPwdStatus("error"); return; }
    try {
      await changeOwnPassword(oldPwd, newPwd);
      setPwdMsg(t("passwordResetOk"));
      setPwdStatus("success");
      setOldPwd(""); setNewPwd("");
    } catch (e: unknown) {
      setPwdMsg(e instanceof Error ? e.message : t("passwordResetFail"));
      setPwdStatus("error");
    }
  };

  const handleResetPassword = async () => {
    if (!editTarget || !newPassword.trim()) return;
    if (newPassword.length < 3) { setResetMsg(t("passwordTooShort")); setResetStatus("error"); return; }
    try {
      await resetPassword(editTarget, newPassword.trim());
      setResetMsg(t("passwordResetOk"));
      setResetStatus("success");
      setNewPassword("");
      router.refresh();
    } catch {
      setResetMsg(t("passwordResetFail"));
      setResetStatus("error");
    }
  };

  const openEdit = (user: User) => {
    setEditTarget(user.id);
    setEditName(user.displayName);
    setEditRole(user.role);
    setEditMsg("");
    setEditStatus("");
    setNewPassword("");
    setResetMsg("");
    setResetStatus("");
  };

  const handleSaveProfile = async () => {
    if (editTarget === null || !editName.trim()) return;
    setSavingEdit(true);
    setEditMsg("");
    setEditStatus("");
    try {
      await updateUser(editTarget, editName.trim(), editRole);
      setEditTarget(null);
      router.refresh();
    } catch (e: unknown) {
      setEditMsg(e instanceof Error ? e.message : t("operationFailed"));
      setEditStatus("error");
    } finally {
      setSavingEdit(false);
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

  const handleToggleBan = async (userId: number, username: string, isBanned: boolean) => {
    const msg = isBanned ? t("confirmUnban", { username }) : t("confirmBan", { username });
    if (confirm(msg)) {
      try {
        await toggleBanUser(userId);
        router.refresh();
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : t("operationFailed"));
      }
    }
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
                        {(() => {
                          const pv = pointsView(user);
                          return (
                            <span className={`inline-flex items-center gap-1.5 text-sm font-medium font-theme-mono ${pv.cls}`}>
                              <CircleDollarSign className="w-4 h-4 opacity-80" />
                              {pv.text}
                            </span>
                          );
                        })()}
                      </td>
                      {/* Last login */}
                      <td className="px-5 py-3.5 text-sm text-text-muted">{formatRelative(lastLogins[user.id])}</td>
                      {/* Actions — 编辑/解封 · 点数 · 历史 */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {user.isBanned && !isProtected ? (
                            <button
                              onClick={() => handleToggleBan(user.id, user.username, user.isBanned)}
                              className="px-3 py-1.5 rounded-theme text-xs font-medium bg-success/15 text-success hover:bg-success/25 transition cursor-pointer"
                            >
                              {t("unban")}
                            </button>
                          ) : (
                            <button
                              onClick={() => openEdit(user)}
                              className="px-3 py-1.5 rounded-theme text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 transition cursor-pointer"
                            >
                              {t("edit")}
                            </button>
                          )}
                          <button
                            onClick={() => openCredit(user)}
                            className="px-3 py-1.5 rounded-theme text-xs font-medium bg-ai/20 text-ai hover:bg-ai/30 transition cursor-pointer"
                          >
                            {t("pointsShort")}
                          </button>
                          <button
                            onClick={() => openHistory(user)}
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

      {/* Create user modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-bold text-text text-lg font-theme-display flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                {t("createUser")}
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form action={createUser} className="flex flex-col gap-3 p-5">
              <div className="grid grid-cols-2 gap-3">
                <input name="username" placeholder={t("username")} required
                  className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
                <input name="password" type="password" placeholder={t("password")} required
                  className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
                <input name="displayName" placeholder={t("displayName")} required
                  className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
                <select name="role" required defaultValue="player"
                  className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary">
                  <option value="player">{t("rolePlayer")}</option>
                  <option value="host">{t("roleHost")}</option>
                  <option value="admin">{t("roleAdmin")}</option>
                </select>
              </div>
              <button type="submit"
                className="mt-1 bg-gradient-to-b from-primary to-primary/85 hover:brightness-110 text-primary-foreground py-2.5 rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">
                {t("submit")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit user modal — profile (nickname/role) + reset password / ban / delete */}
      {editTarget !== null && (() => {
        const editUser = allUsers.find(u => u.id === editTarget);
        if (!editUser) return null;
        const protectedAcct = editUser.username === "admin";
        const avatarColor = getRandomColorForUser(editUser.id);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditTarget(null)}>
            <div className="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
                <h3 className="font-bold text-text text-lg font-theme-display flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-primary" />
                  {t("editUserTitle")}
                </h3>
                <button onClick={() => setEditTarget(null)} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 flex flex-col gap-5">
                {/* Identity */}
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <span
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                    style={{ backgroundColor: avatarColor, color: getContrastColor(avatarColor) }}
                  >
                    {editUser.displayName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="text-base font-bold text-text truncate">{editUser.displayName}</div>
                    <div className="text-xs text-text-dim font-theme-mono truncate">@{editUser.username} · {t("registeredAt", { date: (editUser.createdAt || "").slice(0, 7) })}</div>
                  </div>
                </div>

                {/* Username (read-only) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">{t("username")}</label>
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-input-bg/50 border border-input-border rounded-theme">
                    <span className="text-sm text-text-muted font-theme-mono">{editUser.username}</span>
                    <span className="text-xs text-text-dim">{t("readonly")}</span>
                  </div>
                </div>

                {/* Nickname */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">{t("displayName")}</label>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    maxLength={50}
                    className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary"
                  />
                </div>

                {/* Role */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">{t("role")}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["player", "host", "admin"] as const).map(r => {
                      const active = editRole === r;
                      const disabled = protectedAcct && r !== "admin";
                      return (
                        <button
                          key={r}
                          type="button"
                          disabled={disabled}
                          onClick={() => setEditRole(r)}
                          className={`py-2.5 rounded-theme text-sm font-medium border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                            active ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-text-muted hover:text-text hover:bg-surface-alt"
                          }`}
                        >
                          {roleLabel(r)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {editMsg && <p className={`text-xs ${editStatus === "error" ? "text-danger" : "text-success"}`}>{editMsg}</p>}

                {/* Account actions — reset password / ban / delete */}
                <div className="flex flex-col gap-3 pt-4 border-t border-border">
                  <label className="text-xs text-text-dim font-medium flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-accent" />
                    {t("resetPassword")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder={t("newPassword")}
                      onKeyDown={e => e.key === "Enter" && handleResetPassword()}
                      className="flex-1 min-w-0 px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent"
                    />
                    <button onClick={handleResetPassword} disabled={!newPassword.trim()}
                      className="px-3.5 py-2.5 bg-gradient-to-b from-accent to-accent/80 text-accent-foreground rounded-theme font-bold text-xs transition cursor-pointer disabled:opacity-50 shadow-[0_0_18px_rgb(var(--theme-accent)/0.4)] shrink-0">
                      {t("reset")}
                    </button>
                  </div>
                  {resetMsg && <p className={`text-xs ${resetStatus === "error" ? "text-danger" : "text-success"}`}>{resetMsg}</p>}

                  {!protectedAcct && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { handleToggleBan(editUser.id, editUser.username, editUser.isBanned); setEditTarget(null); }}
                        className={`inline-flex items-center justify-center gap-1.5 py-2.5 rounded-theme text-sm font-medium border transition cursor-pointer ${
                          editUser.isBanned
                            ? "border-success/40 text-success hover:bg-success/10"
                            : "border-warning/40 text-warning hover:bg-warning/10"
                        }`}
                      >
                        {editUser.isBanned ? t("unban") : t("ban")}
                      </button>
                      <button
                        onClick={() => { handleDeleteUser(editUser.id, editUser.username); setEditTarget(null); }}
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-theme text-sm font-medium border border-danger/40 text-danger hover:bg-danger/10 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t("deleteUser")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button onClick={() => setEditTarget(null)}
                    className="px-4 py-2 text-sm text-text-muted hover:text-text transition cursor-pointer">{t("cancel")}</button>
                  <button onClick={handleSaveProfile} disabled={savingEdit || !editName.trim()}
                    className="px-6 py-2.5 bg-gradient-to-b from-primary to-primary/85 hover:brightness-110 disabled:opacity-50 text-primary-foreground rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">
                    {savingEdit ? t("saving") : t("save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* AI points modal — add / subtract / set */}
      {creditTarget !== null && (() => {
        const creditUser = allUsers.find(u => u.id === creditTarget);
        const current = Number(creditUser?.aiPoints ?? 0);
        const amt = parseFloat(creditAmount);
        const preview = isNaN(amt) || amt < 0 ? current : finalPoints(current, creditMode, amt);
        const sign = creditMode === "add" ? "+" : creditMode === "subtract" ? "−" : "=";
        const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
        const modes: { key: PointsMode; label: string; active: string }[] = [
          { key: "add", label: t("pointsAdd"), active: "border-success/50 bg-success/10 text-success" },
          { key: "subtract", label: t("pointsSubtract"), active: "border-danger/50 bg-danger/10 text-danger" },
          { key: "set", label: t("pointsSet"), active: "border-primary/50 bg-primary/10 text-primary" },
        ];
        const confirmLabel = creditMode === "add" ? t("confirmAdd") : creditMode === "subtract" ? t("confirmSubtract") : t("confirmSet");
        const close = () => { setCreditTarget(null); setCreditAmount(""); setCreditNote(""); setCreditMsg(""); };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
            <div className="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
                <h3 className="font-bold text-text text-lg font-theme-display flex items-center gap-2">
                  <CircleDollarSign className="w-5 h-5 text-ai" />
                  {t("aiPointsColumn")}
                </h3>
                <button onClick={close} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 flex flex-col gap-4">
                {/* Balance card */}
                <div className="rounded-theme border border-border bg-surface-alt/40 py-5 text-center">
                  <div className="text-xs text-text-muted">{creditUser?.displayName} · {t("currentBalance")}</div>
                  <div className="text-4xl font-bold text-ai font-theme-display mt-1">{fmt(current)}</div>
                </div>

                {/* Mode */}
                <div className="grid grid-cols-3 gap-2">
                  {modes.map(m => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setCreditMode(m.key)}
                      className={`py-2.5 rounded-theme text-sm font-medium border transition cursor-pointer ${
                        creditMode === m.key ? m.active : "border-border text-text-muted hover:text-text hover:bg-surface-alt"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Amount */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-text-dim font-medium">{t("amountLabel")}</label>
                  <div className="flex items-center gap-2 px-3.5 py-3 bg-input-bg border border-input-border rounded-theme transition focus-within:ring-[3px] focus-within:ring-ai/[0.18] focus-within:border-ai">
                    <span className="text-lg font-bold text-ai">{sign}</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={creditAmount}
                      onChange={e => setCreditAmount(e.target.value)}
                      placeholder="0"
                      autoFocus
                      onKeyDown={e => e.key === "Enter" && handleUpdateCredits()}
                      className="flex-1 min-w-0 bg-transparent outline-none text-text text-lg font-bold placeholder:text-text-dim"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[100, 500, 1000].map(v => (
                      <button key={v} type="button" onClick={() => setCreditAmount(String(v))}
                        className="px-3 py-1.5 rounded-theme text-xs font-medium border border-border text-text-muted hover:text-ai hover:border-ai/40 hover:bg-ai/10 transition cursor-pointer">
                        {creditMode === "set" ? v : `${sign}${v}`}
                      </button>
                    ))}
                    <button type="button" onClick={() => setCreditAmount("")}
                      className="px-3 py-1.5 rounded-theme text-xs font-medium border border-border text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                      {t("custom")}
                    </button>
                  </div>
                </div>

                {/* Note */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-text-dim font-medium">{t("noteLabel")}</label>
                  <input
                    value={creditNote}
                    onChange={e => setCreditNote(e.target.value)}
                    maxLength={200}
                    placeholder={t("notePlaceholder")}
                    className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary"
                  />
                </div>

                {/* After-balance preview */}
                <div className="flex items-center justify-between px-3.5 py-3 rounded-theme border border-border bg-surface-alt/40">
                  <span className="text-sm text-text-muted">{t("afterBalance")}</span>
                  <span className="text-lg font-bold text-success font-theme-display">{fmt(preview)}</span>
                </div>

                {creditMsg && <p className={`text-xs ${creditStatus === "error" ? "text-danger" : "text-success"}`}>{creditMsg}</p>}

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button onClick={close} className="px-4 py-2 text-sm text-text-muted hover:text-text transition cursor-pointer">{t("cancel")}</button>
                  <button onClick={handleUpdateCredits}
                    className="px-6 py-2.5 bg-gradient-to-b from-ai to-ai/80 hover:brightness-110 text-ai-foreground rounded-theme font-bold text-sm transition cursor-pointer shadow-[0_0_18px_rgb(var(--theme-ai)/0.4)]">
                    {confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Change own password modal */}
      {showChangePwd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowChangePwd(false); setOldPwd(""); setNewPwd(""); setPwdMsg(""); }}>
          <div className="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-bold text-text text-base font-theme-display flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                {t("changePassword")}
              </h3>
              <button onClick={() => { setShowChangePwd(false); setOldPwd(""); setNewPwd(""); setPwdMsg(""); }} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder={t("currentPassword")}
                className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder={t("newPassword")}
                onKeyDown={e => e.key === "Enter" && handleChangePwd()}
                className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
              {pwdMsg && <p className={`text-xs ${pwdStatus === "error" ? "text-danger" : "text-success"}`}>{pwdMsg}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowChangePwd(false); setOldPwd(""); setNewPwd(""); setPwdMsg(""); }}
                  className="px-3 py-2 text-sm text-text-muted hover:text-text transition cursor-pointer">{t("cancel")}</button>
                <button onClick={handleChangePwd}
                  className="px-4 py-2 bg-gradient-to-b from-primary to-primary/85 text-primary-foreground rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">{t("confirm")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Login history modal */}
      {historyUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHistoryUser(null)}>
          <div className="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <h3 className="font-bold text-text text-lg font-theme-display leading-tight">{t("loginRecordsTitle")}</h3>
                  <p className="text-xs text-text-muted mt-0.5">{historyUser.displayName} · {t("recentCount", { count: historyRecords.length })}</p>
                </div>
              </div>
              <button onClick={() => setHistoryUser(null)} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingHistory ? (
                <div className="text-center text-text-dim py-8 text-sm">{t("loading")}</div>
              ) : (
                <UserLoginHistory records={historyRecords} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
