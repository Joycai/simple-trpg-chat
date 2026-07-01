"use client";

import { useTranslations } from "next-intl";
import { Package, Share2 } from "lucide-react";
import { isUnread, isUpdated, isNew, typeIcon, typeColorClass, type InventoryItem, type Distribution, type InventoryItemType } from "./inventory-helpers";

interface BackpackViewProps {
  filteredItems: Distribution[];
  filterType: "all" | InventoryItemType;
  onFilterChange: (v: "all" | InventoryItemType) => void;
  userId: number;
  onSelect: (item: InventoryItem | null, dist: Distribution) => void;
}

export function BackpackView({ filteredItems, filterType, onFilterChange, userId, onSelect }: BackpackViewProps) {
  const t = useTranslations("inventory");
  const typeTabLabel = (tStr: string) => ({ clue: t("tabClue"), info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[tStr] || tStr);

  return (
    /* === PLAYER BACKPACK VIEW (Unified RPG Grid with Filters) === */
    <div className="flex flex-col gap-4">
      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onFilterChange("all")}
          className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all duration-200 cursor-pointer ${
            filterType === "all"
              ? "bg-primary text-primary-foreground shadow-[var(--theme-glow)]"
              : "text-text-muted hover:text-text border border-border bg-transparent hover:bg-surface-alt"
          }`}>
          {t("filterAll")}
        </button>
        {(["clue", "info", "character", "item"] as const).map(typeKey => (
          <button key={typeKey} onClick={() => onFilterChange(typeKey)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all duration-200 cursor-pointer ${
              filterType === typeKey
                ? "bg-primary text-primary-foreground shadow-[var(--theme-glow)]"
                : "text-text-muted hover:text-text border border-border bg-transparent hover:bg-surface-alt"
            }`}>
            {typeTabLabel(typeKey)}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center text-text-muted py-12 text-sm">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{t("emptyBackpack", { type: filterType === "all" ? "" : typeTabLabel(filterType) })}</p>
          <p className="text-xs mt-1 opacity-60">{t("waitingKp")}</p>
        </div>
      ) : (
        (() => {
          const GRID_COLS = 3;
          // Render at least a 3×3 RPG grid, padded with empty slots.
          const totalSlots = Math.max(9, Math.ceil(filteredItems.length / GRID_COLS) * GRID_COLS);
          const gridItems = [];

          for (let i = 0; i < totalSlots; i++) {
            const d = i < filteredItems.length ? filteredItems[i] : null;
            const type = (d?.item?.type || "item") as InventoryItemType;
            const Icon = typeIcon[type];
            gridItems.push(
              <div key={d ? d.id : `empty-${i}`}
                className={d
                  ? `relative bg-surface-alt rounded-theme border cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40 transition-all duration-200 aspect-square flex flex-col items-center justify-center gap-2.5 p-3 group inventory-card ${
                      isUpdated(d) ? "border-accent/50 bg-accent/5 shadow-[0_0_14px_rgb(var(--theme-accent)/0.18)]"
                      : isUnread(d) ? "border-primary/50 bg-primary/5 shadow-[var(--theme-glow)]"
                      : "border-border"
                    }`
                  : "rounded-theme border border-dashed border-border/50 aspect-square"
                }
                onClick={() => { if (d) { onSelect(d.item ?? null, d); } }}
                title={d ? d.item?.title || "" : ""}
              >
                {d && (
                  <>
                    {isUpdated(d) ? (
                      <span title={t("badgeUpdatedTitle")} className="absolute -top-2 -right-1.5 bg-accent text-accent-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow z-10">
                        {t("badgeUpdated")}
                      </span>
                    ) : isNew(d) ? (
                      <span title={t("badgeNewTitle")} className="absolute -top-2 -right-1.5 bg-danger text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow z-10">
                        {t("badgeNew")}
                      </span>
                    ) : null}
                    <Icon className={`w-7 h-7 ${typeColorClass[type]}`} strokeWidth={1.75} />
                    <span className="text-xs font-bold text-text text-center leading-tight line-clamp-2">
                      {d.item?.title || `#${d.itemId}`}
                    </span>
                    {d.fromUserId !== userId && (
                      <Share2 className="absolute bottom-1.5 right-2 w-3 h-3 text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </>
                )}
              </div>
            );
          }

          return (
            <div className="grid grid-cols-3 gap-4">
              {gridItems}
            </div>
          );
        })()
      )}
    </div>
  );
}
