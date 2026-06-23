"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, X } from "lucide-react";
import { changeOwnPassword } from "@/app/admin/actions";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { Notice } from "@/components/shared/Notice";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("admin");

  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<"" | "success" | "error">("");

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) return;
    if (newPwd.length < 3) { setMsg(t("passwordTooShort")); setStatus("error"); return; }
    try {
      await changeOwnPassword(oldPwd, newPwd);
      setMsg(t("passwordResetOk"));
      setStatus("success");
      setOldPwd(""); setNewPwd("");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : t("passwordResetFail"));
      setStatus("error");
    }
  };

  return (
    <OverlayShell
      onClose={onClose}
      rootClassName="p-4"
      panelClassName="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-sm overflow-hidden"
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-bold text-text text-base font-theme-display flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              {t("changePassword")}
            </h3>
            <button onClick={close} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 flex flex-col gap-3">
            <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder={t("currentPassword")}
              className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder={t("newPassword")}
              onKeyDown={e => e.key === "Enter" && handleChangePwd()}
              className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
            {msg && <Notice variant={status === "error" ? "error" : "success"}>{msg}</Notice>}
            <div className="flex gap-2 justify-end">
              <button onClick={close}
                className="px-3 py-2 text-sm text-text-muted hover:text-text transition cursor-pointer">{t("cancel")}</button>
              <button onClick={handleChangePwd}
                className="px-4 py-2 bg-gradient-to-b from-primary to-primary/85 text-primary-foreground rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">{t("confirm")}</button>
            </div>
          </div>
        </>
      )}
    </OverlayShell>
  );
}
