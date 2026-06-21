"use client";

import { useState, useEffect } from "react";
import { updateNicknameAction, getRoomSkills, updateRoomMemberColorAction } from "@/app/actions/room";
import { initCocCharacterAction, saveCharacterDataAction, addCustomAttributeAction, removeCustomAttributeAction, updateResourcesAction } from "@/app/actions/character";
import { getMySkillsAction, upsertSkillAction, deleteSkillAction } from "@/app/actions/skills";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CharacterData, CocAttributes } from "@/lib/character-types";
import { COC_DEFAULT_ATTRIBUTES, computeCocDerived } from "@/lib/character-types";
import { getRandomColorForUser } from "@/lib/avatar-colors";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "@/components/shared/icons";
import { AvatarCropper } from "@/components/room/character/AvatarCropper";
import { CharacterHeader } from "@/components/room/character/CharacterHeader";
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
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose);

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
  }, [roomId, readOnly, targetUserId, refreshKey]);

  // Re-sync attributes/resources when the characterData prop changes (e.g. after a
  // .st / .sc command triggers router.refresh upstream). Keeps an open panel current
  // without a full reload, and without remounting (so the active tab is preserved).
  useEffect(() => {
    if (!characterData) return;
    const cd = parseCharData(characterData) as {
      cocAttributes?: CocAttributes;
      bio?: string;
      customAttributes?: { name: string; value: number; max?: number }[];
      cocDerived?: { hp_current?: number; san_current?: number; mp_current?: number };
    };
    if (!cd) return;
    const attrs = cd.cocAttributes || { ...COC_DEFAULT_ATTRIBUTES };
    const d = computeCocDerived(attrs);
    /* eslint-disable react-hooks/set-state-in-effect */
    setCocAttrs(attrs);
    setBio(cd.bio || "");
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

  const tabs: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "attributes", label: t("tabAttributes"), Icon: Icons.BarChart3 },
    { id: "skills", label: t("tabSkills"), Icon: Icons.ClipboardList },
    { id: "background", label: t("tabBackground"), Icon: Icons.FileText },
  ];

  if (loading) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${backdropClass}`} onClick={close}>
        <div className={`bg-surface border border-border rounded-theme theme-border shadow-2xl p-6 w-full max-w-sm mx-4 ${panelClass}`}
          onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-bold text-lg text-text">{t("titleOther", { name: currentNickname })}</h3>
            <button onClick={close} className="p-1.5 -mr-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <Icons.X className="w-5 h-5" />
            </button>
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
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${backdropClass}`} onClick={close}>
        <div className={`bg-surface border border-border rounded-theme theme-border shadow-2xl p-6 w-full max-w-sm mx-4 ${panelClass}`}
          onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-bold text-lg text-text">{t("titleOther", { name: currentNickname })}</h3>
            <button onClick={close} className="p-1.5 -mr-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <Icons.X className="w-5 h-5" />
            </button>
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
    <>
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${backdropClass}`} onClick={close}>
      <div className={`bg-surface border border-border rounded-theme theme-border shadow-2xl w-full max-w-lg mx-4 h-[85vh] md:h-[600px] max-h-[90vh] flex flex-col overflow-hidden ${panelClass}`}
        onClick={e => e.stopPropagation()}>

        <CharacterHeader
          nickname={nickname}
          currentNickname={currentNickname}
          editingNick={editingNick}
          onEditingNickChange={setEditingNick}
          onNicknameChange={setNickname}
          onSaveNickname={saveNickname}
          avatarSrc={avatarSrc}
          selectedColor={selectedColor}
          readOnly={readOnly}
          onChangeAvatar={() => setShowAvatarCropper(true)}
          ruleTemplate={ruleTemplate}
          onColorChange={handleColorChange}
          onClose={close}
        />

        {/* Tab Bar */}
        <div className="shrink-0 flex gap-1 px-5 pt-3 border-b border-border bg-surface">
          {tabs.map(tab => (
            <button key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 -mb-px text-sm font-medium rounded-t-lg border-b-2 transition cursor-pointer ${
                activeTab === tab.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-text-muted hover:text-text hover:bg-surface-alt/60"
              }`}>
              <tab.Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content (scrolls; header stays pinned) */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === "attributes" && (
            <AttributesTab
              ruleTemplate={ruleTemplate}
              readOnly={readOnly}
              canEditResources={canEditResources}
              isGM={isGM}
              derived={derived}
              currentHp={currentHp}
              onCurrentHpChange={setCurrentHp}
              currentSan={currentSan}
              onCurrentSanChange={setCurrentSan}
              currentMp={currentMp}
              onCurrentMpChange={setCurrentMp}
              cocAttrs={cocAttrs}
              onUpdateAttr={updateAttr}
              saveStatus={saveStatus}
              onSaveCharacterData={saveCharacterData}
              onSaveResources={saveResourceValues}
              customAttrs={customAttrs}
              onRemoveCustomAttr={removeCustomAttr}
              newAttrName={newAttrName}
              onNewAttrNameChange={setNewAttrName}
              newAttrValue={newAttrValue}
              onNewAttrValueChange={setNewAttrValue}
              onAddCustomAttr={addCustomAttr}
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
              readOnly={readOnly}
              saveStatus={saveStatus}
              onSave={saveCharacterData}
            />
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
