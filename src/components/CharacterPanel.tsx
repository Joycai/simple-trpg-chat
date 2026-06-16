"use client";

import { useState, useEffect } from "react";
import { updateNicknameAction, getRoomSkills, updateRoomMemberColorAction } from "@/app/actions/room";
import { initCocCharacterAction, saveCharacterDataAction, addCustomAttributeAction, removeCustomAttributeAction, updateResourcesAction } from "@/app/actions/character";
import { getMySkillsAction, upsertSkillAction, deleteSkillAction } from "@/app/actions/skills";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CharacterData, CocAttributes } from "@/lib/character-types";
import { COC_DEFAULT_ATTRIBUTES, computeCocDerived } from "@/lib/character-types";
import { PRESET_AVATAR_COLORS, getContrastColor, getRandomColorForUser } from "@/lib/avatar-colors";

interface CharacterPanelProps {
  roomId: number;
  userId: number;
  currentNickname: string;
  characterData?: string | null;
  roomRuleTemplate?: string;
  onClose: () => void;
  onNicknameChange: (newNick: string) => void;
  readOnly?: boolean;
  targetUserId?: number;
  loading?: boolean;
  avatarColor?: string | null;
  isGM?: boolean;
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
  readOnly = false,
  targetUserId,
  loading = false,
  avatarColor,
  isGM = false,
}: CharacterPanelProps) {
  const t = useTranslations("character");
  const tCommon = useTranslations("common");
  const router = useRouter();

  // Determine if resources can be edited (owner or GM)
  const canEditResources = !readOnly || isGM;

  // Tab
  const [activeTab, setActiveTab] = useState<TabId>("attributes");

  // Nickname & Color
  const [nickname, setNickname] = useState(currentNickname);
  const [editingNick, setEditingNick] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>(avatarColor || getRandomColorForUser(userId));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  // Character data
  const charData = parseCharData(characterData);
  const hasExistingData = !!characterData && !!charData.ruleTemplate;
  const ruleTemplate = charData.ruleTemplate || roomRuleTemplate || "basic";
  const [initDone, setInitDone] = useState(hasExistingData);

  // Auto-init COC 7th character on first open
  useEffect(() => {
    if (readOnly) return;
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
  }, [roomRuleTemplate, roomId, initDone, readOnly]);
  
  const [cocAttrs, setCocAttrs] = useState<CocAttributes>(charData.cocAttributes || { ...COC_DEFAULT_ATTRIBUTES });
  const derived = computeCocDerived(cocAttrs);
  const [bio, setBio] = useState(charData.bio || "");

  // Custom attributes
  const [customAttrs, setCustomAttrs] = useState<{name: string; value: number; max?: number}[]>(charData.customAttributes || []);
  const [newAttrName, setNewAttrName] = useState("");
  const [newAttrValue, setNewAttrValue] = useState(10);

  // Resource current values
  const [currentHp, setCurrentHp] = useState(charData.cocDerived?.hp_current ?? derived.hp);
  const [currentSan, setCurrentSan] = useState(charData.cocDerived?.san_current ?? derived.san);
  const [currentMp, setCurrentMp] = useState(charData.cocDerived?.mp_current ?? derived.mp);

  // Skills
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillValue, setNewSkillValue] = useState(50);

  useEffect(() => {
    if (readOnly && targetUserId) {
      getRoomSkills(roomId, targetUserId).then((data) => {
        setSkills(data.map(s => ({ id: s.id, skillName: s.skillName, skillValue: s.skillValue })));
      }).catch(() => {});
    } else {
      getMySkillsAction(roomId).then(setSkills).catch(() => {});
    }
  }, [roomId, readOnly, targetUserId]);

  const saveNickname = async () => {
    if (nickname.trim() && nickname !== currentNickname) {
      await updateNicknameAction(roomId, nickname.trim());
      onNicknameChange(nickname.trim());
    }
    setEditingNick(false);
  };

  const handleColorChange = async (color: string) => {
    if (readOnly) return;
    setSelectedColor(color);
    try {
      await updateRoomMemberColorAction(roomId, userId, color);
    } catch (err) {
      console.error("Failed to update avatar color:", err);
    }
  };

  const saveCharacterData = async () => {
    const data: CharacterData = {
      ruleTemplate,
      cocAttributes: cocAttrs,
      bio,
    };
    setSaveStatus("saving");
    try {
      await saveCharacterDataAction(roomId, data);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
      router.refresh();
    } catch (e) {
      console.error("Failed to save character data", e);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const saveResourceValues = async () => {
    setSaveStatus("saving");
    try {
      await updateResourcesAction(roomId, targetUserId || userId, {
        hp_current: currentHp,
        san_current: currentSan,
        mp_current: currentMp,
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
      router.refresh();
    } catch (e) {
      console.error("Failed to save resource values", e);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
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

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-surface border border-border rounded-theme theme-border shadow-2xl p-6 w-full max-w-sm mx-4"
          onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-bold text-lg text-text">{t("titleOther", { name: currentNickname })}</h3>
            <button onClick={onClose} className="text-text-muted hover:text-text text-xl cursor-pointer">×</button>
          </div>
          <div className="text-center py-12 text-text-muted flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4" />
            <p className="text-sm font-medium">{tCommon("loading")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (readOnly && !hasExistingData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-surface border border-border rounded-theme theme-border shadow-2xl p-6 w-full max-w-sm mx-4"
          onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-bold text-lg text-text">{t("titleOther", { name: currentNickname })}</h3>
            <button onClick={onClose} className="text-text-muted hover:text-text text-xl cursor-pointer">×</button>
          </div>
          <div className="text-center py-8 text-text-muted">
            <span className="text-4xl block mb-3">🎴</span>
            <p className="text-sm font-medium">{t("notInitialized")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface border border-border rounded-theme theme-border shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-text">{readOnly ? t("titleOther", { name: currentNickname }) : t("title")}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl cursor-pointer">×</button>
        </div>

        {/* Nickname & Avatar Color */}
        <div className="flex flex-col gap-3.5 bg-surface-alt rounded-theme p-3 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-md transition-colors shrink-0"
              style={{
                backgroundColor: selectedColor,
                color: getContrastColor(selectedColor),
              }}
            >
              {nickname.charAt(0).toUpperCase()}
            </div>
            {editingNick ? (
              <div className="flex-1 flex gap-2">
                <input value={nickname} onChange={e => setNickname(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") { setNickname(currentNickname); setEditingNick(false); } }}
                  className="flex-1 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary" autoFocus />
                <button onClick={saveNickname} className="text-xs bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded font-bold cursor-pointer">{tCommon("confirm")}</button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-between">
                <span className="font-bold text-text text-base">{nickname}</span>
                {!readOnly && <button onClick={() => setEditingNick(true)} className="text-xs text-text-muted hover:text-text cursor-pointer">✏️</button>}
              </div>
            )}
          </div>

          {!readOnly && (
            <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2.5">
              <label className="text-xs text-text-dim font-medium">{t("avatarColor")}</label>
              <div className="flex flex-wrap gap-2 items-center">
                {PRESET_AVATAR_COLORS.map(preset => (
                  <button
                    key={preset.hex}
                    onClick={() => handleColorChange(preset.hex)}
                    className={`w-6 h-6 rounded-full border transition cursor-pointer relative ${
                      selectedColor.toLowerCase() === preset.hex.toLowerCase()
                        ? "border-text scale-110 shadow-sm"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: preset.hex }}
                    title={preset.name}
                  >
                    {selectedColor.toLowerCase() === preset.hex.toLowerCase() && (
                      <span className="absolute inset-0 flex items-center justify-center text-[10px]" style={{ color: preset.text }}>
                        ✓
                      </span>
                    )}
                  </button>
                ))}
                {/* Custom Hex input */}
                <div className="flex items-center gap-1.5 ml-1.5">
                  <input
                    type="color"
                    value={selectedColor.startsWith("#") && selectedColor.length === 7 ? selectedColor : "#6366f1"}
                    onChange={e => handleColorChange(e.target.value)}
                    className="w-6 h-6 border-0 p-0 rounded-full cursor-pointer bg-transparent outline-none overflow-hidden"
                  />
                  <input
                    type="text"
                    value={selectedColor}
                    onChange={e => {
                      const val = e.target.value;
                      if (val.length <= 7) {
                        setSelectedColor(val);
                        if (val.match(/^#[0-9a-fA-F]{6}$/)) {
                          handleColorChange(val);
                        }
                      }
                    }}
                    placeholder="#HEX"
                    className="w-16 p-1 border border-input-border bg-input-bg rounded text-[10px] text-text font-mono outline-none"
                  />
                </div>
              </div>
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
                    {canEditResources ? (
                      <div className="flex gap-1 items-center">
                        <input type="number" min={0} max={derived.hpMax}
                          value={currentHp} onChange={e => setCurrentHp(Math.max(0, Math.min(parseInt(e.target.value) || 0, derived.hpMax)))}
                          className="w-12 p-0.5 border border-input-border bg-input-bg rounded text-[11px] text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
                        <span className="font-mono text-[11px] w-8">{currentHp}/{derived.hpMax}</span>
                      </div>
                    ) : (
                      <span className="font-mono">{currentHp}/{derived.hpMax}</span>
                    )}
                  </div>
                  <div className={`h-3 bg-surface-alt rounded-full overflow-hidden border border-border ${derived.hpMax > 0 && currentHp / derived.hpMax <= 0.25 ? "hp-critical" : ""}`}>
                    <div className={`h-full rounded-full transition-all duration-300 hp-bar-fill ${
                      derived.hpMax > 0 && currentHp / derived.hpMax > 0.5 ? "bg-success" :
                      derived.hpMax > 0 && currentHp / derived.hpMax > 0.25 ? "bg-accent" : "bg-danger"
                    }`} style={{ width: `${derived.hpMax > 0 ? Math.min(100, (currentHp / derived.hpMax) * 100) : 0}%` }} />
                  </div>
                </div>

                {/* COC-only: SAN / MP / LUCK / Attributes / Derived */}
                {ruleTemplate === "coc7th" && (
                <div>
                  {/* SAN */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span>💜 {t("san")}</span>
                      {canEditResources ? (
                        <div className="flex gap-1 items-center">
                          <input type="number" min={0} max={derived.sanMax}
                            value={currentSan} onChange={e => setCurrentSan(Math.max(0, Math.min(parseInt(e.target.value) || 0, derived.sanMax)))}
                            className="w-12 p-0.5 border border-input-border bg-input-bg rounded text-[11px] text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
                          <span className="font-mono text-[11px] w-8">{currentSan}/{derived.sanMax}</span>
                        </div>
                      ) : (
                        <span className="font-mono">{currentSan}/{derived.sanMax}</span>
                      )}
                    </div>
                    <div className="h-3 bg-surface-alt rounded-full overflow-hidden border border-border">
                      <div className="h-full rounded-full transition-all duration-300 bg-purple-500"
                        style={{ width: `${derived.sanMax > 0 ? Math.min(100, (currentSan / derived.sanMax) * 100) : 0}%` }} />
                    </div>
                  </div>

                  {/* MP */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span>💙 {t("mp")}</span>
                      {canEditResources ? (
                        <div className="flex gap-1 items-center">
                          <input type="number" min={0} max={derived.mpMax}
                            value={currentMp} onChange={e => setCurrentMp(Math.max(0, Math.min(parseInt(e.target.value) || 0, derived.mpMax)))}
                            className="w-12 p-0.5 border border-input-border bg-input-bg rounded text-[11px] text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
                          <span className="font-mono text-[11px] w-8">{currentMp}/{derived.mpMax}</span>
                        </div>
                      ) : (
                        <span className="font-mono">{currentMp}/{derived.mpMax}</span>
                      )}
                    </div>
                    <div className="h-3 bg-surface-alt rounded-full overflow-hidden border border-border">
                      <div className="h-full rounded-full transition-all duration-300 bg-blue-500"
                        style={{ width: `${derived.mpMax > 0 ? Math.min(100, (currentMp / derived.mpMax) * 100) : 0}%` }} />
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
                      disabled={readOnly}
                      className="w-14 p-1 border border-input-border bg-input-bg rounded text-sm text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary disabled:opacity-85 disabled:cursor-default" />
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

            {!readOnly && (
              <div className="flex gap-2">
                <button onClick={saveCharacterData}
                  disabled={saveStatus === "saving"}
                  className={`flex-1 text-white py-2 rounded-theme font-bold text-sm cursor-pointer transition flex items-center justify-center gap-1 ${
                    saveStatus === "success" ? "bg-success" :
                    saveStatus === "error" ? "bg-danger" :
                    "bg-primary hover:bg-primary-hover"
                  }`}>
                  {saveStatus === "saving" ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-1" />
                      {t("saving") || "保存中..."}
                    </>
                  ) : saveStatus === "success" ? (
                    <>✓ {t("saveSuccess") || "保存成功"}</>
                  ) : saveStatus === "error" ? (
                    <>× {t("saveFailed") || "保存失败"}</>
                  ) : (
                    t("saveAttributes")
                  )}
                </button>
                {ruleTemplate === "coc7th" && (
                  <button onClick={saveResourceValues}
                    disabled={saveStatus === "saving"}
                    className={`flex-1 text-white py-2 rounded-theme font-bold text-sm cursor-pointer transition flex items-center justify-center gap-1 ${
                      saveStatus === "success" ? "bg-success" :
                      saveStatus === "error" ? "bg-danger" :
                      "bg-primary hover:bg-primary-hover"
                    }`}>
                    {saveStatus === "saving" ? (
                      <>
                        <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-1" />
                        {t("saving") || "保存中..."}
                      </>
                    ) : saveStatus === "success" ? (
                      <>✓ {t("saveSuccess") || "保存成功"}</>
                    ) : saveStatus === "error" ? (
                      <>× {t("saveFailed") || "保存失败"}</>
                    ) : (
                      t("saveResources") || "保存资源"
                    )}
                  </button>
                )}
              </div>
            )}
            {canEditResources && readOnly && isGM && ruleTemplate === "coc7th" && (
              <button onClick={saveResourceValues}
                disabled={saveStatus === "saving"}
                className={`w-full text-white py-2 rounded-theme font-bold text-sm cursor-pointer transition flex items-center justify-center gap-1 ${
                  saveStatus === "success" ? "bg-success" :
                  saveStatus === "error" ? "bg-danger" :
                  "bg-primary hover:bg-primary-hover"
                }`}>
                {saveStatus === "saving" ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-1" />
                    {t("saving") || "保存中..."}
                  </>
                ) : saveStatus === "success" ? (
                  <>✓ {t("saveSuccess") || "保存成功"}</>
                ) : saveStatus === "error" ? (
                  <>× {t("saveFailed") || "保存失败"}</>
                ) : (
                  t("saveResources") || "保存资源"
                )}
              </button>
            )}

            {/* Custom Attributes */}
            <div>
              <label className="text-xs text-text-dim font-medium mb-2 block">{t("customAttributes")}</label>
              {customAttrs.length > 0 && (
                <div className="flex flex-col gap-1 mb-2">
                  {customAttrs.map(attr => (
                    <div key={attr.name} className="flex items-center gap-2 bg-surface-alt rounded p-2 group">
                      <span className="flex-1 text-sm text-text">{attr.name}</span>
                      <span className="text-xs text-text-muted font-mono w-12 text-right">{attr.value}</span>
                      {!readOnly && (
                        <button onClick={() => removeCustomAttr(attr.name)}
                          className="text-xs text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition cursor-pointer">🗑</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && (
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
              )}
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
                  {!readOnly && (
                    <button onClick={() => removeSkill(s.id)}
                      className="text-xs text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition cursor-pointer">🗑</button>
                  )}
                </div>
              ))}
            </div>
            {!readOnly && (
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
            )}
          </div>
        )}

        {/* Tab: Background */}
        {activeTab === "background" && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-text-dim font-medium mb-1 block">{t("bioPlaceholder").slice(0, 4)}</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} onBlur={readOnly ? undefined : saveCharacterData}
                placeholder={t("bioPlaceholder")} rows={6}
                readOnly={readOnly}
                className="w-full p-2 border border-input-border bg-input-bg rounded text-sm text-text resize-none outline-none focus:ring-1 focus:ring-primary disabled:opacity-85 disabled:cursor-default" />
            </div>
            {!readOnly && (
              <button onClick={saveCharacterData}
                disabled={saveStatus === "saving"}
                className={`text-white py-2 rounded-theme font-bold text-sm cursor-pointer transition flex items-center justify-center gap-1 ${
                  saveStatus === "success" ? "bg-success" :
                  saveStatus === "error" ? "bg-danger" :
                  "bg-primary hover:bg-primary-hover"
                }`}>
                {saveStatus === "saving" ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-1" />
                    {t("saving") || "保存中..."}
                  </>
                ) : saveStatus === "success" ? (
                  <>✓ {t("saveSuccess") || "保存成功"}</>
                ) : saveStatus === "error" ? (
                  <>× {t("saveFailed") || "保存失败"}</>
                ) : (
                  t("saveBio")
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function parseCharData(json?: string | null): Record<string, any> {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}
