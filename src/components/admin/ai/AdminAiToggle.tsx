"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bot } from "lucide-react";
import { updateSystemConfig } from "@/app/actions/ai";
import { useAsyncAction } from "@/lib/ui/useAsyncAction";

interface AdminAiToggleProps {
  initialEnabled: boolean;
}

export function AdminAiToggle({ initialEnabled }: AdminAiToggleProps) {
  const t = useTranslations("admin");
  const [enabled, setEnabled] = useState(initialEnabled);
  // A failure shows nothing and leaves the switch where it was.
  const toggle = useAsyncAction(async (next: boolean) => {
    await updateSystemConfig("ai_enabled", next ? "true" : "false");
    setEnabled(next);
  });
  const saving = toggle.pending;

  const handleToggle = () => {
    void toggle.run(!enabled);
  };

  return (
    <div className="bg-surface theme-border border border-border rounded-theme p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <span className="w-11 h-11 rounded-theme bg-ai/15 text-ai flex items-center justify-center shrink-0">
          <Bot className="w-6 h-6" />
        </span>
        <div className="min-w-0">
          <h3 className="font-bold text-text text-base">{t("aiEnableTitle")}</h3>
          <p className="text-sm text-text-muted mt-0.5">{t("aiEnableDesc")}</p>
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={saving}
        role="switch"
        aria-checked={enabled}
        aria-label={t("aiEnableTitle")}
        className={`relative w-14 h-7 rounded-full transition-colors duration-200 shrink-0 cursor-pointer disabled:opacity-60 ${
          enabled ? "bg-ai shadow-[0_0_14px_rgb(var(--theme-ai)/0.5)]" : "bg-text-dim/30"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${
            enabled ? "translate-x-7" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
