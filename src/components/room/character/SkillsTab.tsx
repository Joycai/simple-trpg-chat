"use client";

import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { skillColor } from "@/components/room/character/skill-color";

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
    <div className="flex flex-col gap-4">
      {/* Add / overwrite */}
      {!readOnly && (
        <div className="flex gap-2">
          <input value={newSkillName} onChange={e => onNewSkillNameChange(e.target.value)}
            placeholder={t("skillNamePlaceholder")} onKeyDown={e => e.key === "Enter" && onAddSkill()}
            className="flex-1 px-3 py-2 border border-input-border bg-input-bg rounded-theme text-sm text-text outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary placeholder:text-text-dim" />
          <input type="number" min={1} max={99} value={newSkillValue}
            onChange={e => onNewSkillValueChange(parseInt(e.target.value) || 1)}
            className="w-16 px-2 py-2 border border-input-border bg-input-bg rounded-theme text-sm text-text text-center font-mono outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
          <button onClick={onAddSkill} aria-label="add"
            className="flex items-center justify-center w-10 rounded-theme bg-primary hover:bg-primary-hover text-primary-foreground cursor-pointer">
            <Icons.Plus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Skill list — matches the standalone 技能 drawer */}
      {skills.length === 0 ? (
        <p className="text-xs text-text-dim italic text-center py-6">{t("noSkills")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {[...skills].sort((a, b) => a.skillName.localeCompare(b.skillName, "zh") || a.id - b.id).map(s => {
            const col = skillColor(s.skillName);
            return (
              <div key={s.id} className="bg-surface-alt rounded-theme p-4 border border-border group hover:border-primary/30 transition">
                <div className="flex justify-between items-center mb-2.5">
                  <span className="text-sm font-bold text-text">{s.skillName}</span>
                  <div className="flex items-center gap-2">
                    {!readOnly && (
                      <button onClick={() => onRemoveSkill(s.id)} aria-label="delete"
                        className="text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition cursor-pointer">
                        <Icons.Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="text-lg font-mono font-bold" style={col.textStyle}>{s.skillValue}</span>
                  </div>
                </div>
                <div className="h-2 bg-bg rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ ...col.barStyle, width: `${Math.min(100, s.skillValue)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
