"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Shield } from "lucide-react";
import { changeOwnPassword } from "@/app/admin/actions";

export function SecurityTab() {
  const t = useTranslations("admin");
  const ts = useTranslations("userSettings");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdOk, setPwdOk] = useState(false);

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) return;
    if (newPwd.length < 3) { setPwdMsg(t("passwordTooShort")); return; }
    try {
      await changeOwnPassword(oldPwd, newPwd);
      setPwdOk(true);
      setPwdMsg(t("passwordResetOk"));
      setOldPwd(""); setNewPwd("");
    } catch (e: unknown) {
      setPwdMsg(e instanceof Error ? e.message : t("passwordResetFail"));
      setPwdOk(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-primary" />
          {ts("tabSecurity")}
        </h4>
        <p className="text-xs text-text-muted">{ts("securityDesc")}</p>
      </div>
      <div className="bg-surface-alt border border-border rounded-theme p-4 space-y-4 shadow-sm">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted block">{ts("oldPassword")}</label>
          <input
            type="password"
            value={oldPwd}
            onChange={e => setOldPwd(e.target.value)}
            placeholder={ts("oldPassword")}
            className="w-full p-2.5 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted block">{ts("newPasswordHint")}</label>
          <input
            type="password"
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            placeholder={ts("newPasswordHint")}
            className="w-full p-2.5 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
          />
        </div>
        {pwdMsg && (
          <p className={`text-xs font-semibold ${pwdOk ? "text-success" : "text-danger"}`}>{pwdMsg}</p>
        )}
        <button
          onClick={handleChangePwd}
          className="w-full bg-primary hover:bg-primary-hover text-white py-2.5 rounded-theme font-bold text-sm transition shadow-sm cursor-pointer"
        >
          {ts("confirmUpdate")}
        </button>
      </div>
    </div>
  );
}
