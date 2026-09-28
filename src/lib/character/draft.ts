import type { CharacterSheetV2, SheetEdit } from "./sheet-v2";

/**
 * Pure helpers for the panel's draft when someone else updates the same sheet
 * while it's open (a host adjusting HP, the player's own `.st`). The panel
 * always adopts the newer sheet as its baseline and keeps its draft; only the
 * paths both sides changed need the user's decision.
 *
 * Paths are the ones `sheetDiff` reports: `attributes.<key>`,
 * `resources.<key>.current|max`, `profile.<key>`, `customAttributes`.
 */

/** Paths changed by others that the draft also changes. */
export function overlappingChanges(theirs: ReadonlyArray<string>, mine: ReadonlyArray<string>): string[] {
  const mineSet = new Set(mine);
  return theirs.filter((p) => mineSet.has(p));
}

/** The draft without the given paths — "take theirs" for those fields. */
export function dropPaths(draft: SheetEdit, paths: ReadonlyArray<string>): SheetEdit {
  const out: SheetEdit = {
    ...draft,
    attributes: draft.attributes ? { ...draft.attributes } : undefined,
    resources: draft.resources
      ? Object.fromEntries(Object.entries(draft.resources).map(([k, v]) => [k, { ...v }]))
      : undefined,
    profile: draft.profile ? { ...draft.profile } : undefined,
  };
  for (const path of paths) {
    const [group, key, part] = path.split(".");
    if (group === "attributes" && out.attributes) delete out.attributes[key];
    else if (group === "resources" && out.resources?.[key] && (part === "current" || part === "max")) {
      delete out.resources[key][part];
      if (Object.keys(out.resources[key]).length === 0) delete out.resources[key];
    } else if (group === "profile" && out.profile) delete out.profile[key as keyof typeof out.profile];
    else if (group === "customAttributes") delete out.customAttributes;
  }
  // Drop emptied groups so an all-dropped draft reads as "no changes".
  if (out.attributes && Object.keys(out.attributes).length === 0) delete out.attributes;
  if (out.resources && Object.keys(out.resources).length === 0) delete out.resources;
  if (out.profile && Object.keys(out.profile).length === 0) delete out.profile;
  for (const k of Object.keys(out) as (keyof SheetEdit)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/**
 * The newer of two copies of one sheet: the parent's (loaded or refreshed)
 * and the one a save returned. The higher write counter wins, so a refresh
 * that started before the save landed can't bring back the old values, and
 * any later write — ours arriving through the refresh, or someone else's —
 * replaces the saved copy. On a tie they are the same write; the loaded one
 * is kept.
 */
export function newerSheet<S extends CharacterSheetV2>(loaded: S, saved: S | null): S {
  return saved && (saved.rev ?? 0) > (loaded.rev ?? 0) ? saved : loaded;
}
