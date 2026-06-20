/**
 * Supported theme identifiers.
 *
 * ADDING A NEW THEME (everything lives under src/themes/<id>/ except the import):
 * 1. Create directory: src/themes/<id>/
 * 2. Add theme.css — a `[data-theme="<id>"]` token block PLUS any
 *    theme-specific component overrides (.theme-border, .filter-*, .conv-*,
 *    .clue-card, .chat-bubble…). Keep ALL per-theme styling in this one file.
 * 3. Add this ID to the ThemeId union type below
 * 4. Add metadata to the THEMES record below (names, descriptions, swatch, icon)
 * 5. Add @import "../themes/<id>/theme.css" to globals.css (CSS can't glob)
 *
 * No application/UI code should branch on a theme id — the UI renders entirely
 * from this registry, and styling lives in the theme's own theme.css.
 */
export type ThemeId = "default" | "parchment" | "cthulhu" | "shrine";

/** A small color preview pair for theme pickers (CSS color strings). */
export interface ThemeSwatch {
  bg: string;
  border: string;
}

/** Theme metadata for UI display — the single source of truth. */
export interface ThemeMeta {
  id: ThemeId;
  name: string;          // display name (Chinese)
  nameEn: string;        // display name (English)
  description: string;   // description (Chinese)
  descriptionEn: string; // description (English)
  swatch: ThemeSwatch;   // preview colors for theme pickers
  icon?: string;         // optional emoji shown in plain <option> lists
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  default: {
    id: "default",
    name: "默认",
    nameEn: "Default",
    description: "深色 TRPG 桌面风格",
    descriptionEn: "Dark TRPG desktop style",
    swatch: { bg: "#f8fafc", border: "#2563eb" },
  },
  parchment: {
    id: "parchment",
    name: "古旧羊皮卷",
    nameEn: "Aged Parchment",
    description: "古旧牛皮纸与铁胆墨水，封蜡印记、泥金花饰与铜绿地图墨，西方奇幻手稿质感",
    descriptionEn:
      "Aged vellum and iron-gall ink, wax seals, illuminated fleurons and verdigris map accents — a Western-fantasy manuscript",
    swatch: { bg: "#f4ebd6", border: "#82401e" },
    icon: "🏺",
  },
  cthulhu: {
    id: "cthulhu",
    name: "克苏鲁的呼唤",
    nameEn: "Call of Cthulhu",
    description: "深渊墨绿为底，幽灵紫与深渊青荧光双色，长辈印、注视之眼与不可名状的恐惧",
    descriptionEn:
      "Abyssal black-green with ghost-violet and teal glow, Elder Signs and a watching eye — unnameable dread",
    swatch: { bg: "#060e10", border: "#4ed6c4" },
    icon: "🦑",
  },
  shrine: {
    id: "shrine",
    name: "远古神社",
    nameEn: "Ancient Shrine",
    description: "巫女红白配色，朱漆鸟居与注連縄御币，明朝体落于和纸之上的素净神社气息",
    descriptionEn:
      "Miko red-and-white palette, vermilion torii with shimenawa & shide, mincho type on bright washi paper",
    swatch: { bg: "#fffcf6", border: "#c63026" },
    icon: "⛩️",
  },
} as const;

export const THEME_LIST: ThemeMeta[] = Object.values(THEMES);

/** Locale-aware display name. Falls back to the id for unknown themes. */
export function getThemeName(theme: ThemeId, locale: string): string {
  const meta = THEMES[theme];
  if (!meta) return theme;
  return locale.startsWith("en") ? meta.nameEn : meta.name;
}

/** Locale-aware description. Empty string for unknown themes. */
export function getThemeDesc(theme: ThemeId, locale: string): string {
  const meta = THEMES[theme];
  if (!meta) return "";
  return locale.startsWith("en") ? meta.descriptionEn : meta.description;
}
