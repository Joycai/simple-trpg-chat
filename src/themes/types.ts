/** Supported theme identifiers */
export type ThemeId = "default" | "parchment" | "cthulhu" | "shrine";

/** Theme metadata for UI display */
export interface ThemeMeta {
  id: ThemeId;
  name: string;    // display name (Chinese)
  nameEn: string;  // display name (English)
  description: string;
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  default: {
    id: "default",
    name: "默认",
    nameEn: "Default",
    description: "深色 TRPG 桌面风格",
  },
  parchment: {
    id: "parchment",
    name: "古旧羊皮卷",
    nameEn: "Aged Parchment",
    description: "复古泛黄，墨迹质感，适合传统西幻跑团",
  },
  cthulhu: {
    id: "cthulhu",
    name: "克苏鲁的呼唤",
    nameEn: "Call of Cthulhu",
    description: "深海绿与诡异紫，不可名状的恐怖氛围",
  },
  shrine: {
    id: "shrine",
    name: "远古神社",
    nameEn: "Ancient Shrine",
    description: "沉静深棕古木，朱红鸟居点缀，和纸质感的空灵和风氛围",
  },
} as const;

export const THEME_LIST: ThemeMeta[] = Object.values(THEMES);
