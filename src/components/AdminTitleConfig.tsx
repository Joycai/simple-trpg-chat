"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Type, Save } from "lucide-react";
import { updateSystemConfig } from "@/app/actions/ai";

interface AdminTitleConfigProps {
  initialTitle: string;
}

export function AdminTitleConfig({ initialTitle }: AdminTitleConfigProps) {
  const t = useTranslations("admin");
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      await updateSystemConfig("site_title", title.trim());
      setMsg(t("saveSuccess"));
      setMsgType("success");
    } catch (e) {
      console.error(e);
      setMsg(t("saveFailed"));
      setMsgType("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-surface p-6 rounded-xl border border-border shadow-lg flex flex-col gap-6 transition-all duration-200 hover:border-purple-500/20">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
          <Type className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-text text-lg mb-1 flex items-center gap-2">
            {t("editSiteTitle")}
          </h3>
          <p className="text-xs text-text-muted leading-relaxed">
            {t("editSiteTitleDesc")}
          </p>
        </div>
      </div>

      <div className="border-t border-border/60 my-1" />

      {/* Input */}
      <div className="flex flex-col gap-2.5">
        <label htmlFor="site-title-input" className="text-sm font-bold text-text">
          {t("siteTitleLabel")}
        </label>
        <input
          id="site-title-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("siteTitlePlaceholder")}
          disabled={saving}
          className="p-3 bg-bg border border-border rounded-lg text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition placeholder-text-dim"
        />
      </div>

      {/* Footer / Actions */}
      <div className="flex items-center gap-4 mt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:bg-text-dim text-white font-bold px-4 py-2 rounded-lg text-sm transition shadow-md hover:shadow-lg disabled:shadow-none cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {saving ? t("saving") : t("saveConfig")}
        </button>

        {msg && (
          <span
            className={`text-xs font-semibold animate-fade-in ${
              msgType === "success" ? "text-success" : "text-danger"
            }`}
          >
            {msg}
          </span>
        )}
      </div>
    </section>
  );
}
