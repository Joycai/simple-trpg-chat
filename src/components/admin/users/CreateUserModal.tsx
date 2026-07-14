"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus, X, Eye, EyeOff, Minus, Plus } from "lucide-react";
import { createUser } from "@/app/admin/actions";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { Notice } from "@/components/shared/Notice";

const AI_POINTS_STEP = 100;
const DEFAULT_AI_POINTS = 500;

/** Generate a legible random initial password (no ambiguous chars like O/0/l/1). */
function generatePassword(length = 12): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => alphabet[n % alphabet.length]).join("");
}

export function CreateUserModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("admin");

  const [role, setRole] = useState("player");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [aiPoints, setAiPoints] = useState(DEFAULT_AI_POINTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>, close: () => void) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await createUser(new FormData(e.currentTarget));
      close();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("operationFailed"));
      setSubmitting(false);
    }
  };

  const roleLabel = (r: string): string =>
    ({ player: t("rolePlayer"), host: t("roleHost"), admin: t("roleAdmin") } as Record<string, string>)[r] ?? r;

  const inputCls =
    "px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary";

  return (
    <OverlayShell
      onClose={onClose}
      rootClassName="p-4"
      panelClassName="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
    >
      {(close) => (
        <>
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
            <div className="flex items-start gap-2.5 min-w-0">
              <UserPlus className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-bold text-text text-lg font-theme-display leading-tight">{t("createUser")}</h3>
                <p className="text-xs text-text-muted mt-1 leading-snug">{t("createUserSubtitle")}</p>
              </div>
            </div>
            <button onClick={close} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={(e) => handleSubmit(e, close)} className="flex flex-col gap-5 p-5">
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="aiPoints" value={aiPoints} />

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cu-username" className="text-xs text-text-dim font-medium">
                {t("username")} <span className="text-primary">*</span>
              </label>
              <input
                id="cu-username"
                name="username"
                required
                autoComplete="off"
                maxLength={50}
                className={`${inputCls} font-theme-mono`}
              />
              <span className="text-xs text-text-dim">{t("usernameHint")}</span>
            </div>

            {/* Nickname */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cu-nickname" className="text-xs text-text-dim font-medium">{t("nickname")}</label>
              <input id="cu-nickname" name="displayName" maxLength={50} className={inputCls} />
            </div>

            {/* Initial password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cu-password" className="text-xs text-text-dim font-medium">
                {t("initialPassword")} <span className="text-primary">*</span>
              </label>
              <div className="relative flex items-center">
                <input
                  id="cu-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} w-full pr-24`}
                />
                <div className="absolute right-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                    className="p-1.5 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}
                    className="px-2.5 py-1 rounded-theme text-xs font-medium border border-primary/40 text-primary hover:bg-primary/10 transition cursor-pointer"
                  >
                    {t("randomize")}
                  </button>
                </div>
              </div>
            </div>

            {/* Role — segmented control */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-dim font-medium">{t("role")}</label>
              <div className="grid grid-cols-3 gap-2">
                {(["player", "host", "admin"] as const).map((r) => {
                  const active = role === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`py-2.5 rounded-theme text-sm font-medium border transition cursor-pointer ${
                        active ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-text-muted hover:text-text hover:bg-surface-alt"
                      }`}
                    >
                      {roleLabel(r)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Initial AI points — stepper */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-theme border border-border bg-surface-alt/30">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text">{t("initialAiPoints")}</div>
                <div className="text-xs text-text-dim mt-0.5">{t("initialAiPointsHint")}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setAiPoints((p) => Math.max(0, p - AI_POINTS_STEP))}
                  aria-label={t("pointsSubtract")}
                  className="w-8 h-8 flex items-center justify-center rounded-theme border border-border text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-14 text-center font-bold font-theme-mono text-lg text-text tabular-nums">{aiPoints}</span>
                <button
                  type="button"
                  onClick={() => setAiPoints((p) => p + AI_POINTS_STEP)}
                  aria-label={t("pointsAdd")}
                  className="w-8 h-8 flex items-center justify-center rounded-theme border border-border text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error && <Notice variant="error">{error}</Notice>}

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={close}
                className="px-4 py-2 text-sm text-text-muted hover:text-text transition cursor-pointer">
                {t("cancel")}
              </button>
              <button type="submit" disabled={submitting}
                className="btn-primary px-6 py-2.5 rounded-theme bg-gradient-to-b from-primary to-primary/85 hover:brightness-110 text-primary-foreground font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)] disabled:opacity-60 disabled:cursor-not-allowed">
                {t("createAccount")}
              </button>
            </div>
          </form>
        </>
      )}
    </OverlayShell>
  );
}
