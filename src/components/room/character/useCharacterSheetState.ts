"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { initCharacterAction, addCustomAttributeAction, removeCustomAttributeAction } from "@/app/actions/character";
import {
  getRule, DEFAULT_RULE_ID,
  type CocAttributes, type D20Attributes, type D20Sheet,
  type ShAttributes, type ShSheet, type TaQualities, type TaSheet,
} from "@/lib/rules";
import { parseCharData, draftStatusFor, currentsFromStatus, buildAttributeValues } from "@/lib/character/panel-status";

/**
 * The character sheet being edited in the panel: attributes, role/level,
 * background fields, custom attributes and resource currents / max overrides,
 * all seeded from `characterData` and re-synced when it changes (e.g. after a
 * .st / .sc command refreshes the page). On the owner's first open it also
 * initializes the sheet for rules that have one.
 */
export function useCharacterSheetState({
  roomId,
  characterData,
  roomRuleTemplate,
  readOnly,
  afterEnter,
  setPanelError,
}: {
  roomId: number;
  characterData: string | null | undefined;
  roomRuleTemplate: string | undefined;
  readOnly: boolean;
  afterEnter: (fn: () => void) => void;
  setPanelError: Dispatch<SetStateAction<string | null>>;
}) {
  const tCommon = useTranslations("common");
  const router = useRouter();

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
    // The default rule (basic) has no structured sheet to initialize.
    if (roomRuleTemplate === DEFAULT_RULE_ID || !roomRuleTemplate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitDone(true);
      return;
    }
    // Deferred to `afterEnter`: the action revalidates `/rooms/:id` and this
    // then calls `router.refresh()`, so the response re-renders the entire room
    // tree. Landing that inside the drawer's slide is the difference between a
    // smooth open and a visible hitch.
    initCharacterAction(roomId).then((res) => {
      if (!res.success) { setPanelError(res.error); return; }
      const { data } = res;
      afterEnter(() => {
        setAttributeValues(buildAttributeValues(ruleTemplate, data.cocAttributes, data.d20Attributes, data.taQualities, data.shAttributes));
        if (data.d20Sheet) {
          setD20Role(data.d20Sheet.role ?? "");
          setD20Level(data.d20Sheet.level ?? "");
        }
        setInitDone(true);
        router.refresh();
      });
    }).catch(() => setPanelError(tCommon("error")));
    // intentionally omits `router` and `ruleTemplate` from deps — initial-mount-only effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomRuleTemplate, roomId, initDone, readOnly]);
  const [bio, setBio] = useState(charData.bio || "");
  const [occupation, setOccupation] = useState(charData.occupation || "");
  const [age, setAge] = useState<number | "">(charData.age ?? "");

  // Custom attributes / resources (a custom item with `max` set renders as a resource bar)
  const [customAttrs, setCustomAttrs] = useState<{name: string; value: number; max?: number}[]>(charData.customAttributes || []);
  // Per-name value the server last accepted, so a failed in-place edit rolls
  // back to it — not to a newer optimistic value that also never landed.
  // Cleared whenever the sheet re-syncs from props.
  const confirmedCustomRef = useRef(new Map<string, { name: string; value: number; max?: number }>());

  // Draft the rule's live status from the currently-edited attributes so the
  // bar denominators + derived footer move as the player edits, without the
  // panel knowing whether a max is derived (COC/狩魂者) or free-set (d20).
  // Rebuilt each render (was per-rule computeCocDerived / computeShDerived).
  const draftStatus = draftStatusFor(ruleTemplate, charData, attributeValues);
  // Rule-provided derived stats (狩魂者 术法强度 / 灵识); undefined for others.
  const derivedValues = draftStatus.derived;
  const resourceMaxes: Record<string, number> = {};
  for (const bar of ruleCap.resourceBars) {
    const r = draftStatus.resources[bar.key];
    if (r && (bar.style ?? "bar") !== "counter" && r.max !== undefined) {
      resourceMaxes[bar.key] = r.max;
    }
  }

  // Resource current values — generic Record keyed by resource key. Seeded from
  // the rule's own status snapshot (current = stored value, defaulting to max),
  // which subsumes the old per-rule current-value branches.
  const [currentResources, setCurrentResources] = useState<Record<string, number>>(() =>
    currentsFromStatus(ruleTemplate, draftStatusFor(ruleTemplate, charData, attributeValues))
  );
  // Resource values as last loaded or saved. A host editing another member's
  // card sends only what differs from this, so a snapshot that went stale
  // while the panel was open can't roll back the member's other values, and
  // resources the member doesn't have are never written as 0.
  const loadedResourcesRef = useRef(currentResources);

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
    confirmedCustomRef.current.clear();
    // Resource currents come from the rule's own status snapshot; role/level
    // only for rules that expose them. (Was a dnd5e/triangle/shouhun/coc chain.)
    const loaded = currentsFromStatus(rt, draftStatusFor(rt, cd, attrs));
    setCurrentResources(loaded);
    loadedResourcesRef.current = loaded;
    if (getRule(rt).capabilities.hasRoleLevel) {
      setD20Role(cd.d20Sheet?.role ?? "");
      setD20Level(cd.d20Sheet?.level ?? "");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [characterData, ruleTemplate]);

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

  // Add or overwrite a custom item. `max` present ⇒ rendered as a resource bar.
  const addCustom = async (attr: { name: string; value: number; max?: number }) => {
    const name = attr.name.trim();
    if (!name) return;
    const item = { ...attr, name };
    setPanelError(null);
    const res = await addCustomAttributeAction(roomId, item)
      .catch(() => ({ success: false as const, error: tCommon("error") }));
    if (!res.success) { setPanelError(res.error); return; }
    setCustomAttrs(prev => {
      const idx = prev.findIndex(a => a.name === name);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = item; return copy; }
      return [...prev, item];
    });
    router.refresh();
  };

  // Edit a custom item's current value / max in place (optimistic + persist).
  const updateCustom = async (name: string, patch: { value?: number; max?: number }) => {
    const existing = customAttrs.find(a => a.name === name);
    if (!existing) return;
    const confirmed = confirmedCustomRef.current;
    if (!confirmed.has(name)) confirmed.set(name, existing);
    const item = { ...existing, ...patch };
    setCustomAttrs(prev => prev.map(a => (a.name === name ? item : a)));
    setPanelError(null);
    const res = await addCustomAttributeAction(roomId, item)
      .catch(() => ({ success: false as const, error: tCommon("error") }));
    if (!res.success) {
      // Roll back the optimistic edit unless a newer edit has replaced it.
      const base = confirmed.get(name) ?? existing;
      setCustomAttrs(prev => prev.map(a => (a === item ? base : a)));
      setPanelError(res.error);
      return;
    }
    confirmed.set(name, item);
    router.refresh();
  };

  const removeCustomAttr = async (name: string) => {
    setPanelError(null);
    const res = await removeCustomAttributeAction(roomId, name)
      .catch(() => ({ success: false as const, error: tCommon("error") }));
    if (!res.success) { setPanelError(res.error); return; }
    setCustomAttrs(prev => prev.filter(a => a.name !== name));
    router.refresh();
  };

  return {
    hasExistingData, ruleTemplate, ruleCap,
    attributeValues, updateAttr,
    d20Role, setD20Role, d20Level, setD20Level,
    bio, setBio, occupation, setOccupation, age, setAge,
    customAttrs, addCustom, updateCustom, removeCustomAttr,
    draftStatus, derivedValues, resourceMaxes, effectiveResourceMaxes,
    currentResources, handleResourceChange, handleResourceMaxChange, loadedResourcesRef,
  };
}
