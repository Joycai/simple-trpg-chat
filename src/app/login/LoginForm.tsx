"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

interface LoginFormProps {
  siteTitle: string;
}

export function LoginForm({ siteTitle }: LoginFormProps) {
  const t = useTranslations("login");
  const [error, setError] = useState("");
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
  const mainHeaderTitle = displayTitle.startsWith("🎲") ? displayTitle : `🎲 ${displayTitle}`;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-surface">
      <form
        onSubmit={handleSubmit}
        className="p-8 bg-surface rounded-theme theme-border shadow-lg flex flex-col gap-4 w-full max-w-sm border border-border"
      >
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-text">{mainHeaderTitle}</h1>
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
          className="bg-primary hover:bg-primary-hover disabled:bg-text-dim text-white p-2.5 rounded-theme font-bold transition text-sm mt-2 flex items-center justify-center gap-2 cursor-pointer"
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

        <div className="text-[10px] text-text-muted text-center mt-1">
          {t("acceptLicensePrompt")}
          <button
            type="button"
            onClick={() => setShowLicense(true)}
            className="text-primary hover:underline font-medium bg-transparent border-none p-0 cursor-pointer inline-block ml-0.5"
          >
            {t("licenseAgreementText")}
          </button>
        </div>

        <p className="text-[10px] text-text-dim text-center mt-1">
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
                  The software is provided "as is", without warranty of any kind. The author assumes no liability for any legal issues or damages arising from the use of this software.
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
      </footer>
    </div>
  );
}
