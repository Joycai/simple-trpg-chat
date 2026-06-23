"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Dice5, User, Lock } from "lucide-react";
import { Notice } from "@/components/shared/Notice";

interface LoginFormProps {
  siteTitle: string;
  /** App version, from package.json. */
  version: string;
  /** Why the user landed on /login, e.g. "elsewhere" when kicked by a newer login. */
  noticeReason?: string;
  /** IP of the login that kicked this session (single-session notice). */
  noticeIp?: string;
}

export function LoginForm({ siteTitle, version, noticeReason, noticeIp }: LoginFormProps) {
  const t = useTranslations("login");
  const [error, setError] = useState("");
  const notice =
    noticeReason === "elsewhere"
      ? t("noticeLoggedInElsewhere", { ip: noticeIp || t("unknownIp") })
      : "";
  const [showLicense, setShowLicense] = useState(false);
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
          } else if (result.error === "rate_limit") {
            setError(t("errorRateLimit"));
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

  const displayTitle = siteTitle.trim();

  return (
    <div className="relative overflow-hidden flex flex-col items-center justify-center min-h-screen bg-bg px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="relative z-[2] p-8 sm:p-10 bg-surface rounded-theme theme-border shadow-lg flex flex-col gap-6 w-full max-w-md border border-border"
      >
        <div className="flex flex-col items-center text-center gap-3 mb-1">
          <div className="flex items-center justify-center w-16 h-16 rounded-theme border border-primary/40 bg-primary/10 text-primary shadow-[var(--theme-glow)]">
            <Dice5 className="w-8 h-8" strokeWidth={1.75} />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-text font-theme-display">{displayTitle}</h1>
            <p className="text-sm text-text-muted">{t("subtitle")}</p>
          </div>
        </div>

        {notice && !error && <Notice variant="info">{notice}</Notice>}

        {error && <Notice variant="error">{error}</Notice>}

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
              className="w-full pl-11 pr-3.5 py-3 border border-input-border rounded-theme outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary transition text-sm bg-input-bg text-text placeholder:text-text-dim"
              autoFocus
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
              autoComplete="current-password"
              className="w-full pl-11 pr-3.5 py-3 border border-input-border rounded-theme outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary transition text-sm bg-input-bg text-text placeholder:text-text-dim"
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

        <div className="text-[10px] text-text-muted text-center -mt-1">
          {t("acceptLicensePrompt")}
          <button
            type="button"
            onClick={() => setShowLicense(true)}
            className="text-primary hover:underline font-medium bg-transparent border-none p-0 cursor-pointer inline-block ml-0.5"
          >
            {t("licenseAgreementText")}
          </button>
        </div>

        <p className="text-[10px] text-text-dim text-center -mt-3">
          {t("hint")}
        </p>
      </form>

      {showLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-border rounded-theme max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-bold text-text flex items-center gap-1.5">
                📜 {t("licenseAgreement")}
              </h2>
              <button
                type="button"
                onClick={() => setShowLicense(false)}
                className="text-text-muted hover:text-text p-1 cursor-pointer transition text-base"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto text-xs text-text-muted space-y-4 leading-relaxed max-h-[60vh]">
              <div>
                <h3 className="font-bold text-text mb-0.5">开源授权：AGPL-3.0 / 双重授权模式</h3>
                <h3 className="font-bold text-text mb-2">License: GNU AGPL-3.0 & Dual Licensing</h3>
                <p>
                  本项目采用 <strong>GNU Affero General Public License v3.0 (AGPL-3.0)</strong> 开源许可证。
                </p>
                <p className="mt-1">
                  This project is licensed under the <strong>GNU Affero General Public License v3.0 (AGPL-3.0)</strong>.
                </p>
              </div>

              <hr className="border-border" />

              <div>
                <h4 className="font-bold text-text mb-1">1. 开源免费与强传染开源义务 / Open Source & AGPL Obligations</h4>
                <p>
                  个人及非商业性用户可免费运行、修改和分发本项目。但在 AGPL-3.0 协议下，<strong>如果您将本项目或修改版本部署于网络服务器，并向公众提供在线服务，您必须公开衍生作品的全部源代码</strong>。
                </p>
                <p className="mt-0.5 opacity-90">
                  Free for personal use. Under AGPL-3.0, <strong>if you run a modified version of this software on a server to provide public network services, you must make its corresponding source code publicly available</strong>.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-text mb-1">2. 商业豁免（闭源商用） / Commercial Waiver (Closed Source)</h4>
                <p>
                  任何个人或实体若要在<strong>不公开源代码（闭源）</strong>的前提下将本软件用于商业目的、商业部署，或免除 AGPL-3.0 的开源约束，<strong>必须向原作者 Joycai 申请并获得单独的商业授权协议（Commercial License）</strong>。
                </p>
                <p className="mt-0.5 opacity-90">
                  If you want to use this software commercially <strong>without disclosing your source code (closed source)</strong>, you <strong>must obtain a separate Commercial License</strong> from the original author, Joycai.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-text mb-1">3. 署名与出处要求 / Attribution Requirements</h4>
                <p>
                  无论在何种授权模式下，任何衍生或二次开发版本均必须在系统的显著位置（如关于或页脚），清晰标注原作者 <strong>Joycai</strong> 以及原项目 GitHub 链接：<code>https://github.com/Joycai/simple-trpg-chat</code>。
                </p>
                <p className="mt-0.5 opacity-90">
                  In all licensing models, any derivative works must preserve and clearly display credit to the original author (Joycai) and link to the GitHub repository.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-text mb-1">4. 免责声明 / Disclaimer of Warranty</h4>
                <p>
                  本软件及源代码均“按现状”提供，作者不提供任何形式的担保。作者不对使用者因使用本软件造成的任何直接或间接法律纠纷、数据丢失、经济赔偿承担任何民事或刑事责任。
                </p>
                <p className="mt-0.5 opacity-90">
                  The software is provided &quot;as is&quot;, without warranty of any kind. The author assumes no liability for any legal issues or damages arising from the use of this software.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-surface flex justify-end">
              <button
                type="button"
                onClick={() => setShowLicense(false)}
                className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-theme font-bold text-xs cursor-pointer transition"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center text-xs text-text-dim space-y-1 mt-4">
        <p>
          &copy; {new Date().getFullYear()}{" "}
          <a href="https://github.com/Joycai/simple-trpg-chat" target="_blank" rel="noopener noreferrer"
            className="text-primary hover:underline">
            {displayTitle}
          </a>
        </p>
        {process.env.NEXT_PUBLIC_ICP_BEIAN && (
          <p className="text-[10px] text-text-dim/50">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:underline">
              {process.env.NEXT_PUBLIC_ICP_BEIAN}
            </a>
          </p>
        )}
        <p className="text-[10px] text-text-dim/60">v{version}</p>
      </footer>
    </div>
  );
}
