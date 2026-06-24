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
export type ThemeId =
  | "default"
  | "parchment"
  | "cthulhu"
  | "shrine"
  | "rainglass"
  | "aether";

/**
 * Color mode — orthogonal to theme. Every theme has a light and a dark variant.
 * 'auto' follows the OS via `prefers-color-scheme` (resolved on the client,
 * falling back to 'light' when unsupported). Canonical source of truth; the DB
 * schema re-exports this so server code stays in sync without UI bundling db code.
 */
export const THEME_MODES = ["auto", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** The concrete mode actually applied to `<html data-mode>` (auto already resolved). */
export type ResolvedMode = "light" | "dark";

/** A small color preview pair for theme pickers (CSS color strings). */
export interface ThemeSwatch {
  bg: string;
  border: string;
}

/**
 * Optional DOM decoration slots a theme can opt into.
 *
 * When a key is present, the corresponding generic slot component
 * (ThemeCornerDecor, etc. in src/components/theme/ThemeDecor.tsx) renders the
 * mapped component. Themes that omit a key render nothing — zero impact on other
 * themes. Add new slot types here as needed; register implementations in ThemeDecor.tsx.
 *
 * Use this only for decorations that require real DOM nodes (animated SVGs,
 * interactive elements). Static decorations belong in the theme's theme.css instead.
 */
export interface ThemeDecorations {
  /** Key for panel/modal corner ornaments — e.g. 'gears', 'electric-arc', 'vines'. */
  cornerDecor?: string;
  /** Key for a login-card hero ornament — e.g. shrine's torii (day) / lantern tree (night). */
  loginHero?: string;
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
  decorations?: ThemeDecorations; // optional DOM decoration slots (see ThemeDecor.tsx)
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  default: {
    id: "default",
    name: "默认",
    nameEn: "Default",
    description: "现代 web / SaaS 质感，蓝色主色配琥珀强调，干净留白与柔和层次",
    descriptionEn:
      "Modern web / SaaS feel — blue primary with amber accent, clean whitespace and soft elevation",
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
    decorations: { loginHero: "shrine" },
  },
  rainglass: {
    id: "rainglass",
    name: "霓虹雨夜",
    nameEn: "Neon Rainglass",
    description: "冷青黑夜底，电青与霓虹品红倒影，磨砂玻璃面板、雨珠与都市辉光，深色为主的赛博都市夜雨质感",
    descriptionEn:
      "Cool teal-black night with electric-cyan and neon-magenta reflections, frosted glass panels, raindrops and city glow — a dark-first cyber-city rainy night",
    swatch: { bg: "#060c10", border: "#22d3ee" },
    icon: "🌧️",
  },
  aether: {
    id: "aether",
    name: "苍穹幻境",
    nameEn: "Azure Aether",
    description: "蓝天白云大地，明亮天蓝配洁白云面，金辉与草绿大地点缀，水晶切面与金线花纹指令窗，浅色为主的晴空幻想冒险气息",
    descriptionEn:
      "Blue sky, white clouds and golden earth — bright azure with white cloud panels, gilt and verdant earth accents, crystal facets and gilt-filigree command windows — a light-first skybound fantasy adventure",
    swatch: { bg: "#deedfa", border: "#d69e28" },
    icon: "🔮",
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
