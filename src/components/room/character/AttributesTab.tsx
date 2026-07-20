"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Heart, Eye, Droplet, Plus, Trash2, X, Check, Minus, Award, AlertTriangle } from "lucide-react";
import { getRule } from "@/lib/rules";

/**
 * Icon mapping for rule-declared resource bars. The rule's capabilities only
 * declare keys + i18n labels (it's a pure module with no React deps); this
 * client-only map picks the visual. Unknown keys fall back to the primary
 * color + no icon, so new rules don't require a code change to render.
 */
const RESOURCE_ICON: Record<string, { Icon: typeof Heart; color: string }> = {
  hp:  { Icon: Heart,   color: "var(--theme-danger)" },
  san: { Icon: Eye,     color: "var(--theme-ai)" },
  mp:  { Icon: Droplet, color: "var(--theme-primary)" },
  commendations: { Icon: Award,         color: "var(--theme-accent)" },
  reprimands:    { Icon: AlertTriangle, color: "var(--theme-danger)" },
};

type CustomItem = { name: string; value: number; max?: number };

interface AttributesTabProps {
  ruleTemplate: string;
  readOnly: boolean;
  canEditResources: boolean;
  /** Current value per resource key (e.g. {hp:25, san:60}). */
  currentResources: Record<string, number>;
  /** Max value per resource key — drives the bar denominator. */
  resourceMaxes: Record<string, number>;
  /** Updater for a single resource current value. */
  onResourceChange: (key: string, value: number) => void;
  /** Attribute values keyed by `capabilities.attributeKeys[*].key`. */
  attributeValues: Record<string, number>;
  /** Whether the resource bar's max input is editable (d20: yes; COC: no — max is derived). */
  resourceMaxEditable?: boolean;
  /** Updater for a single resource max value. Only used when resourceMaxEditable=true. */
  onResourceMaxChange?: (key: string, value: number) => void;
  onUpdateAttr: (key: string, value: number) => void;
  customAttrs: CustomItem[];
  onAddCustom: (attr: CustomItem) => void;
  onUpdateCustom: (name: string, patch: { value?: number; max?: number }) => void;
  onRemoveCustom: (name: string) => void;
}

const num = (v: string) => Math.max(0, parseInt(v) || 0);

export function AttributesTab({
  ruleTemplate, readOnly, canEditResources,
  currentResources, resourceMaxes, onResourceChange,
  resourceMaxEditable = false, onResourceMaxChange,
  attributeValues, onUpdateAttr,
  customAttrs, onAddCustom, onUpdateCustom, onRemoveCustom,
}: AttributesTabProps) {
  const t = useTranslations("character");
  // Capability-driven layout: resource bars + attribute grid both come from
  // the active rule. Each rule advertises which slots to render, and we just
  // look up the displayed value by the key the rule chose.
  const cap = getRule(ruleTemplate).capabilities;
  const hasAttributeGrid = cap.attributeKeys.length > 0;

  // A custom item with a `max` renders as a resource bar; without, as a single value.
  const customResources = customAttrs.filter(a => a.max != null);
  const customSingles = customAttrs.filter(a => a.max == null);

  // Inline add-form state (local to this tab).
  const [addRes, setAddRes] = useState(false);
  const [resName, setResName] = useState(""); const [resCur, setResCur] = useState(10); const [resMax, setResMax] = useState(10);
  const [addAttr, setAddAttr] = useState(false);
  const [attrName, setAttrName] = useState(""); const [attrVal, setAttrVal] = useState(10);

  // Preset resource bars — rendered in the order the rule declared.
  const predefined = cap.resourceBars.map(spec => ({
    labelKey: spec.labelKey,
    iconKey: spec.key,
    style: spec.style ?? "bar",
    current: currentResources[spec.key] ?? 0,
    max: resourceMaxes[spec.key] ?? 0,
    onChange: (v: number) => onResourceChange(spec.key, v),
    onMax: onResourceMaxChange ? (v: number) => onResourceMaxChange(spec.key, v) : undefined,
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
          const color = visual?.color ?? "var(--theme-primary)";
          if (r.style === "counter") {
            return (
              <CounterCard key={r.iconKey} label={t(r.labelKey)} icon={icon} color={color}
                value={r.current} editable={canEditResources} onChange={r.onChange} />
            );
          }
          return (
            <ResourceCard key={r.iconKey} label={t(r.labelKey)} icon={icon} color={color}
              current={r.current} max={r.max} editable={canEditResources}
              maxEditable={resourceMaxEditable && !!r.onMax}
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
            {/* Preset attribute grid is rule-driven. Each rule's capabilities
                declares the keys + labels; we look up the value from the
                generic `attributeValues` record (COC populates from
                cocAttributes; d20 from d20Attributes). */}
            {cap.attributeKeys.map(({ key, labelKey }) => (
              <AttrCard key={key} label={t(labelKey)} value={attributeValues[key] ?? 0} readOnly={readOnly}
                onChange={v => onUpdateAttr(key, v)} />
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
        <div className="h-full rounded-full transition-all"
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
 * Unbounded counter resource (ResourceBarSpec.style === "counter") — a value
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
