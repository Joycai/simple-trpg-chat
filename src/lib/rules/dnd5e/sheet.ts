/**
 * DnD 5e (d20) character-sheet data model. Owned by the d20 rule module (moved
 * out of the shared `character-types.ts`). Self-contained — no `CharacterData`
 * import; the generic sheet type-imports these for its `d20Attributes` /
 * `d20Sheet` fields.
 */

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
