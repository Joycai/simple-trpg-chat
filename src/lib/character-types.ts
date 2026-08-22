/**
 * Character Sheet Data Types — the generic `CharacterData` shell shared by every
 * ruleset.
 *
 * Each ruleset's own attribute/resource types, defaults and derivation helpers
 * now live next to its module in `src/lib/rules/<id>/sheet.ts` (COC 7th, d20,
 * Triangle, 狩魂者). This file keeps only the rule-agnostic skeleton and
 * type-imports each rule's bag types for `CharacterData`'s optional fields.
 *
 * These are **type-only** imports (erased at build), so there is no runtime
 * dependency on the rules subsystem and no import cycle — the sheet files are
 * self-contained leaves. External code should import a rule's sheet helpers
 * from the `@/lib/rules` barrel rather than reaching into a sub-path.
 */

import type { CocAttributes, CocDerived } from "@/lib/rules/coc7th/sheet";
import type { D20Attributes, D20Sheet } from "@/lib/rules/dnd5e/sheet";
import type { TaQualities, TaSheet } from "@/lib/rules/triangle/sheet";
import type { ShAttributes, ShSheet } from "@/lib/rules/shouhun/sheet";

// ============================================================
// Generic Character Sheet
// ============================================================

/**
 * Hard cap on the serialized sheet (JSON string length) enforced at every
 * action that persists client-supplied sheet data. The member list ships
 * every member's characterData to every client on each room render, so an
 * unbounded sheet is a room-wide payload amplifier. Real sheets are ~1-4 KB;
 * 64 KB leaves generous headroom for custom attributes and notes.
 */
export const CHARACTER_DATA_MAX_BYTES = 65536;

/** Custom attribute (for non-COC systems) */
export interface CustomAttribute {
  name: string;
  value: number;
  max?: number;
}

/** Resource bar (HP, SAN, MP, etc.) */
export interface ResourceBar {
  key: string;       // e.g. "hp", "san", "mp"
  label: string;     // e.g. "生命值", "理智值"
  current: number;
  max: number;
  color: string;     // Tailwind color class e.g. "bg-danger"
  show: boolean;     // Whether to display in panel
}

// ============================================================
// Character Data Root
// ============================================================

export interface CharacterData {
  /** Display info */
  name?: string;
  age?: number;
  occupation?: string;
  bio?: string;          // Backstory / description
  avatarUrl?: string;    // Reserved

  /** Rule id — resolves to a RuleModule via `getRule` */
  ruleTemplate: string;  // 'basic' | 'coc7th' | 'dnd5e' | 'triangle' | 'shouhun'

  /** COC 7th attributes (only when ruleTemplate = 'coc7th') */
  cocAttributes?: CocAttributes;

  /** COC 7th derived values */
  cocDerived?: CocDerived;

  /** DnD 5e attributes (only when ruleTemplate = 'dnd5e') */
  d20Attributes?: D20Attributes;

  /** DnD 5e role / level / HP (only when ruleTemplate = 'dnd5e') */
  d20Sheet?: D20Sheet;

  /** Triangle Agency qualifications (only when ruleTemplate = 'triangle') */
  taQualities?: TaQualities;

  /** Triangle Agency commendation/reprimand counters (only when ruleTemplate = 'triangle') */
  taSheet?: TaSheet;

  /** 狩魂者 attributes (only when ruleTemplate = 'shouhun') */
  shAttributes?: ShAttributes;

  /** 狩魂者 HP/mana current values (only when ruleTemplate = 'shouhun') */
  shSheet?: ShSheet;

  /** Generic custom attributes */
  customAttributes?: CustomAttribute[];

  /** Resource bars for display */
  resources?: ResourceBar[];

  /** Skills reference (managed via room_skills table) */
  skillIds?: number[];
}
