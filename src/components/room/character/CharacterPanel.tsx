"use client";

import { useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/ui/useOverlayTransition";
import { useEscapeToClose } from "@/lib/ui/overlay-esc";
import { Icons } from "@/components/shared/icons";
import { ImageCropper } from "@/components/shared/ImageCropper";
import { Notice } from "@/components/shared/Notice";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useHostLabel, useRuleLabelResolver } from "@/components/shared/host-label";
import { AttributesTab } from "@/components/room/character/AttributesTab";
import { SkillsTab } from "@/components/room/character/SkillsTab";
import { BackgroundTab } from "@/components/room/character/BackgroundTab";
import { PaneTransition } from "@/components/shared/PaneTransition";
import { NICKNAME_MAX_LENGTH } from "@/lib/room/limits";
import { buildCharacterExportText } from "@/lib/character/panel-status";
import { memberCompletion } from "@/lib/character/member-completion";
import { buildSkillRows } from "@/lib/character/skill-list";
import { resolveSheet } from "@/lib/character/sheet-model";
import { sheetCompletion, type FieldState, type FieldStatus } from "@/lib/character/completion";
import { useSheetDraft } from "./useSheetDraft";
import { useCharacterSkills } from "./useCharacterSkills";
import { useMemberProfile } from "./useMemberProfile";
import { useCharacterAvatarUpload } from "./useCharacterAvatarUpload";
import { AvatarColorBand } from "./AvatarColorBand";
import { SheetCompletionBar } from "./SheetCompletionBar";
import { HostEditBanner, SheetConflictNotice } from "./SheetBanners";

interface CharacterPanelProps {
  roomId: number;
  userId: number;
  currentNickname: string;
  characterData?: string | null;
  roomRuleTemplate?: string;
  onClose: () => void;
  onNicknameChange: (newNick: string) => void;
  /** Own card in a frozen room / as an observer: nothing is editable. */
  readOnly?: boolean;
  /** Set when the card belongs to another member. */
  targetUserId?: number;
  loading?: boolean;
  avatarColor?: string | null;
  /** Avatar image source for this member (reference URL from the avatars API,
   *  or a data URL right after an upload), if uploaded. */
  avatar?: string | null;
  /** The viewer hosts the room (or is an admin): another member's card opens in host edit mode. */
  isGM?: boolean;
  /** Bumped by the parent after a .st command, so the skills tab reloads. */
  refreshKey?: number;
  /** Fired after an in-panel skill add/delete/adjust, so the parent can refresh
   *  its own skill-derived state. */
  onSkillsChanged?: () => void;
}

type TabId = "attributes" | "skills" | "background";

/**
 * The character sheet drawer, in one of three modes:
 *  - self: the viewer's own card;
 *  - host: the room host (or an admin) editing another member's card —
 *    every field, saved to that member and synced to them live;
 *  - view: another member's card, read-only.
 * The sheet is the stored sheet plus a draft of unsaved changes
 * (`useSheetDraft`); closing with unsaved changes asks first.
 */
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
  const hostLabel = useHostLabel();
  const ruleLabel = useRuleLabelResolver();
  const mode: "self" | "host" | "view" = targetUserId === undefined ? "self" : isGM ? "host" : "view";
  const editable = mode === "host" || (mode === "self" && !readOnly);

  // Escape goes through the unsaved-changes guard below, not straight to close.
  const { close, panelRef, backdropRef, panelClass, afterEnter } =
    useOverlayTransition(onClose, "drawer", { closeOnEscape: false });

  // Avatar photo: the uploaded image, or a colored initial; crop → upload.
  const { cropFile, setCropFile, avatarSrc, confirmCrop } = useCharacterAvatarUpload(roomId, avatar);

  const [activeTab, setActiveTabState] = useState<TabId>("attributes");
  // Tabs share one scroll container: a new tab starts at its top.
  const scrollRef = useRef<HTMLDivElement>(null);
  const setActiveTab = (tab: TabId) => {
    if (tab !== activeTab && scrollRef.current) scrollRef.current.scrollTop = 0;
    setActiveTabState(tab);
  };

  // The panel's single error strip (above the footer) — any failed write.
  const [panelError, setPanelError] = useState<string | null>(null);
  // Nickname (click to edit in the header) and avatar colour — own card only.
  const { nickname, setNickname, editingNick, setEditingNick, selectedColor, saveNickname, handleColorChange } =
    useMemberProfile({ roomId, userId, currentNickname, avatarColor, readOnly: mode !== "self" || readOnly, onNicknameChange, setPanelError });

  // The sheet being edited: the stored sheet plus a draft of unsaved changes.
  const sheet = useSheetDraft({
    roomId, targetUserId: targetUserId ?? userId, characterData, roomRuleTemplate, setPanelError,
  });
  const { rule, resolved } = sheet;
  const hasExistingData = !!characterData;
  const profile = resolved.sheet;
  const baselineResolved = useMemo(() => resolveSheet(rule, sheet.baseline), [rule, sheet.baseline]);
  const changed = useMemo(() => new Set(sheet.changed), [sheet.changed]);

  // Skills tab: the card owner's skills, reloaded on refreshKey.
  const { skills, skillsLoaded, setSkill, removeSkill } =
    useCharacterSkills({ roomId, targetUserId, refreshKey, afterEnter, onSkillsChanged, onError: setPanelError });

  // Completion of the sheet as edited (draft applied) against the room rule.
  // A sheet still built for another rule (rebuild declined) is graded by its
  // own rule, so its fields, chips and states agree with what the panel shows;
  // the completion bar then explains the mismatch instead of counting.
  const roomRuleId = roomRuleTemplate ?? rule.id;
  const ruleMismatch = resolved.sheet.ruleTemplate !== roomRuleId;
  const aliases = useMemo(() => rule.skillAliasCandidates?.bind(rule), [rule]);
  const completion = useMemo(() => {
    const names = skills.map((s) => s.skillName);
    return ruleMismatch
      ? sheetCompletion(rule, resolved.sheet, names, aliases)
      : memberCompletion(resolved.sheet, names, roomRuleId);
  }, [resolved.sheet, skills, roomRuleId, ruleMismatch, rule, aliases]);
  const stateByField = useMemo(() => {
    const m = new Map<string, FieldState>();
    for (const f of completion.fields) m.set(`${f.kind}:${f.key}`, f.state);
    return m;
  }, [completion]);
  const stateOf = (key: string): FieldState => stateByField.get(key) ?? "default";
  const skillRows = useMemo(
    () => buildSkillRows(rule, resolved.sheet, skills, aliases),
    [rule, resolved.sheet, skills, aliases],
  );
  const missingIn = (kinds: FieldStatus["kind"][]) =>
    completion.fields.filter((f) => f.state === "missing" && kinds.includes(f.kind)).length;
  // Shown from the first frame (skills fill in when they load) so the tab bar
  // doesn't shift down under the user's pointer.
  // Only where the user can act on it, and only for rules with required
  // fields (basic / Triangle have none to count). Until the skills load the
  // bar keeps its place without numbers, so it neither jumps nor misreports.
  const showCompletion = editable && completion.requiredTotal > 0;
  const completionPending = !skillsLoaded && (rule.sheet.standardSkills?.length ?? 0) > 0;

  const labelOf = (f: FieldStatus) => {
    if (f.kind === "attribute") {
      const field = rule.sheet.attributes.find((a) => a.key === f.key);
      return field ? t(field.labelKey) : f.key;
    }
    if (f.kind === "resource") {
      const field = rule.sheet.resources.find((r) => r.key === f.key);
      return field ? t(field.labelKey) : f.key;
    }
    return f.key;
  };
  // Completion chip → the field: switch tab, then scroll to it and focus it
  // once the pane has mounted.
  const [skillsTabKey, setSkillsTabKey] = useState(0);
  const jumpTo = (f: FieldStatus) => {
    // A skills-tab filter or search could hide the target row: remount the
    // tab (it holds them locally) so every row is listed.
    if (f.kind === "skill") setSkillsTabKey((k) => k + 1);
    setActiveTab(f.kind === "skill" ? "skills" : "attributes");
    setTimeout(() => {
      // Scoped to this drawer — a second one (own card + a member's) may be open.
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-field="${CSS.escape(`${f.kind}:${f.key}`)}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el?.querySelector<HTMLElement>("input:not([disabled])") ?? el?.querySelector<HTMLElement>("button:not([disabled])"))
        ?.focus({ preventScroll: true });
    }, 260);
  };

  // Closing with unsaved changes asks first (× / backdrop / Escape).
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const dirtyCount = sheet.changed.length;
  const requestClose = () => { if (dirtyCount > 0) setConfirmClose(true); else close(); };
  useEscapeToClose(requestClose, !confirmClose);

  const { saveStatus, save: handleSaveAll } = sheet;

  // Footer "导出" — downloads a readable text summary of the sheet (client-side).
  const handleExport = () => {
    const text = buildCharacterExportText({ t, nickname, rule, resolved, skills });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nickname || "character"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: TabId; label: string; missing: number }[] = [
    { id: "attributes", label: t("tabAttributes"), missing: missingIn(["attribute", "resource"]) },
    { id: "skills", label: t("tabSkills"), missing: missingIn(["skill"]) },
    { id: "background", label: t("tabBackground"), missing: 0 },
  ];

  // Shared drawer chrome for the loading / empty states.
  const drawerShell = (body: React.ReactNode) => (
    <div className="fixed inset-0 z-50 flex font-theme" onClick={close}>
      <div ref={backdropRef} className="absolute inset-0 bg-scrim/30" />
      <div ref={panelRef} className={`relative ml-auto w-full sm:w-[34rem] bg-surface border-l border-border shadow-2xl h-full flex flex-col overflow-hidden ${panelClass}`}
        onClick={e => e.stopPropagation()}>
        <div className="shrink-0 bg-surface border-b border-border px-6 py-5 flex justify-between items-center">
          <h3 className="font-bold text-text text-xl font-theme-display truncate">{t("titleMember", { name: currentNickname })}</h3>
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

  // Only a read-only view needs a stored sheet; a host can fill in an empty one.
  if ((mode === "view" || (mode === "self" && readOnly)) && !hasExistingData) {
    return drawerShell(
      <div className="flex-1 text-center py-16 text-text-muted flex flex-col items-center justify-center">
        <Icons.User className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">{t("notInitialized")}</p>
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex font-theme" onClick={requestClose}>
      <div ref={backdropRef} className="absolute inset-0 bg-scrim/30" />
      <div ref={panelRef} className={`relative ml-auto w-full sm:w-[34rem] bg-surface border-l border-border shadow-2xl h-full flex flex-col overflow-hidden ${panelClass}`}
        onClick={e => e.stopPropagation()}>

        {/* Header — 角色卡 · 昵称 (own card, click to edit) or "X 的角色卡" */}
        <div className="shrink-0 bg-surface px-6 py-5 flex justify-between items-center gap-3 border-b border-border">
          {mode === "self" && editingNick ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-text-muted text-lg font-bold shrink-0">{t("title")} ·</span>
              <input value={nickname} onChange={e => setNickname(e.target.value)}
                maxLength={NICKNAME_MAX_LENGTH}
                onBlur={saveNickname}
                onKeyDown={e => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") { e.preventDefault(); setNickname(currentNickname); setEditingNick(false); } }}
                autoFocus
                className="flex-1 min-w-0 text-lg font-bold text-text bg-input-bg border border-input-border rounded px-2 py-0.5 outline-none focus:ring-[3px] focus:ring-primary/[0.18]" />
            </div>
          ) : (
            <h3 className="font-bold text-text text-xl font-theme-display flex items-center gap-1.5 min-w-0">
              <span className="truncate">{mode === "self" ? `${t("title")} · ${nickname}` : t("titleMember", { name: nickname })}</span>
              {mode === "self" && !readOnly && (
                <button onClick={() => setEditingNick(true)} title={t("editName")} className="shrink-0 text-text-muted hover:text-primary transition cursor-pointer">
                  <Icons.Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </h3>
          )}
          <button onClick={requestClose} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer shrink-0">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile band — avatar + colour, own card only. Sits above the tab
            bar and stays mounted across tabs so the layout doesn't jump. */}
        {mode === "self" && !readOnly && (
          <AvatarColorBand
            nickname={nickname}
            selectedColor={selectedColor}
            avatarSrc={avatarSrc}
            onPickFile={setCropFile}
            onColorChange={handleColorChange}
          />
        )}

        {mode === "host" && <div className="pt-3"><HostEditBanner hostLabel={hostLabel} memberName={nickname} /></div>}
        {sheet.conflict.length > 0 && (
          <div className={mode === "host" ? "" : "pt-3"}>
            <SheetConflictNotice
              fields={[...new Set(sheet.conflict.map((p) => {
                const [group, key] = p.split(".");
                if (group === "attributes") return labelOf({ kind: "attribute", key, state: "set", required: false });
                if (group === "resources") return labelOf({ kind: "resource", key, state: "set", required: false });
                return group === "profile" ? t(key === "bio" ? "backgroundStory" : key) : t("customAttributes");
              }))]}
              onTakeTheirs={sheet.takeTheirs}
              onKeepMine={sheet.keepMine}
            />
          </div>
        )}

        {editable && ruleMismatch && (
          <div className="shrink-0 flex items-center gap-3 px-6 py-2.5 border-b border-border bg-surface-alt/60 text-xs text-warning">
            <span className="flex-1 min-w-0">{t("sheetRuleMismatch", { rule: ruleLabel(resolved.sheet.ruleTemplate), roomRule: ruleLabel(roomRuleId) })}</span>
            <button type="button" onClick={() => setConfirmRebuild(true)} disabled={sheet.rebuilding}
              className="shrink-0 font-semibold text-primary border border-primary/40 rounded-lg px-2.5 py-1 hover:bg-primary/10 cursor-pointer disabled:opacity-50 disabled:cursor-default">
              {t("sheetRebuildBtn")}
            </button>
          </div>
        )}
        {showCompletion && !ruleMismatch && (
          <SheetCompletionBar completion={completion} labelOf={labelOf} onJump={jumpTo}
            compact={activeTab === "skills"} pending={completionPending} />
        )}

        {/* Tab Bar — underline; red count = required fields missing on that tab */}
        <div className="shrink-0 flex gap-6 px-6 border-b border-border bg-surface">
          {tabs.map(tab => (
            <button key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative py-3 text-sm font-medium transition cursor-pointer ${
                activeTab === tab.id ? "text-primary" : "text-text-muted hover:text-text"
              }`}>
              {tab.label}
              {showCompletion && !completionPending && tab.missing > 0 && (
                <span className="ml-1 font-theme-mono text-[11px] text-danger">{tab.missing}</span>
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
        <PaneTransition paneKey={activeTab}>
          {activeTab === "attributes" && (
            <AttributesTab
              resolved={resolved}
              baseline={baselineResolved}
              changed={changed}
              stateOf={stateOf}
              editable={editable}
              showDirtyFrom={mode === "host"}
              onResourceChange={(key, v) => sheet.setResource(key, { current: v })}
              onResourceMaxChange={(key, v) => sheet.setResource(key, { max: v })}
              onUpdateAttr={(key, v) => sheet.setAttribute(key, v)}
              customAttrs={profile.customAttributes ?? []}
              onAddCustom={(attr) => sheet.setCustomAttributes(list => [...list.filter(a => a.name !== attr.name), attr])}
              onUpdateCustom={(name, patch) => sheet.setCustomAttributes(list => list.map(a => (a.name === name ? { ...a, ...patch } : a)))}
              onRemoveCustom={(name) => sheet.setCustomAttributes(list => list.filter(a => a.name !== name))}
            />
          )}

          {activeTab === "skills" && (
            <SkillsTab key={skillsTabKey} rows={skillRows} editable={editable} aliases={aliases} onSet={setSkill} onRemove={removeSkill} />
          )}

          {activeTab === "background" && (
            <BackgroundTab
              bio={sheet.profileInput("bio") ?? ""}
              onBioChange={v => sheet.setProfile({ bio: v })}
              occupation={sheet.profileInput("occupation") ?? ""}
              onOccupationChange={v => sheet.setProfile({ occupation: v })}
              age={sheet.profileInput("age") ?? ""}
              onAgeChange={v => sheet.setProfile({ age: v === "" ? null : v })}
              readOnly={!editable}
              showRoleLevel={rule.sheet.profile.roleLevel}
              role={sheet.profileInput("role") ?? ""}
              onRoleChange={v => sheet.setProfile({ role: v })}
              level={sheet.profileInput("level") ?? ""}
              onLevelChange={v => sheet.setProfile({ level: v === "" ? null : v })}
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

        {/* Footer — unsaved count; own card: 导出 / 保存; host: 放弃修改 / 保存到 X 的卡 */}
        <div className="shrink-0 border-t border-border bg-surface px-6 py-4 flex gap-3 items-center">
          <span className="flex-1 min-w-0 text-xs text-warning truncate">
            {dirtyCount > 0 ? t("unsavedCount", { count: dirtyCount }) : ""}
          </span>
          {mode === "host" ? (
            <button onClick={sheet.discard} disabled={dirtyCount === 0}
              className="px-4 py-2.5 rounded-theme border border-border text-text font-bold text-sm hover:bg-surface-alt transition cursor-pointer disabled:opacity-50 disabled:cursor-default">
              {t("discardChanges")}
            </button>
          ) : (
            <button onClick={handleExport}
              className="px-4 py-2.5 rounded-theme border border-border text-text font-bold text-sm hover:bg-surface-alt transition cursor-pointer">
              {t("export")}
            </button>
          )}
          {editable && (
            <button onClick={handleSaveAll} disabled={saveStatus === "saving"}
              className="px-5 py-2.5 rounded-theme bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)] disabled:opacity-70 disabled:shadow-none flex items-center justify-center gap-1.5 whitespace-nowrap">
              {saveStatus === "saving" ? tCommon("loading")
                : <>{saveStatus === "success" && <Check className="w-4 h-4" />}{mode === "host" ? t("saveToMember", { name: nickname }) : t("save")}</>}
            </button>
          )}
        </div>
      </div>
    </div>

    {confirmRebuild && (
      <ConfirmDialog
        title={t("sheetRebuildTitle")}
        description={t("sheetRebuildBody", { rule: ruleLabel(roomRuleId) })}
        confirmLabel={t("sheetRebuildBtn")}
        onConfirm={() => { setConfirmRebuild(false); sheet.rebuild(); }}
        onCancel={() => setConfirmRebuild(false)}
      />
    )}

    {confirmClose && (
      <ConfirmDialog
        title={t("closeUnsavedTitle")}
        description={t("closeUnsavedBody", { count: dirtyCount })}
        confirmLabel={t("closeUnsavedConfirm")}
        onConfirm={() => { setConfirmClose(false); close(); }}
        onCancel={() => setConfirmClose(false)}
      />
    )}

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
