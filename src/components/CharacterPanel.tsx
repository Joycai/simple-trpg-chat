"use client";

import { useState, useEffect } from "react";
import { updateNicknameAction, updateCharacterDataAction } from "@/app/actions/room";
import { getMySkillsAction, upsertSkillAction, deleteSkillAction } from "@/app/actions/skills";
import { useRouter } from "next/navigation";

interface CharacterPanelProps {
  roomId: number;
  userId: number;
  currentNickname: string;
  characterData?: string | null;
  onClose: () => void;
  onNicknameChange: (newNick: string) => void;
}

interface SkillItem {
  id: number;
  skillName: string;
  skillValue: number;
}

export function CharacterPanel({
  roomId,
  userId,
  currentNickname,
  characterData,
  onClose,
  onNicknameChange,
}: CharacterPanelProps) {
  const router = useRouter();

  // Nickname
  const [nickname, setNickname] = useState(currentNickname);
  const [editingNick, setEditingNick] = useState(false);

  // Character data
  const charData = parseCharData(characterData);
  const [hp, setHp] = useState(charData.hp || 10);
  const [maxHp, setMaxHp] = useState(charData.maxHp || 10);
  const [bio, setBio] = useState(charData.bio || "");

  // Skills
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillValue, setNewSkillValue] = useState(50);

  useEffect(() => {
    getMySkillsAction(roomId).then(setSkills).catch(() => {});
  }, [roomId]);

  const saveNickname = async () => {
    if (nickname.trim() && nickname !== currentNickname) {
      await updateNicknameAction(roomId, nickname.trim());
      onNicknameChange(nickname.trim());
    }
    setEditingNick(false);
  };

  const saveCharacterData = async () => {
    await updateCharacterDataAction(roomId, { hp, maxHp, bio });
  };

  const addSkill = async () => {
    if (!newSkillName.trim()) return;
    await upsertSkillAction(roomId, newSkillName.trim(), newSkillValue);
    setNewSkillName("");
    router.refresh();
    getMySkillsAction(roomId).then(setSkills).catch(() => {});
  };

  const removeSkill = async (skillId: number) => {
    await deleteSkillAction(roomId, skillId);
    router.refresh();
    getMySkillsAction(roomId).then(setSkills).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-text">👤 角色面板</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl">×</button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Nickname */}
          <div className="flex items-center gap-3 bg-surface-alt rounded-theme p-3">
            <span className="text-2xl">👤</span>
            {editingNick ? (
              <div className="flex-1 flex gap-2">
                <input
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") { setNickname(currentNickname); setEditingNick(false); } }}
                  className="flex-1 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text"
                  autoFocus
                />
                <button onClick={saveNickname} className="text-xs bg-primary text-white px-3 py-1.5 rounded font-bold">保存</button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-between">
                <span className="font-bold text-text">{nickname}</span>
                <button onClick={() => setEditingNick(true)} className="text-xs text-text-muted hover:text-text">✏️</button>
              </div>
            )}
          </div>

          {/* HP */}
          <div>
            <label className="text-xs text-text-dim font-medium flex items-center gap-1 mb-2">❤️ 生命值</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={999}
                value={hp} onChange={e => setHp(parseInt(e.target.value) || 0)}
                className="w-20 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text text-center font-mono"
              />
              <span className="text-text-muted text-sm">/</span>
              <input
                type="number" min={1} max={999}
                value={maxHp} onChange={e => setMaxHp(parseInt(e.target.value) || 1)}
                className="w-20 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text text-center font-mono"
              />
              <button onClick={saveCharacterData} className="text-xs text-primary hover:underline ml-2">保存</button>
            </div>
            {/* HP Bar */}
            <div className={`mt-2 h-3 bg-surface-alt rounded-full overflow-hidden border border-border ${maxHp > 0 && hp / maxHp <= 0.25 ? "hp-critical" : ""}`}>
              <div
                className={`h-full rounded-full transition-all duration-300 hp-bar-fill ${
                  maxHp > 0 && hp / maxHp > 0.5 ? "bg-success" :
                  maxHp > 0 && hp / maxHp > 0.25 ? "bg-accent" : "bg-danger"
                }`}
                style={{ width: `${maxHp > 0 ? Math.min(100, (hp / maxHp) * 100) : 0}%` }}
              />
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="text-xs text-text-dim font-medium mb-1 block">📝 简介</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              onBlur={saveCharacterData}
              placeholder="写下你的角色简介..."
              rows={3}
              className="w-full p-2 border border-input-border bg-input-bg rounded text-sm text-text resize-none"
            />
          </div>

          {/* Skills */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-text-dim font-medium">📋 技能</label>
              <span className="text-[10px] text-text-muted">也可用 .st 指令设置</span>
            </div>
            <div className="flex flex-col gap-1 mb-3">
              {skills.length === 0 && (
                <p className="text-xs text-text-dim italic text-center py-4">暂无技能，使用下方表单添加</p>
              )}
              {skills.map(s => (
                <div key={s.id} className="flex items-center gap-2 bg-surface-alt rounded p-2 group">
                  <span className="flex-1 text-sm text-text font-medium">{s.skillName}</span>
                  <div className="w-24 h-2 bg-bg rounded-full overflow-hidden border border-border">
                    <div
                      className={`h-full rounded-full ${s.skillValue >= 75 ? "bg-success" : s.skillValue >= 50 ? "bg-accent" : "bg-danger"}`}
                      style={{ width: `${Math.min(100, s.skillValue)}%` }}
                    />
                  </div>
                  <span className="text-xs text-text-muted font-mono w-8 text-right">{s.skillValue}</span>
                  <button onClick={() => removeSkill(s.id)}
                    className="text-xs text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition">
                    🗑
                  </button>
                </div>
              ))}
            </div>
            {/* Add skill */}
            <div className="flex gap-2">
              <input
                value={newSkillName}
                onChange={e => setNewSkillName(e.target.value)}
                placeholder="技能名"
                onKeyDown={e => e.key === "Enter" && addSkill()}
                className="flex-1 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text"
              />
              <input
                type="number" min={1} max={99}
                value={newSkillValue}
                onChange={e => setNewSkillValue(parseInt(e.target.value) || 1)}
                className="w-16 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text text-center font-mono"
              />
              <button onClick={addSkill}
                className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded text-xs font-bold">
                ＋
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function parseCharData(json?: string | null): Record<string, any> {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}
