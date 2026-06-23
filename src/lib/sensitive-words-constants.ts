/**
 * Immutable default blacklist keywords (Mainland China political moderation)
 * Safe to import in both client-side and server-side modules.
 *
 * Grouped by category so the admin UI can surface a type summary
 * (group name + count) without revealing the individual words.
 */
export const DEFAULT_SENSITIVE_WORD_GROUPS = [
  {
    key: "leaders",
    words: [
      "习近平",
      "习明泽",
      "李克强",
      "毛泽东",
      "江泽民",
      "胡锦涛",
      "温家宝",
      "赵紫阳",
      "胡耀邦",
    ],
  },
  {
    key: "cult",
    words: ["李洪志", "法轮功", "法轮大法", "真善忍", "九评"],
  },
  {
    key: "party",
    words: ["共产党", "退党", "三退", "习近平下台", "打倒共产党", "消灭共产党", "双规"],
  },
  {
    key: "events",
    words: ["六四", "六四事件", "八九民运", "8964", "天安门事件", "天安门屠杀", "巴拿马文件"],
  },
  {
    key: "separatism",
    words: ["台独", "台湾独立", "港独", "香港独立", "疆独", "东突", "藏独", "达赖喇嘛"],
  },
] as const;

/** Flattened blacklist — used by the runtime content filter. */
export const DEFAULT_SENSITIVE_WORDS: string[] = DEFAULT_SENSITIVE_WORD_GROUPS.flatMap(
  (g) => g.words as readonly string[]
);
