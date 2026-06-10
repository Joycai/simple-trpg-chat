"use client";

import { useState, useEffect } from "react";
import { Shield, History, X, Key } from "lucide-react";
import { useTranslations } from "next-intl";
import { changeOwnPassword } from "@/app/admin/actions";
import { getMyLoginHistory } from "@/app/actions/login-history";
import { UserLoginHistory } from "@/components/UserLoginHistory";

interface UserSettingsPanelProps {
  userName: string;
  userRole: string;
  onClose: () => void;
}

type Tab = "security" | "history";

export function UserSettingsPanel({ userName, userRole, onClose }: UserSettingsPanelProps) {
  const t = useTranslations("admin");
  const [tab, setTab] = useState<Tab>("security");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdOk, setPwdOk] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (tab === "history") {
      setLoadingHistory(true);
      getMyLoginHistory()
        .then(setRecords)
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
  }, [tab]);

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) return;
    if (newPwd.length < 3) { setPwdMsg(t("passwordTooShort") || "密码至少3位"); return; }
    try {
      await changeOwnPassword(oldPwd, newPwd);
      setPwdOk(true);
      setPwdMsg(t("passwordResetOk") || "密码已重置");
      setOldPwd(""); setNewPwd("");
    } catch (e: any) {
      setPwdMsg(e.message || t("passwordResetFail") || "修改失败");
      setPwdOk(false);
    }
  };

  const roleLabel = userRole === "admin" ? "Admin" : userRole === "host" ? "Host" : "Player";
  const roleColor = userRole === "admin" ? "bg-danger/20 text-danger" : userRole === "host" ? "bg-success/20 text-success" : "bg-primary/20 text-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface border border-border rounded-theme theme-border shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold text-text text-lg">个人设置</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info bar */}
        <div className="px-5 py-3 bg-surface-alt border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
            {userName[0]?.toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-text">{userName}</div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${roleColor}`}>{roleLabel}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {([
            ["security", Shield, "账号安全"],
            ["history", History, "登录日志"],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                tab === key ? "text-primary border-b-2 border-primary" : "text-text-muted hover:text-text"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "security" && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">修改你的登录密码。修改后需要重新登录。</p>
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                placeholder="当前密码" className="w-full p-2.5 bg-bg border border-border rounded-lg text-text text-sm outline-none focus:ring-2 focus:ring-primary" />
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                placeholder="新密码（至少3位）" className="w-full p-2.5 bg-bg border border-border rounded-lg text-text text-sm outline-none focus:ring-2 focus:ring-primary" />
              {pwdMsg && (
                <p className={`text-xs ${pwdOk ? "text-success" : "text-danger"}`}>{pwdMsg}</p>
              )}
              <button onClick={handleChangePwd}
                className="w-full bg-primary hover:bg-primary-hover text-white py-2.5 rounded-lg font-bold text-sm transition">
                确认修改
              </button>
            </div>
          )}

          {tab === "history" && (
            loadingHistory ? (
              <div className="text-center text-text-dim py-8 text-sm">加载中...</div>
            ) : (
              <UserLoginHistory records={records} />
            )
          )}
        </div>
      </div>
    </div>
  );
}
