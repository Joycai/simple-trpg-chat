"use client";

import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { formatContent, typeIcon, typeColorClass, type InventoryItem, type Distribution, type InventoryItemType } from "./inventory-helpers";

interface ManageViewProps {
  roomItems: InventoryItem[];
  history: Distribution[];
  manageFilterType: "all" | InventoryItemType;
  onManageFilterTypeChange: (v: "all" | InventoryItemType) => void;
  manageFilterDist: "all" | "undistributed" | "distributed";
  onManageFilterDistChange: (v: "all" | "undistributed" | "distributed") => void;
  onCreateClick: () => void;
  onViewDetail: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (itemId: number, itemTitle: string) => void;
  onDistribute: (itemId: number) => void;
}

export function ManageView({
  roomItems, history, manageFilterType, onManageFilterTypeChange,
  manageFilterDist, onManageFilterDistChange, onCreateClick,
  onViewDetail, onEdit, onDelete, onDistribute,
}: ManageViewProps) {
  const t = useTranslations("inventory");
  const typeTabLabel = (tStr: string) => ({ clue: t("tabClue"), info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[tStr] || tStr);

  // Filter pill: active = filled (cyan, or green for the "unsent" tone); inactive = ghost.
  const pillCls = (active: boolean, tone: "primary" | "success" = "primary") => {
    const base = "px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition";
    if (active) return tone === "success"
      ? `${base} bg-success text-primary-foreground`
      : `${base} bg-primary text-primary-foreground shadow-[var(--theme-glow)]`;
    return tone === "success"
      ? `${base} text-success border border-success/40 bg-transparent hover:bg-success/10`
      : `${base} text-text-muted border border-border bg-transparent hover:text-text hover:bg-surface-alt`;
  };

  return (
    /* === KP MANAGEMENT VIEW === */
    <div className="flex flex-col gap-5">
      {/* Create button — opens the create modal */}
      <button onClick={onCreateClick}
        className="btn-primary w-full flex items-center justify-center gap-1.5 bg-gradient-to-b from-success to-success/80 text-primary-foreground py-3 rounded-theme font-bold transition hover:brightness-110 cursor-pointer shadow-[0_0_16px_rgb(var(--theme-success)/0.35)]">
        <Icons.Plus className="w-4 h-4" /> {t("createItem")}
      </button>

      {/* Quick Filters */}
      <div className="flex flex-col gap-3 bg-surface-alt/40 border border-border rounded-theme p-4">
        <div className="flex gap-2 items-center">
          <span className="text-xs font-bold text-text-dim w-10 shrink-0">{t("typeFilter")}</span>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => onManageFilterTypeChange("all")} className={pillCls(manageFilterType === "all")}>{t("filterAll")}</button>
            {(["clue", "info", "character", "item"] as const).map(typeKey => (
              <button key={typeKey} onClick={() => onManageFilterTypeChange(typeKey)} className={pillCls(manageFilterType === typeKey)}>
                {typeTabLabel(typeKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs font-bold text-text-dim w-10 shrink-0">{t("statusFilter")}</span>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => onManageFilterDistChange("all")} className={pillCls(manageFilterDist === "all")}>{t("filterAll")}</button>
            <button onClick={() => onManageFilterDistChange("undistributed")} className={pillCls(manageFilterDist === "undistributed", "success")}>{t("filterUnsent")}</button>
            <button onClick={() => onManageFilterDistChange("distributed")} className={pillCls(manageFilterDist === "distributed")}>{t("filterSent")}</button>
          </div>
        </div>
      </div>

      {/* Room items for distribution */}
      <div>
        {(() => {
          const filteredRoomItems = roomItems.filter(item => {
            if (manageFilterType !== "all" && item.type !== manageFilterType) return false;
            const distCount = history.filter((h) => h.itemId === item.id).length;
            if (manageFilterDist === "undistributed" && distCount > 0) return false;
            if (manageFilterDist === "distributed" && distCount === 0) return false;
            return true;
          });

          if (filteredRoomItems.length === 0) {
            return <p className="text-sm text-text-muted py-4 text-center">{t("emptyList")}</p>;
          }

          const sortedRoomItems = [...filteredRoomItems].sort((a, b) => {
            const countA = history.filter((h) => h.itemId === a.id).length;
            const countB = history.filter((h) => h.itemId === b.id).length;

            if (countA === 0 && countB > 0) return -1;
            if (countA > 0 && countB === 0) return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          return (
            <div className="flex flex-col gap-2">
              {sortedRoomItems.map(item => {
                const itemHistory = history.filter((h) => h.itemId === item.id);
                const distCount = itemHistory.length;
                const hasBeenDistributed = distCount > 0;
                const uniqueRecipients = Array.from(new Set(itemHistory.map((h) => h.toUsername).filter(Boolean)));

                const TypeIcon = typeIcon[item.type];
                return (
                  <div key={item.id} className={`rounded-theme border inventory-card transition-colors duration-200 ${
                    !hasBeenDistributed
                      ? "border-success/40 bg-success/5 shadow-[0_0_14px_rgb(var(--theme-success)/0.12)]"
                      : "border-border bg-surface-alt hover:border-primary/30"
                  }`}>
                    {/* Info — click to view full detail */}
                    <div className="p-4 cursor-pointer" onClick={() => onViewDetail(item)}>
                      <div className="flex items-start gap-2.5">
                        <TypeIcon className={`w-5 h-5 mt-0.5 shrink-0 ${typeColorClass[item.type]}`} strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-bold text-text truncate">{item.title}</span>
                            {!hasBeenDistributed ? (
                              <span className="shrink-0 bg-success/15 text-success text-[10px] font-bold px-2 py-0.5 rounded-full border border-success/30 select-none">
                                {t("statusUnsent")}
                              </span>
                            ) : (
                              <span className="shrink-0 bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full border border-primary/30 select-none">
                                {t("statusSentCount", { count: distCount })}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted line-clamp-2 mt-1.5">{formatContent(item).slice(0, 80)}</div>
                          {uniqueRecipients.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
                              <span className="text-[10px] text-text-dim">{t("holders")}</span>
                              {uniqueRecipients.slice(0, 3).map((hName, hIdx) => (
                                <span key={hIdx} className="inline-flex items-center gap-1 bg-surface text-text-muted text-[10px] px-2 py-0.5 rounded-theme border border-border font-medium max-w-[90px] truncate">
                                  <Icons.User className="w-3 h-3 shrink-0" /> {hName}
                                </span>
                              ))}
                              {uniqueRecipients.length > 3 && (
                                <span className="text-[10px] text-text-dim leading-none ml-0.5">
                                  {t("holdersOthers", { count: uniqueRecipients.length })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Actions — separated from the info above */}
                    <div className="flex items-center gap-2 px-4 py-3 border-t border-border/40">
                      <button onClick={() => onDistribute(item.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 py-2 rounded-theme text-sm font-bold transition cursor-pointer">
                        <Icons.Send className="w-4 h-4" /> {t("distribute")}
                      </button>
                      <button onClick={() => onEdit(item)} title={t("edit")}
                        className="flex items-center justify-center w-9 h-9 rounded-theme text-text-muted hover:text-accent hover:bg-accent/10 transition cursor-pointer">
                        <Icons.Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => onDelete(item.id, item.title)} title={t("delete")}
                        className="flex items-center justify-center w-9 h-9 rounded-theme text-text-muted hover:text-danger hover:bg-danger/10 transition cursor-pointer">
                        <Icons.Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* History */}
      <div>
        <h4 className="text-xs text-text-dim font-medium mb-2 uppercase tracking-wider">{t("distributeHistory")}</h4>
        {history.length === 0 ? (
          <p className="text-sm text-text-muted">{t("emptyHistory")}</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
            {history.map(h => (
              <div key={h.id} className="text-xs text-text-muted py-1 border-b border-border/50">
                <span className="font-bold text-text">{h.item?.title || `#${h.itemId}`}</span>
                {" → "}
                <span>{h.toUsername || `#${h.toUserId}`}</span>
                <span className="ml-2 text-text-dim">{h.action === "shared" ? t("logShared") : t("logSent")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
