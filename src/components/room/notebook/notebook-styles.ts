import { Icons } from "@/components/shared/icons";
import type { NotebookColor } from "@/lib/room/notebook";

/**
 * Class bundles per predefined label color. All theme tokens — a category
 * label recolors automatically with the active theme. Full literal strings
 * (no interpolation) so Tailwind's scanner sees every class.
 *   chip   — tinted pill (viewer header, search cards, sidebar rows)
 *   chipOn — selected/active pill (editor picker, active sidebar row)
 *   dot    — small round swatch (sidebar rows, color picker)
 */
export const COLOR_META: Record<NotebookColor, { chip: string; chipOn: string; dot: string }> = {
  primary: { chip: "text-primary border-primary/40 bg-primary/10",    chipOn: "text-primary border-primary bg-primary/15",    dot: "bg-primary" },
  accent:  { chip: "text-accent border-accent/40 bg-accent/10",       chipOn: "text-accent border-accent bg-accent/15",       dot: "bg-accent" },
  success: { chip: "text-success border-success/40 bg-success/10",    chipOn: "text-success border-success bg-success/15",    dot: "bg-success" },
  warning: { chip: "text-warning border-warning/40 bg-warning/10",    chipOn: "text-warning border-warning bg-warning/15",    dot: "bg-warning" },
  danger:  { chip: "text-danger border-danger/40 bg-danger/10",       chipOn: "text-danger border-danger bg-danger/15",       dot: "bg-danger" },
  ai:      { chip: "text-ai border-ai/40 bg-ai/10",                   chipOn: "text-ai border-ai bg-ai/15",                   dot: "bg-ai" },
  neutral: { chip: "text-text-muted border-border bg-surface-alt",    chipOn: "text-text border-text-muted bg-surface-alt",   dot: "bg-text-muted" },
};

export function colorMeta(color: string) {
  return COLOR_META[color as NotebookColor] ?? COLOR_META.neutral;
}

type IconComponent = (typeof Icons)[keyof typeof Icons];

/** @-mention chip chrome per backpack entity type (colors are theme tokens). */
export const ENTITY_META: Record<string, { Icon: IconComponent; labelKey: string; chipClass: string }> = {
  clue:      { Icon: Icons.Search, labelKey: "typeClue", chipClass: "text-primary border-primary/40 bg-primary/10" },
  info:      { Icon: Icons.Info,   labelKey: "typeInfo", chipClass: "text-ai border-ai/40 bg-ai/10" },
  character: { Icon: Icons.User,   labelKey: "typeChar", chipClass: "text-accent border-accent/40 bg-accent/10" },
  item:      { Icon: Icons.Box,    labelKey: "typeItem", chipClass: "text-success border-success/40 bg-success/10" },
  event:     { Icon: Icons.Flag,   labelKey: "typeEvent", chipClass: "text-primary border-primary/40 bg-primary/10" },
};

const FALLBACK_ENTITY_META = ENTITY_META.item;

export function entityMeta(type: string) {
  return ENTITY_META[type] ?? FALLBACK_ENTITY_META;
}
