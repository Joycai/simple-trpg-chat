/**
 * 狩魂者 (shouhun) stat-name resolution.
 *
 * Maps the names players type in chat commands (.st / .rc / .ra) to canonical
 * attribute / resource keys, honoring CN/EN aliases (体魄 / phy / physique all
 * → phy). Pure module — no DB or server deps — so it can be shared by the
 * rule module (server-side) and any client-side stat lookups.
 *
 * Mirror of `d20-stats.ts`. 3 attributes (体魄/智慧/心魂) and 2 resources
 * (生命值/灵力值); skills are NOT special-cased here (all skill names go to
 * room_skills as free bookkeeping values).
 */

export type ShAttributeKey = "phy" | "wis" | "soul";

export type ShResourceKey = "hp" | "mana";

export type ShStatResolution =
  | { kind: "attribute"; key: ShAttributeKey; canonical: string }
  | { kind: "resource"; key: ShResourceKey; canonical: string }
  | { kind: "skill"; canonical: string };

const ATTRIBUTE_ALIASES: Record<string, ShAttributeKey> = {
  // 体魄
  体魄: "phy", phy: "phy", physique: "phy",
  // 智慧
  智慧: "wis", wis: "wis", wisdom: "wis",
  // 心魂
  心魂: "soul", soul: "soul",
};

const RESOURCE_ALIASES: Record<string, ShResourceKey> = {
  生命: "hp", 生命值: "hp", hp: "hp",
  灵力: "mana", 灵力值: "mana", mana: "mana", mp: "mana",
};

const ATTRIBUTE_CANONICAL: Record<ShAttributeKey, string> = {
  phy: "体魄", wis: "智慧", soul: "心魂",
};

const RESOURCE_CANONICAL: Record<ShResourceKey, string> = {
  hp: "生命值", mana: "灵力值",
};

/**
 * Resolve a stat name typed by a player into an attribute / resource / plain
 * skill. Only the 3 attributes and the HP/mana resources are special-cased;
 * everything else is a skill name (stored in room_skills).
 */
export function resolveShStat(name: string): ShStatResolution {
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
