"use client";

import { useState, useEffect } from "react";
import { getRoomSkills, upsertSkillAction, deleteSkillAction } from "@/app/actions/room";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "@/components/shared/icons";
import { skillColor } from "@/components/room/character/skill-color";

interface Skill {
  id: number;
  roomId: number;
  userId: number;
  skillName: string;
  skillValue: number;
}

interface SkillPanelProps {
  roomId: number;
  userId: number;
  onClose: () => void;
  readOnly?: boolean;
  /** Bumped by the parent after a .st command, so the panel reloads its skills. */
  refreshKey?: number;
}

export function SkillPanel({ roomId, userId, onClose, readOnly = false, refreshKey = 0 }: SkillPanelProps) {
  const t = useTranslations("skills");
  const tCommon = useTranslations("common");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState(50);
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState(0);
  const router = useRouter();
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose, "drawer");

  const loadSkills = async () => {
    try {
      const data = await getRoomSkills(roomId, userId);
      setSkills(data as Skill[]);
    } catch { /* server-side, handle gracefully */ }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadSkills(); }, [roomId, userId, refreshKey]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await upsertSkillAction(roomId, userId, newName.trim(), newValue);
    setNewName("");
    setNewValue(50);
    router.refresh();
    loadSkills();
  };

  const handleEdit = async (skillName: string) => {
    await upsertSkillAction(roomId, userId, skillName, editValue);
    setEditing(null);
    router.refresh();
    loadSkills();
  };

  const handleDelete = async (skillName: string) => {
    await deleteSkillAction(roomId, userId, skillName);
    router.refresh();
    loadSkills();
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={close}>
      {/* Backdrop */}
      <div className={`absolute inset-0 bg-black/30 ${backdropClass}`} />

      {/* Sidebar drawer */}
      <div
        className={`relative ml-auto w-full sm:w-[28rem] bg-surface border-l border-border shadow-2xl h-full overflow-y-auto ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-5 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-xl font-theme-display">{t("title")}</h3>
          <button onClick={close} title={tCommon("close")}
            className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-5">
          {/* Command hint */}
          <div className="flex items-center gap-2.5 bg-surface-alt rounded-theme px-4 py-3 text-sm border border-border">
            <Icons.Info className="w-4 h-4 text-primary shrink-0" />
            <span className="text-text-muted">{t("commandHintPrefix")}</span>
            <code className="border border-primary/30 bg-primary/5 text-primary font-theme-mono text-xs px-2 py-0.5 rounded-theme">{t("commandHintCode")}</code>
            <span className="text-text-muted">{t("commandHintSuffix")}</span>
          </div>

          {/* Add form */}
          {!readOnly && (
          <div className="theme-border bg-surface-alt rounded-theme p-5 border border-border">
            <h4 className="text-base font-bold text-text mb-4">{t("addOrOverwrite")}</h4>
            <div className="flex gap-2 mb-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="flex-1 px-3 py-2.5 text-sm border border-input-border bg-input-bg rounded-theme outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary text-text placeholder:text-text-dim"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(parseInt(e.target.value) || 0)}
                min={1}
                max={99}
                className="w-16 px-2 py-2.5 text-sm border border-input-border bg-input-bg rounded-theme outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary text-text text-center font-mono"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:shadow-none text-primary-foreground py-2.5 rounded-theme text-sm font-bold transition shadow-[var(--theme-glow)]"
            >
              {t("btnAdd")}
            </button>
          </div>
          )}

          {/* Skills list */}
          {loading ? (
            <div className="text-center text-text-muted text-sm py-8">{tCommon("loading")}</div>
          ) : skills.length === 0 ? (
            <div className="text-center text-text-muted py-10">
              <Icons.ClipboardList className="w-9 h-9 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{t("noSkills")}</p>
              <p className="text-xs mt-1">{t("noSkillsDesc")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {[...skills].sort((a, b) => a.skillName.localeCompare(b.skillName, "zh") || a.id - b.id).map((skill) => {
                const col = skillColor(skill.skillName);
                return (
                <div
                  key={skill.id}
                  className="bg-surface-alt rounded-theme p-4 border border-border group hover:border-primary/30 transition"
                >
                  {editing === skill.id ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-bold text-text">{skill.skillName}</span>
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
                        min={1}
                        max={99}
                        autoFocus
                        className="w-16 px-2 py-1 text-xs border border-input-border bg-input-bg rounded-theme outline-none focus:ring-[3px] focus:ring-primary/[0.18] text-text text-center font-mono"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEdit(skill.skillName);
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                      <button onClick={() => handleEdit(skill.skillName)} aria-label="confirm"
                        className="flex items-center justify-center w-7 h-7 rounded-theme bg-primary text-primary-foreground hover:bg-primary-hover">
                        <Icons.Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditing(null)} aria-label="cancel"
                        className="flex items-center justify-center w-7 h-7 rounded-theme text-text-muted hover:text-text hover:bg-surface">
                        <Icons.X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-2.5">
                        <span className="text-sm font-bold text-text">{skill.skillName}</span>
                        <div className="flex items-center gap-2">
                          {!readOnly && (
                            <button
                              onClick={() => handleDelete(skill.skillName)}
                              className="text-text-dim hover:text-danger transition opacity-0 group-hover:opacity-100 cursor-pointer"
                              title={t("deleteTooltip")}
                            >
                              <Icons.Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <span
                            className={`text-lg font-mono font-bold transition ${readOnly ? "" : "cursor-pointer"}`}
                            style={col.textStyle}
                            onClick={readOnly ? undefined : () => { setEditing(skill.id); setEditValue(skill.skillValue); }}
                            title={readOnly ? undefined : t("editTooltip")}
                          >
                            {skill.skillValue}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-bg rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ ...col.barStyle, width: `${Math.min(100, skill.skillValue)}%` }} />
                      </div>
                    </>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
