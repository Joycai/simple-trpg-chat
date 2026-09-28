"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, X, Check, Minus } from "lucide-react";
import type { ResolvedSheet } from "@/lib/character/sheet-model";
import { RESOURCE_ICON, DEFAULT_RESOURCE_COLOR } from "./resource-visuals";

type CustomItem = { name: string; value: number; max?: number };

interface AttributesTabProps {
  /** The sheet being edited, resolved through its rule (draft applied). */
  resolved: ResolvedSheet;
  readOnly: boolean;
  canEditResources: boolean;
  /** Updater for a single resource current value. */
  onResourceChange: (key: string, value: number) => void;
  /** Updater for a single resource max value — only offered where the rule's max is editable. */
  onResourceMaxChange: (key: string, value: number) => void;
  onUpdateAttr: (key: string, value: number) => void;
  customAttrs: CustomItem[];
  onAddCustom: (attr: CustomItem) => void;
  onUpdateCustom: (name: string, patch: { value?: number; max?: number }) => void;
  onRemoveCustom: (name: string) => void;
}

const num = (v: string) => Math.max(0, parseInt(v) || 0);

export function AttributesTab({
  resolved, readOnly, canEditResources,
  onResourceChange, onResourceMaxChange, onUpdateAttr,
  customAttrs, onAddCustom, onUpdateCustom, onRemoveCustom,
}: AttributesTabProps) {
  const t = useTranslations("character");
  // Schema-driven layout: resources, the attribute grid and derived values all
  // come from the rule's sheet schema, resolved against the edited sheet.
  const hasAttributeGrid = resolved.attributes.length > 0;
  const derived = resolved.derivedFields.filter(d => d.field.display === "sheet" || d.field.display === "both");

  // A custom item with a `max` renders as a resource bar; without, as a single value.
  const customResources = customAttrs.filter(a => a.max != null);
  const customSingles = customAttrs.filter(a => a.max == null);

  // Inline add-form state (local to this tab).
  const [addRes, setAddRes] = useState(false);
  const [resName, setResName] = useState(""); const [resCur, setResCur] = useState(10); const [resMax, setResMax] = useState(10);
  const [addAttr, setAddAttr] = useState(false);
  const [attrName, setAttrName] = useState(""); const [attrVal, setAttrVal] = useState(10);

  // Preset resources — rendered in the order the rule declared.
  const predefined = resolved.resources.map(r => ({
    labelKey: r.field.labelKey,
    iconKey: r.field.key,
    style: r.field.style,
    current: r.current,
    max: r.max ?? 0,
    maxEditable: !!r.field.max && "editable" in r.field.max,
    onChange: (v: number) => onResourceChange(r.field.key, v),
    onMax: (v: number) => onResourceMaxChange(r.field.key, v),
  }));

  const sectionHeader = (label: string, sub: string, onAdd?: () => void) => (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-dim font-medium">
        {label} <span className="text-text-dim/60">· {sub}</span>
      </span>
      {!readOnly && onAdd && (
        <button onClick={onAdd}
          className="inline-flex items-center gap-1 text-xs font-bold text-primary border border-primary/40 rounded-theme px-2.5 py-1 hover:bg-primary/10 transition cursor-pointer">
          <Plus className="w-3.5 h-3.5" /> {t("addBtn")}
        </button>
      )}
    </div>
  );

  const fieldCls = "w-full px-3 py-2 bg-input-bg border border-input-border rounded-theme text-text text-sm outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary placeholder:text-text-dim";

  return (
    <div className="flex flex-col gap-6">
      {/* ===== Resources ===== */}
      <div className="flex flex-col gap-3">
        {sectionHeader(t("resourcesLabel"), t("resourceColumns"), () => setAddRes(v => !v))}

        {addRes && !readOnly && (
          <div className="flex flex-col gap-2 bg-surface-alt/40 rounded-theme p-3 border border-border">
            <input value={resName} onChange={e => setResName(e.target.value)} placeholder={t("customAttrPlaceholder")} autoFocus className={fieldCls} />
            <div className="flex gap-2 items-center">
              <input type="number" value={resCur} onChange={e => setResCur(num(e.target.value))} className={`${fieldCls} flex-1 text-center font-mono`} title={t("currentLabel")} />
              <span className="text-text-dim">/</span>
              <input type="number" value={resMax} onChange={e => setResMax(num(e.target.value))} className={`${fieldCls} flex-1 text-center font-mono`} title={t("maxLabel")} />
              <button onClick={() => { if (resName.trim()) { onAddCustom({ name: resName.trim(), value: resCur, max: resMax }); setResName(""); setResCur(10); setResMax(10); setAddRes(false); } }}
                className="flex items-center justify-center w-9 h-9 rounded-theme bg-primary text-primary-foreground shrink-0"><Check className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {predefined.map(r => {
          const visual = RESOURCE_ICON[r.iconKey];
          const Icon = visual?.Icon;
          const icon = Icon ? <Icon className="w-4 h-4" fill={r.iconKey === "hp" ? "currentColor" : undefined} /> : undefined;
          const color = visual?.color ?? DEFAULT_RESOURCE_COLOR;
          if (r.style === "counter") {
            return (
              <CounterCard key={r.iconKey} label={t(r.labelKey)} icon={icon} color={color}
                value={r.current} editable={canEditResources} onChange={r.onChange} />
            );
          }
          return (
            <ResourceCard key={r.iconKey} label={t(r.labelKey)} icon={icon} color={color}
              current={r.current} max={r.max} editable={canEditResources}
              maxEditable={r.maxEditable && !readOnly}
              onCurrent={r.onChange}
              onMax={r.onMax} />
          );
        })}
        {customResources.map(r => (
          <ResourceCard key={r.name} label={r.name} color="var(--theme-accent)"
            current={r.value} max={r.max ?? 0} editable={!readOnly} maxEditable={!readOnly}
            onCurrent={v => onUpdateCustom(r.name, { value: v })}
            onMax={v => onUpdateCustom(r.name, { max: v })}
            onRemove={readOnly ? undefined : () => onRemoveCustom(r.name)} />
        ))}
      </div>

      {/* ===== Attributes (single values) ===== */}
      {hasAttributeGrid && (
        <div className="flex flex-col gap-3">
          {sectionHeader(t("attributesLabel"), t("singleValue"), () => setAddAttr(v => !v))}

          {addAttr && !readOnly && (
            <div className="flex flex-col gap-2 bg-surface-alt/40 rounded-theme p-3 border border-border">
              <input value={attrName} onChange={e => setAttrName(e.target.value)} placeholder={t("customAttrPlaceholder")} autoFocus className={fieldCls} />
              <div className="flex gap-2 items-center">
                <input type="number" value={attrVal} onChange={e => setAttrVal(num(e.target.value))} className={`${fieldCls} flex-1 text-center font-mono`} />
                <button onClick={() => { if (attrName.trim()) { onAddCustom({ name: attrName.trim(), value: attrVal }); setAttrName(""); setAttrVal(10); setAddAttr(false); } }}
                  className="flex items-center justify-center w-9 h-9 rounded-theme bg-primary text-primary-foreground shrink-0"><Check className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {/* Preset attribute grid, declared by the rule's schema. */}
            {resolved.attributes.map(({ field, value }) => (
              <AttrCard key={field.key} label={t(field.labelKey)} value={value} readOnly={readOnly}
                onChange={v => onUpdateAttr(field.key, v)} />
            ))}
            {/* Derived values are always read-only — the rule computes them
                from the attributes above (e.g. 狩魂者's 术法强度 = ⌊智慧/2⌋). */}
            {derived.map(({ field, value }) => (
              <DerivedCard key={field.key} label={t(field.labelKey)} value={value} />
            ))}
            {customSingles.map(a => (
              <AttrCard key={a.name} label={a.name} value={a.value} readOnly={readOnly}
                onChange={v => onUpdateCustom(a.name, { value: v })}
                onRemove={readOnly ? undefined : () => onRemoveCustom(a.name)} />
            ))}
          </div>
        </div>
      )}

      {!hasAttributeGrid && (
        <p className="text-xs text-text-dim text-center py-2">{t("generalD100Hint")}</p>
      )}
    </div>
  );
}

function ResourceCard({ label, icon, color, current, max, editable, maxEditable, onCurrent, onMax, onRemove }: {
  label: string; icon?: React.ReactNode; color: string; current: number; max: number;
  editable: boolean; maxEditable: boolean;
  onCurrent: (v: number) => void; onMax?: (v: number) => void; onRemove?: () => void;
}) {
  const t = useTranslations("character");
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const inputCls = "w-full px-3 py-2 bg-input-bg border border-input-border rounded-theme text-text text-lg font-bold font-mono text-center outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary disabled:opacity-70";
  return (
    <div className="rounded-theme border border-border bg-surface-alt/40 p-4">
      <div className="flex items-center justify-between mb-2.5">
        <span className="flex items-center gap-1.5 font-bold text-sm" style={{ color: `rgb(${color})` }}>{icon}{label}</span>
        {onRemove && (
          <button onClick={onRemove} aria-label="remove" className="text-text-dim hover:text-danger transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="h-2 bg-bg rounded-full overflow-hidden mb-3">
        <div className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundImage: `linear-gradient(90deg, rgb(${color} / 0.7), rgb(${color}))` }} />
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <div className="text-[11px] text-text-dim mb-1">{t("currentLabel")}</div>
          <input type="number" value={current} disabled={!editable}
            onChange={e => onCurrent(num(e.target.value))} className={inputCls} />
        </div>
        <span className="text-text-dim pb-2">/</span>
        <div className="flex-1">
          <div className="text-[11px] text-text-dim mb-1">{t("maxLabel")}</div>
          <input type="number" value={max} disabled={!maxEditable}
            onChange={e => onMax?.(num(e.target.value))} className={inputCls} />
        </div>
      </div>
    </div>
  );
}

/**
 * Unbounded counter resource (`style: "counter"`) — a value
 * with −/+ steppers, no max and no fill bar. Used by accumulating resources
 * like Triangle Agency's commendations/reprimands.
 */
function CounterCard({ label, icon, color, value, editable, onChange }: {
  label: string; icon?: React.ReactNode; color: string; value: number;
  editable: boolean; onChange: (v: number) => void;
}) {
  const inputCls = "w-full px-3 py-2 bg-input-bg border border-input-border rounded-theme text-text text-lg font-bold font-mono text-center outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary disabled:opacity-70";
  const stepCls = "flex items-center justify-center w-9 h-9 rounded-theme border border-border bg-surface-alt text-text-muted hover:bg-primary/10 hover:text-primary transition cursor-pointer disabled:opacity-40 disabled:cursor-default shrink-0";
  return (
    <div className="rounded-theme border border-border bg-surface-alt/40 p-4">
      <div className="flex items-center justify-between mb-2.5">
        <span className="flex items-center gap-1.5 font-bold text-sm" style={{ color: `rgb(${color})` }}>{icon}{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={!editable} aria-label="-1" className={stepCls}>
          <Minus className="w-4 h-4" />
        </button>
        <input type="number" value={value} disabled={!editable}
          onChange={e => onChange(num(e.target.value))} className={inputCls} />
        <button type="button" onClick={() => onChange(value + 1)} disabled={!editable} aria-label="+1" className={stepCls}>
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function DerivedCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-theme bg-surface-alt px-3 py-3 flex flex-col gap-2">
      <span className="text-xs text-text-muted text-center leading-tight">{label}</span>
      <span className="text-2xl font-bold text-text-muted font-theme-mono text-center py-1">{value}</span>
    </div>
  );
}

function AttrCard({ label, value, readOnly, onChange, onRemove }: {
  label: string; value: number; readOnly: boolean; onChange: (v: number) => void; onRemove?: () => void;
}) {
  return (
    <div className="relative rounded-theme border border-border bg-surface-alt/40 px-3 py-3 flex flex-col gap-2">
      {onRemove && (
        <button onClick={onRemove} aria-label="remove" className="absolute top-1.5 right-1.5 text-text-dim hover:text-danger transition cursor-pointer">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      <span className="text-xs text-text-muted text-center leading-tight">{label}</span>
      <input type="number" value={value} disabled={readOnly}
        onChange={e => onChange(num(e.target.value))}
        className="w-full text-2xl font-bold text-primary font-theme-mono text-center bg-input-bg border border-input-border rounded-theme py-1 outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary disabled:opacity-80 disabled:bg-transparent disabled:border-transparent" />
    </div>
  );
}
