/**
 * Supported theme identifiers.
 *
 * ADDING A NEW THEME:
 * 1. Create directory: src/themes/<id>/
 * 2. Add theme.css with [data-theme="<id>"] CSS variables block
 * 3. Add this ID to the ThemeId union type below
 * 4. Add metadata to THEMES record below
 * 5. Add @import "../themes/<id>/theme.css" to globals.css
 */
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
    description: "古旧牛皮纸与铁胆墨水，封蜡印记、泥金花饰与铜绿地图墨，西方奇幻手稿质感",
  },
  cthulhu: {
    id: "cthulhu",
    name: "克苏鲁的呼唤",
    nameEn: "Call of Cthulhu",
    description: "深渊墨绿为底，幽灵紫与深渊青荧光双色，长辈印、注视之眼与不可名状的恐惧",
  },
  shrine: {
    id: "shrine",
    name: "远古神社",
    nameEn: "Ancient Shrine",
    description: "巫女红白配色，朱漆鸟居与注連縄御币，明朝体落于和纸之上的素净神社气息",
  },
} as const;

export const THEME_LIST: ThemeMeta[] = Object.values(THEMES);
