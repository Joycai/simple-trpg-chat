"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X, Check } from "lucide-react";
import type { FieldState } from "@/lib/character/completion";
import type { ResolvedSheet } from "@/lib/character/sheet-model";
import { SheetFieldCell } from "./SheetFieldCell";
import { ResourceField } from "./ResourceField";
import { DerivedStats } from "./DerivedStats";

type CustomItem = { name: string; value: number; max?: number };

interface AttributesTabProps {
  /** The sheet being edited, resolved through its rule (draft applied). */
  resolved: ResolvedSheet;
  /** The saved sheet — the "原 X" on a field with an unsaved change. */
  baseline: ResolvedSheet;
  /** Draft paths that differ from the saved sheet (`attributes.str`, …). */
  changed: ReadonlySet<string>;
  /** Per field (`attribute:str`, `resource:hp`) completion state. */
  stateOf: (key: string) => FieldState;
  editable: boolean;
  /** Show the saved value on dirty tags (host edits another member's card). */
  showDirtyFrom: boolean;
  onResourceChange: (key: string, value: number) => void;
  onResourceMaxChange: (key: string, value: number | null) => void;
  onUpdateAttr: (key: string, value: number | null) => void;
  customAttrs: CustomItem[];
  onAddCustom: (attr: CustomItem) => void;
  onUpdateCustom: (name: string, patch: { value?: number; max?: number }) => void;
  onRemoveCustom: (name: string) => void;
}

const num = (v: string) => Math.max(0, parseInt(v) || 0);

/**
 * The 属性 tab, laid out from the rule's schema (UI spec ①③⑥): resources,
 * the attribute grid, derived values, then the player's custom attributes.
 * Every field shows its completion state and whether it holds an unsaved
 * change.
 */
export function AttributesTab({
  resolved, baseline, changed, stateOf, editable, showDirtyFrom,
  onResourceChange, onResourceMaxChange, onUpdateAttr,
  customAttrs, onAddCustom, onUpdateCustom, onRemoveCustom,
}: AttributesTabProps) {
  const t = useTranslations("character");
  const requiredAttrs = resolved.attributes.filter((a) => a.field.required).length;
  const hasPresets = resolved.attributes.length > 0 || resolved.resources.length > 0;

  // A custom item with a `max` renders as a bar; without, as a single value.
  const customResources = customAttrs.filter(a => a.max != null);
  const customSingles = customAttrs.filter(a => a.max == null);

  // Inline add-form state (local to this tab).
  const [addRes, setAddRes] = useState(false);
  const [resName, setResName] = useState(""); const [resCur, setResCur] = useState(10); const [resMax, setResMax] = useState(10);
  const [addAttr, setAddAttr] = useState(false);
  const [attrName, setAttrName] = useState(""); const [attrVal, setAttrVal] = useState(10);

  const cellLabels = {
    required: t("stateRequired"), default: t("stateDefault"), custom: t("stateCustom"), dirty: t("stateDirty"),
    dirtyFrom: (v: number) => t("stateDirtyFrom", { value: v }),
    usesDefault: (v: number) => t("checkUsesDefault", { value: v }),
  };
  const resourceLabels = (label: string) => ({
    unsetInitial: t("stateUnsetInitial"), maxRequired: t("maxRequired"), dirty: t("stateDirty"),
    dirtyFrom: (v: string) => t("stateDirtyFrom", { value: v }),
    decrease: t("decrease", { name: label }), increase: t("increase", { name: label }),
    current: t("currentLabel"), max: t("maxLabel"),
  });

  const sectionHeader = (label: React.ReactNode, right?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-text-muted">
      <span>{label}</span>
      {right}
    </div>
  );
  const addButton = (onClick: () => void) => editable && (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-bold text-primary border border-primary/40 rounded-theme px-2.5 py-1 hover:bg-primary/10 transition cursor-pointer">
      <Plus className="w-3.5 h-3.5" /> {t("addBtn")}
    </button>
  );

  const fieldCls = "w-full px-3 py-2 bg-input-bg border border-input-border rounded-theme text-text text-sm outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary placeholder:text-text-dim";

  return (
    <div className="flex flex-col gap-6">
      {/* ===== Resources ===== */}
      {(resolved.resources.length > 0 || customResources.length > 0 || editable) && (
        <section className="flex flex-col gap-2.5">
          {sectionHeader(t("resourcesLabel"), (
            <span className="flex items-center gap-2">
              {resolved.resources.some((r) => r.field.max && "derived" in r.field.max) && (
                <span className="font-normal text-text-dim hidden sm:inline">{t("resourcesHintDerived")}</span>
              )}
              {addButton(() => setAddRes(v => !v))}
            </span>
          ))}

          {addRes && editable && (
            <div className="flex flex-col gap-2 bg-surface-alt/40 rounded-theme p-3 border border-border">
              <input value={resName} onChange={e => setResName(e.target.value)} placeholder={t("customAttrPlaceholder")} autoFocus className={fieldCls} />
              <div className="flex gap-2 items-center">
                <input type="number" value={resCur} onChange={e => setResCur(num(e.target.value))} className={`${fieldCls} flex-1 text-center font-mono`} title={t("currentLabel")} />
                <span className="text-text-dim">/</span>
                <input type="number" value={resMax} onChange={e => setResMax(num(e.target.value))} className={`${fieldCls} flex-1 text-center font-mono`} title={t("maxLabel")} />
                <button type="button" aria-label={t("addBtn")} onClick={() => { if (resName.trim()) { onAddCustom({ name: resName.trim(), value: resCur, max: resMax }); setResName(""); setResCur(10); setResMax(10); setAddRes(false); } }}
                  className="flex items-center justify-center w-9 h-9 rounded-theme bg-primary text-primary-foreground shrink-0 cursor-pointer"><Check className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {resolved.resources.map((r) => {
            const key = r.field.key;
            const label = t(r.field.labelKey);
            const dirty = changed.has(`resources.${key}.current`) || changed.has(`resources.${key}.max`);
            const saved = baseline.resources.find((b) => b.field.key === key);
            return (
              <ResourceField key={key} resource={r} label={label} state={stateOf(`resource:${key}`)}
                dirty={dirty} editable={editable}
                dirtyFrom={showDirtyFrom && dirty && saved ? (saved.max !== undefined ? `${saved.current}/${saved.max}` : String(saved.current)) : undefined}
                onCurrent={(v) => onResourceChange(key, v)} onMax={(v) => onResourceMaxChange(key, v)}
                labels={resourceLabels(label)} />
            );
          })}
          {customResources.map(r => (
            <CustomResourceCard key={r.name} label={r.name} current={r.value} max={r.max ?? 0} editable={editable}
              customLabel={t("stateCustom")} removeLabel={t("removeCustom", { name: r.name })}
              onCurrent={v => onUpdateCustom(r.name, { value: v })}
              onMax={v => onUpdateCustom(r.name, { max: v })}
              onRemove={() => onRemoveCustom(r.name)} />
          ))}
        </section>
      )}

      {/* ===== Attributes ===== */}
      {resolved.attributes.length > 0 && (
        <section className="flex flex-col gap-2.5">
          {sectionHeader(
            <>{t("baseAttributes")}{requiredAttrs > 0 && <span className="font-normal text-text-dim"> · {t("requiredCount", { count: requiredAttrs })}</span>}</>,
            <span className="hidden sm:flex items-center gap-2.5 font-normal text-[11px] text-text-dim">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-[3px] border border-success" />{t("legendSet")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-[3px] border border-dashed border-danger" />{t("legendMissing")}</span>
            </span>,
          )}
          <div className="grid grid-cols-2 min-[400px]:grid-cols-3 gap-2.5">
            {resolved.attributes.map(({ field, value, isSet }) => {
              const dirty = changed.has(`attributes.${field.key}`);
              const saved = baseline.attributes.find((b) => b.field.key === field.key);
              return (
                <SheetFieldCell key={field.key} fieldId={`attribute:${field.key}`} label={t(field.labelKey)}
                  value={value} isSet={isSet} state={stateOf(`attribute:${field.key}`)} defaultValue={field.default}
                  badge={field.badge ? field.badge(value) : undefined}
                  dirty={dirty} dirtyFrom={showDirtyFrom && dirty && saved?.isSet ? saved.value : undefined}
                  editable={editable} onChange={(v) => onUpdateAttr(field.key, v)} labels={cellLabels} />
              );
            })}
          </div>
        </section>
      )}

      {/* ===== Derived ===== */}
      <DerivedStats derived={resolved.derivedFields} />

      {/* ===== Custom attributes ===== */}
      <section className="flex flex-col gap-2.5">
        {sectionHeader(t("customAttributes"), addButton(() => setAddAttr(v => !v)))}
        {!hasPresets && customSingles.length === 0 && customResources.length === 0 && !addAttr && (
          <div className="border border-dashed border-input-border rounded-theme p-5 flex flex-col items-center gap-2 text-center">
            <span className="text-[13px] font-semibold">{t("noPresetFields")}</span>
            <span className="text-xs text-text-muted">{t("noPresetHint")}</span>
          </div>
        )}
        {addAttr && editable && (
          <div className="flex flex-col gap-2 bg-surface-alt/40 rounded-theme p-3 border border-border">
            <input value={attrName} onChange={e => setAttrName(e.target.value)} placeholder={t("customAttrPlaceholder")} autoFocus className={fieldCls} />
            <div className="flex gap-2 items-center">
              <input type="number" value={attrVal} onChange={e => setAttrVal(num(e.target.value))} className={`${fieldCls} flex-1 text-center font-mono`} />
              <button type="button" aria-label={t("addBtn")} onClick={() => { if (attrName.trim()) { onAddCustom({ name: attrName.trim(), value: attrVal }); setAttrName(""); setAttrVal(10); setAddAttr(false); } }}
                className="flex items-center justify-center w-9 h-9 rounded-theme bg-primary text-primary-foreground shrink-0 cursor-pointer"><Check className="w-4 h-4" /></button>
            </div>
          </div>
        )}
        {customSingles.length > 0 && (
          <div className="grid grid-cols-2 min-[400px]:grid-cols-3 gap-2.5">
            {customSingles.map(a => (
              <SheetFieldCell key={a.name} fieldId={`custom:${a.name}`} label={a.name} value={a.value} isSet state="custom"
                dirty={changed.has("customAttributes") && !baseline.sheet.customAttributes?.some((b) => b.name === a.name && b.value === a.value)}
                editable={editable} onChange={(v) => v !== null && onUpdateCustom(a.name, { value: v })}
                onRemove={() => onRemoveCustom(a.name)} removeLabel={t("removeCustom", { name: a.name })} labels={cellLabels} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** A player-defined bar (a custom attribute with a max). */
function CustomResourceCard({ label, current, max, editable, customLabel, removeLabel, onCurrent, onMax, onRemove }: {
  label: string; current: number; max: number; editable: boolean; customLabel: string; removeLabel: string;
  onCurrent: (v: number) => void; onMax: (v: number) => void; onRemove: () => void;
}) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const numCls = "w-14 bg-transparent border-0 p-0 text-center text-[15px] font-bold font-theme-mono text-text outline-none disabled:opacity-100";
  return (
    <div className="rounded-theme border border-border bg-surface-alt/55 px-3.5 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-bold text-accent min-w-0">
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-[10px] font-semibold leading-4 px-1.5 rounded-full border text-ai border-ai/50">{customLabel}</span>
        </span>
        <span className="flex items-center gap-1">
          <input type="number" value={current} disabled={!editable} aria-label={label} onChange={e => onCurrent(num(e.target.value))} className={numCls} />
          <span className="text-text-dim font-theme-mono">/</span>
          <input type="number" value={max} disabled={!editable} aria-label={`${label} max`} onChange={e => onMax(num(e.target.value))} className={numCls} />
          {editable && (
            <button type="button" onClick={onRemove} aria-label={removeLabel} className="text-text-dim hover:text-danger transition cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </span>
      </div>
      <div className="h-1.5 bg-bg rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
