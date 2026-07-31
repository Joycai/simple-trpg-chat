"use client";

import { useTranslations } from "next-intl";
import { LayoutGrid, Package, Share2 } from "lucide-react";
import { isUnread, isUpdated, isNew, typeIcon, typeColorClass, type InventoryItem, type Distribution, type InventoryItemType } from "./inventory-helpers";
import { useHostLabel } from "@/components/shared/host-label";
import { PaneTransition } from "@/components/shared/PaneTransition";

interface BackpackViewProps {
  filteredItems: Distribution[];
  filterType: "all" | InventoryItemType;
  onFilterChange: (v: "all" | InventoryItemType) => void;
  userId: number;
  onSelect: (item: InventoryItem | null, dist: Distribution) => void;
}

export function BackpackView({ filteredItems, filterType, onFilterChange, userId, onSelect }: BackpackViewProps) {
  const t = useTranslations("inventory");
  const hostLabel = useHostLabel();
  const typeTabLabel = (tStr: string) => ({ clue: t("tabClue"), info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[tStr] || tStr);

  // Categories carry their own icon/colour from the shared item maps, so the
  // rail reads the same as the item cards it filters.
  const categories = [
    { key: "all" as const, label: t("filterAll"), Icon: LayoutGrid },
    ...(["clue", "info", "character", "item"] as const).map((k) => ({
      key: k,
      label: typeTabLabel(k),
      Icon: typeIcon[k],
    })),
  ];

  return (
    /* === PLAYER BACKPACK VIEW (Unified RPG Grid + category rail) ===
       Rail left / grid right on desktop; the drawer goes full-width below the
       `sm` breakpoint, where there is no room to sit beside the grid, so the
       rail folds into a horizontally scrollable strip above it. Same shape as
       the settings panels' tab rail. */
    <div className="flex flex-col sm:flex-row sm:min-h-full gap-3 sm:gap-4">
      {/* `sm:min-h-full` (with the flex row's default stretch) is what runs the
          divider the whole height of the drawer body rather than stopping under
          the last bookmark. Needs InventoryPanel's body to have a definite
          height — it is `flex-1 min-h-0` there. */}
      <div className="flex sm:flex-col gap-1.5 shrink-0 overflow-x-auto sm:overflow-x-visible scrollbar-none border-b sm:border-b-0 sm:border-r border-border pb-2 sm:pb-0">
        {categories.map(({ key, label, Icon }) => {
          const active = filterType === key;
          return (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              aria-pressed={active}
              /* Bookmark: vertical text on desktop, flush against the divider
                 so it reads as a tab on the edge of a page. `-mr-px` pulls the
                 active tab over the divider line so the two visually join.
                 The vertical writing mode and the flattened right corners come
                 from `.backpack-bookmark` in globals.css — see the comment
                 there for why they cannot be Tailwind utilities. */
              className={`backpack-bookmark flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-all duration-150 text-xs sm:text-sm font-medium border
                px-2.5 py-2 rounded-theme
                sm:px-2 sm:py-4 sm:-mr-px ${
                active
                  ? "text-primary bg-primary/10 border-primary/40 font-semibold"
                  : "text-text-muted border-transparent hover:text-text hover:bg-surface-alt/50"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-text-dim"}`} />
              <span className="tracking-wide">{label}</span>
            </button>
          );
        })}
      </div>

      {/* min-w-0 so the grid can shrink inside the flex row instead of
          overflowing the drawer. */}
      <div className="flex-1 min-w-0">
      <PaneTransition paneKey={filterType}>
      {filteredItems.length === 0 ? (
        <div className="text-center text-text-muted py-12 text-sm">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{t("emptyBackpack", { type: filterType === "all" ? "" : typeTabLabel(filterType) })}</p>
          <p className="text-xs mt-1 opacity-60">{t("waitingKp", { host: hostLabel })}</p>
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
      </PaneTransition>
      </div>
    </div>
  );
}
