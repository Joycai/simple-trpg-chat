"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Key, X, Trash2, Pencil } from "lucide-react";
import { updateUser, resetPassword } from "@/app/admin/actions";
import { getRandomColorForUser, getContrastColor } from "@/lib/avatar-colors";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { Notice } from "@/components/shared/Notice";
import type { User } from "./types";

interface EditUserModalProps {
  user: User;
  onClose: () => void;
  /** Parent-owned ban toggle (confirm + action + refresh). */
  onToggleBan: (user: User) => void;
  /** Parent-owned delete (confirm + action + refresh). */
  onDelete: (user: User) => void;
}

export function EditUserModal({ user, onClose, onToggleBan, onDelete }: EditUserModalProps) {
  const t = useTranslations("admin");
  const router = useRouter();

  const [editName, setEditName] = useState(user.displayName);
  const [editRole, setEditRole] = useState(user.role);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [editStatus, setEditStatus] = useState<"" | "success" | "error">("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetStatus, setResetStatus] = useState<"" | "success" | "error">("");

  const protectedAcct = user.username === "admin";
  const avatarColor = getRandomColorForUser(user.id);

  const roleLabel = (role: string): string => {
    const known: Record<string, string> = { admin: t("roleAdmin"), host: t("roleHost"), player: t("rolePlayer") };
    return known[role] ?? role;
  };

  const handleSaveProfile = async (close: () => void) => {
    if (!editName.trim()) return;
    setSavingEdit(true);
    setEditMsg("");
    setEditStatus("");
    try {
      await updateUser(user.id, editName.trim(), editRole);
      router.refresh();
      close();
    } catch (e: unknown) {
      setEditMsg(e instanceof Error ? e.message : t("operationFailed"));
      setEditStatus("error");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim()) return;
    if (newPassword.length < 3) { setResetMsg(t("passwordTooShort")); setResetStatus("error"); return; }
    try {
      await resetPassword(user.id, newPassword.trim());
      setResetMsg(t("passwordResetOk"));
      setResetStatus("success");
      setNewPassword("");
      router.refresh();
    } catch {
      setResetMsg(t("passwordResetFail"));
      setResetStatus("error");
    }
  };

  return (
    <OverlayShell
      onClose={onClose}
      rootClassName="p-4"
      panelClassName="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
            <h3 className="font-bold text-text text-lg font-theme-display flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              {t("editUserTitle")}
            </h3>
            <button onClick={close} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
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
                {user.displayName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="text-base font-bold text-text truncate">{user.displayName}</div>
                <div className="text-xs text-text-dim font-theme-mono truncate">@{user.username} · {t("registeredAt", { date: (user.createdAt || "").slice(0, 7) })}</div>
              </div>
            </div>

            {/* Username (read-only) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-dim font-medium">{t("username")}</label>
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-input-bg/50 border border-input-border rounded-theme">
                <span className="text-sm text-text-muted font-theme-mono">{user.username}</span>
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

            {editMsg && <Notice variant={editStatus === "error" ? "error" : "success"}>{editMsg}</Notice>}

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
              {resetMsg && <Notice variant={resetStatus === "error" ? "error" : "success"}>{resetMsg}</Notice>}

              {!protectedAcct && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { onToggleBan(user); close(); }}
                    className={`inline-flex items-center justify-center gap-1.5 py-2.5 rounded-theme text-sm font-medium border transition cursor-pointer ${
                      user.isBanned
                        ? "border-success/40 text-success hover:bg-success/10"
                        : "border-warning/40 text-warning hover:bg-warning/10"
                    }`}
                  >
                    {user.isBanned ? t("unban") : t("ban")}
                  </button>
                  <button
                    onClick={() => { onDelete(user); close(); }}
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
              <button onClick={close}
                className="px-4 py-2 text-sm text-text-muted hover:text-text transition cursor-pointer">{t("cancel")}</button>
              <button onClick={() => handleSaveProfile(close)} disabled={savingEdit || !editName.trim()}
                className="px-6 py-2.5 bg-gradient-to-b from-primary to-primary/85 hover:brightness-110 disabled:opacity-50 text-primary-foreground rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">
                {savingEdit ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </>
      )}
    </OverlayShell>
  );
}
