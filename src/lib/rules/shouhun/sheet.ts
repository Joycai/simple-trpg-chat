/**
 * 狩魂者 (shouhun) character-sheet data model — 3 base attributes plus the full
 * derivation (strength tiers, HP/mana maxes, 灵识, letter grades). Owned by the
 * shouhun rule module (moved out of the shared `character-types.ts`).
 * Self-contained.
 */

/**
 * 狩魂者's 3 base attributes, each 1..9 (E → SSS+). Everything else —
 * strength tiers, HP, mana, 灵识 — derives from these three numbers.
 */
export interface ShAttributes {
  phy: number;   // 体魄
  wis: number;   // 智慧
  soul: number;  // 心魂
}

/**
 * 狩魂者 sheet meta. Only current resource values are stored — the maxes are
 * always derived from attributes via `computeShDerived` and never persisted.
 */
export interface ShSheet {
  hp_current?: number;
  mana_current?: number;
}

/** Derived values for 狩魂者. Strength tiers are ⌊attr/2⌋ per the rulebook. */
export interface ShDerived {
  phyStrength: number;     // 体魄强度
  spellStrength: number;   // 术法强度 (from 智慧)
  psychicStrength: number; // 灵能力强度 (from 心魂)
  hpMax: number;           // 5 + 体魄强度
  manaMax: number;         // 5 + 智慧×2 + 心魂
  spiritSense: number;     // 灵识 = 三属性之和 (point-buy reference, not enforced)
}

/** 属性 1..9 → 等级 E..SSS+ (index = attr - 1). */
export const SH_GRADE_LABELS = ["E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+"] as const;

export const SH_DEFAULT_ATTRIBUTES: ShAttributes = { phy: 3, wis: 3, soul: 3 };

/** Clamp a 狩魂者 attribute into its legal 1..9 range. */
export function clampShAttr(v: number): number {
  return Math.min(9, Math.max(1, Math.floor(v)));
}

/** Letter grade for an attribute value (clamped to the legal range first). */
export function shGradeLabel(value: number): string {
  return SH_GRADE_LABELS[clampShAttr(value) - 1];
}

/** Compute 狩魂者 derived values from attributes. */
export function computeShDerived(attrs: ShAttributes): ShDerived {
  const phy = clampShAttr(attrs.phy);
  const wis = clampShAttr(attrs.wis);
  const soul = clampShAttr(attrs.soul);
  const phyStrength = Math.floor(phy / 2);
  const spellStrength = Math.floor(wis / 2);
  const psychicStrength = Math.floor(soul / 2);
  return {
    phyStrength,
    spellStrength,
    psychicStrength,
    hpMax: 5 + phyStrength,
    manaMax: 5 + wis * 2 + soul,
    spiritSense: phy + wis + soul,
  };
}
