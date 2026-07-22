/**
 * COC 7th character-sheet data model — attributes, derived values, defaults,
 * and the derivation helper. Owned by the COC rule module (moved out of the
 * shared `character-types.ts` so each ruleset carries its own sheet types).
 *
 * Self-contained: no import of `CharacterData` or any other rule. The generic
 * `CharacterData` in `@/lib/character-types` type-imports these interfaces for
 * its optional `cocAttributes` / `cocDerived` fields.
 */

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
