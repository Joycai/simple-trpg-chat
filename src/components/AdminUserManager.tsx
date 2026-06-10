"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Key } from "lucide-react";
import { createUser, deleteUser, resetPassword, changeOwnPassword } from "@/app/admin/actions";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  username: string;
  displayName: string;
  role: string;
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

  return (
    <section className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
      {/* Change own password */}
      <div className="mb-4 pb-4 border-b border-purple-500/10">
        {!showChangePwd ? (
          <button onClick={() => setShowChangePwd(true)}
            className="text-xs text-amber-400/70 hover:text-amber-400 transition">
            <Key className="w-3.5 h-3.5 inline -mt-0.5" />{t("changePassword") || "修改密码"}
          </button>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <h4 className="text-sm font-bold text-amber-300 mb-2"><Key className="w-3.5 h-3.5 inline -mt-0.5" />{t("changePassword") || "修改密码"}</h4>
            <div className="flex flex-col gap-2">
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                placeholder={t("currentPassword") || "当前密码"}
                className="p-2 bg-[#0a0e1a] border border-amber-500/20 rounded text-purple-100 text-sm" />
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                placeholder={t("newPassword") || "新密码（至少3位）"}
                className="p-2 bg-[#0a0e1a] border border-amber-500/20 rounded text-purple-100 text-sm"
                onKeyDown={e => e.key === "Enter" && handleChangePwd()} />
              <div className="flex gap-2">
                <button onClick={handleChangePwd}
                  className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg font-bold text-sm">
                  {t("confirm") || "确认"}
                </button>
                <button onClick={() => { setShowChangePwd(false); setOldPwd(""); setNewPwd(""); setPwdMsg(""); }}
                  className="text-purple-400/50 hover:text-purple-300 text-sm px-2">
                  {t("cancel") || "取消"}
                </button>
              </div>
              {pwdMsg && (
                <p className={`text-xs ${pwdStatus === "error" ? "text-rose-400" : "text-emerald-400"}`}>{pwdMsg}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <h3 className="font-bold text-purple-200 mb-4 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        {t("userManagement")}
        <span className="text-xs text-purple-400/40 font-normal ml-auto">{t("userCount", { count: allUsers.length })}</span>
      </h3>

      {/* Password Reset Dialog */}
      {resetTarget !== null && (
        <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <h4 className="text-sm font-bold text-amber-300 mb-2">
            <Key className="w-3.5 h-3.5 inline -mt-0.5" />{t("resetPassword") || "重置密码"} — {allUsers.find(u => u.id === resetTarget)?.username}
          </h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder={t("newPassword") || "输入新密码（至少3位）"}
              className="flex-1 p-2 bg-[#0a0e1a] border border-amber-500/20 rounded text-purple-100 text-sm"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleResetPassword()}
            />
            <button onClick={handleResetPassword}
              className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg font-bold text-sm">
              {t("confirm") || "确认"}
            </button>
            <button onClick={() => { setResetTarget(null); setNewPassword(""); setResetMsg(""); }}
              className="text-purple-400/50 hover:text-purple-300 text-sm px-2">
              {t("cancel") || "取消"}
            </button>
          </div>
          {resetMsg && (
            <p className={`text-xs mt-2 ${resetStatus === "error" ? "text-rose-400" : "text-emerald-400"}`}>
              {resetMsg}
            </p>
          )}
        </div>
      )}

      {/* Create User Form */}
      <details className="mb-4">
        <summary className="text-sm text-purple-400/60 cursor-pointer hover:text-purple-300 transition mb-3">
          ＋ {t("createUser")}
        </summary>
        <form action={createUser} className="flex flex-col gap-3 mt-2 p-4 bg-[#0a0e1a] rounded-lg border border-purple-500/10">
          <div className="grid grid-cols-2 gap-3">
            <input name="username" placeholder={t("username")} required
              className="p-2 bg-[#0f1425] border border-purple-500/20 rounded text-purple-100 text-sm placeholder:text-purple-400/30 focus:border-purple-400/50 outline-none" />
            <input name="password" type="password" placeholder={t("password")} required
              className="p-2 bg-[#0f1425] border border-purple-500/20 rounded text-purple-100 text-sm placeholder:text-purple-400/30 focus:border-purple-400/50 outline-none" />
            <input name="displayName" placeholder={t("displayName")} required
              className="p-2 bg-[#0f1425] border border-purple-500/20 rounded text-purple-100 text-sm placeholder:text-purple-400/30 focus:border-purple-400/50 outline-none" />
            <select name="role" required
              className="p-2 bg-[#0f1425] border border-purple-500/20 rounded text-purple-100 text-sm focus:border-purple-400/50 outline-none">
              <option value="player">{t("rolePlayer")}</option>
              <option value="host">{t("roleHost")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
          </div>
          <button type="submit"
            className="bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg font-bold text-sm transition">
            {t("submit")}
          </button>
        </form>
      </details>

      {/* User List */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-purple-400/60 text-xs border-b border-purple-500/20">
              <th className="pb-2.5 font-medium">{t("username")}</th>
              <th className="pb-2.5 font-medium">{t("displayName")}</th>
              <th className="pb-2.5 font-medium">{t("role")}</th>
              <th className="pb-2.5 font-medium text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.length === 0 ? (
              <tr><td colSpan={4} className="py-12 text-center text-purple-400/30 text-sm">{t("noUsers")}</td></tr>
            ) : (
              allUsers.map((user: any) => (
              <tr key={user.id} className="border-b border-purple-500/10 last:border-0 hover:bg-purple-500/5 transition">
                <td className="py-3 font-mono text-sm text-purple-200">{user.username}</td>
                <td className="py-3 text-purple-300 text-sm">{user.displayName}</td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    user.role === "admin" ? "bg-rose-500/20 text-rose-400" :
                    user.role === "host" ? "bg-emerald-500/20 text-emerald-400" :
                    "bg-blue-500/20 text-blue-400"
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="py-3 text-right flex items-center justify-end gap-2">
                  {user.username !== "admin" && (
                    <button
                      onClick={() => { setResetTarget(user.id); setNewPassword(""); setResetMsg(""); }}
                      className="text-amber-400/60 hover:text-amber-400 text-xs transition"
                      title={t("resetPassword") || "重置密码"}
                    >
                      <Key className="w-4 h-4" />
                    </button>
                  )}
                  <form action={deleteUser.bind(null, user.id)} className="inline">
                    <button className="text-rose-400/60 hover:text-rose-400 text-xs transition disabled:opacity-20"
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
    </section>
  );
}
