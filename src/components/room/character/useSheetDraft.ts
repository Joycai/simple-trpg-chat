"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { editCharacterAction } from "@/app/actions/character";
import { getRule, DEFAULT_RULE_ID } from "@/lib/rules";
import { applySheetEdit, resolveSheet } from "@/lib/character/sheet-model";
import { parseSheet } from "@/lib/character/sheet-store";
import type { CharacterData, CustomAttribute, SheetEdit } from "@/lib/character/types";
import type { ProfileEdit } from "@/lib/character/sheet-v2";
import type { SaveStatus } from "@/components/room/character/SaveButton";

/**
 * The character sheet being edited in the panel.
 *
 * The server owns the sheet; the panel holds a `baseline` (the sheet as last
 * loaded or saved) and a `draft` — a `SheetEdit` of what the user changed.
 * Everything shown is `applySheetEdit(baseline, draft)` resolved through the
 * rule, the same function the server persists with, so clamping, derived
 * maxes and completion preview exactly. Saving sends only the draft, for the
 * member themself and for a host editing someone else alike, so values the
 * user didn't touch can never be rolled back by a stale panel.
 */
export function useSheetDraft({
  roomId,
  targetUserId,
  characterData,
  roomRuleTemplate,
  setPanelError,
}: {
  roomId: number;
  /** Whose sheet this is (the caller's own id for their own card). */
  targetUserId: number;
  /** The stored sheet (column JSON, or an object from getCharacterDataAction). */
  characterData: string | CharacterData | null | undefined;
  roomRuleTemplate: string | undefined;
  setPanelError: Dispatch<SetStateAction<string | null>>;
}) {
  const tCommon = useTranslations("common");
  const router = useRouter();

  const fromProp = useMemo(
    () => parseSheet(characterData, roomRuleTemplate ?? DEFAULT_RULE_ID),
    [characterData, roomRuleTemplate],
  );
  // A save returns the stored sheet before the parent's `characterData` catches
  // up (router.refresh for the own card; never, for a card fetched once). Use
  // it until the prop changes — a new prop is newer than the save.
  const [saved, setSaved] = useState<{ from: typeof characterData; sheet: CharacterData } | null>(null);
  const baseline = saved && saved.from === characterData ? saved.sheet : fromProp;

  const [draft, setDraft] = useState<SheetEdit>({});
  const rule = getRule(baseline.ruleTemplate);
  const preview = useMemo(() => applySheetEdit(rule, baseline, draft), [rule, baseline, draft]);
  const resolved = useMemo(() => resolveSheet(rule, preview.sheet), [rule, preview.sheet]);

  const setAttribute = (key: string, value: number | null) =>
    setDraft((d) => ({ ...d, attributes: { ...d.attributes, [key]: value } }));
  const setResource = (key: string, patch: { current?: number | null; max?: number | null }) =>
    setDraft((d) => ({ ...d, resources: { ...d.resources, [key]: { ...d.resources?.[key], ...patch } } }));
  const setProfile = (patch: ProfileEdit) =>
    setDraft((d) => ({ ...d, profile: { ...d.profile, ...patch } }));
  const setCustomAttributes = (update: (list: CustomAttribute[]) => CustomAttribute[]) =>
    setDraft((d) => ({ ...d, customAttributes: update(preview.sheet.customAttributes ?? []) }));

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const save = async () => {
    const failSave = (error: string) => {
      setPanelError(error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    };
    setSaveStatus("saving");
    setPanelError(null);
    const sent = draft;
    const res = await editCharacterAction(roomId, targetUserId, sent)
      .catch(() => ({ success: false as const, error: tCommon("error") }));
    if (!res.success) return failSave(res.error);
    setSaved({ from: characterData, sheet: res.data });
    // Keep anything typed while the save was in flight.
    setDraft((d) => (d === sent ? {} : d));
    setSaveStatus("success");
    setTimeout(() => setSaveStatus("idle"), 2000);
    router.refresh();
  };

  /**
   * What a profile input shows: the text as typed while it's in the draft
   * (the stored value is trimmed, so reading it back would eat the space
   * between two words mid-typing), else the stored value.
   */
  const profileInput = <K extends keyof ProfileEdit>(key: K): NonNullable<ProfileEdit[K]> | undefined => {
    const typed = draft.profile?.[key];
    if (typed !== undefined && typed !== null) return typed as NonNullable<ProfileEdit[K]>;
    if (draft.profile && key in draft.profile) return undefined;
    return (baseline[key] ?? undefined) as NonNullable<ProfileEdit[K]> | undefined;
  };

  return {
    rule,
    profileInput,
    baseline,
    resolved,
    /** Paths the draft changes, relative to the baseline. */
    changed: preview.changed,
    setAttribute,
    setResource,
    setProfile,
    setCustomAttributes,
    discard: () => setDraft({}),
    save,
    saveStatus,
  };
}
