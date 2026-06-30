"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

/**
 * Shrine-styled custom dropdown — used by the rule-template and preset-provider
 * pickers. Trigger collapses/expands with a flat-bottom border that seams into
 * the menu; each row has a letter/icon badge, label, and optional description.
 * The active row gets a left vertical bar, tint, and trailing check.
 *
 * The `tone` knob swaps the highlight palette (primary = crimson, accent = gold)
 * so call sites pick whichever the surrounding UX uses without per-component
 * forks.
 */
export interface BadgeDropdownItem {
  id: string;
  label: string;
  description?: string;
  badge: { letters?: string; Icon?: LucideIcon };
  /** Render the description line in the theme's monospace stack (e.g. endpoint+model). */
  descriptionMono?: boolean;
}

type Tone = "primary" | "accent";

interface BadgeDropdownProps {
  id?: string;
  /** When provided, a hidden input mirrors `value` so this plugs into native form submission. */
  name?: string;
  value: string;
  onChange: (id: string) => void;
  items: BadgeDropdownItem[];
  /** Small caption shown above the list. Rendered as `<headerText> · <count>`. */
  headerText: string;
  tone?: Tone;
  disabled?: boolean;
  className?: string;
}

const TONE: Record<Tone, {
  triggerOpen: string;
  rowActive: string;
  bar: string;
  badgeActive: string;
  check: string;
  menuBorder: string;
}> = {
  primary: {
    triggerOpen: "border-primary ring-primary/[0.18]",
    rowActive: "bg-primary/10",
    bar: "bg-primary",
    badgeActive: "bg-primary/15 border-primary/50 text-primary",
    check: "text-primary",
    menuBorder: "border-primary",
  },
  accent: {
    triggerOpen: "border-accent ring-accent/[0.18]",
    rowActive: "bg-accent/10",
    bar: "bg-accent",
    badgeActive: "bg-accent/15 border-accent/50 text-accent",
    check: "text-accent",
    menuBorder: "border-accent",
  },
};

export function BadgeDropdown({
  id,
  name,
  value,
  onChange,
  items,
  headerText,
  tone = "primary",
  disabled,
  className = "",
}: BadgeDropdownProps) {
  const selected = items.find((it) => it.id === value) ?? items[0];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const T = TONE[tone];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!selected) return null;

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}

      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 bg-input-bg border text-sm text-text cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed ${
          open
            ? `${T.triggerOpen} ring-[3px] rounded-t-theme rounded-b-none`
            : "border-input-border hover:border-text-muted rounded-theme"
        }`}
      >
        <BadgeSpan badge={selected.badge} active={open} toneActive={T.badgeActive} />
        <span className="flex-1 text-left truncate font-medium">{selected.label}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute left-0 right-0 top-full z-30 bg-surface border ${T.menuBorder} border-t-0 rounded-b-theme overflow-hidden shadow-[var(--theme-card-shadow)]`}
        >
          <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-text-dim border-b border-border/60 bg-surface-alt/40">
            {headerText} · {items.length}
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {items.map((item) => {
              const active = item.id === value;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(item.id)}
                    className={`relative w-full flex items-center gap-3 px-3 py-2.5 text-left transition cursor-pointer ${
                      active ? T.rowActive : "hover:bg-surface-alt"
                    }`}
                  >
                    {active && <span className={`absolute left-0 top-2 bottom-2 w-[3px] ${T.bar} rounded-r`} aria-hidden />}
                    <BadgeSpan badge={item.badge} active={active} toneActive={T.badgeActive} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text truncate">{item.label}</div>
                      {item.description && (
                        <div
                          className={`text-xs text-text-muted truncate mt-0.5 ${item.descriptionMono ? "font-theme-mono" : ""}`}
                        >
                          {item.description}
                        </div>
                      )}
                    </div>
                    {active && <Check className={`w-4 h-4 ${T.check} shrink-0`} aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function BadgeSpan({
  badge,
  active,
  toneActive,
}: {
  badge: BadgeDropdownItem["badge"];
  active: boolean;
  toneActive: string;
}) {
  const cls = `inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-theme border text-xs font-bold font-mono select-none transition ${
    active ? toneActive : "bg-surface-alt/60 border-input-border text-text-muted"
  }`;
  if (badge.Icon) {
    const Icon = badge.Icon;
    return (
      <span className={cls} aria-hidden>
        <Icon className="w-4 h-4" />
      </span>
    );
  }
  return (
    <span className={cls} aria-hidden>
      {badge.letters}
    </span>
  );
}
