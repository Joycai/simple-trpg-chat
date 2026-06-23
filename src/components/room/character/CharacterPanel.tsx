"use client";

import { useState, useEffect } from "react";
import { updateNicknameAction, getRoomSkills, updateRoomMemberColorAction } from "@/app/actions/room";
import { initCocCharacterAction, saveCharacterDataAction, addCustomAttributeAction, removeCustomAttributeAction, updateResourcesAction } from "@/app/actions/character";
import { getMySkillsAction, upsertSkillAction, deleteSkillAction } from "@/app/actions/skills";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CocAttributes } from "@/lib/character-types";
import { COC_DEFAULT_ATTRIBUTES, computeCocDerived } from "@/lib/character-types";
import { getRandomColorForUser, getContrastColor, PRESET_AVATAR_COLORS } from "@/lib/avatar-colors";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "@/components/shared/icons";
import { AvatarCropper } from "@/components/room/character/AvatarCropper";
import { AttributesTab } from "@/components/room/character/AttributesTab";
import { SkillsTab, type SkillItem } from "@/components/room/character/SkillsTab";
import { BackgroundTab } from "@/components/room/character/BackgroundTab";
import type { SaveStatus } from "@/components/room/character/SaveButton";

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
  /** Base64 JPEG avatar for this member, if uploaded. */
  avatar?: string | null;
  isGM?: boolean;
  /** Bumped by the parent after a .st command, so the skills tab reloads. */
  refreshKey?: number;
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
  avatar,
  isGM = false,
  refreshKey = 0,
}: CharacterPanelProps) {
  const t = useTranslations("character");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose, "drawer");

  // Avatar photo: shows the uploaded image when present, falling back to a
  // colored initial. `avatarOverride` reflects a just-cropped image instantly,
  // before router.refresh propagates the new value down through props.
  const [showAvatarCropper, setShowAvatarCropper] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const avatarSrc = avatarOverride ?? avatar ?? null;

  // Determine if resources can be edited (owner or GM)
  const canEditResources = !readOnly || isGM;

  // Tab
  const [activeTab, setActiveTab] = useState<TabId>("attributes");

  // Nickname & Color
  const [nickname, setNickname] = useState(currentNickname);
  const [editingNick, setEditingNick] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>(avatarColor || getRandomColorForUser(userId));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Character data
  const charData = parseCharData(characterData) as {
    ruleTemplate?: string;
    cocAttributes?: CocAttributes;
    bio?: string;
    occupation?: string;
    age?: number;
    customAttributes?: { name: string; value: number; max?: number }[];
    cocDerived?: { hp_current?: number; san_current?: number; mp_current?: number };
  };
  const hasExistingData = !!characterData && !!charData.ruleTemplate;
  const ruleTemplate = charData.ruleTemplate || roomRuleTemplate || "basic";
  const [initDone, setInitDone] = useState(hasExistingData);

  const [cocAttrs, setCocAttrs] = useState<CocAttributes>(charData.cocAttributes || { ...COC_DEFAULT_ATTRIBUTES });
  const derived = computeCocDerived(cocAttrs);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitDone(true);
    }
  }, [roomRuleTemplate, roomId, initDone, readOnly]);
  const [bio, setBio] = useState(charData.bio || "");
  const [occupation, setOccupation] = useState(charData.occupation || "");
  const [age, setAge] = useState<number | "">(charData.age ?? "");

  // Custom attributes / resources (a custom item with `max` set renders as a resource bar)
  const [customAttrs, setCustomAttrs] = useState<{name: string; value: number; max?: number}[]>(charData.customAttributes || []);

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
  }, [roomId, readOnly, targetUserId, refreshKey]);

  // Re-sync attributes/resources when the characterData prop changes (e.g. after a
  // .st / .sc command triggers router.refresh upstream). Keeps an open panel current
  // without a full reload, and without remounting (so the active tab is preserved).
  useEffect(() => {
    if (!characterData) return;
    const cd = parseCharData(characterData) as {
      cocAttributes?: CocAttributes;
      bio?: string;
      occupation?: string;
      age?: number;
      customAttributes?: { name: string; value: number; max?: number }[];
      cocDerived?: { hp_current?: number; san_current?: number; mp_current?: number };
    };
    if (!cd) return;
    const attrs = cd.cocAttributes || { ...COC_DEFAULT_ATTRIBUTES };
    const d = computeCocDerived(attrs);
    /* eslint-disable react-hooks/set-state-in-effect */
    setCocAttrs(attrs);
    setBio(cd.bio || "");
    setOccupation(cd.occupation || "");
    setAge(cd.age ?? "");
    setCustomAttrs(cd.customAttributes || []);
    setCurrentHp(cd.cocDerived?.hp_current ?? d.hp);
    setCurrentSan(cd.cocDerived?.san_current ?? d.san);
    setCurrentMp(cd.cocDerived?.mp_current ?? d.mp);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [characterData]);

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

  // Footer "保存" — persists attributes + bio (and resources for COC) in one go.
  const handleSaveAll = async () => {
    setSaveStatus("saving");
    try {
      await saveCharacterDataAction(roomId, {
        ruleTemplate, cocAttributes: cocAttrs, bio,
        occupation: occupation.trim() || undefined,
        age: age === "" ? undefined : Number(age),
      });
      if (ruleTemplate === "coc7th") {
        await updateResourcesAction(roomId, targetUserId || userId, {
          hp_current: currentHp, san_current: currentSan, mp_current: currentMp,
        });
      }
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
      router.refresh();
    } catch (e) {
      console.error("Failed to save character", e);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // Footer "导出" — downloads a readable text summary of the sheet (client-side).
  const handleExport = () => {
    const lines = [`${t("title")} · ${nickname}`, ""];
    if (ruleTemplate === "coc7th") {
      lines.push(`${t("hp")}: ${currentHp}/${derived.hpMax}`, `${t("san")}: ${currentSan}/${derived.sanMax}`, `${t("mp")}: ${currentMp}/${derived.mpMax}`, "");
      lines.push(t("baseAttributes") + ":");
      (Object.keys(cocAttrs) as (keyof CocAttributes)[]).forEach((k) => lines.push(`  ${k.toUpperCase()}: ${cocAttrs[k]}`));
    }
    if (skills.length) { lines.push("", t("tabSkills") + ":"); skills.forEach((s) => lines.push(`  ${s.skillName}: ${s.skillValue}`)); }
    if (bio.trim()) lines.push("", t("tabBackground") + ":", bio.trim());
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nickname || "character"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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

  // Add or overwrite a custom item. `max` present ⇒ rendered as a resource bar.
  const addCustom = async (attr: { name: string; value: number; max?: number }) => {
    const name = attr.name.trim();
    if (!name) return;
    const item = { ...attr, name };
    try {
      await addCustomAttributeAction(roomId, item);
      setCustomAttrs(prev => {
        const idx = prev.findIndex(a => a.name === name);
        if (idx >= 0) { const copy = [...prev]; copy[idx] = item; return copy; }
        return [...prev, item];
      });
      router.refresh();
    } catch (e) { console.error(e); }
  };

  // Edit a custom item's current value / max in place (optimistic + persist).
  const updateCustom = async (name: string, patch: { value?: number; max?: number }) => {
    const existing = customAttrs.find(a => a.name === name);
    if (!existing) return;
    const item = { ...existing, ...patch };
    setCustomAttrs(prev => prev.map(a => (a.name === name ? item : a)));
    try { await addCustomAttributeAction(roomId, item); router.refresh(); } catch (e) { console.error(e); }
  };

  const removeCustomAttr = async (name: string) => {
    try {
      await removeCustomAttributeAction(roomId, name);
      setCustomAttrs(prev => prev.filter(a => a.name !== name));
      router.refresh();
    } catch (e) { console.error(e); }
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "attributes", label: t("tabAttributes") },
    { id: "skills", label: t("tabSkills") },
    { id: "background", label: t("tabBackground") },
  ];

  // Shared drawer chrome for the loading / empty states.
  const drawerShell = (body: React.ReactNode) => (
    <div className="fixed inset-0 z-50 flex font-theme" onClick={close}>
      <div className={`absolute inset-0 bg-black/30 ${backdropClass}`} />
      <div className={`relative ml-auto w-full sm:w-[34rem] bg-surface border-l border-border shadow-2xl h-full flex flex-col overflow-hidden ${panelClass}`}
        onClick={e => e.stopPropagation()}>
        <div className="shrink-0 bg-surface border-b border-border px-6 py-5 flex justify-between items-center">
          <h3 className="font-bold text-text text-xl font-theme-display truncate">{t("titleOther", { name: currentNickname })}</h3>
          <button onClick={close} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );

  if (loading) {
    return drawerShell(
      <div className="flex-1 text-center py-20 text-text-muted flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4" />
        <p className="text-sm font-medium">{tCommon("loading")}</p>
      </div>
    );
  }

  if (readOnly && !hasExistingData) {
    return drawerShell(
      <div className="flex-1 text-center py-16 text-text-muted flex flex-col items-center justify-center">
        <Icons.User className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">{t("notInitialized")}</p>
      </div>
    );
  }

  const canSave = !readOnly || (isGM && canEditResources);

  return (
    <>
    <div className="fixed inset-0 z-50 flex font-theme" onClick={close}>
      <div className={`absolute inset-0 bg-black/30 ${backdropClass}`} />
      <div className={`relative ml-auto w-full sm:w-[34rem] bg-surface border-l border-border shadow-2xl h-full flex flex-col overflow-hidden ${panelClass}`}
        onClick={e => e.stopPropagation()}>

        {/* Header — 角色卡 · 昵称 (click to edit) + close */}
        <div className="shrink-0 bg-surface border-b border-border px-6 py-5 flex justify-between items-center gap-3">
          {editingNick ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-text-muted text-lg font-bold shrink-0">{t("title")} ·</span>
              <input value={nickname} onChange={e => setNickname(e.target.value)}
                onBlur={saveNickname}
                onKeyDown={e => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") { setNickname(currentNickname); setEditingNick(false); } }}
                autoFocus
                className="flex-1 min-w-0 text-lg font-bold text-text bg-input-bg border border-input-border rounded px-2 py-0.5 outline-none focus:ring-[3px] focus:ring-primary/[0.18]" />
            </div>
          ) : (
            <h3 className="font-bold text-text text-xl font-theme-display flex items-center gap-1.5 min-w-0">
              <span className="truncate">{readOnly ? t("titleOther", { name: nickname }) : `${t("title")} · ${nickname}`}</span>
              {!readOnly && (
                <button onClick={() => setEditingNick(true)} title={t("editName")} className="shrink-0 text-text-muted hover:text-primary transition cursor-pointer">
                  <Icons.Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </h3>
          )}
          <button onClick={close} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer shrink-0">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile band — avatar + colour (first page only, per design) */}
        {!readOnly && activeTab === "attributes" && (
          <div className="shrink-0 border-b border-border px-6 py-4 flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-theme overflow-hidden flex items-center justify-center border-2"
                style={{ borderColor: selectedColor, boxShadow: `0 0 12px ${selectedColor}55` }}>
                {avatarSrc
                  ? <img src={avatarSrc} alt={nickname} className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center text-2xl font-bold"
                      style={{ backgroundColor: selectedColor, color: getContrastColor(selectedColor) }}>{nickname.charAt(0).toUpperCase()}</span>}
              </div>
              <button onClick={() => setShowAvatarCropper(true)} title={t("changeAvatar")}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground border-2 border-surface flex items-center justify-center cursor-pointer">
                <Icons.Pencil className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-muted mb-2">{t("avatarColor")}</div>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_AVATAR_COLORS.map(p => (
                  <button key={p.hex} onClick={() => handleColorChange(p.hex)} title={p.name}
                    className={`w-7 h-7 rounded-full transition cursor-pointer ${
                      selectedColor.toLowerCase() === p.hex.toLowerCase()
                        ? "ring-2 ring-offset-2 ring-offset-surface ring-primary scale-105" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: p.hex }} />
                ))}
                <label title={t("customColor")}
                  className="w-7 h-7 rounded-full border border-dashed border-border flex items-center justify-center cursor-pointer text-text-muted hover:text-text hover:border-primary/50 transition">
                  <Icons.Plus className="w-3.5 h-3.5" />
                  <input type="color"
                    value={selectedColor.startsWith("#") && selectedColor.length === 7 ? selectedColor : "#6366f1"}
                    onChange={e => handleColorChange(e.target.value)}
                    className="absolute w-0 h-0 opacity-0" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Tab Bar — underline */}
        <div className="shrink-0 flex gap-6 px-6 border-b border-border bg-surface">
          {tabs.map(tab => (
            <button key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative py-3 text-sm font-medium transition cursor-pointer ${
                activeTab === tab.id ? "text-primary" : "text-text-muted hover:text-text"
              }`}>
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full shadow-[var(--theme-glow)]" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content (scrolls) */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "attributes" && (
            <AttributesTab
              ruleTemplate={ruleTemplate}
              readOnly={readOnly}
              canEditResources={canEditResources}
              derived={derived}
              currentHp={currentHp}
              onCurrentHpChange={setCurrentHp}
              currentSan={currentSan}
              onCurrentSanChange={setCurrentSan}
              currentMp={currentMp}
              onCurrentMpChange={setCurrentMp}
              cocAttrs={cocAttrs}
              onUpdateAttr={updateAttr}
              customAttrs={customAttrs}
              onAddCustom={addCustom}
              onUpdateCustom={updateCustom}
              onRemoveCustom={removeCustomAttr}
            />
          )}

          {activeTab === "skills" && (
            <SkillsTab
              skills={skills}
              readOnly={readOnly}
              newSkillName={newSkillName}
              onNewSkillNameChange={setNewSkillName}
              newSkillValue={newSkillValue}
              onNewSkillValueChange={setNewSkillValue}
              onAddSkill={addSkill}
              onRemoveSkill={removeSkill}
            />
          )}

          {activeTab === "background" && (
            <BackgroundTab
              bio={bio}
              onBioChange={setBio}
              occupation={occupation}
              onOccupationChange={setOccupation}
              age={age}
              onAgeChange={setAge}
              readOnly={readOnly}
            />
          )}
        </div>

        {/* Footer — 导出 / 保存 */}
        <div className="shrink-0 border-t border-border bg-surface px-6 py-4 flex gap-3">
          <button onClick={handleExport}
            className="flex-1 py-2.5 rounded-theme border border-border text-text font-bold text-sm hover:bg-surface-alt transition cursor-pointer">
            {t("export")}
          </button>
          {canSave && (
            <button onClick={handleSaveAll} disabled={saveStatus === "saving"}
              className="flex-1 py-2.5 rounded-theme bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)] disabled:opacity-70 disabled:shadow-none">
              {saveStatus === "saving" ? tCommon("loading") : saveStatus === "success" ? `✓ ${t("save")}` : t("save")}
            </button>
          )}
        </div>
      </div>
    </div>

    {showAvatarCropper && (
      <AvatarCropper
        roomId={roomId}
        onClose={() => setShowAvatarCropper(false)}
        onSuccess={(img) => {
          setAvatarOverride(img);
          router.refresh();
        }}
      />
    )}
    </>
  );
}

function parseCharData(json?: string | null): Record<string, unknown> {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}
