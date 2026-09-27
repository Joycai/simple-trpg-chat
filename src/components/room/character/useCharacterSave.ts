"use client";

import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveCharacterDataAction, updateResourcesAction } from "@/app/actions/character";
import { getRule, type ResourcePatch } from "@/lib/rules";
import type { SaveStatus } from "@/components/room/character/SaveButton";

/**
 * The panel's footer save. The owner's save writes the sheet (and, for rules
 * that keep resource currents separately, those too); a host viewing another
 * member's card writes only that member's changed resources.
 */
export function useCharacterSave({
  roomId,
  userId,
  readOnly,
  targetUserId,
  ruleTemplate,
  bio,
  occupation,
  age,
  attributeValues,
  d20Role,
  d20Level,
  currentResources,
  resourceMaxes,
  loadedResourcesRef,
  setPanelError,
}: {
  roomId: number;
  userId: number;
  readOnly: boolean;
  targetUserId: number | undefined;
  ruleTemplate: string;
  bio: string;
  occupation: string;
  age: number | "";
  attributeValues: Record<string, number>;
  d20Role: string;
  d20Level: number | "";
  currentResources: Record<string, number>;
  resourceMaxes: Record<string, number>;
  /** Resource values as last loaded or saved — the baseline a host's save diffs against. */
  loadedResourcesRef: MutableRefObject<Record<string, number>>;
  setPanelError: Dispatch<SetStateAction<string | null>>;
}) {
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Persists attributes + bio + per-rule sheet in one go.
  const handleSaveAll = async () => {
    // Failure: the button flashes its error state and the strip says why.
    const failSave = (error: string) => {
      setPanelError(error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    };
    setSaveStatus("saving");
    setPanelError(null);
    try {
      const basePayload = {
        ruleTemplate, bio,
        occupation: occupation.trim() || undefined,
        age: age === "" ? undefined : Number(age),
      };
      const rule = getRule(ruleTemplate);
      const cap = rule.capabilities;

      // Attribute bag → sheet patch (rule owns which bag), plus role/level for
      // rules that expose them. (Was a coc7th/dnd5e/triangle/shouhun if-chain.)
      let sheetPatch = rule.writeAttributes({ ruleTemplate }, attributeValues);
      if (cap.hasRoleLevel) {
        sheetPatch = {
          ...sheetPatch,
          d20Sheet: {
            ...(sheetPatch.d20Sheet ?? {}),
            role: d20Role.trim() || undefined,
            level: d20Level === "" ? undefined : Number(d20Level),
          },
        };
      }

      // Standard resource currents (+ editable HP max for d20).
      const resPatch: ResourcePatch = {
        hp_current: currentResources.hp ?? 0,
        san_current: currentResources.san ?? 0,
        mp_current: currentResources.mp ?? 0,
        mana_current: currentResources.mana ?? 0,
        hpMax: cap.resourceMaxEditable ? resourceMaxes.hp : undefined,
      };

      if (readOnly && targetUserId) {
        // Host viewing another member's card: only the resource bars are
        // editable here, and they belong to the target. The own-sheet writes
        // below would land on the host's row (saveCharacterDataAction writes
        // the caller's sheet), so send everything through the target-scoped
        // action — counters included, which it writes via the rule.
        const base = loadedResourcesRef.current;
        const changed = (key: string) =>
          currentResources[key] !== undefined && currentResources[key] !== base[key];
        const patch: ResourcePatch & { counters?: Record<string, number> } = {};
        if (changed("hp")) patch.hp_current = currentResources.hp;
        if (changed("san")) patch.san_current = currentResources.san;
        if (changed("mp")) patch.mp_current = currentResources.mp;
        if (changed("mana")) patch.mana_current = currentResources.mana;
        for (const bar of cap.resourceBars) {
          if (bar.style === "counter" && changed(bar.key)) {
            patch.counters = { ...patch.counters, [bar.key]: currentResources[bar.key] };
          }
        }
        const res = await updateResourcesAction(roomId, targetUserId, patch);
        if (!res.success) return failSave(res.error);
        loadedResourcesRef.current = { ...currentResources };
      } else if (cap.resourceCurrentsViaAction) {
        // COC / 狩魂者: attributes on the caller's own sheet, currents via
        // updateResourcesAction so a host can adjust another player's bars.
        const saved = await saveCharacterDataAction(roomId, { ...basePayload, ...sheetPatch });
        if (!saved.success) return failSave(saved.error);
        // A failure here leaves the attributes saved; retrying is idempotent,
        // so reporting the whole save as failed is acceptable.
        const res = await updateResourcesAction(roomId, userId, resPatch);
        if (!res.success) return failSave(res.error);
      } else {
        // d20 / triangle / basic: currents bundle into the player's own sheet —
        // standard resources via applyResourcePatch, counters via applyStatWrite.
        let full = rule.applyResourcePatch({ ...sheetPatch, ruleTemplate }, resPatch);
        for (const bar of cap.resourceBars) {
          if ((bar.style ?? "bar") !== "counter") continue;
          const v = currentResources[bar.key];
          if (v !== undefined) {
            full = rule.applyStatWrite(full, { kind: "resource", key: bar.key, canonical: bar.key }, v).sheet;
          }
        }
        const saved = await saveCharacterDataAction(roomId, { ...basePayload, ...full });
        if (!saved.success) return failSave(saved.error);
      }
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
      router.refresh();
    } catch (e) {
      console.error("Failed to save character", e);
      failSave(tCommon("error"));
    }
  };

  return { saveStatus, handleSaveAll };
}
