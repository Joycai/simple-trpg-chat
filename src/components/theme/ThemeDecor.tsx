"use client";

import type { ComponentType } from "react";
import { THEMES } from "@/themes/types";
import { ShrineLoginHero } from "@/themes/shrine/ShrineLoginHero";
import { CthulhuLoginHero } from "@/themes/cthulhu/CthulhuLoginHero";
import { useTheme } from "./ThemeProvider";

export type CornerPosition = "tl" | "tr" | "bl" | "br";

export interface CornerDecorProps {
  position: CornerPosition;
}

/**
 * Registry of corner decoration components, keyed by the string declared in
 * ThemeDecorations.cornerDecor. Add an entry here when a new theme needs
 * corner ornaments; no other files need to change.
 *
 * Example (uncomment and implement when the theme exists):
 *   import { GearCorner } from "@/themes/steampunk/GearCorner";
 *   'gears': GearCorner,
 */
const CORNER_DECOR_REGISTRY: Partial<Record<string, ComponentType<CornerDecorProps>>> = {
  // 'gears':         GearCorner,
  // 'electric-arc':  ElectricArcCorner,
  // 'vines':         VineCorner,
};

/**
 * Renders the active theme's corner ornament at one position.
 * Returns null when the theme declares no cornerDecor or the key isn't
 * registered — no effect on other themes.
 *
 * The parent container must have `position: relative` and `overflow: visible`.
 */
export function ThemeCornerDecor({ position }: CornerDecorProps) {
  const { activeTheme } = useTheme();
  const key = THEMES[activeTheme]?.decorations?.cornerDecor;
  if (!key) return null;
  const Component = CORNER_DECOR_REGISTRY[key];
  if (!Component) return null;
  return <Component position={position} />;
}

/**
 * Convenience wrapper — renders all four corner ornaments.
 * Bails out early (single useTheme call) when no decoration is registered,
 * so the cost for non-decorated themes is just one context read.
 */
export function ThemeCornerDecors() {
  const { activeTheme } = useTheme();
  const key = THEMES[activeTheme]?.decorations?.cornerDecor;
  if (!key) return null;
  const Component = CORNER_DECOR_REGISTRY[key];
  if (!Component) return null;
  return (
    <>
      <Component position="tl" />
      <Component position="tr" />
      <Component position="bl" />
      <Component position="br" />
    </>
  );
}

/**
 * Registry of login-card hero ornaments, keyed by ThemeDecorations.loginHero.
 * Each component renders an absolutely-positioned band atop the login card;
 * day/night variants are gated in the theme's own theme.css.
 */
const LOGIN_HERO_REGISTRY: Partial<Record<string, ComponentType>> = {
  shrine: ShrineLoginHero,
  cthulhu: CthulhuLoginHero,
};

/**
 * Renders the active theme's login-card hero ornament, or null when the theme
 * declares no loginHero. Drop it inside the (relatively-positioned) login card.
 */
export function ThemeLoginHero() {
  const { activeTheme } = useTheme();
  const key = THEMES[activeTheme]?.decorations?.loginHero;
  if (!key) return null;
  const Component = LOGIN_HERO_REGISTRY[key];
  if (!Component) return null;
  return <Component />;
}
