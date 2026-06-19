/**
 * COC 7th stat-name resolution.
 *
 * Maps the names players type in chat commands (.st / .rc / .ra) to their
 * canonical attribute / resource keys, honoring the equivalences required by
 * the command spec (e.g. 外貌 = 魅力 = app, 幸运 = luk = luck).
 *
 * Pure module — no DB or server dependencies — so it can be shared by the
 * command engine (src/lib/commands.ts) and the character actions
 * (src/app/actions/skills.ts).
 */

/** COC 7th attribute keys (match CocAttributes in character-types.ts). */
export type CocAttributeKey = "str" | "con" | "siz" | "dex" | "app" | "int" | "pow" | "edu" | "luck";

/** COC 7th resource keys (current value lives in cocDerived[`${key}_current`]). */
export type CocResourceKey = "hp" | "mp" | "san";

export type CocStatResolution =
  | { kind: "attribute"; key: CocAttributeKey; canonical: string }
  | { kind: "resource"; key: CocResourceKey; canonical: string }
  | { kind: "skill"; canonical: string };

/** Alias → attribute key. Keys are stored lowercase (Chinese is unaffected by toLowerCase). */
const ATTRIBUTE_ALIASES: Record<string, CocAttributeKey> = {
  力量: "str", str: "str",
  体质: "con", con: "con",
  体型: "siz", siz: "siz",
  敏捷: "dex", dex: "dex",
  外貌: "app", 魅力: "app", app: "app",
  智力: "int", int: "int",
  意志: "pow", pow: "pow",
  教育: "edu", edu: "edu",
  幸运: "luck", luk: "luck", luck: "luck",
};

/** Alias → resource key. */
const RESOURCE_ALIASES: Record<string, CocResourceKey> = {
  生命值: "hp", hp: "hp",
  魔法值: "mp", mp: "mp",
  理智值: "san", san: "san", san值: "san",
};

/** Canonical Chinese display name per attribute key. */
const ATTRIBUTE_CANONICAL: Record<CocAttributeKey, string> = {
  str: "力量", con: "体质", siz: "体型", dex: "敏捷",
  app: "外貌", int: "智力", pow: "意志", edu: "教育", luck: "幸运",
};

/** Canonical Chinese display name per resource key. */
const RESOURCE_CANONICAL: Record<CocResourceKey, string> = {
  hp: "生命值", mp: "魔法值", san: "理智值",
};

/**
 * Resolve a stat name typed by a player into an attribute / resource / plain skill.
 * Only attribute and resource names are special-cased; everything else is a skill.
 */
export function resolveCocStat(name: string): CocStatResolution {
  const normalized = name.trim().toLowerCase();

  const attrKey = ATTRIBUTE_ALIASES[normalized];
  if (attrKey) {
    return { kind: "attribute", key: attrKey, canonical: ATTRIBUTE_CANONICAL[attrKey] };
  }

  const resKey = RESOURCE_ALIASES[normalized];
  if (resKey) {
    return { kind: "resource", key: resKey, canonical: RESOURCE_CANONICAL[resKey] };
  }

  return { kind: "skill", canonical: name.trim() };
}
