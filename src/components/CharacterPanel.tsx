"use client";

import { useState, useEffect } from "react";
import { updateNicknameAction } from "@/app/actions/room";
import { initCocCharacterAction, saveCharacterDataAction, addCustomAttributeAction, removeCustomAttributeAction } from "@/app/actions/character";
import { getMySkillsAction, upsertSkillAction, deleteSkillAction } from "@/app/actions/skills";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CharacterData, CocAttributes } from "@/lib/character-types";
import { COC_DEFAULT_ATTRIBUTES, computeCocDerived } from "@/lib/character-types";

interface CharacterPanelProps {
  roomId: number;
  userId: number;
  currentNickname: string;
  characterData?: string | null;
  roomRuleTemplate?: string;
  onClose: () => void;
  onNicknameChange: (newNick: string) => void;
}

interface SkillItem {
  id: number;
  skillName: string;
  skillValue: number;
}

type TabId = "attributes" | "skills" | "background";

export function CharacterPanel({
  roomId,
  userId,
  currentNickname,
  characterData,
  roomRuleTemplate,
  onClose,
  onNicknameChange,
}: CharacterPanelProps) {
  const t = useTranslations("character");
  const tCommon = useTranslations("common");
  const router = useRouter();

  // Tab
  const [activeTab, setActiveTab] = useState<TabId>("attributes");

  // Nickname
  const [nickname, setNickname] = useState(currentNickname);
  const [editingNick, setEditingNick] = useState(false);

  // Character data
  const charData = parseCharData(characterData);
  const hasExistingData = !!characterData && !!charData.ruleTemplate;
  const ruleTemplate = charData.ruleTemplate || roomRuleTemplate || "basic";
  const [initDone, setInitDone] = useState(hasExistingData);

  // Auto-init COC 7th character on first open
  useEffect(() => {
    if (initDone) return;
    if (roomRuleTemplate === "coc7th") {
      initCocCharacterAction(roomId).then((data) => {
        setCocAttrs(data.cocAttributes || { ...COC_DEFAULT_ATTRIBUTES });
        setInitDone(true);
        router.refresh();
      }).catch(() => {});
    } else {
      setInitDone(true);
    }
  }, [roomRuleTemplate, roomId, initDone]);
  
  const [cocAttrs, setCocAttrs] = useState<CocAttributes>(charData.cocAttributes || { ...COC_DEFAULT_ATTRIBUTES });
  const derived = computeCocDerived(cocAttrs);
  const [bio, setBio] = useState(charData.bio || "");

  // Custom attributes
  const [customAttrs, setCustomAttrs] = useState<{name: string; value: number; max?: number}[]>(charData.customAttributes || []);
  const [newAttrName, setNewAttrName] = useState("");
  const [newAttrValue, setNewAttrValue] = useState(10);

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
    const data: CharacterData = {
      ruleTemplate,
      cocAttributes: cocAttrs,
      bio,
    };
    try {
      await saveCharacterDataAction(roomId, data);
      router.refresh();
    } catch (e) {
      console.error("Failed to save character data", e);
    }
  };

  const updateAttr = (key: keyof CocAttributes, value: number) => {
    setCocAttrs(prev => ({ ...prev, [key]: value }));
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

  const addCustomAttr = async () => {
    if (!newAttrName.trim()) return;
    try {
      await addCustomAttributeAction(roomId, { name: newAttrName.trim(), value: newAttrValue });
      setCustomAttrs(prev => {
        const idx = prev.findIndex(a => a.name === newAttrName.trim());
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { name: newAttrName.trim(), value: newAttrValue };
          return copy;
        }
        return [...prev, { name: newAttrName.trim(), value: newAttrValue }];
      });
      setNewAttrName("");
      setNewAttrValue(10);
      router.refresh();
    } catch (e) { console.error(e); }
  };

  const removeCustomAttr = async (name: string) => {
    try {
      await removeCustomAttributeAction(roomId, name);
      setCustomAttrs(prev => prev.filter(a => a.name !== name));
      router.refresh();
    } catch (e) { console.error(e); }
  };

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "attributes", label: t("tabAttributes"), icon: "📊" },
    { id: "skills", label: t("tabSkills"), icon: "📋" },
    { id: "background", label: t("tabBackground"), icon: "📝" },
  ];

  // Map keys to the translation keys
  const cocAttrKeys: { key: keyof CocAttributes; tKey: string }[] = [
    { key: "str", tKey: "str" },
    { key: "con", tKey: "con" },
    { key: "siz", tKey: "siz" },
    { key: "dex", tKey: "dex" },
    { key: "app", tKey: "app" },
    { key: "int", tKey: "int" },
    { key: "pow", tKey: "pow" },
    { key: "edu", tKey: "edu" },
    { key: "luck", tKey: "luckAttr" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface border border-border rounded-theme theme-border shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-text">{t("title")}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl cursor-pointer">×</button>
        </div>

        {/* Nickname */}
        <div className="flex items-center gap-3 bg-surface-alt rounded-theme p-3 mb-4">
          <span className="text-2xl">👤</span>
          {editingNick ? (
            <div className="flex-1 flex gap-2">
              <input value={nickname} onChange={e => setNickname(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") { setNickname(currentNickname); setEditingNick(false); } }}
                className="flex-1 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary" autoFocus />
              <button onClick={saveNickname} className="text-xs bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded font-bold cursor-pointer">{tCommon("confirm")}</button>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-between">
              <span className="font-bold text-text">{nickname}</span>
              <button onClick={() => setEditingNick(true)} className="text-xs text-text-muted hover:text-text cursor-pointer">✏️</button>
            </div>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-border mb-4">
          {tabs.map(tab => (
            <button key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-sm font-medium transition border-b-2 cursor-pointer ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-text-muted hover:text-text"
              }`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Attributes & Resources */}
        {activeTab === "attributes" && (
          <div className="flex flex-col gap-4">
            {/* Resource Bars */}
            <div>
              <label className="text-xs text-text-dim font-medium mb-2 block">{t("resourceStatus")}</label>
              <div className="flex flex-col gap-2">
                {/* HP */}
                <div>
                  <div className="flex justify-between text-xs text-text-muted mb-1">
                    <span>❤️ {t("hp")}</span>
                    <span className="font-mono">{derived.hp}/{derived.hpMax}</span>
                  </div>
                  <div className={`h-3 bg-surface-alt rounded-full overflow-hidden border border-border ${derived.hpMax > 0 && derived.hp / derived.hpMax <= 0.25 ? "hp-critical" : ""}`}>
                    <div className={`h-full rounded-full transition-all duration-300 hp-bar-fill ${
                      derived.hpMax > 0 && derived.hp / derived.hpMax > 0.5 ? "bg-success" :
                      derived.hpMax > 0 && derived.hp / derived.hpMax > 0.25 ? "bg-accent" : "bg-danger"
                    }`} style={{ width: `${derived.hpMax > 0 ? Math.min(100, (derived.hp / derived.hpMax) * 100) : 0}%` }} />
                  </div>
                </div>

                {/* COC-only: SAN / MP / LUCK / Attributes / Derived */}
                {ruleTemplate === "coc7th" && (
                <div>
                  {/* SAN */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span>💜 {t("san")}</span>
                      <span className="font-mono">{derived.san}/{derived.sanMax}</span>
                    </div>
                    <div className="h-3 bg-surface-alt rounded-full overflow-hidden border border-border">
                      <div className="h-full rounded-full transition-all duration-300 bg-purple-500"
                        style={{ width: `${derived.sanMax > 0 ? Math.min(100, (derived.san / derived.sanMax) * 100) : 0}%` }} />
                    </div>
                  </div>

                  {/* MP */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span>💙 {t("mp")}</span>
                      <span className="font-mono">{derived.mp}/{derived.mpMax}</span>
                    </div>
                    <div className="h-3 bg-surface-alt rounded-full overflow-hidden border border-border">
                      <div className="h-full rounded-full transition-all duration-300 bg-blue-500"
                        style={{ width: `${derived.mpMax > 0 ? Math.min(100, (derived.mp / derived.mpMax) * 100) : 0}%` }} />
                    </div>
                  </div>

                  {/* LUCK */}
                  <div className="flex justify-between text-xs text-text-muted">
                    <span>🍀 {t("luck")}</span>
                    <span className="font-mono">{derived.luck}</span>
                  </div>
                </div>
                )}
              </div>
            </div>

            {/* COC Attributes */}
            {ruleTemplate === "coc7th" && (
            <div>
              <label className="text-xs text-text-dim font-medium mb-2 block">{t("baseAttributes")}</label>
              <div className="grid grid-cols-2 gap-2">
                {cocAttrKeys.map(({ key, tKey }) => (
                  <div key={key} className="flex items-center gap-2 bg-surface-alt rounded p-2">
                    <label className="text-xs text-text-muted w-16 shrink-0">{t(tKey).split(" ")[0]}</label>
                    <input type="number" min={0} max={99}
                      value={cocAttrs[key]} onChange={e => updateAttr(key, parseInt(e.target.value) || 0)}
                      className="w-14 p-1 border border-input-border bg-input-bg rounded text-sm text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
                    <span className="text-[10px] text-text-dim w-8 text-right">{Math.floor((cocAttrs[key] - 50) / 5)}</span>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Derived */}
            {ruleTemplate === "coc7th" && (
            <div>
              <label className="text-xs text-text-dim font-medium mb-2 block">{t("derivedAttributes")}</label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-surface-alt rounded p-2 text-center">
                  <span className="text-text-muted">MOV</span>
                  <div className="font-bold text-text font-mono">{derived.mov}</div>
                </div>
                <div className="bg-surface-alt rounded p-2 text-center">
                  <span className="text-text-muted">DB</span>
                  <div className="font-bold text-text font-mono">{derived.db}</div>
                </div>
                <div className="bg-surface-alt rounded p-2 text-center">
                  <span className="text-text-muted">{t("build")}</span>
                  <div className="font-bold text-text font-mono">{derived.build}</div>
                </div>
              </div>
            </div>
            )}

            {ruleTemplate !== "coc7th" && (
              <p className="text-xs text-text-dim text-center py-2">
                {t("generalD100Hint")}
              </p>
            )}

            <button onClick={saveCharacterData}
              className="bg-primary hover:bg-primary-hover text-white py-2 rounded-theme font-bold text-sm cursor-pointer transition">
              {t("saveAttributes")}
            </button>

            {/* Custom Attributes */}
            <div>
              <label className="text-xs text-text-dim font-medium mb-2 block">{t("customAttributes")}</label>
              {customAttrs.length > 0 && (
                <div className="flex flex-col gap-1 mb-2">
                  {customAttrs.map(attr => (
                    <div key={attr.name} className="flex items-center gap-2 bg-surface-alt rounded p-2 group">
                      <span className="flex-1 text-sm text-text">{attr.name}</span>
                      <span className="text-xs text-text-muted font-mono w-12 text-right">{attr.value}</span>
                      <button onClick={() => removeCustomAttr(attr.name)}
                        className="text-xs text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition cursor-pointer">🗑</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={newAttrName} onChange={e => setNewAttrName(e.target.value)}
                  placeholder={t("customAttrPlaceholder")} onKeyDown={e => e.key === "Enter" && addCustomAttr()}
                  className="flex-1 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary" />
                <input type="number" min={0} max={999} value={newAttrValue}
                  onChange={e => setNewAttrValue(parseInt(e.target.value) || 0)}
                  className="w-16 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
                <button onClick={addCustomAttr}
                  className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded text-xs font-bold cursor-pointer">＋</button>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Skills */}
        {activeTab === "skills" && (
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
                  <button onClick={() => removeSkill(s.id)}
                    className="text-xs text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition cursor-pointer">🗑</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newSkillName} onChange={e => setNewSkillName(e.target.value)}
                placeholder={t("skillNamePlaceholder")} onKeyDown={e => e.key === "Enter" && addSkill()}
                className="flex-1 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary" />
              <input type="number" min={1} max={99} value={newSkillValue}
                onChange={e => setNewSkillValue(parseInt(e.target.value) || 1)}
                className="w-16 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
              <button onClick={addSkill}
                className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded text-xs font-bold cursor-pointer">＋</button>
            </div>
          </div>
        )}

        {/* Tab: Background */}
        {activeTab === "background" && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-text-dim font-medium mb-1 block">{t("bioPlaceholder").slice(0, 4)}</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} onBlur={saveCharacterData}
                placeholder={t("bioPlaceholder")} rows={6}
                className="w-full p-2 border border-input-border bg-input-bg rounded text-sm text-text resize-none outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <button onClick={saveCharacterData}
              className="bg-primary hover:bg-primary-hover text-white py-2 rounded-theme font-bold text-sm cursor-pointer transition">
              {t("saveBio")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function parseCharData(json?: string | null): Record<string, any> {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}
