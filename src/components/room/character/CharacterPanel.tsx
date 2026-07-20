"use client";

import { useState, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { updateNicknameAction, getRoomSkills, updateRoomMemberColorAction, uploadAvatarAction } from "@/app/actions/room";
import { initCharacterAction, saveCharacterDataAction, addCustomAttributeAction, removeCustomAttributeAction, updateResourcesAction } from "@/app/actions/character";
import { getMySkillsAction, upsertSkillAction, deleteSkillAction } from "@/app/actions/skills";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CocAttributes, D20Attributes, D20Sheet, ShAttributes, ShSheet, TaQualities, TaSheet } from "@/lib/character-types";
import { COC_DEFAULT_ATTRIBUTES, D20_DEFAULT_ATTRIBUTES, SH_DEFAULT_ATTRIBUTES, TA_DEFAULT_QUALITIES, computeCocDerived, computeShDerived, shGradeLabel } from "@/lib/character-types";
import { getRandomColorForUser, getContrastColor, PRESET_AVATAR_COLORS } from "@/lib/avatar-colors";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "@/components/shared/icons";
import { ImageCropper } from "@/components/shared/ImageCropper";
import { AttributesTab } from "@/components/room/character/AttributesTab";
import { SkillsTab, type SkillItem } from "@/components/room/character/SkillsTab";
import { BackgroundTab } from "@/components/room/character/BackgroundTab";
import type { SaveStatus } from "@/components/room/character/SaveButton";
import { getRule } from "@/lib/rules";

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
  const [cropFile, setCropFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
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

  // Character data — parsed once, then individual fields are pulled into local
  // state below so edits can be optimistic before save.
  const charData = parseCharData(characterData) as {
    ruleTemplate?: string;
    cocAttributes?: CocAttributes;
    cocDerived?: { hp_current?: number; san_current?: number; mp_current?: number; hp?: number; san?: number; mp?: number; hpMax?: number; sanMax?: number; mpMax?: number };
    d20Attributes?: D20Attributes;
    d20Sheet?: D20Sheet;
    taQualities?: TaQualities;
    taSheet?: TaSheet;
    shAttributes?: ShAttributes;
    shSheet?: ShSheet;
    bio?: string;
    occupation?: string;
    age?: number;
    customAttributes?: { name: string; value: number; max?: number }[];
  };
  const hasExistingData = !!characterData && !!charData.ruleTemplate;
  const ruleTemplate = charData.ruleTemplate || roomRuleTemplate || "basic";
  const ruleCap = getRule(ruleTemplate).capabilities;
  const [initDone, setInitDone] = useState(hasExistingData);

  // Attributes — generic Record keyed by capability `attributeKeys[*].key`.
  // For COC: pulled from cocAttributes; for d20: from d20Attributes.
  const [attributeValues, setAttributeValues] = useState<Record<string, number>>(() =>
    buildAttributeValues(ruleTemplate, charData.cocAttributes, charData.d20Attributes, charData.taQualities, charData.shAttributes)
  );

  // d20-specific role / level (gated by `cap.hasRoleLevel`).
  const [d20Role, setD20Role] = useState<string>(charData.d20Sheet?.role ?? "");
  const [d20Level, setD20Level] = useState<number | "">(charData.d20Sheet?.level ?? "");

  // Auto-init character on first open (rule-driven; was COC-only before).
  useEffect(() => {
    if (readOnly) return;
    if (initDone) return;
    if (roomRuleTemplate === "basic" || !roomRuleTemplate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitDone(true);
      return;
    }
    initCharacterAction(roomId).then((data) => {
      setAttributeValues(buildAttributeValues(ruleTemplate, data.cocAttributes, data.d20Attributes, data.taQualities, data.shAttributes));
      if (data.d20Sheet) {
        setD20Role(data.d20Sheet.role ?? "");
        setD20Level(data.d20Sheet.level ?? "");
      }
      setInitDone(true);
      router.refresh();
    }).catch(() => {});
    // intentionally omits `router` and `ruleTemplate` from deps — initial-mount-only effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomRuleTemplate, roomId, initDone, readOnly]);
  const [bio, setBio] = useState(charData.bio || "");
  const [occupation, setOccupation] = useState(charData.occupation || "");
  const [age, setAge] = useState<number | "">(charData.age ?? "");

  // Custom attributes / resources (a custom item with `max` set renders as a resource bar)
  const [customAttrs, setCustomAttrs] = useState<{name: string; value: number; max?: number}[]>(charData.customAttributes || []);

  // For COC, derived (hpMax/sanMax/mpMax) is computed from attributes; for
  // d20 it's free-set on d20Sheet. We rebuild on every render so attribute
  // edits in the panel immediately move the bar denominators.
  const cocDerived = ruleTemplate === "coc7th"
    ? computeCocDerived(attributeValuesAsCocAttrs(attributeValues))
    : null;
  // 狩魂者: maxes derive from the 3 attributes; recomputed per render so
  // attribute edits move the bar denominators immediately (same as COC).
  const shDerived = ruleTemplate === "shouhun"
    ? computeShDerived(attributeValuesAsShAttrs(attributeValues))
    : null;
  const resourceMaxes: Record<string, number> =
    ruleTemplate === "dnd5e"
      ? { hp: charData.d20Sheet?.hpMax ?? 10 }
      : ruleTemplate === "triangle"
        ? {} // counters have no max
        : shDerived
          ? { hp: shDerived.hpMax, mana: shDerived.manaMax }
          : cocDerived
            ? { hp: cocDerived.hpMax, san: cocDerived.sanMax, mp: cocDerived.mpMax }
            : {};

  // Resource current values — generic Record keyed by resource key.
  const [currentResources, setCurrentResources] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    if (ruleTemplate === "dnd5e") {
      out.hp = charData.d20Sheet?.hp_current ?? charData.d20Sheet?.hpMax ?? 10;
      return out;
    }
    if (ruleTemplate === "triangle") {
      out.commendations = charData.taSheet?.commendations ?? 0;
      out.reprimands = charData.taSheet?.reprimands ?? 0;
      return out;
    }
    if (ruleTemplate === "shouhun") {
      const d = computeShDerived(attributeValuesAsShAttrs(attributeValues));
      out.hp = charData.shSheet?.hp_current ?? d.hpMax;
      out.mana = charData.shSheet?.mana_current ?? d.manaMax;
      return out;
    }
    const d = computeCocDerived(attributeValuesAsCocAttrs(attributeValues));
    out.hp = charData.cocDerived?.hp_current ?? d.hp;
    out.san = charData.cocDerived?.san_current ?? d.san;
    out.mp = charData.cocDerived?.mp_current ?? d.mp;
    return out;
  });

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
      ruleTemplate?: string;
      cocAttributes?: CocAttributes;
      d20Attributes?: D20Attributes;
      d20Sheet?: D20Sheet;
      taQualities?: TaQualities;
      taSheet?: TaSheet;
      shAttributes?: ShAttributes;
      shSheet?: ShSheet;
      bio?: string;
      occupation?: string;
      age?: number;
      customAttributes?: { name: string; value: number; max?: number }[];
      cocDerived?: { hp_current?: number; san_current?: number; mp_current?: number; hp?: number; san?: number; mp?: number };
    };
    if (!cd) return;
    const rt = cd.ruleTemplate || ruleTemplate;
    const attrs = buildAttributeValues(rt, cd.cocAttributes, cd.d20Attributes, cd.taQualities, cd.shAttributes);
    /* eslint-disable react-hooks/set-state-in-effect */
    setAttributeValues(attrs);
    setBio(cd.bio || "");
    setOccupation(cd.occupation || "");
    setAge(cd.age ?? "");
    setCustomAttrs(cd.customAttributes || []);
    if (rt === "dnd5e") {
      setD20Role(cd.d20Sheet?.role ?? "");
      setD20Level(cd.d20Sheet?.level ?? "");
      setCurrentResources({ hp: cd.d20Sheet?.hp_current ?? cd.d20Sheet?.hpMax ?? 10 });
    } else if (rt === "triangle") {
      setCurrentResources({
        commendations: cd.taSheet?.commendations ?? 0,
        reprimands: cd.taSheet?.reprimands ?? 0,
      });
    } else if (rt === "shouhun") {
      const d = computeShDerived(attributeValuesAsShAttrs(attrs));
      setCurrentResources({
        hp: cd.shSheet?.hp_current ?? d.hpMax,
        mana: cd.shSheet?.mana_current ?? d.manaMax,
      });
    } else {
      const d = computeCocDerived(attributeValuesAsCocAttrs(attrs));
      setCurrentResources({
        hp: cd.cocDerived?.hp_current ?? d.hp,
        san: cd.cocDerived?.san_current ?? d.san,
        mp: cd.cocDerived?.mp_current ?? d.mp,
      });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [characterData, ruleTemplate]);

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

  // Footer "保存" — persists attributes + bio + per-rule sheet in one go.
  const handleSaveAll = async () => {
    setSaveStatus("saving");
    try {
      const basePayload = {
        ruleTemplate, bio,
        occupation: occupation.trim() || undefined,
        age: age === "" ? undefined : Number(age),
      };
      if (ruleTemplate === "coc7th") {
        await saveCharacterDataAction(roomId, {
          ...basePayload,
          cocAttributes: attributeValuesAsCocAttrs(attributeValues),
        });
        await updateResourcesAction(roomId, targetUserId || userId, {
          hp_current: currentResources.hp ?? 0,
          san_current: currentResources.san ?? 0,
          mp_current: currentResources.mp ?? 0,
        });
      } else if (ruleTemplate === "dnd5e") {
        await saveCharacterDataAction(roomId, {
          ...basePayload,
          d20Attributes: attributeValuesAsD20Attrs(attributeValues),
          d20Sheet: {
            role: d20Role.trim() || undefined,
            level: d20Level === "" ? undefined : Number(d20Level),
            hpMax: resourceMaxes.hp,
            hp_current: currentResources.hp ?? 0,
          },
        });
      } else if (ruleTemplate === "triangle") {
        await saveCharacterDataAction(roomId, {
          ...basePayload,
          taQualities: attributeValuesAsTaQualities(attributeValues),
          taSheet: {
            commendations: currentResources.commendations ?? 0,
            reprimands: currentResources.reprimands ?? 0,
          },
        });
      } else if (ruleTemplate === "shouhun") {
        // Two-step like COC: attributes on the caller's own sheet, currents
        // via updateResourcesAction so a GM can adjust another player's bars.
        await saveCharacterDataAction(roomId, {
          ...basePayload,
          shAttributes: attributeValuesAsShAttrs(attributeValues),
        });
        await updateResourcesAction(roomId, targetUserId || userId, {
          hp_current: currentResources.hp ?? 0,
          mana_current: currentResources.mana ?? 0,
        });
      } else {
        // basic — no rule-specific shape; save just the generic fields.
        await saveCharacterDataAction(roomId, basePayload);
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
      lines.push(
        `${t("hp")}: ${currentResources.hp ?? 0}/${resourceMaxes.hp ?? 0}`,
        `${t("san")}: ${currentResources.san ?? 0}/${resourceMaxes.san ?? 0}`,
        `${t("mp")}: ${currentResources.mp ?? 0}/${resourceMaxes.mp ?? 0}`,
        ""
      );
      lines.push(t("baseAttributes") + ":");
      ruleCap.attributeKeys.forEach(({ key }) =>
        lines.push(`  ${key.toUpperCase()}: ${attributeValues[key] ?? 0}`));
    } else if (ruleTemplate === "dnd5e") {
      if (d20Role) lines.push(`${t("role")}: ${d20Role}`);
      if (d20Level !== "") lines.push(`${t("level")}: ${d20Level}`);
      lines.push(`${t("hp")}: ${currentResources.hp ?? 0}/${resourceMaxes.hp ?? 0}`, "");
      lines.push(t("baseAttributes") + ":");
      ruleCap.attributeKeys.forEach(({ key }) =>
        lines.push(`  ${key.toUpperCase()}: ${attributeValues[key] ?? 0}`));
    } else if (ruleTemplate === "triangle") {
      lines.push(
        `${t("commendations")}: ${currentResources.commendations ?? 0}`,
        `${t("reprimands")}: ${currentResources.reprimands ?? 0}`,
        ""
      );
      lines.push(t("baseAttributes") + ":");
      ruleCap.attributeKeys.forEach(({ key, labelKey }) =>
        lines.push(`  ${t(labelKey)}: ${attributeValues[key] ?? 0}`));
    } else if (ruleTemplate === "shouhun") {
      lines.push(
        `${t("hp")}: ${currentResources.hp ?? 0}/${resourceMaxes.hp ?? 0}`,
        `${t("shMana")}: ${currentResources.mana ?? 0}/${resourceMaxes.mana ?? 0}`,
        `${t("shSpellStrength")}: ${shDerived?.spellStrength ?? 0}`,
        `${t("shSpiritSense")}: ${shDerived?.spiritSense ?? 0}`,
        ""
      );
      lines.push(t("baseAttributes") + ":");
      ruleCap.attributeKeys.forEach(({ key, labelKey }) =>
        lines.push(`  ${t(labelKey)}: ${attributeValues[key] ?? 0} (${shGradeLabel(attributeValues[key] ?? 1)})`));
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

  const updateAttr = (key: string, value: number) => {
    setAttributeValues(prev => ({ ...prev, [key]: value }));
  };

  const handleResourceChange = (key: string, value: number) => {
    setCurrentResources(prev => ({ ...prev, [key]: value }));
  };

  // d20: max is editable on the HP bar (no auto-derivation). Wire it into
  // resourceMaxes via a local override state so the AttributesTab can refresh
  // immediately without a server round-trip.
  const [resourceMaxOverrides, setResourceMaxOverrides] = useState<Record<string, number>>({});
  const effectiveResourceMaxes = { ...resourceMaxes, ...resourceMaxOverrides };
  const handleResourceMaxChange = (key: string, value: number) => {
    setResourceMaxOverrides(prev => ({ ...prev, [key]: value }));
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
                  // Avatar is a base64 data URL — next/image can't optimize these.
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatarSrc} alt={nickname} className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center text-2xl font-bold"
                      style={{ backgroundColor: selectedColor, color: getContrastColor(selectedColor) }}>{nickname.charAt(0).toUpperCase()}</span>}
              </div>
              <button onClick={() => avatarInputRef.current?.click()} title={t("changeAvatar")}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground border-2 border-surface flex items-center justify-center cursor-pointer">
                <Icons.Pencil className="w-3 h-3" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Reset value so re-selecting the same file re-fires onChange.
                  e.target.value = "";
                  if (file) setCropFile(file);
                }}
              />
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
              currentResources={currentResources}
              resourceMaxes={effectiveResourceMaxes}
              onResourceChange={handleResourceChange}
              resourceMaxEditable={ruleTemplate === "dnd5e" && !readOnly}
              onResourceMaxChange={handleResourceMaxChange}
              attributeValues={attributeValues}
              derivedValues={shDerived ? { spellStrength: shDerived.spellStrength } : undefined}
              onUpdateAttr={updateAttr}
              customAttrs={customAttrs}
              onAddCustom={addCustom}
              onUpdateCustom={updateCustom}
              onRemoveCustom={removeCustomAttr}
            />
          )}
          {activeTab === "attributes" && shDerived && (
            <p className="mt-3 text-xs text-text-dim text-center">
              {t("shSpiritSense")}: {shDerived.spiritSense} · {t("shSpiritSenseHint")}
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
        </div>

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
        onConfirm={async (dataUrl) => {
          await uploadAvatarAction(roomId, dataUrl);
          setAvatarOverride(dataUrl);
          setCropFile(null);
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

/**
 * Build the generic `attributeValues: Record<string, number>` record fed to
 * AttributesTab from rule-specific attribute bags. COC → cocAttributes;
 * d20 → d20Attributes; basic → empty.
 */
function buildAttributeValues(
  ruleTemplate: string,
  coc: CocAttributes | undefined,
  d20: D20Attributes | undefined,
  ta?: TaQualities,
  sh?: ShAttributes,
): Record<string, number> {
  if (ruleTemplate === "coc7th") {
    const src = coc || COC_DEFAULT_ATTRIBUTES;
    return { ...src };
  }
  if (ruleTemplate === "dnd5e") {
    const src = d20 || D20_DEFAULT_ATTRIBUTES;
    return { ...src };
  }
  if (ruleTemplate === "triangle") {
    const src = ta || TA_DEFAULT_QUALITIES;
    return { ...src };
  }
  if (ruleTemplate === "shouhun") {
    const src = sh || SH_DEFAULT_ATTRIBUTES;
    return { ...src };
  }
  return {};
}

/** Read back a COC attributes object from the generic record (only valid keys). */
function attributeValuesAsCocAttrs(values: Record<string, number>): CocAttributes {
  const keys: (keyof CocAttributes)[] = ["str","con","siz","dex","app","int","pow","edu","luck"];
  const out = { ...COC_DEFAULT_ATTRIBUTES };
  keys.forEach(k => {
    if (typeof values[k] === "number") out[k] = values[k];
  });
  return out;
}

/** Read back a D20 attributes object from the generic record. */
function attributeValuesAsD20Attrs(values: Record<string, number>): D20Attributes {
  const keys: (keyof D20Attributes)[] = ["str","dex","con","int","wis","cha","pb","ac"];
  const out = { ...D20_DEFAULT_ATTRIBUTES };
  keys.forEach(k => {
    if (typeof values[k] === "number") out[k] = values[k];
  });
  return out;
}

/** Read back a 狩魂者 attributes object from the generic record. */
function attributeValuesAsShAttrs(values: Record<string, number>): ShAttributes {
  const keys: (keyof ShAttributes)[] = ["phy", "wis", "soul"];
  const out = { ...SH_DEFAULT_ATTRIBUTES };
  keys.forEach(k => {
    if (typeof values[k] === "number") out[k] = values[k];
  });
  return out;
}

/** Read back a Triangle Agency qualities object from the generic record. */
function attributeValuesAsTaQualities(values: Record<string, number>): TaQualities {
  const keys: (keyof TaQualities)[] = [
    "attentiveness","duplicity","dynamism","empathy","initiative",
    "persistence","presence","professionalism","subtlety",
  ];
  const out = { ...TA_DEFAULT_QUALITIES };
  keys.forEach(k => {
    if (typeof values[k] === "number") out[k] = values[k];
  });
  return out;
}
