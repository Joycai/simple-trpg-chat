"use client";

import { useState, useEffect } from "react";
import { getRoomSkills, upsertSkillAction, deleteSkillAction } from "@/app/actions/room";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
}

export function SkillPanel({ roomId, userId, onClose, readOnly = false }: SkillPanelProps) {
  const t = useTranslations("skills");
  const tCommon = useTranslations("common");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState(50);
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState(0);
  const router = useRouter();

  const loadSkills = async () => {
    try {
      const data = await getRoomSkills(roomId, userId);
      setSkills(data as Skill[]);
    } catch { /* server-side, handle gracefully */ }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadSkills(); }, [roomId, userId]);

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
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Sidebar drawer */}
      <div
        className="relative ml-auto w-full sm:w-80 bg-surface border-l border-border shadow-2xl h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">{t("title")}</h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-xl leading-none transition"
            title={tCommon("close")}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-5">
          {/* Tip */}
          <div className="bg-surface-alt rounded-theme p-3 text-xs text-text-muted border border-border">
            💡 {t("commandHintPrefix")}<code className="bg-bg px-1 py-0.5 rounded text-text font-mono">{t("commandHintCode")}</code>
          </div>

          {/* Add form */}
          {!readOnly && (
          <div className="bg-surface-alt rounded-theme p-4 border border-border">
            <h4 className="text-sm font-bold text-text mb-3">{t("addOrOverwrite")}</h4>
            <div className="flex gap-2 mb-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="flex-1 px-3 py-2 text-sm border border-input-border bg-input-bg rounded outline-none focus:ring-2 focus:ring-primary/50 text-text"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(parseInt(e.target.value) || 0)}
                min={1}
                max={99}
                className="w-16 px-2 py-2 text-sm border border-input-border bg-input-bg rounded outline-none focus:ring-2 focus:ring-primary/50 text-text text-center font-mono"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded-lg text-sm font-bold transition"
            >
              {t("btnAdd")}
            </button>
          </div>
          )}

          {/* Skills list */}
          {loading ? (
            <div className="text-center text-text-muted text-sm py-8">{tCommon("loading")}</div>
          ) : skills.length === 0 ? (
            <div className="text-center text-text-muted py-8">
              <div className="text-3xl mb-2">📝</div>
              <p className="text-sm">{t("noSkills")}</p>
              <p className="text-xs mt-1">{t("noSkillsDesc")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="bg-surface-alt rounded-theme p-3 border border-border group hover:border-primary/30 transition"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-text">{skill.skillName}</span>
                    {!readOnly && (
                      <button
                        onClick={() => handleDelete(skill.skillName)}
                        className="text-[10px] text-danger/50 hover:text-danger transition opacity-0 group-hover:opacity-100"
                        title={t("deleteTooltip")}
                      >
                        🗑
                      </button>
                    )}
                  </div>

                  {/* Value bar */}
                  {editing === skill.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
                        min={1}
                        max={99}
                        autoFocus
                        className="w-16 px-2 py-1 text-xs border border-input-border bg-input-bg rounded outline-none focus:ring-2 focus:ring-primary/50 text-text text-center font-mono"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEdit(skill.skillName);
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                      <button
                        onClick={() => handleEdit(skill.skillName)}
                        className="text-xs bg-primary text-white px-2 py-1 rounded hover:bg-primary-hover"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="text-xs text-text-muted hover:text-text px-2 py-1"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-bg rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            skill.skillValue >= 80 ? "bg-danger" :
                            skill.skillValue >= 50 ? "bg-accent" :
                            "bg-primary"
                          }`}
                          style={{ width: `${Math.min(100, skill.skillValue)}%` }}
                        />
                      </div>
                      <span
                        className={`text-sm font-mono font-bold text-text transition ${readOnly ? "" : "cursor-pointer hover:text-primary"}`}
                        onClick={readOnly ? undefined : () => {
                          setEditing(skill.id);
                          setEditValue(skill.skillValue);
                        }}
                        title={readOnly ? undefined : t("editTooltip")}
                      >
                        {skill.skillValue}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
