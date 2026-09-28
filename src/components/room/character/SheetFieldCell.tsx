"use client";

import { X } from "lucide-react";
import type { FieldState } from "@/lib/character/completion";

/** Small pill naming a field's state (必填 / 默认 / 自定义 / 已修改 / a badge). */
export function FieldTag({ tone, children }: { tone: "danger" | "muted" | "ai" | "warning" | "primary"; children: React.ReactNode }) {
  const cls = {
    danger: "text-danger border-danger/50",
    muted: "text-text-muted border-input-border",
    ai: "text-ai border-ai/50",
    warning: "text-warning border-warning/50",
    primary: "text-primary border-primary/50",
  }[tone];
  return <span className={`shrink-0 text-[10px] font-semibold leading-4 px-1.5 rounded-full border whitespace-nowrap ${cls}`}>{children}</span>;
}

/**
 * The frame that shows a field's state, shared by attribute cells and
 * resource cards: solid when set, red dashed when a required field is unset,
 * amber with a glow while it holds an unsaved change.
 */
export function fieldFrameClass(state: FieldState, dirty: boolean): string {
  if (dirty) return "border border-warning/70 ring-[3px] ring-warning/[0.12] bg-surface-alt/55";
  if (state === "missing") return "border border-dashed border-danger/65 bg-danger/5";
  return "border border-border bg-surface-alt/55";
}

/**
 * One attribute (or custom attribute) as an editable number. An unset field
 * shows an empty input: required ones say "—" and which default checks use,
 * optional ones show their default dimmed. Clearing the input unsets it.
 */
export function SheetFieldCell({
  fieldId, label, value, isSet, state, defaultValue, badge, dirty, dirtyFrom, editable,
  onChange, onRemove, removeLabel, labels,
}: {
  /** `data-field` anchor for jumping here from the completion bar. */
  fieldId: string;
  label: string;
  value: number;
  isSet: boolean;
  state: FieldState;
  defaultValue?: number;
  badge?: string;
  dirty: boolean;
  /** The saved value, shown on the dirty tag (host edits). */
  dirtyFrom?: number;
  editable: boolean;
  onChange: (value: number | null) => void;
  onRemove?: () => void;
  removeLabel?: string;
  labels: { required: string; default: string; custom: string; dirty: string; dirtyFrom: (v: number) => string; usesDefault: (v: number) => string };
}) {
  const shown = isSet ? String(value) : "";
  const placeholder = state === "missing" ? "—" : defaultValue !== undefined ? String(defaultValue) : "";
  return (
    <label data-field={fieldId} className={`relative rounded-theme px-3 py-2.5 flex flex-col gap-1.5 transition ${fieldFrameClass(state, dirty)}`}>
      <span className="flex items-center justify-between gap-1 min-w-0">
        <span className="text-xs text-text-muted font-semibold truncate">{label}</span>
        <span className="flex items-center gap-1">
          {badge && <FieldTag tone="primary">{badge}</FieldTag>}
          {dirty ? (
            <FieldTag tone="warning">{dirtyFrom !== undefined ? labels.dirtyFrom(dirtyFrom) : labels.dirty}</FieldTag>
          ) : state === "missing" ? (
            <FieldTag tone="danger">{labels.required}</FieldTag>
          ) : state === "default" ? (
            <FieldTag tone="muted">{labels.default}</FieldTag>
          ) : state === "custom" ? (
            <FieldTag tone="ai">{labels.custom}</FieldTag>
          ) : null}
          {onRemove && editable && (
            <button type="button" onClick={(e) => { e.preventDefault(); onRemove(); }} aria-label={removeLabel}
              className="text-text-dim hover:text-danger transition cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={shown}
        placeholder={placeholder}
        disabled={!editable}
        aria-label={label}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full bg-transparent border-0 p-0 text-[22px] leading-7 font-bold font-theme-mono text-text outline-none placeholder:text-text-dim disabled:opacity-100"
      />
      {state === "missing" && defaultValue !== undefined && (
        <span className="text-[11px] text-text-dim">{labels.usesDefault(defaultValue)}</span>
      )}
    </label>
  );
}
