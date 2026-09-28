/**
 * Character sheet types — the rule-agnostic v2 sheet every ruleset shares.
 *
 * A rule describes its fields with a `SheetSchema` (`@/lib/rules/sheet-schema`);
 * the sheet stores only the values someone set, keyed by those field keys.
 * The shape itself lives in `./sheet-v2` next to `SheetEdit`; this module is
 * the stable import path for the rest of the app. Pre-v2 rows (one bag per
 * ruleset) are upgraded on read by `parseSheet` (`./sheet-store`).
 */

import type { CharacterSheetV2 } from "./sheet-v2";

/**
 * Hard cap on the serialized sheet (JSON string length) enforced at every
 * action that persists client-supplied sheet data. The member list ships
 * every member's characterData to every client on each room render, so an
 * unbounded sheet is a room-wide payload amplifier. Real sheets are ~1-4 KB;
 * 64 KB leaves generous headroom for custom attributes and notes.
 */
export const CHARACTER_DATA_MAX_BYTES = 65536;

/** A player-defined attribute; with `max` it renders as a resource bar. */
export interface CustomAttribute {
  name: string;
  value: number;
  max?: number;
}

export type CharacterData = CharacterSheetV2;
export type { SheetEdit, ResourceValue } from "./sheet-v2";
