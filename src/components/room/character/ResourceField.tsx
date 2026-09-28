"use client";

import { Minus, Plus } from "lucide-react";
import type { ResolvedResource } from "@/lib/character/sheet-model";
import type { FieldState } from "@/lib/character/completion";
import { RESOURCE_ICON, DEFAULT_RESOURCE_COLOR } from "./resource-visuals";
import { FieldTag, fieldFrameClass } from "./SheetFieldCell";

/** Remaining-ratio tone for bars that opt into it (HP): green → amber → red. */
function ratioColor(pct: number): string {
  return pct > 60 ? "var(--theme-success)" : pct > 30 ? "var(--theme-warning)" : "var(--theme-danger)";
}

const stepCls = "flex items-center justify-center w-7 h-7 rounded-lg border border-input-border bg-surface-alt text-text-muted hover:text-primary hover:border-primary/40 transition cursor-pointer disabled:opacity-40 disabled:cursor-default shrink-0";
const numCls = "w-14 bg-transparent border-0 p-0 text-center text-[15px] font-bold font-theme-mono text-text outline-none disabled:opacity-100";

/**
 * One rule resource. A bar shows `current / max` with −/+ steppers and a fill;
 * where the rule lets the player set the max (d20 HP) the max is an input
 * too, marked 上限必填 while unset. A counter (Triangle's 嘉奖 / 处分) is a bare
 * stepper. Values are previewed through the rule, so a max derived from
 * attributes moves as the attributes are edited.
 */
export function ResourceField({
  resource, label, state, dirty, dirtyFrom, editable, onCurrent, onMax, labels,
}: {
  resource: ResolvedResource;
  label: string;
  state: FieldState;
  dirty: boolean;
  /** Saved `current/max` text, shown on the dirty tag (host edits). */
  dirtyFrom?: string;
  editable: boolean;
  onCurrent: (v: number) => void;
  onMax: (v: number | null) => void;
  labels: {
    unsetInitial: string; maxRequired: string; dirty: string; dirtyFrom: (v: string) => string;
    decrease: string; increase: string; current: string; max: string;
  };
}) {
  const { field, current, max, min, currentSet } = resource;
  const visual = RESOURCE_ICON[field.key];
  const Icon = visual?.Icon;
  const editableMax = !!field.max && "editable" in field.max;
  const pct = max && max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  const color = visual?.ratioTone ? ratioColor(pct) : visual?.color ?? DEFAULT_RESOURCE_COLOR;
  const tag = dirty
    ? <FieldTag tone="warning">{dirtyFrom ? labels.dirtyFrom(dirtyFrom) : labels.dirty}</FieldTag>
    : state === "missing" && editableMax
      ? <FieldTag tone="danger">{labels.maxRequired}</FieldTag>
      : !currentSet && field.style === "bar"
        ? <FieldTag tone="muted">{labels.unsetInitial}</FieldTag>
        : null;

  return (
    <div data-field={`resource:${field.key}`} className={`rounded-theme px-3.5 py-3 flex flex-col gap-2 ${fieldFrameClass(state, dirty)}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-2 text-[13px] font-bold min-w-0" style={{ color: `rgb(${color})` }}>
          {Icon && <Icon className="w-4 h-4 shrink-0" fill={field.key === "hp" ? "currentColor" : undefined} />}
          <span className="truncate">{label}</span>
          {tag}
        </span>
        <span className="flex items-center gap-2">
          <button type="button" className={stepCls} disabled={!editable || current <= min}
            onClick={() => onCurrent(current - 1)} aria-label={labels.decrease}>
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="flex items-baseline">
            <input type="number" inputMode="numeric" value={current} disabled={!editable} aria-label={`${label} ${labels.current}`}
              onChange={(e) => e.target.value !== "" && onCurrent(Number(e.target.value))} className={numCls} />
            {field.style === "bar" && (
              <>
                <span className="text-text-dim font-theme-mono">/</span>
                {editableMax ? (
                  <input type="number" inputMode="numeric" value={resource.maxSet ? max ?? "" : ""} placeholder={max !== undefined ? String(max) : "—"}
                    disabled={!editable} aria-label={`${label} ${labels.max}`}
                    onChange={(e) => onMax(e.target.value === "" ? null : Number(e.target.value))}
                    className={`${numCls} placeholder:text-text-dim ${state === "missing" ? "border-b border-dashed border-danger/65" : ""}`} />
                ) : (
                  <span className="w-14 text-center text-[15px] font-bold font-theme-mono text-text-dim">{max ?? "—"}</span>
                )}
              </>
            )}
          </span>
          <button type="button" className={stepCls} disabled={!editable || (max !== undefined && current >= max)}
            onClick={() => onCurrent(current + 1)} aria-label={labels.increase}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>
      {field.style === "bar" && (
        <div className="h-1.5 bg-bg rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, backgroundColor: `rgb(${color})` }} />
        </div>
      )}
    </div>
  );
}
