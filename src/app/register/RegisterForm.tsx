"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Ticket, User, Lock, UserPlus, ArrowLeft } from "lucide-react";
import { Notice } from "@/components/shared/Notice";
import { FilingFooter } from "@/components/shared/FilingFooter";
import { ThemeLoginHero } from "@/components/theme/ThemeDecor";
import { registerAction } from "@/app/actions/invite";

interface RegisterFormProps {
  siteTitle: string;
  version: string;
  icp?: string;
  icpUrl?: string;
  policeIcon?: string;
  policeHtml?: string;
  /** Global admin toggle — when off, the form is replaced by a notice. */
  registrationEnabled: boolean;
}

const inputCls =
  "w-full pl-11 pr-3.5 py-3 border border-input-border rounded-theme outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary transition text-sm bg-input-bg text-text placeholder:text-text-dim";

/**
 * Re-group free-form code input as XXXX-XXXX-XXXX while typing. The character
 * filter mirrors INVITE_CODE_ALPHABET in src/lib/invites.ts (no 0/O 1/I/L U).
 */
function formatCodeInput(value: string): string {
  const raw = value.toUpperCase().replace(/[^23456789ABCDEFGHJKMNPQRSTVWXYZ]/g, "").slice(0, 12);
  return raw.replace(/(.{4})(?=.)/g, "$1-");
}

export function RegisterForm({ siteTitle, version, icp, icpUrl, policeIcon, policeHtml, registrationEnabled }: RegisterFormProps) {
  const t = useTranslations("register");
  const router = useRouter();
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const username = (formData.get("username") as string)?.trim();
    const password = formData.get("password") as string;
    const confirm = formData.get("confirm") as string;

    if (!code || !username || !password) {
      setError(t("errorEmpty"));
      return;
    }
    if (password !== confirm) {
      setError(t("errorPasswordMismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("errorPasswordTooShort"));
      return;
    }
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
      setError(t("errorUsernameFormat"));
      return;
    }

    startTransition(async () => {
      try {
        const result = await registerAction(formData);
        if (result.success) {
          router.push("/login?reason=registered");
        } else {
          setError(result.error || t("errorUnknown"));
        }
      } catch {
        setError(t("errorUnknown"));
      }
    });
  }

  const displayTitle = siteTitle.trim();

  return (
    <div className="login-page-bg relative overflow-hidden flex flex-col items-center justify-center min-h-screen bg-bg px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="login-card relative z-[2] p-8 sm:p-10 bg-surface rounded-theme theme-border shadow-lg flex flex-col gap-5 w-full max-w-md border border-border"
      >
        <ThemeLoginHero />
        <div className="flex flex-col items-center text-center gap-3 mb-1">
          <div className="default-login-icon flex items-center justify-center w-16 h-16 rounded-theme border border-primary/40 bg-primary/10 text-primary shadow-[var(--theme-glow)]">
            <UserPlus className="w-8 h-8" strokeWidth={1.75} />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-text font-theme-display">{displayTitle}</h1>
            <p className="text-sm text-text-muted">{t("subtitle")}</p>
          </div>
        </div>

        {!registrationEnabled ? (
          <>
            <Notice variant="info">{t("noticeDisabled")}</Notice>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1.5 text-sm text-primary hover:underline font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("backToLogin")}
            </Link>
          </>
        ) : (
          <>
            {error && <Notice variant="error">{error}</Notice>}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="code" className="text-xs text-text-muted font-medium">
                {t("inviteCode")}
              </label>
              <div className="relative">
                <Ticket className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
                <input
                  id="code"
                  name="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(formatCodeInput(e.target.value))}
                  placeholder="XXXX-XXXX-XXXX"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputCls} font-theme-mono tracking-wider`}
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-text-dim">{t("inviteCodeHint")}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-xs text-text-muted font-medium">
                {t("username")}
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder={t("usernamePlaceholder")}
                  required
                  autoComplete="username"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="displayName" className="text-xs text-text-muted font-medium">
                {t("displayName")}
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  placeholder={t("displayNamePlaceholder")}
                  maxLength={30}
                  autoComplete="nickname"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs text-text-muted font-medium">
                {t("password")}
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={t("passwordPlaceholder")}
                  required
                  autoComplete="new-password"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm" className="text-xs text-text-muted font-medium">
                {t("confirmPassword")}
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  placeholder={t("confirmPasswordPlaceholder")}
                  required
                  autoComplete="new-password"
                  className={inputCls}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="bg-primary hover:bg-primary-hover disabled:bg-text-dim text-primary-foreground py-3 rounded-theme font-bold transition text-sm mt-1 flex items-center justify-center gap-2 cursor-pointer shadow-[var(--theme-glow)]"
            >
              {isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"></span>
                  {t("submitting")}
                </>
              ) : (
                t("submit")
              )}
            </button>

            <p className="text-xs text-text-muted text-center">
              {t("haveAccountPrompt")}{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                {t("goToLogin")}
              </Link>
            </p>
          </>
        )}
      </form>

      <footer className="text-center text-xs text-text-dim space-y-1 mt-4">
        <p>
          &copy; {new Date().getFullYear()}{" "}
          <a
            href="https://github.com/Joycai/simple-trpg-chat"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {displayTitle}
          </a>
        </p>
        <FilingFooter icp={icp} icpUrl={icpUrl} policeIcon={policeIcon} policeHtml={policeHtml} />
        <p className="text-[10px] text-text-dim/60">v{version}</p>
      </footer>
    </div>
  );
}
