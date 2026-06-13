/**
 * Character Sheet Data Types
 *
 * Structured character_data JSON stored in room_members.character_data.
 * Supports COC 7th and basic rule templates.
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
  san: number;     // Sanity (POW)
  sanMax: number;
  mp: number;      // Magic Points (POW/5)
  mpMax: number;
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

export interface CharacterData {
  /** Display info */
  name?: string;
  age?: number;
  occupation?: string;
  bio?: string;          // Backstory / description
  avatarUrl?: string;    // Reserved

  /** Rule-specific data */
  ruleTemplate: string;  // 'basic' | 'coc7th'

  /** COC 7th attributes (only when ruleTemplate = 'coc7th') */
  cocAttributes?: CocAttributes;

  /** COC 7th derived values */
  cocDerived?: CocDerived;

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

  return { hp, hpMax: hp, san, sanMax: san, mp, mpMax: mp, mov, db, build, luck: attrs.luck };
}
