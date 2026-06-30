/**
 * DnD 5e (d20) stat-name resolution.
 *
 * Maps the names players type in chat commands (.st / .rc / .ra) to canonical
 * attribute / resource keys, honoring CN/EN aliases (力量 / strength / STR
 * all → str). Pure module — no DB or server deps — so it can be shared by the
 * rule module (server-side) and any client-side stat lookups.
 *
 * Mirror of `coc-stats.ts`. v1 has 8 attributes (6 abilities + pb + ac) and
 * 1 resource (hp); skills are NOT mapped to abilities here (all skill names
 * go to room_skills as flat modifiers — players write the bonus directly).
 */

export type D20AttributeKey =
  | "str" | "dex" | "con"
  | "int" | "wis" | "cha"
  | "pb"  | "ac";

export type D20ResourceKey = "hp";

export type D20StatResolution =
  | { kind: "attribute"; key: D20AttributeKey; canonical: string }
  | { kind: "resource"; key: D20ResourceKey; canonical: string }
  | { kind: "skill"; canonical: string };

const ATTRIBUTE_ALIASES: Record<string, D20AttributeKey> = {
  // Strength
  力量: "str", str: "str", strength: "str",
  // Dexterity
  敏捷: "dex", dex: "dex", dexterity: "dex",
  // Constitution
  体质: "con", con: "con", constitution: "con",
  // Intelligence
  智力: "int", int: "int", intelligence: "int",
  // Wisdom
  感知: "wis", 智慧: "wis", wis: "wis", wisdom: "wis",
  // Charisma
  魅力: "cha", cha: "cha", charisma: "cha",
  // Proficiency bonus
  熟练: "pb", 熟练值: "pb", pb: "pb", proficiency: "pb", "proficiency-bonus": "pb",
  // Armor class
  护甲: "ac", 护甲等级: "ac", ac: "ac", "armor-class": "ac", armor: "ac",
};

const RESOURCE_ALIASES: Record<string, D20ResourceKey> = {
  生命: "hp", 生命值: "hp", 生命点: "hp", hp: "hp", hitpoints: "hp", "hit-points": "hp",
};

const ATTRIBUTE_CANONICAL: Record<D20AttributeKey, string> = {
  str: "力量", dex: "敏捷", con: "体质",
  int: "智力", wis: "感知", cha: "魅力",
  pb:  "熟练值", ac:  "护甲",
};

const RESOURCE_CANONICAL: Record<D20ResourceKey, string> = {
  hp: "生命值",
};

/**
 * Resolve a stat name typed by a player into an attribute / resource / plain
 * skill. Only the 8 attributes and HP resource are special-cased; everything
 * else is a skill name (stored in room_skills as a flat modifier).
 */
export function resolveD20Stat(name: string): D20StatResolution {
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
