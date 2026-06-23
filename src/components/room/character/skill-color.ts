import type { CSSProperties } from "react";

// Number of palette slots a theme may define (`--theme-skill-0` … `--theme-skill-5`).
const SKILL_PALETTE_SIZE = 6;

/**
 * Deterministically map a skill name → a theme palette colour, so each skill
 * gets a stable, distinct hue without manual assignment.
 *
 * Colours live in the theme (`--theme-skill-0..5`, each an "R G B" triple) so
 * every theme can pick its own palette. Themes that haven't defined them yet
 * fall back to `--theme-primary` — one sensible default colour.
 */
export function skillColor(name: string): { barStyle: CSSProperties; textStyle: CSSProperties } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) >>> 0;
  const idx = h % SKILL_PALETTE_SIZE;
  const c = `var(--theme-skill-${idx}, var(--theme-primary))`;
  return {
    barStyle: { backgroundImage: `linear-gradient(90deg, rgb(${c} / 0.7), rgb(${c}))` },
    textStyle: { color: `rgb(${c})` },
  };
}
