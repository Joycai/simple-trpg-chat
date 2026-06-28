"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Heart, Eye, Droplet, Plus, Trash2, X, Check } from "lucide-react";
import type { CocAttributes, computeCocDerived } from "@/lib/character-types";
import { getRule } from "@/lib/rules";

/**
 * Icon mapping for rule-declared resource bars. The rule's capabilities only
 * declare keys + i18n labels (it's a pure module with no React deps); this
 * client-only map picks the visual.
 */
const RESOURCE_ICON: Record<string, { Icon: typeof Heart; color: string }> = {
  hp:  { Icon: Heart,   color: "var(--theme-danger)" },
  san: { Icon: Eye,     color: "var(--theme-ai)" },
  mp:  { Icon: Droplet, color: "var(--theme-primary)" },
};

type CocDerived = ReturnType<typeof computeCocDerived>;
type CustomItem = { name: string; value: number; max?: number };

interface AttributesTabProps {
  ruleTemplate: string;
  readOnly: boolean;
  canEditResources: boolean;
  derived: CocDerived;
  currentHp: number;
  onCurrentHpChange: (v: number) => void;
  currentSan: number;
  onCurrentSanChange: (v: number) => void;
  currentMp: number;
  onCurrentMpChange: (v: number) => void;
  cocAttrs: CocAttributes;
  onUpdateAttr: (key: keyof CocAttributes, value: number) => void;
  customAttrs: CustomItem[];
  onAddCustom: (attr: CustomItem) => void;
  onUpdateCustom: (name: string, patch: { value?: number; max?: number }) => void;
  onRemoveCustom: (name: string) => void;
}

const num = (v: string) => Math.max(0, parseInt(v) || 0);

export function AttributesTab({
  ruleTemplate, readOnly, canEditResources, derived,
  currentHp, onCurrentHpChange, currentSan, onCurrentSanChange, currentMp, onCurrentMpChange,
  cocAttrs, onUpdateAttr, customAttrs, onAddCustom, onUpdateCustom, onRemoveCustom,
}: AttributesTabProps) {
  const t = useTranslations("character");
  // Capability-driven layout: SAN/MP bars and the attribute grid only render
  // when the active rule advertises them. Future non-COC rules (e.g. DnD 5e
  // with 6 abilities) plug in by adjusting their `capabilities.attributeKeys`
  // and `resourceBars` — no edits to this component are needed for them.
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

  // Preset resource bars. HP stays universal (every rule that maintains a
  // sheet at all has HP); SAN / MP are gated by capability flags so basic and
  // future non-COC rules drop them automatically.
  const predefined = [
    { label: t("hp"),  iconKey: "hp",  current: currentHp,  max: derived.hpMax,  onChange: onCurrentHpChange,  show: true },
    { label: t("san"), iconKey: "san", current: currentSan, max: derived.sanMax, onChange: onCurrentSanChange, show: cap.hasSanity },
    { label: t("mp"),  iconKey: "mp",  current: currentMp,  max: derived.mpMax,  onChange: onCurrentMpChange,  show: cap.hasManaPoints },
  ].filter(r => r.show);

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
          return (
            <ResourceCard key={r.label} label={r.label}
              icon={Icon ? <Icon className="w-4 h-4" fill={r.iconKey === "hp" ? "currentColor" : undefined} /> : undefined}
              color={visual?.color ?? "var(--theme-primary)"}
              current={r.current} max={r.max} editable={canEditResources} maxEditable={false}
              onCurrent={r.onChange} />
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
            {/* Preset attribute grid is rule-driven. The lookup into cocAttrs
                is safe because today only the COC rule populates attributeKeys;
                rules with a different attribute bag (e.g. DnD 5e abilities)
                will need their own typed accessor in a future iteration. */}
            {cap.attributeKeys.map(({ key, labelKey }) => (
              <AttrCard key={key} label={t(labelKey)} value={cocAttrs[key as keyof CocAttributes]} readOnly={readOnly}
                onChange={v => onUpdateAttr(key as keyof CocAttributes, v)} />
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
