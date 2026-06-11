"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  const t = useTranslations("login");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    if (!username || !password) {
      setError(t("errorEmpty"));
      return;
    }

    startTransition(async () => {
      try {
        const result = await signIn("credentials", {
          username,
          password,
          redirect: false,
        });

        if (result?.error) {
          if (result.error === "CredentialsSignin") {
            setError(t("errorCredentials"));
          } else if (result.error === "banned") {
            setError(t("errorBanned"));
          } else {
            setError(t("errorUnknown"));
          }
        } else {
          router.push("/");
          router.refresh();
        }
      } catch {
        setError(t("errorUnknown"));
      }
    });
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-surface">
      <form
        onSubmit={handleSubmit}
        className="p-8 bg-surface rounded-theme theme-border shadow-lg flex flex-col gap-4 w-full max-w-sm border border-border"
      >
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-text">{t("title")}</h1>
          <p className="text-sm text-text-muted mt-1">{t("subtitle")}</p>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-2 rounded text-sm text-center animate-pulse">
            ⚠️ {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-xs text-text-muted font-medium">
            {t("username")}
          </label>
          <input
            id="username"
            name="username"
            type="text"
            placeholder={t("usernamePlaceholder")}
            required
            autoComplete="username"
            className="p-2.5 border border-border rounded-theme outline-none focus:ring-2 focus:ring-primary transition text-sm bg-surface"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-xs text-text-muted font-medium">
            {t("password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder={t("passwordPlaceholder")}
            required
            autoComplete="current-password"
            className="p-2.5 border border-border rounded-theme outline-none focus:ring-2 focus:ring-primary transition text-sm bg-surface"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="bg-primary hover:bg-primary-hover disabled:bg-text-dim text-white p-2.5 rounded-theme font-bold transition text-sm mt-2 flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              {t("submitting")}
            </>
          ) : (
            t("submit")
          )}
        </button>

        <p className="text-[10px] text-text-dim text-center mt-2">
          {t("hint")}
        </p>
      </form>

      <footer className="text-center text-xs text-text-dim space-y-1">
        <p>
          &copy; {new Date().getFullYear()}{" "}
          <a href="https://github.com/Joycai/simple-trpg-chat" target="_blank" rel="noopener noreferrer"
            className="text-primary hover:underline">
            Simple TRPG Chat
          </a>
        </p>
        {process.env.NEXT_PUBLIC_ICP_BEIAN && (
          <p className="text-[10px] text-text-dim/50">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:underline">
              {process.env.NEXT_PUBLIC_ICP_BEIAN}
            </a>
          </p>
        )}
      </footer>
    </div>
  );
}
