"use client";

import { useTranslations } from "next-intl";
import { isUnread, isUpdated, isNew, typeEmoji, type InventoryItem, type Distribution, type InventoryItemType } from "./inventory-helpers";

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
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => onFilterChange("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
            filterType === "all"
              ? "bg-primary text-primary-foreground shadow-sm filter-tab-active"
              : "bg-surface-alt text-text-muted hover:text-text border border-border/50"
          }`}>
          {t("filterAll")}
        </button>
        {(["clue", "info", "character", "item"] as const).map(typeKey => (
          <button key={typeKey} onClick={() => onFilterChange(typeKey)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
              filterType === typeKey
                ? "bg-primary text-primary-foreground shadow-sm filter-tab-active"
                : "bg-surface-alt text-text-muted hover:text-text border border-border/50"
            }`}>
            {typeTabLabel(typeKey)}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center text-text-muted py-12 text-sm">
          <div className="text-4xl mb-3 opacity-30">🎒</div>
          <p>{t("emptyBackpack", { type: filterType === "all" ? "" : typeTabLabel(filterType) })}</p>
          <p className="text-xs mt-1 opacity-60">{t("waitingKp")}</p>
        </div>
      ) : (
        (() => {
          const GRID_COLS = 4;
          // Render minimum 12 slots for RPG grid layout
          const totalSlots = Math.max(12, Math.ceil(filteredItems.length / GRID_COLS) * GRID_COLS);
          const gridItems = [];

          for (let i = 0; i < totalSlots; i++) {
            const d = i < filteredItems.length ? filteredItems[i] : null;
            gridItems.push(
              <div key={d ? d.id : `empty-${i}`}
                className={d
                  ? `relative bg-surface-alt rounded-theme border cursor-pointer hover:scale-105 hover:shadow-lg hover:border-primary/40 transition-all duration-200 aspect-square flex flex-col items-center justify-center p-2 group inventory-card ${
                      isUpdated(d) ? "border-accent/50 bg-accent/5 ring-1 ring-accent/40"
                      : isUnread(d) ? "border-primary/40 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border"
                    }`
                  : "bg-bg/50 rounded-theme border border-dashed border-border/30 aspect-square opacity-40"
                }
                onClick={() => { if (d) { onSelect(d.item ?? null, d); } }}
                title={d ? d.item?.title || "" : ""}
              >
                {d && (
                  <>
                    {isUpdated(d) ? (
                      <span title={t("badgeUpdatedTitle")} className="absolute -top-1.5 -right-1.5 bg-accent text-accent-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow animate-pulse z-10">
                        {t("badgeUpdated")}
                      </span>
                    ) : isNew(d) ? (
                      <span title={t("badgeNewTitle")} className="absolute -top-1.5 -right-1.5 bg-danger text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow animate-pulse z-10">
                        {t("badgeNew")}
                      </span>
                    ) : null}
                    <span className="text-2xl mb-1">{typeEmoji(d.item?.type || "item")}</span>
                    <span className="text-[10px] font-bold text-text text-center leading-tight line-clamp-2">
                      {d.item?.title || `#${d.itemId}`}
                    </span>
                    <span className="absolute bottom-1 right-1.5 text-[8px] text-text-dim opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.fromUserId !== userId ? "🎁" : ""}
                    </span>
                  </>
                )}
              </div>
            );
          }

          return (
            <div className="grid grid-cols-4 gap-3">
              {gridItems}
            </div>
          );
        })()
      )}
    </div>
  );
}
