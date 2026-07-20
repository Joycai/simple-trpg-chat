import { Heart, Eye, Droplet, Award, AlertTriangle, Sparkles, Wand2 } from "lucide-react";

/**
 * Icon + color per rule-declared resource bar / derived stat key.
 *
 * Rule capabilities only declare keys + i18n labels (a rule module is pure
 * data and must stay importable on the server, so it can't reference React).
 * These client-only maps pick the visual for a key, and are shared by every
 * surface that renders a sheet — the character panel's AttributesTab and the
 * chat avatar hover card — so a resource looks the same in both.
 *
 * Unknown keys fall back to the primary color with no icon, so a new rule
 * renders correctly without touching this file; adding an entry is purely
 * cosmetic polish.
 *
 * `color` values are raw rgb triples meant for `rgb(${color})` — matching how
 * the theme CSS variables are defined.
 */
export const RESOURCE_ICON: Record<string, { Icon: typeof Heart; color: string; ratioTone?: boolean }> = {
  // HP is the one bar whose fill tracks the remaining ratio (green → amber → red)
  // instead of a fixed hue — a wounded character should read as wounded at a glance.
  hp:  { Icon: Heart,   color: "var(--theme-danger)", ratioTone: true },
  san: { Icon: Eye,     color: "var(--theme-ai)" },
  mp:  { Icon: Droplet, color: "var(--theme-primary)" },
  commendations: { Icon: Award,         color: "var(--theme-accent)" },
  reprimands:    { Icon: AlertTriangle, color: "var(--theme-danger)" },
  mana:          { Icon: Sparkles,      color: "var(--theme-ai)" },
};

/** Icon per `capabilities.derivedStats[*].key` (read-only computed values). */
export const DERIVED_ICON: Record<string, typeof Heart> = {
  spellStrength: Wand2,
};

/** Fallback bar color for keys absent from `RESOURCE_ICON`. */
export const DEFAULT_RESOURCE_COLOR = "var(--theme-primary)";
