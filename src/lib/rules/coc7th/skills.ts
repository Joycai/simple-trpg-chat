import type { StandardSkill } from "../sheet-schema";

/**
 * COC 7th standard skill list with base values (the value an investigator
 * has before spending any occupation or interest points). Names are the
 * common Chinese table names — they are matched against `room_skills` rows,
 * so they follow what players type (`.rc 斗殴`, `.rc 步霰`), and
 * `getSkillAliasCandidates` covers alternate spellings (侦查/侦察).
 *
 * Only 信用评级 is required: every occupation sets it.
 */
export const COC_STANDARD_SKILLS: ReadonlyArray<StandardSkill> = [
  // 战斗
  { name: "闪避", base: { fromAttribute: "dex", divisor: 2 }, required: false, group: "combat" },
  { name: "斗殴", base: 25, required: false, group: "combat" },
  { name: "手枪", base: 20, required: false, group: "combat" },
  { name: "步霰", base: 25, required: false, group: "combat" },
  { name: "投掷", base: 20, required: false, group: "combat" },
  // 调查
  { name: "侦查", base: 25, required: false, group: "investigation" },
  { name: "聆听", base: 20, required: false, group: "investigation" },
  { name: "图书馆使用", base: 20, required: false, group: "investigation" },
  { name: "追踪", base: 10, required: false, group: "investigation" },
  { name: "估价", base: 5, required: false, group: "investigation" },
  { name: "锁匠", base: 1, required: false, group: "investigation" },
  // 交流
  { name: "信用评级", base: 0, required: true, group: "social" },
  { name: "魅惑", base: 15, required: false, group: "social" },
  { name: "话术", base: 5, required: false, group: "social" },
  { name: "恐吓", base: 15, required: false, group: "social" },
  { name: "说服", base: 10, required: false, group: "social" },
  { name: "心理学", base: 10, required: false, group: "social" },
  { name: "乔装", base: 5, required: false, group: "social" },
  { name: "母语", base: { fromAttribute: "edu" }, required: false, group: "social" },
  { name: "外语", base: 1, required: false, group: "social" },
  // 行动
  { name: "攀爬", base: 20, required: false, group: "action" },
  { name: "跳跃", base: 20, required: false, group: "action" },
  { name: "游泳", base: 20, required: false, group: "action" },
  { name: "潜行", base: 20, required: false, group: "action" },
  { name: "妙手", base: 10, required: false, group: "action" },
  { name: "汽车驾驶", base: 20, required: false, group: "action" },
  { name: "驾驶", base: 1, required: false, group: "action" },
  { name: "骑术", base: 5, required: false, group: "action" },
  { name: "导航", base: 10, required: false, group: "action" },
  { name: "生存", base: 10, required: false, group: "action" },
  // 学识
  { name: "会计", base: 5, required: false, group: "knowledge" },
  { name: "人类学", base: 1, required: false, group: "knowledge" },
  { name: "考古学", base: 1, required: false, group: "knowledge" },
  { name: "历史", base: 5, required: false, group: "knowledge" },
  { name: "法律", base: 5, required: false, group: "knowledge" },
  { name: "神秘学", base: 5, required: false, group: "knowledge" },
  { name: "博物学", base: 10, required: false, group: "knowledge" },
  { name: "科学", base: 1, required: false, group: "knowledge" },
  { name: "医学", base: 1, required: false, group: "knowledge" },
  { name: "急救", base: 30, required: false, group: "knowledge" },
  { name: "精神分析", base: 1, required: false, group: "knowledge" },
  { name: "克苏鲁神话", base: 0, required: false, group: "knowledge" },
  // 技艺
  { name: "艺术与手艺", base: 5, required: false, group: "craft" },
  { name: "计算机使用", base: 5, required: false, group: "craft" },
  { name: "电气维修", base: 10, required: false, group: "craft" },
  { name: "电子学", base: 1, required: false, group: "craft" },
  { name: "机械维修", base: 10, required: false, group: "craft" },
  { name: "操作重型机械", base: 1, required: false, group: "craft" },
];
