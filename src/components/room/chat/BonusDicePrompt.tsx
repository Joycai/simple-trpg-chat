"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "@/components/shared/icons";

interface Props {
  /** Upper bound for the bonus-dice count (from the rule's capabilities). */
  max: number;
  onConfirm: (bonusDice: number) => void;
  onClose: () => void;
}

/**
 * Themed in-page modal asking a player for their 加骰 count (x) before
 * responding to a rule-specialized host check request (狩魂者: the check
 * rolls 1d20 + x个d4 ± 时髦骰d6 vs DC). Mirrors SkillSetPrompt's chrome.
 */
export function BonusDicePrompt({ max, onConfirm, onClose }: Props) {
  const t = useTranslations("room");
  const tCommon = useTranslations("common");
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose);
  const [value, setValue] = useState("0");

  const parsed = parseInt(value, 10);
  const isValid = !isNaN(parsed) && parsed >= 0 && parsed <= max;

  const submit = () => {
    if (!isValid) return;
    onConfirm(parsed);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 ${backdropClass}`} onClick={close}>
      <div className={`bg-surface theme-border overlay-modal rounded-theme shadow-2xl p-6 w-full max-w-md ${panelClass}`}
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-xl text-text font-theme-display">{t("bonusDiceTitle")}</h3>
          <button onClick={close} aria-label={tCommon("close")}
            className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-text-muted leading-relaxed mb-5">{t("bonusDiceDesc")}</p>

        <div className="flex flex-col gap-2 mb-5">
          <label className="text-sm text-text-muted">{t("bonusDiceLabel", { max })}</label>
          <input
            type="number"
            min={0}
            max={max}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            autoFocus
            className="w-full px-4 py-3 text-lg font-bold border border-input-border bg-input-bg rounded-theme text-text outline-none transition focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent placeholder:text-text-dim"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={close}
            className="flex-1 py-3 rounded-theme font-bold text-sm border border-border text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            {t("skillSetCancel")}
          </button>
          <button onClick={submit} disabled={!isValid}
            className="flex-1 py-3 rounded-theme font-bold text-sm transition hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:shadow-none bg-gradient-to-b from-accent to-accent/80 text-accent-foreground shadow-[0_0_18px_rgb(var(--theme-accent)/0.4)]">
            {t("skillSetConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
