/**
 * Character Sheet Data Types
 *
 * Structured character_data JSON stored in room_members.character_data.
 * Supports COC 7th, basic, and DnD 5e (d20) rule templates.
 */

// ============================================================
// COC 7th Attributes
// ============================================================

/** COC 7th standard attributes */
export interface CocAttributes {
  str: number;   // Strength (3D6 * 5)
  con: number;   // Constitution (3D6 * 5)
  siz: number;   // Size (2D6+6 * 5)
  dex: number;   // Dexterity (3D6 * 5)
  app: number;   // Appearance (3D6 * 5)
  int: number;   // Intelligence (2D6+6 * 5)
  pow: number;   // Power (3D6 * 5)
  edu: number;   // Education (2D6+6 * 5)
  luck: number;  // Luck (3D6 * 5) — mutable during play
}

/** Derived values computed from attributes */
export interface CocDerived {
  hp: number;      // Hit Points ((CON+SIZ)/10)
  hpMax: number;
  hp_current?: number; // Current HP (if adjusted)
  san: number;     // Sanity (POW)
  sanMax: number;
  san_current?: number; // Current Sanity (if adjusted)
  mp: number;      // Magic Points (POW/5)
  mpMax: number;
  mp_current?: number; // Current MP (if adjusted)
  mov: number;     // Movement Rate
  db: string;      // Damage Bonus
  build: number;   // Build
  luck: number;    // Luck (3D6 * 5)
}

// ============================================================
// Generic Character Sheet
// ============================================================

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

// ============================================================
// DnD 5e (d20) Attributes
// ============================================================

/**
 * D20 attributes. All 8 are free-set numbers — the rule does NO derivation
 * (per v1 design: no auto ability-mod, no auto AC, no auto pb-from-level).
 * Players control everything via `.st <name> <val>` or the character panel.
 */
export interface D20Attributes {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  pb: number;    // Proficiency bonus (free-set)
  ac: number;    // Armor class (free-set)
}

/**
 * D20 sheet meta + resources. Role/level are free-text/free-number display
 * fields (no class system in v1). HP is the only resource bar.
 */
export interface D20Sheet {
  role?: string;       // Character role / class (free text)
  level?: number;      // Character level (free-set)
  hpMax?: number;
  hp_current?: number;
}

export const D20_DEFAULT_ATTRIBUTES: D20Attributes = {
  str: 10, dex: 10, con: 10,
  int: 10, wis: 10, cha: 10,
  pb: 2, ac: 10,
};

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

  /** Rule-specific data */
  ruleTemplate: string;  // 'basic' | 'coc7th' | 'dnd5e'

  /** COC 7th attributes (only when ruleTemplate = 'coc7th') */
  cocAttributes?: CocAttributes;

  /** COC 7th derived values */
  cocDerived?: CocDerived;

  /** DnD 5e attributes (only when ruleTemplate = 'dnd5e') */
  d20Attributes?: D20Attributes;

  /** DnD 5e role / level / HP (only when ruleTemplate = 'dnd5e') */
  d20Sheet?: D20Sheet;

  /** Generic custom attributes */
  customAttributes?: CustomAttribute[];

  /** Resource bars for display */
  resources?: ResourceBar[];

  /** Skills reference (managed via room_skills table) */
  skillIds?: number[];
}

// ============================================================
// COC 7th Defaults
// ============================================================

export const COC_DEFAULT_ATTRIBUTES: CocAttributes = {
  str: 50, con: 50, siz: 50, dex: 50,
  app: 50, int: 50, pow: 50, edu: 50, luck: 50,
};

/**
 * COC 7th: maximum Sanity is always 99 (reduced only by Cthulhu Mythos, which we don't
 * track here). POW only sets the *starting* SAN value, never the cap.
 */
export const COC_MAX_SANITY = 99;

/** Compute COC 7th derived values from attributes */
export function computeCocDerived(attrs: CocAttributes): CocDerived {
  const hp = Math.floor((attrs.con + attrs.siz) / 10);
  const san = attrs.pow;
  const mp = Math.floor(attrs.pow / 5);
  const strPlusSiz = attrs.str + attrs.siz;

  let db = "0";
  let build = 0;
  if (strPlusSiz >= 2 && strPlusSiz <= 64) { db = "-2"; build = -2; }
  else if (strPlusSiz <= 84) { db = "-1"; build = -1; }
  else if (strPlusSiz <= 124) { db = "0"; build = 0; }
  else if (strPlusSiz <= 164) { db = "+1D4"; build = 1; }
  else if (strPlusSiz <= 204) { db = "+1D6"; build = 2; }
  else {
    const steps = Math.floor((strPlusSiz - 205) / 80) + 3;
    db = `+${steps - 1}D6`;
    build = steps;
  }

  // MOV based on DEX+SIZ
  let mov = 8;
  if (attrs.dex < attrs.siz && attrs.str < attrs.siz) mov = 7;
  else if (attrs.dex > attrs.siz && attrs.str > attrs.siz) mov = 9;

  return { hp, hpMax: hp, san, sanMax: COC_MAX_SANITY, mp, mpMax: mp, mov, db, build, luck: attrs.luck };
}
