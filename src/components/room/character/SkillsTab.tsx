"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Search, X } from "lucide-react";
import {
  filterSkillRows, isNewSkillName, skillFilterCounts, type SkillFilter, type SkillRow,
} from "@/lib/character/skill-list";
import { FieldTag } from "./SheetFieldCell";

export interface SkillItem {
  id: number;
  skillName: string;
  skillValue: number;
}

interface SkillsTabProps {
  /** Standard skills (schema order) then custom ones — see `buildSkillRows`. */
  rows: SkillRow[];
  editable: boolean;
  /** Set a skill by name (overwrites, same as `.st`). */
  onSet: (skillName: string, value: number) => void;
  onRemove: (id: number) => void;
}

const FILTERS: SkillFilter[] = ["all", "set", "unset", "custom"];

/**
 * The 技能 tab (UI spec ②): the rule's standard skills — each set, or showing
 * the default it reads as, with a 设置 button — then the member's own custom
 * skills. The search box filters and, for a name that isn't listed, offers to
 * add it.
 */
export function SkillsTab({ rows, editable, onSet, onRemove }: SkillsTabProps) {
  const t = useTranslations("character");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("all");
  const [newValue, setNewValue] = useState(50);

  const counts = skillFilterCounts(rows);
  const visible = filterSkillRows(rows, filter, query);
  const standard = visible.filter((r) => r.kind === "standard");
  const custom = visible.filter((r) => r.kind === "custom");
  const canAdd = editable && isNewSkillName(rows, query);
  const add = () => {
    if (!canAdd) return;
    onSet(query.trim(), newValue);
    setQuery("");
  };

  const filterLabel = (f: SkillFilter) => ({
    all: t("skillFilterAll", { count: counts.all }),
    set: t("skillFilterSet", { count: counts.set }),
    unset: t("skillFilterUnset", { count: counts.unset }),
    custom: t("skillFilterCustom", { count: counts.custom }),
  }[f]);

  // Standard rows, grouped when the rule groups them (COC: 战斗 / 调查 / …).
  const groups: { group?: string; rows: SkillRow[] }[] = [];
  for (const r of standard) {
    const last = groups[groups.length - 1];
    if (last && last.group === r.group) last.rows.push(r);
    else groups.push({ group: r.group, rows: [r] });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-center">
        <label className="flex-1 flex items-center gap-2 px-3 h-9 rounded-theme bg-input-bg border border-input-border text-text-dim focus-within:ring-[3px] focus-within:ring-primary/[0.18] focus-within:border-primary">
          <Search className="w-4 h-4 shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={editable ? t("skillSearchPlaceholder") : t("skillsList")} aria-label={t("skillSearchPlaceholder")}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-text placeholder:text-text-dim" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="clear" className="text-text-dim hover:text-text cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
        {canAdd && (
          <>
            <input type="number" min={0} max={999} value={newValue} aria-label={t("skillNamePlaceholder")}
              onChange={(e) => setNewValue(Math.max(0, Math.min(999, parseInt(e.target.value) || 0)))}
              className="w-16 h-9 px-2 border border-input-border bg-input-bg rounded-theme text-sm text-text text-center font-theme-mono outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
            <button type="button" onClick={add}
              className="flex items-center gap-1 h-9 px-3 rounded-theme bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold whitespace-nowrap cursor-pointer">
              <Plus className="w-3.5 h-3.5" />{t("skillAdd", { name: query.trim() })}
            </button>
          </>
        )}
      </div>

      <div role="group" aria-label="filter" className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={`text-xs leading-7 px-3 rounded-full border transition cursor-pointer ${filter === f
              ? "text-primary border-primary/50 bg-primary/10"
              : "text-text-muted border-border hover:text-text"}`}>
            {filterLabel(f)}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-xs text-text-dim text-center py-6">{rows.length === 0 ? t("noSkills") : t("skillNoMatch")}</p>
      )}

      {standard.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-text-muted">
            <span>{t("standardSkillsTitle")}</span>
            <span className="font-normal text-text-dim text-right">{t("standardSkillsHint")}</span>
          </div>
          {groups.map(({ group, rows: groupRows }, i) => (
            <div key={`${group ?? ""}-${i}`} className="flex flex-col gap-1.5">
              {group && <span className="text-[11px] text-text-dim mt-1.5">{t(`skillGroups.${group}`)}</span>}
              {groupRows.map((r) => (
                <SkillRowView key={r.name} row={r} editable={editable} onSet={onSet} onRemove={onRemove} />
              ))}
            </div>
          ))}
        </section>
      )}

      {custom.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <div className="text-xs font-semibold text-text-muted">{t("customSkillsTitle")}</div>
          {custom.map((r) => (
            <SkillRowView key={`c:${r.stored?.id}`} row={r} editable={editable} onSet={onSet} onRemove={onRemove} />
          ))}
        </section>
      )}
    </div>
  );
}

function SkillRowView({ row, editable, onSet, onRemove }: {
  row: SkillRow;
  editable: boolean;
  onSet: (skillName: string, value: number) => void;
  onRemove: (id: number) => void;
}) {
  const t = useTranslations("character");
  const frame = row.state === "missing"
    ? "border border-dashed border-danger/65 bg-danger/5"
    : row.stored ? "border border-border bg-surface-alt/55" : "border border-transparent";
  // The stored row's own name: a standard skill may be filled by an alias
  // spelling, and writes must keep updating that row.
  const storedName = row.stored?.skillName ?? row.name;
  const commit = (raw: string) => {
    const v = parseInt(raw);
    if (Number.isFinite(v) && v >= 0 && v <= 999 && v !== row.stored?.skillValue) onSet(storedName, v);
  };
  return (
    <div data-field={`skill:${row.name}`} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${frame}`}>
      <span className={`flex-1 min-w-0 truncate text-[13px] font-semibold ${row.stored || row.state === "missing" ? "text-text" : "text-text-muted"}`}>
        {row.name}
        {row.stored && row.stored.skillName !== row.name && <span className="ml-1 text-[11px] font-normal text-text-dim">({row.stored.skillName})</span>}
      </span>
      {row.required && !row.stored && <FieldTag tone="danger">{t("stateRequired")}</FieldTag>}
      {row.kind === "custom" && <FieldTag tone="ai">{t("stateCustom")}</FieldTag>}
      {row.stored ? (
        <>
          <input key={row.stored.skillValue} type="number" min={0} max={999} defaultValue={row.stored.skillValue}
            disabled={!editable} aria-label={row.name}
            onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-14 text-right bg-surface-alt border border-input-border rounded-lg px-2 py-1 text-sm font-bold font-theme-mono text-text outline-none focus:ring-[3px] focus:ring-primary/[0.18] disabled:bg-transparent disabled:border-transparent" />
          {editable && (
            <button type="button" onClick={() => onRemove(row.stored!.id)} aria-label={t("removeCustom", { name: row.name })}
              className="text-text-dim hover:text-danger transition cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </>
      ) : (
        <>
          <span className="text-xs text-text-dim">{t("skillDefault", { value: row.base ?? 0 })}</span>
          {editable && (
            <button type="button" onClick={() => onSet(row.name, row.base ?? 0)}
              className="text-xs font-semibold text-primary border border-primary/40 rounded-lg px-2.5 py-0.5 hover:bg-primary/10 cursor-pointer">
              {t("skillSetBtn")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
