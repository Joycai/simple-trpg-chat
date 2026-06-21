"use client";

import { useTranslations } from "next-intl";

export interface SkillItem {
  id: number;
  skillName: string;
  skillValue: number;
}

interface SkillsTabProps {
  skills: SkillItem[];
  readOnly: boolean;
  newSkillName: string;
  onNewSkillNameChange: (v: string) => void;
  newSkillValue: number;
  onNewSkillValueChange: (v: number) => void;
  onAddSkill: () => void;
  onRemoveSkill: (id: number) => void;
}

export function SkillsTab({
  skills, readOnly, newSkillName, onNewSkillNameChange,
  newSkillValue, onNewSkillValueChange, onAddSkill, onRemoveSkill,
}: SkillsTabProps) {
  const t = useTranslations("character");

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-text-dim font-medium">{t("skillsList")}</label>
        <span className="text-[10px] text-text-muted">{t("skillsHint")}</span>
      </div>
      <div className="flex flex-col gap-1 mb-3">
        {skills.length === 0 && (
          <p className="text-xs text-text-dim italic text-center py-4">{t("noSkills")}</p>
        )}
        {skills.map(s => (
          <div key={s.id} className="flex items-center gap-2 bg-surface-alt rounded p-2 group">
            <span className="flex-1 text-sm text-text font-medium">{s.skillName}</span>
            <div className="w-24 h-2 bg-bg rounded-full overflow-hidden border border-border">
              <div className={`h-full rounded-full ${s.skillValue >= 75 ? "bg-success" : s.skillValue >= 50 ? "bg-accent" : "bg-danger"}`}
                style={{ width: `${Math.min(100, s.skillValue)}%` }} />
            </div>
            <span className="text-xs text-text-muted font-mono w-8 text-right">{s.skillValue}</span>
            {!readOnly && (
              <button onClick={() => onRemoveSkill(s.id)}
                className="text-xs text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition cursor-pointer">🗑</button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="flex gap-2">
          <input value={newSkillName} onChange={e => onNewSkillNameChange(e.target.value)}
            placeholder={t("skillNamePlaceholder")} onKeyDown={e => e.key === "Enter" && onAddSkill()}
            className="flex-1 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary" />
          <input type="number" min={1} max={99} value={newSkillValue}
            onChange={e => onNewSkillValueChange(parseInt(e.target.value) || 1)}
            className="w-16 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
          <button onClick={onAddSkill}
            className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded text-xs font-bold cursor-pointer">＋</button>
        </div>
      )}
    </div>
  );
}
