"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";

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
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose);
  const [value, setValue] = useState("50");

  const parsed = parseInt(value, 10);
  const isValid = !isNaN(parsed) && parsed >= MIN && parsed <= MAX;

  const submit = () => {
    if (!isValid) return;
    onConfirm(parsed);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${backdropClass}`} onClick={close}>
      <div className={`bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-sm mx-4 ${panelClass}`}
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg text-text">{t("skillSetTitle")}</h3>
          <button onClick={close} className="text-text-muted hover:text-text text-xl cursor-pointer">×</button>
        </div>

        <p className="text-sm text-text-muted mb-4">
          {t("skillSetDesc", { skillName })}
        </p>

        <div className="flex flex-col gap-1.5 mb-5">
          <label className="text-xs text-text-dim">{t("skillSetLabel", { min: MIN, max: MAX })}</label>
          <input
            type="number"
            min={MIN}
            max={MAX}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            autoFocus
            className="p-2 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={close}
            className="flex-1 py-2 rounded font-bold text-sm border border-border text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            {t("skillSetCancel")}
          </button>
          <button onClick={submit} disabled={!isValid}
            className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-40 text-accent-foreground py-2 rounded font-bold text-sm transition cursor-pointer">
            {t("skillSetConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
