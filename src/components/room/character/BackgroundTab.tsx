"use client";

import { useTranslations } from "next-intl";

interface BackgroundTabProps {
  bio: string;
  onBioChange: (v: string) => void;
  occupation: string;
  onOccupationChange: (v: string) => void;
  age: number | "";
  onAgeChange: (v: number | "") => void;
  readOnly: boolean;
  /** When true, render role/level inputs above the occupation row (d20 only). */
  showRoleLevel?: boolean;
  role?: string;
  onRoleChange?: (v: string) => void;
  level?: number | "";
  onLevelChange?: (v: number | "") => void;
}

export function BackgroundTab({
  bio, onBioChange, occupation, onOccupationChange, age, onAgeChange, readOnly,
  showRoleLevel = false, role = "", onRoleChange, level = "", onLevelChange,
}: BackgroundTabProps) {
  const t = useTranslations("character");

  const fieldCls = "w-full px-3 py-2.5 border border-input-border bg-input-bg rounded-theme text-sm text-text outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary placeholder:text-text-dim disabled:opacity-80";

  return (
    <div className="flex flex-col gap-5">
      {/* d20-only: role + level (free-text/free-number, no class system) */}
      {showRoleLevel && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("role")}</label>
            <input value={role} onChange={e => onRoleChange?.(e.target.value)}
              readOnly={readOnly} placeholder={t("rolePlaceholder")} className={fieldCls} />
          </div>
          <div className="w-24">
            <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("level")}</label>
            <input type="number" min={0} max={99} value={level}
              onChange={e => onLevelChange?.(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
              readOnly={readOnly} placeholder={t("levelPlaceholder")} className={`${fieldCls} text-center font-mono`} />
          </div>
        </div>
      )}

      {/* Occupation + age */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("occupation")}</label>
          <input value={occupation} onChange={e => onOccupationChange(e.target.value)}
            readOnly={readOnly} placeholder={t("occupationPlaceholder")} className={fieldCls} />
        </div>
        <div className="w-24">
          <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("age")}</label>
          <input type="number" min={0} max={999} value={age}
            onChange={e => onAgeChange(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
            readOnly={readOnly} className={`${fieldCls} text-center font-mono`} />
        </div>
      </div>

      {/* Bio */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-text-dim font-medium">{t("backgroundStory")}</label>
          <span className="text-[10px] text-text-dim">{t("markdownHint")}</span>
        </div>
        <textarea value={bio} onChange={e => onBioChange(e.target.value)}
          placeholder={t("bioPlaceholder")} rows={10} readOnly={readOnly}
          className={`${fieldCls} resize-none leading-relaxed`} />
      </div>
    </div>
  );
}
