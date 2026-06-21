"use client";

import { useTranslations } from "next-intl";
import { SaveButton, type SaveStatus } from "./SaveButton";

interface BackgroundTabProps {
  bio: string;
  onBioChange: (v: string) => void;
  readOnly: boolean;
  saveStatus: SaveStatus;
  onSave: () => void;
}

export function BackgroundTab({ bio, onBioChange, readOnly, saveStatus, onSave }: BackgroundTabProps) {
  const t = useTranslations("character");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs text-text-dim font-medium mb-1 block">{t("bioPlaceholder").slice(0, 4)}</label>
        <textarea value={bio} onChange={e => onBioChange(e.target.value)} onBlur={readOnly ? undefined : onSave}
          placeholder={t("bioPlaceholder")} rows={6}
          readOnly={readOnly}
          className="w-full p-2 border border-input-border bg-input-bg rounded text-sm text-text resize-none outline-none focus:ring-1 focus:ring-primary disabled:opacity-85 disabled:cursor-default" />
      </div>
      {!readOnly && (
        <SaveButton status={saveStatus} onClick={onSave} idleLabel={t("saveBio")} />
      )}
    </div>
  );
}
