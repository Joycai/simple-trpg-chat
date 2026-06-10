"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, User, Key, LogOut } from "lucide-react";
import { changeOwnPassword } from "@/app/admin/actions";
import { logoutAction } from "@/app/actions/user";
import { useTranslations } from "next-intl";

interface UserDropdownProps {
  userName: string;
  userRole: string;
  roleLabel: string;
}

export function UserDropdown({ userName, userRole, roleLabel }: UserDropdownProps) {
  const t = useTranslations("lobby");
  const ta = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdOk, setPwdOk] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowPasswordForm(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const roleColor =
    userRole === "admin"
      ? "bg-danger/20 text-danger border-danger/30"
      : userRole === "host"
        ? "bg-success/20 text-success border-success/30"
        : "bg-primary/20 text-primary border-primary/30";

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => { setOpen(!open); setShowPasswordForm(false); setPwdError(""); setPwdOk(false); }}
        className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="hidden sm:inline">{userName}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${roleColor}`}>
            {roleLabel}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-theme shadow-lg z-50 overflow-hidden">
          {/* Profile info */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-text-muted" />
              <span className="text-sm font-medium text-text">{userName}</span>
            </div>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${roleColor}`}>
              {roleLabel}
            </span>
          </div>

          {/* Change password */}
          {!showPasswordForm ? (
            <button
              onClick={() => { setShowPasswordForm(true); setPwdError(""); setPwdOk(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text hover:bg-surface-alt transition-colors text-left"
            >
              <Key className="w-4 h-4 text-text-muted" />
              {ta("changePassword") || "修改密码"}
            </button>
          ) : (
            <div className="px-4 py-3 border-b border-border space-y-2">
              <p className="text-xs font-medium text-text">{ta("changePassword") || "修改密码"}</p>
              <input
                type="password"
                placeholder={ta("currentPassword") || "当前密码"}
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                className="w-full p-1.5 border border-border rounded text-sm bg-bg text-text outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="password"
                placeholder={ta("newPassword") || "新密码"}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="w-full p-1.5 border border-border rounded text-sm bg-bg text-text outline-none focus:ring-1 focus:ring-primary"
              />
              {pwdError && <p className="text-xs text-danger">{pwdError}</p>}
              {pwdOk && <p className="text-xs text-success">{ta("passwordResetOk") || "密码修改成功"}</p>}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setPwdError("");
                    if (!oldPwd || !newPwd) { setPwdError("请填写完整"); return; }
                    if (newPwd.length < 3) { setPwdError(ta("passwordTooShort") || "密码至少3位"); return; }
                    try {
                      await changeOwnPassword(oldPwd, newPwd);
                      setPwdOk(true);
                      setOldPwd("");
                      setNewPwd("");
                    } catch (e: any) {
                      setPwdError(e.message || ta("passwordResetFail") || "修改失败");
                    }
                  }}
                  className="flex-1 py-1 text-xs bg-primary text-white rounded font-medium hover:bg-primary-hover transition"
                >
                  {ta("confirm") || "确认"}
                </button>
                <button
                  onClick={() => { setShowPasswordForm(false); setPwdError(""); }}
                  className="flex-1 py-1 text-xs bg-surface-alt text-text-muted rounded hover:text-text transition"
                >
                  {ta("cancel") || "取消"}
                </button>
              </div>
            </div>
          )}

          {/* Logout */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text hover:bg-surface-alt transition-colors text-left"
            >
              <LogOut className="w-4 h-4 text-text-muted" />
              {t("logout") || "退出登录"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
