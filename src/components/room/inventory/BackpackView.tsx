"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid, Package, Search, Share2 } from "lucide-react";
import {
  isUpdated, isNew, typeIcon, typeOverlayClass, typeChipClass, typeColorClass,
  filterActiveClass, filterBarClass, formatDistTime,
  type InventoryItem, type Distribution, type InventoryItemType, type BackpackFilter,
} from "./inventory-helpers";
import { useHostLabel } from "@/components/shared/host-label";
import { PaneTransition } from "@/components/shared/PaneTransition";

interface BackpackViewProps {
  /** The player's whole backpack, unfiltered — the rail needs every row to
   *  count each category, so filtering happens here rather than in the panel. */
  items: Distribution[];
  filterType: BackpackFilter;
  onFilterChange: (v: BackpackFilter) => void;
  userId: number;
  onSelect: (item: InventoryItem | null, dist: Distribution) => void;
}

const TYPE_ORDER = ["clue", "info", "character", "item"] as const;

export function BackpackView({ items, filterType, onFilterChange, userId, onSelect }: BackpackViewProps) {
  const t = useTranslations("inventory");
  const hostLabel = useHostLabel();
  const [query, setQuery] = useState("");
  const typeTabLabel = (tStr: string) =>
    ({ clue: t("tabClue"), info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[tStr] || tStr);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, clue: 0, info: 0, character: 0, item: 0 };
    for (const d of items) if (d.item) c[d.item.type]++;
    return c;
  }, [items]);

  // Category first, then the search box narrows whatever that category holds.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((d) => {
      if (filterType !== "all" && d.item?.type !== filterType) return false;
      if (q && !(d.item?.title ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filterType, query]);

  const categories: { key: BackpackFilter; label: string; Icon: typeof LayoutGrid }[] = [
    { key: "all", label: t("filterAll"), Icon: LayoutGrid },
    ...TYPE_ORDER.map((k) => ({ key: k as BackpackFilter, label: typeTabLabel(k), Icon: typeIcon[k] })),
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:min-h-full gap-3 sm:gap-5">
      {/* Category rail — icon over label over count. `sm:min-h-full` on the row
          (plus the flex default stretch) runs the divider the full height of
          the drawer body instead of stopping under the last entry. */}
      <div className="flex sm:flex-col gap-1.5 shrink-0 sm:w-24 overflow-x-auto sm:overflow-x-visible scrollbar-none border-b sm:border-b-0 sm:border-r border-border pb-2 sm:pb-0 sm:pr-3">
        {categories.map(({ key, label, Icon }) => {
          const active = filterType === key;
          return (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              aria-pressed={active}
              className={`relative flex sm:flex-col items-center justify-center gap-1.5 sm:gap-1 shrink-0 cursor-pointer
                rounded-theme border px-3 py-2 sm:px-2 sm:py-3 transition-[color,background-color,border-color] duration-150 ${
                active
                  ? `${filterActiveClass[key]} font-semibold`
                  : "border-transparent text-text-muted hover:text-text hover:bg-surface-alt/50"
              }`}
            >
              {/* Leading indicator bar — down the left edge on the desktop rail,
                  along the bottom when the rail folds into a strip. */}
              {active && (
                <span
                  aria-hidden
                  className={`absolute rounded-full ${filterBarClass[key]}
                    left-2 right-2 bottom-0 h-0.5
                    sm:left-0 sm:right-auto sm:top-2 sm:bottom-2 sm:h-auto sm:w-0.5`}
                />
              )}
              <Icon className={`w-4 h-4 shrink-0 ${active ? "" : "text-text-dim"}`} />
              <span className="text-xs leading-none">{label}</span>
              <span className={`text-[11px] leading-none font-theme-mono ${active ? "opacity-80" : "text-text-dim"}`}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* min-w-0 so the grid can shrink inside the flex row instead of
          overflowing the drawer. */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-9 pr-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-sm text-text placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary"
          />
        </div>

        {/* Keyed on the category only: re-running the fade on every keystroke
            would make the search box feel like it is fighting the user. */}
        <PaneTransition paneKey={filterType}>
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-14 gap-4">
              <div className="w-28 h-28 rounded-theme border-2 border-dashed border-border flex items-center justify-center">
                <Package className="w-10 h-10 text-text-dim opacity-50" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-base font-bold text-text">
                  {t("emptyBackpack", { type: filterType === "all" ? "" : typeTabLabel(filterType) })}
                </p>
                <p className="text-xs text-text-muted leading-relaxed max-w-[15rem]">
                  {t("emptyHint", { host: hostLabel })}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs text-text-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                {t("waitingKp", { host: hostLabel })}
              </span>
            </div>
          ) : (
            // `sm:` (not `md:`) matches the drawer's own breakpoint — it is a
            // fixed 36rem from `sm` up, so two columns fit from there on.
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visible.map((d) => {
                const type = (d.item?.type || "item") as InventoryItemType;
                const Icon = typeIcon[type];
                const updated = isUpdated(d);
                const fresh = isNew(d);
                return (
                  <button
                    key={d.id}
                    onClick={() => onSelect(d.item ?? null, d)}
                    title={d.item?.title || ""}
                    className="inventory-card group relative text-left rounded-theme p-4 flex flex-col gap-3
                      transition-[translate,box-shadow] duration-200 cursor-pointer hover:-translate-y-0.5"
                  >
                    {/* Type colour rides above the theme's card surface — see
                        typeOverlayClass for why it cannot be on the card. */}
                    <span
                      aria-hidden
                      className={`absolute inset-0 rounded-theme pointer-events-none transition-opacity duration-200
                        opacity-90 group-hover:opacity-100 ${typeOverlayClass[type]}`}
                    />
                    <div className="relative flex items-start justify-between gap-2">
                      <span className={`w-11 h-11 rounded-theme flex items-center justify-center shrink-0 ${typeChipClass[type]}`}>
                        <Icon className="w-5 h-5" strokeWidth={1.75} />
                      </span>
                      {updated ? (
                        <span title={t("badgeUpdatedTitle")} className="shrink-0 bg-accent text-accent-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {t("badgeUpdated")}
                        </span>
                      ) : fresh ? (
                        <span title={t("badgeNewTitle")} className="shrink-0 bg-danger text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {t("badgeNew")}
                        </span>
                      ) : null}
                    </div>

                    <div className="relative flex flex-col gap-1.5 min-w-0">
                      <span className="text-sm font-bold text-text truncate">
                        {d.item?.title || `#${d.itemId}`}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs min-w-0">
                        <span className={`font-medium ${typeColorClass[type]}`}>{typeTabLabel(type)}</span>
                        <span className="text-text-dim">·</span>
                        <span className="text-text-dim font-theme-mono">{formatDistTime(d.createdAt)}</span>
                      </span>
                    </div>

                    {d.fromUserId !== userId && (
                      <Share2 className="absolute bottom-3 right-3 w-3 h-3 text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </PaneTransition>
      </div>
    </div>
  );
}
