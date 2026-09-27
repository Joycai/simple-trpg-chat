"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/ui/useOverlayTransition";
import { Icons } from "@/components/shared/icons";
import { ImageCropper } from "@/components/shared/ImageCropper";
import { Notice } from "@/components/shared/Notice";
import { AttributesTab } from "@/components/room/character/AttributesTab";
import { SkillsTab } from "@/components/room/character/SkillsTab";
import { BackgroundTab } from "@/components/room/character/BackgroundTab";
import { PaneTransition } from "@/components/shared/PaneTransition";
import { NICKNAME_MAX_LENGTH } from "@/lib/room/limits";
import { buildCharacterExportText } from "@/lib/character/panel-status";
import { useCharacterSheetState } from "./useCharacterSheetState";
import { useCharacterSkills } from "./useCharacterSkills";
import { useMemberProfile } from "./useMemberProfile";
import { useCharacterSave } from "./useCharacterSave";
import { useCharacterAvatarUpload } from "./useCharacterAvatarUpload";
import { AvatarColorBand } from "./AvatarColorBand";

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
  /** Avatar image source for this member (reference URL from the avatars API,
   *  or a data URL right after an upload), if uploaded. */
  avatar?: string | null;
  isGM?: boolean;
  /** Bumped by the parent after a .st command, so the skills tab reloads. */
  refreshKey?: number;
  /** Fired after an in-panel skill add/delete/adjust, so the parent can refresh
   *  its own skill-derived state (e.g. the top-bar "not set up" nudge). */
  onSkillsChanged?: () => void;
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
  onSkillsChanged,
}: CharacterPanelProps) {
  const t = useTranslations("character");
  const tCommon = useTranslations("common");
  const { close, panelRef, backdropRef, panelClass, afterEnter } = useOverlayTransition(onClose, "drawer");

  // Avatar photo: the uploaded image, or a colored initial; crop → upload.
  const { cropFile, setCropFile, avatarSrc, confirmCrop } = useCharacterAvatarUpload(roomId, avatar);

  // Determine if resources can be edited (owner or GM)
  const canEditResources = !readOnly || isGM;

  // Tab
  const [activeTab, setActiveTab] = useState<TabId>("attributes");

  // The panel's single error strip (above the footer) — any failed write.
  const [panelError, setPanelError] = useState<string | null>(null);
  // Nickname (click to edit in the header) and avatar colour.
  const { nickname, setNickname, editingNick, setEditingNick, selectedColor, saveNickname, handleColorChange } =
    useMemberProfile({ roomId, userId, currentNickname, avatarColor, readOnly, onNicknameChange, setPanelError });

  // The sheet being edited — seeded from characterData, re-synced when it changes.
  const {
    hasExistingData, ruleTemplate, ruleCap,
    attributeValues, updateAttr,
    d20Role, setD20Role, d20Level, setD20Level,
    bio, setBio, occupation, setOccupation, age, setAge,
    customAttrs, addCustom, updateCustom, removeCustomAttr,
    draftStatus, derivedValues, resourceMaxes, effectiveResourceMaxes,
    currentResources, handleResourceChange, handleResourceMaxChange, loadedResourcesRef,
  } = useCharacterSheetState({ roomId, characterData, roomRuleTemplate, readOnly, afterEnter, setPanelError });

  // Skills tab: list, reload on refreshKey, add / remove / edit.
  const {
    skills, skillsLoaded, newSkillName, setNewSkillName, newSkillValue, setNewSkillValue,
    addSkill, removeSkill, updateSkill,
  } = useCharacterSkills({ roomId, readOnly, targetUserId, refreshKey, afterEnter, onSkillsChanged });

  // "No skills yet" nudge on the 技能 tab: only for the owner, only when this
  // rule uses a structured sheet (basic/通用 d100 never hints), and only once
  // the list has actually loaded (avoids flashing on the async gap).
  const skillsUnset =
    !readOnly && ruleCap.attributeKeys.length > 0 && skillsLoaded && skills.length === 0;

  // Footer "保存" — attributes, background and resources in one go.
  const { saveStatus, handleSaveAll } = useCharacterSave({
    roomId, userId, readOnly, targetUserId, ruleTemplate,
    bio, occupation, age, attributeValues, d20Role, d20Level,
    currentResources, resourceMaxes, loadedResourcesRef, setPanelError,
  });

  // Footer "导出" — downloads a readable text summary of the sheet (client-side).
  const handleExport = () => {
    const text = buildCharacterExportText({
      t, nickname, cap: ruleCap, role: d20Role, level: d20Level,
      currentResources, resourceMaxes, derivedValues,
      attributeGrades: draftStatus.attributeGrades, attributeValues, skills, bio,
    });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nickname || "character"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "attributes", label: t("tabAttributes") },
    { id: "skills", label: t("tabSkills") },
    { id: "background", label: t("tabBackground") },
  ];

  // Shared drawer chrome for the loading / empty states.
  const drawerShell = (body: React.ReactNode) => (
    <div className="fixed inset-0 z-50 flex font-theme" onClick={close}>
      <div ref={backdropRef} className="absolute inset-0 bg-scrim/30" />
      <div ref={panelRef} className={`relative ml-auto w-full sm:w-[34rem] bg-surface border-l border-border shadow-2xl h-full flex flex-col overflow-hidden ${panelClass}`}
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
      <div ref={backdropRef} className="absolute inset-0 bg-scrim/30" />
      <div ref={panelRef} className={`relative ml-auto w-full sm:w-[34rem] bg-surface border-l border-border shadow-2xl h-full flex flex-col overflow-hidden ${panelClass}`}
        onClick={e => e.stopPropagation()}>

        {/* Header — 角色卡 · 昵称 (click to edit) + close */}
        <div className="shrink-0 bg-surface border-b border-border px-6 py-5 flex justify-between items-center gap-3">
          {editingNick ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-text-muted text-lg font-bold shrink-0">{t("title")} ·</span>
              <input value={nickname} onChange={e => setNickname(e.target.value)}
                maxLength={NICKNAME_MAX_LENGTH}
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

        {/* Profile band — avatar + colour. Sits ABOVE the tab bar, so it must
            not be tab-scoped: it used to render only on the 属性 tab, and
            unmounting it shifted the tabs and the whole pane up by its height
            on every switch to 技能 / 背景. Keeping it mounted costs ~96px of
            vertical room on those tabs and buys a stable layout. */}
        {!readOnly && (
          <AvatarColorBand
            nickname={nickname}
            selectedColor={selectedColor}
            avatarSrc={avatarSrc}
            onPickFile={setCropFile}
            onColorChange={handleColorChange}
          />
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
              {tab.id === "skills" && skillsUnset && (
                <span
                  className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-primary align-middle shadow-[var(--theme-glow)]"
                  title={t("hintSkillsUnset")}
                />
              )}
              {activeTab === tab.id && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full shadow-[var(--theme-glow)]" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content (scrolls). The pane sits inside the scroll container,
            not around it, so the scrollbar isn't recreated on every tab
            switch — only the content it holds is replaced. */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
        <PaneTransition paneKey={activeTab}>
          {activeTab === "attributes" && (
            <AttributesTab
              ruleTemplate={ruleTemplate}
              readOnly={readOnly}
              canEditResources={canEditResources}
              currentResources={currentResources}
              resourceMaxes={effectiveResourceMaxes}
              onResourceChange={handleResourceChange}
              resourceMaxEditable={!!ruleCap.resourceMaxEditable && !readOnly}
              onResourceMaxChange={handleResourceMaxChange}
              attributeValues={attributeValues}
              derivedValues={derivedValues}
              onUpdateAttr={updateAttr}
              customAttrs={customAttrs}
              onAddCustom={addCustom}
              onUpdateCustom={updateCustom}
              onRemoveCustom={removeCustomAttr}
            />
          )}
          {activeTab === "attributes" && derivedValues?.spiritSense !== undefined && (
            <p className="mt-3 text-xs text-text-dim text-center">
              {t("shSpiritSense")}: {derivedValues.spiritSense} · {t("shSpiritSenseHint")}
            </p>
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
              onUpdateSkill={updateSkill}
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
              showRoleLevel={ruleCap.hasRoleLevel}
              role={d20Role}
              onRoleChange={setD20Role}
              level={d20Level}
              onLevelChange={setD20Level}
            />
          )}
        </PaneTransition>
        </div>

        {panelError && (
          <div className="shrink-0 px-6 pt-3">
            <Notice variant="error" onDismiss={() => setPanelError(null)} dismissLabel={tCommon("close")}>
              {panelError}
            </Notice>
          </div>
        )}

        {/* Footer — 导出 / 保存 */}
        <div className="shrink-0 border-t border-border bg-surface px-6 py-4 flex gap-3">
          <button onClick={handleExport}
            className="flex-1 py-2.5 rounded-theme border border-border text-text font-bold text-sm hover:bg-surface-alt transition cursor-pointer">
            {t("export")}
          </button>
          {canSave && (
            <button onClick={handleSaveAll} disabled={saveStatus === "saving"}
              className="flex-1 py-2.5 rounded-theme bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)] disabled:opacity-70 disabled:shadow-none flex items-center justify-center gap-1.5">
              {saveStatus === "saving" ? tCommon("loading") : saveStatus === "success" ? <><Check className="w-4 h-4" /> {t("save")}</> : t("save")}
            </button>
          )}
        </div>
      </div>
    </div>

    {cropFile && (
      <ImageCropper
        file={cropFile}
        aspectRatio={1}
        maxOutputSize={512}
        maxOutputBytes={280_000}
        title={t("changeAvatar")}
        onCancel={() => setCropFile(null)}
        onConfirm={confirmCrop}
      />
    )}
    </>
  );
}
