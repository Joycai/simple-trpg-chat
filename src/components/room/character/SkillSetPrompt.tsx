"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "@/components/shared/icons";

interface Props {
  skillName: string;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

const MIN = 1;
const MAX = 99;

/**
 * Themed in-page modal asking a player to set a skill value before responding to
 * a host check request (replaces the native browser prompt). Uses semantic theme
 * tokens so it adapts to the active room theme.
 */
export function SkillSetPrompt({ skillName, onConfirm, onClose }: Props) {
  const t = useTranslations("room");
  const tCommon = useTranslations("common");
  const { close, panelRef, backdropRef, panelClass } = useOverlayTransition(onClose);
  const [value, setValue] = useState("50");

  const parsed = parseInt(value, 10);
  const isValid = !isNaN(parsed) && parsed >= MIN && parsed <= MAX;

  const submit = () => {
    if (!isValid) return;
    onConfirm(parsed);
  };

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div ref={panelRef} className={`bg-surface theme-border rounded-theme shadow-2xl p-6 w-full max-w-md ${panelClass}`}
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-xl text-text font-theme-display">{t("skillSetTitle")}</h3>
          <button onClick={close} aria-label={tCommon("close")}
            className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-text-muted leading-relaxed mb-5">
          {t.rich("skillSetDesc", {
            skillName,
            skill: (chunks) => <span className="font-bold text-accent">{chunks}</span>,
          })}
        </p>

        <div className="flex flex-col gap-2 mb-5">
          <label className="text-sm text-text-muted">{t("skillSetLabel", { min: MIN, max: MAX })}</label>
          <input
            type="number"
            min={MIN}
            max={MAX}
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
