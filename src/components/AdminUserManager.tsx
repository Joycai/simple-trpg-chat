"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Key, History, Ban } from "lucide-react";
import { createUser, deleteUser, resetPassword, changeOwnPassword, toggleBanUser } from "@/app/admin/actions";
import { getUserLoginHistory } from "@/app/actions/login-history";
import { UserLoginHistory } from "@/components/UserLoginHistory";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  username: string;
  displayName: string;
  role: string;
  isBanned: boolean;
}

interface AdminUserManagerProps {
  users: User[];
}

export function AdminUserManager({ users: allUsers }: AdminUserManagerProps) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [resetTarget, setResetTarget] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetStatus, setResetStatus] = useState<"" | "success" | "error">("");
  // Change own password
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdStatus, setPwdStatus] = useState<"" | "success" | "error">("");
  // Login history
  const [historyUser, setHistoryUser] = useState<{ id: number; username: string } | null>(null);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openHistory = async (userId: number, username: string) => {
    setHistoryUser({ id: userId, username });
    setLoadingHistory(true);
    try {
      const records = await getUserLoginHistory(userId);
      setHistoryRecords(records);
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
    } catch (e: any) {
      setPwdMsg(e.message || t("passwordResetFail"));
      setPwdStatus("error");
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword.trim()) return;
    if (newPassword.length < 3) {
      setResetMsg(t("passwordTooShort") || "密码至少3位");
      return;
    }
    try {
      await resetPassword(resetTarget, newPassword.trim());
      setResetMsg(t("passwordResetOk"));
      setResetStatus("success");
      setResetTarget(null);
      setNewPassword("");
      router.refresh();
    } catch {
      setResetMsg(t("passwordResetFail"));
      setResetStatus("error");
    }
  };

  const handleToggleBan = async (userId: number, username: string, isBanned: boolean) => {
    const msg = isBanned 
      ? (t("confirmUnban") || `确定要解封账号 ${username} 吗？`)
      : (t("confirmBan") || `确定要封禁账号 ${username} 吗？这会强制使其下线。`);
      
    if (confirm(msg)) {
      try {
        await toggleBanUser(userId);
        router.refresh();
      } catch (e: any) {
        alert(e.message || "操作失败");
      }
    }
  };

  return (
    <section className="bg-surface p-5 rounded-xl border border-border shadow-lg">
      {/* Change own password */}
      <div className="mb-4 pb-4 border-b border-border">
        {!showChangePwd ? (
          <button onClick={() => setShowChangePwd(true)}
            className="text-xs text-accent hover:text-accent-hover transition">
            <Key className="w-3.5 h-3.5 inline -mt-0.5" />{t("changePassword") || "修改密码"}
          </button>
        ) : (
          <div className="bg-accent/10 border border-accent/20 rounded-lg p-3">
            <h4 className="text-sm font-bold text-accent mb-2"><Key className="w-3.5 h-3.5 inline -mt-0.5" />{t("changePassword") || "修改密码"}</h4>
            <div className="flex flex-col gap-2">
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                placeholder={t("currentPassword") || "当前密码"}
                className="p-2 bg-bg border border-border rounded text-text text-sm" />
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                placeholder={t("newPassword") || "新密码（至少3位）"}
                className="p-2 bg-bg border border-border rounded text-text text-sm"
                onKeyDown={e => e.key === "Enter" && handleChangePwd()} />
              <div className="flex gap-2">
                <button onClick={handleChangePwd}
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-bold text-sm">
                  {t("confirm") || "确认"}
                </button>
                <button onClick={() => { setShowChangePwd(false); setOldPwd(""); setNewPwd(""); setPwdMsg(""); }}
                  className="text-text-dim hover:text-text text-sm px-2">
                  {t("cancel") || "取消"}
                </button>
              </div>
              {pwdMsg && (
                <p className={`text-xs ${pwdStatus === "error" ? "text-danger" : "text-success"}`}>{pwdMsg}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <h3 className="font-bold text-text mb-4 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-success" />
        {t("userManagement")}
        <span className="text-xs text-text-dim font-normal ml-auto">{t("userCount", { count: allUsers.length })}</span>
      </h3>

      {/* Password Reset Dialog */}
      {resetTarget !== null && (
        <div className="mb-4 bg-accent/10 border border-accent/20 rounded-lg p-4">
          <h4 className="text-sm font-bold text-accent mb-2">
            <Key className="w-3.5 h-3.5 inline -mt-0.5" />{t("resetPassword") || "重置密码"} — {allUsers.find(u => u.id === resetTarget)?.username}
          </h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder={t("newPassword") || "输入新密码（至少3位）"}
              className="flex-1 p-2 bg-bg border border-border rounded text-text text-sm"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleResetPassword()}
            />
            <button onClick={handleResetPassword}
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-bold text-sm">
              {t("confirm") || "确认"}
            </button>
            <button onClick={() => { setResetTarget(null); setNewPassword(""); setResetMsg(""); }}
              className="text-text-dim hover:text-text text-sm px-2">
              {t("cancel") || "取消"}
            </button>
          </div>
          {resetMsg && (
            <p className={`text-xs mt-2 ${resetStatus === "error" ? "text-danger" : "text-success"}`}>
              {resetMsg}
            </p>
          )}
        </div>
      )}

      {/* Create User Form */}
      <details className="mb-4">
        <summary className="text-sm text-text-muted cursor-pointer hover:text-text transition mb-3">
          ＋ {t("createUser")}
        </summary>
        <form action={createUser} className="flex flex-col gap-3 mt-2 p-4 bg-bg rounded-lg border border-border">
          <div className="grid grid-cols-2 gap-3">
            <input name="username" placeholder={t("username")} required
              className="p-2 bg-surface border border-border rounded text-text text-sm placeholder:text-text-dim focus:border-primary/50 outline-none" />
            <input name="password" type="password" placeholder={t("password")} required
              className="p-2 bg-surface border border-border rounded text-text text-sm placeholder:text-text-dim focus:border-primary/50 outline-none" />
            <input name="displayName" placeholder={t("displayName")} required
              className="p-2 bg-surface border border-border rounded text-text text-sm placeholder:text-text-dim focus:border-primary/50 outline-none" />
            <select name="role" required
              className="p-2 bg-surface border border-border rounded text-text text-sm focus:border-primary/50 outline-none">
              <option value="player">{t("rolePlayer")}</option>
              <option value="host">{t("roleHost")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
          </div>
          <button type="submit"
            className="bg-primary hover:bg-primary-hover text-white py-2 rounded-lg font-bold text-sm transition">
            {t("submit")}
          </button>
        </form>
      </details>

      {/* User List */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-text-muted text-xs border-b border-border">
              <th className="pb-2.5 font-medium">{t("username")}</th>
              <th className="pb-2.5 font-medium">{t("displayName")}</th>
              <th className="pb-2.5 font-medium">{t("role")}</th>
              <th className="pb-2.5 font-medium text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.length === 0 ? (
              <tr><td colSpan={4} className="py-12 text-center text-text-dim text-sm">{t("noUsers")}</td></tr>
            ) : (
              allUsers.map((user: any) => (
              <tr key={user.id} className="border-b border-border last:border-0 hover:bg-surface-alt transition">
                <td className="py-3 font-mono text-sm text-text">
                  <span className={user.isBanned ? "text-danger line-through opacity-60" : ""}>
                    {user.username}
                  </span>
                  {user.isBanned && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-danger/10 text-danger text-[9px] font-bold">
                      {t("bannedBadge") || "已封禁"}
                    </span>
                  )}
                </td>
                <td className="py-3 text-text text-sm">{user.displayName}</td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    user.role === "admin" ? "bg-danger/20 text-danger" :
                    user.role === "host" ? "bg-success/20 text-success" :
                    "bg-primary/20 text-primary"
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="py-3 text-right flex items-center justify-end gap-2">
                  <button
                    onClick={() => openHistory(user.id, user.username)}
                    className="text-text-muted/60 hover:text-text-muted text-xs transition"
                    title="登录历史"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                  {user.username !== "admin" && (
                    <>
                      <button
                        onClick={() => handleToggleBan(user.id, user.username, user.isBanned)}
                        className={`text-xs transition ${
                          user.isBanned 
                            ? "text-success hover:text-success/80" 
                            : "text-danger/60 hover:text-danger"
                        }`}
                        title={user.isBanned ? (t("unban") || "解封") : (t("ban") || "封禁")}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setResetTarget(user.id); setNewPassword(""); setResetMsg(""); }}
                        className="text-accent/60 hover:text-accent text-xs transition"
                        title={t("resetPassword") || "重置密码"}
                      >
                        <Key className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <form action={deleteUser.bind(null, user.id)} className="inline">
                    <button className="text-danger/60 hover:text-danger text-xs transition disabled:opacity-20"
                      disabled={user.username === "admin"}>
                      {user.username === "admin" ? "—" : t("delete")}
                    </button>
                  </form>
                </td>
              </tr>
            ))
            )}
          </tbody>
        </table>
      </div>

      {/* Login History Modal */}
      {historyUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setHistoryUser(null)}>
          <div className="bg-surface border border-border rounded-theme theme-border shadow-2xl w-full max-w-md mx-4 max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="font-bold text-text text-sm flex items-center gap-2">
                <History className="w-4 h-4" />
                登录历史 — {historyUser.username}
              </h3>
              <button onClick={() => setHistoryUser(null)} className="text-text-muted hover:text-text text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingHistory ? (
                <div className="text-center text-text-dim py-8 text-sm">加载中...</div>
              ) : (
                <UserLoginHistory records={historyRecords} />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
