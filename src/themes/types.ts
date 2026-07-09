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

/**
 * What a room may persist in `rooms.theme_mode`: the user-selectable modes plus
 * `"timeline"` — a room-only mode where light/dark follows the latest inserted
 * timeline divider (night → dark, morning/afternoon → light). It is never a
 * selectable option in the app-wide switcher, only a room setting.
 */
export type StoredThemeMode = ThemeMode | "timeline";

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
    decorations: { loginHero: "parchment" },
  },
  cthulhu: {
    id: "cthulhu",
    name: "克苏鲁的呼唤",
    nameEn: "Call of Cthulhu",
    description: "因思茅斯雾港深渊黑绿底，达贡教派锈蚀金器与干涸朱砂血红封印，长辈印徽与不可名状的恐惧",
    descriptionEn:
      "Innsmouth foggy-port abyssal black-green with Dagon brass and dried sealing-wax red, an Elder Sign sigil and unnameable dread",
    swatch: { bg: "#0a1316", border: "#c4a05a" },
    icon: "🦑",
    decorations: { loginHero: "cthulhu" },
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
    decorations: { loginHero: "rainglass" },
  },
  aether: {
    id: "aether",
    name: "苍穹幻境",
    nameEn: "Azure Aether",
    description: "深紫夜空中的宇宙罗盘，黄铜辉光配水晶青；亮色形态为象牙暖白底、抛光黄铜与铜绿点缀的黄铜蒸汽质感",
    descriptionEn:
      "A cosmic compass in deep violet night — brass glow with crystal cyan; light mode turns to warm ivory with polished brass and verdigris, a brass-and-steam daylight form",
    swatch: { bg: "#1a1626", border: "#c9a14a" },
    icon: "🔮",
    decorations: { loginHero: "aether" },
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
