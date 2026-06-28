"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes } from "react";

/**
 * Themed `<select>` wrapper.
 *
 * Native browser dropdown chrome ignores most CSS, so every standard-input
 * select in this project ends up looking out-of-theme. This wrapper strips
 * the native chrome (`appearance-none`), reserves space for a Lucide
 * `ChevronDown` overlay, and applies the same `input-bg` / `input-border`
 * / `primary` ring tokens the rest of the form fields use.
 *
 * Defaults match the standard form-input scale (`p-2.5`, `text-sm`,
 * `focus:ring-2 focus:ring-primary/50`). Callers needing different sizing,
 * an alternative ring color, or extra right-padding (e.g. inline trailing
 * buttons) pass a `className` — Tailwind utilities written later in the
 * class string win on conflicting properties.
 *
 * The native `<option>` popup remains browser-rendered (web platform limit;
 * no CSS portably restyles it). For a fully themed dropdown, use a custom
 * popover component instead of this wrapper.
 */
interface ThemedSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
  /** Classes for the relative wrapper. Use this for outer layout (flex-1, min-w-…). */
  wrapperClassName?: string;
  /** Override chevron color/position. Defaults to muted text on the right. */
  chevronClassName?: string;
}

const DEFAULT_SELECT_CLS =
  "w-full appearance-none p-2.5 pr-9 border border-input-border bg-input-bg rounded-theme outline-none focus:ring-2 focus:ring-primary/50 text-text text-sm cursor-pointer disabled:opacity-50";

const DEFAULT_CHEVRON_CLS =
  "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted";

export function ThemedSelect({
  children,
  className = "",
  wrapperClassName = "",
  chevronClassName = "",
  ...selectProps
}: ThemedSelectProps) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <select {...selectProps} className={`${DEFAULT_SELECT_CLS} ${className}`}>
        {children}
      </select>
      <ChevronDown className={`${DEFAULT_CHEVRON_CLS} ${chevronClassName}`} />
    </div>
  );
}
