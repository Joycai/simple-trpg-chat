"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Shield } from "lucide-react";
import { changeOwnPassword } from "@/app/admin/actions";
import { Notice } from "@/components/shared/Notice";

const FIELD_CLS =
  "w-full px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm outline-none placeholder:text-text-dim focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary transition";

export function SecurityTab() {
  const t = useTranslations("admin");
  const ts = useTranslations("userSettings");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdOk, setPwdOk] = useState(false);

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) return;
    if (newPwd.length < 3) { setPwdOk(false); setPwdMsg(t("passwordTooShort")); return; }
    if (newPwd !== confirmPwd) { setPwdOk(false); setPwdMsg(ts("passwordMismatch")); return; }
    try {
      await changeOwnPassword(oldPwd, newPwd);
      setPwdOk(true);
      setPwdMsg(t("passwordResetOk"));
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (e: unknown) {
      setPwdMsg(e instanceof Error ? e.message : t("passwordResetFail"));
      setPwdOk(false);
    }
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h4 className="text-lg font-bold text-text flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-primary" />
          {ts("changePassword")}
        </h4>
        <p className="text-sm text-text-muted">{ts("securityDesc")}</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted block">{ts("oldPassword")}</label>
          <input
            type="password"
            value={oldPwd}
            onChange={e => setOldPwd(e.target.value)}
            autoComplete="current-password"
            className={FIELD_CLS}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted block">{ts("newPassword")}</label>
          <input
            type="password"
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            placeholder={ts("newPasswordHint")}
            autoComplete="new-password"
            className={FIELD_CLS}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted block">{ts("confirmNewPassword")}</label>
          <input
            type="password"
            value={confirmPwd}
            onChange={e => setConfirmPwd(e.target.value)}
            autoComplete="new-password"
            className={FIELD_CLS}
          />
        </div>

        {pwdMsg && <Notice variant={pwdOk ? "success" : "error"}>{pwdMsg}</Notice>}

        <button
          onClick={handleChangePwd}
          className="inline-flex items-center justify-center bg-primary hover:bg-primary-hover text-primary-foreground px-5 py-2.5 rounded-theme font-bold text-sm transition shadow-[var(--theme-glow)] cursor-pointer"
        >
          {ts("updatePassword")}
        </button>
      </div>
    </div>
  );
}
