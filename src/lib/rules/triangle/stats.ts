/**
 * Triangle Agency stat-name resolution.
 *
 * Maps the names players type in chat commands (.st) to canonical
 * qualification / counter keys, honoring CN/EN aliases (专注 / attentiveness
 * both → attentiveness). Pure module — no DB or server deps — mirror of
 * `d20-stats.ts`.
 *
 * 9 Qualifications as attributes + 2 unbounded counters (commendations /
 * reprimands) as resources; everything else falls through to room_skills.
 */

export type TaQualityKey =
  | "attentiveness" | "duplicity" | "dynamism"
  | "empathy" | "initiative" | "persistence"
  | "presence" | "professionalism" | "subtlety";

export type TaResourceKey = "commendations" | "reprimands";

export type TaStatResolution =
  | { kind: "attribute"; key: TaQualityKey; canonical: string }
  | { kind: "resource"; key: TaResourceKey; canonical: string }
  | { kind: "skill"; canonical: string };

const QUALITY_ALIASES: Record<string, TaQualityKey> = {
  // Attentiveness
  专注: "attentiveness", attentiveness: "attentiveness",
  // Duplicity
  欺瞒: "duplicity", duplicity: "duplicity",
  // Dynamism
  活力: "dynamism", dynamism: "dynamism",
  // Empathy
  共情: "empathy", empathy: "empathy",
  // Initiative
  主动: "initiative", initiative: "initiative",
  // Persistence
  坚持: "persistence", persistence: "persistence",
  // Presence
  存在感: "presence", presence: "presence",
  // Professionalism
  专业: "professionalism", professionalism: "professionalism",
  // Subtlety
  隐微: "subtlety", subtlety: "subtlety",
};

const RESOURCE_ALIASES: Record<string, TaResourceKey> = {
  嘉奖: "commendations", commendation: "commendations", commendations: "commendations",
  处分: "reprimands", reprimand: "reprimands", reprimands: "reprimands",
};

const QUALITY_CANONICAL: Record<TaQualityKey, string> = {
  attentiveness: "专注", duplicity: "欺瞒", dynamism: "活力",
  empathy: "共情", initiative: "主动", persistence: "坚持",
  presence: "存在感", professionalism: "专业", subtlety: "隐微",
};

const RESOURCE_CANONICAL: Record<TaResourceKey, string> = {
  commendations: "嘉奖",
  reprimands: "处分",
};

/**
 * Resolve a stat name typed by a player into a qualification / counter /
 * plain skill. Only the 9 qualifications and 2 counters are special-cased;
 * everything else is a skill name (stored in room_skills).
 */
export function resolveTaStat(name: string): TaStatResolution {
  const normalized = name.trim().toLowerCase();

  const qualityKey = QUALITY_ALIASES[normalized];
  if (qualityKey) {
    return { kind: "attribute", key: qualityKey, canonical: QUALITY_CANONICAL[qualityKey] };
  }

  const resKey = RESOURCE_ALIASES[normalized];
  if (resKey) {
    return { kind: "resource", key: resKey, canonical: RESOURCE_CANONICAL[resKey] };
  }

  return { kind: "skill", canonical: name.trim() };
}
