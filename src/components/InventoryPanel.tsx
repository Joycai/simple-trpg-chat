"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createInventoryItemAction, updateInventoryItemAction, distributeItemAction, getRoomItems, getDistributionHistory, getMyInventory, shareItemAction, markInventoryViewedAction, deleteInventoryItemAction } from "@/app/actions/inventory";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "./icons";

interface InventoryItem {
  id: number;
  type: "clue" | "info" | "character" | "item";
  title: string;
  contentJson: string;
  imageUrl: string | null;
  createdAt: string;
}

interface Distribution {
  id: number;
  itemId: number;
  fromUserId: number;
  toUserId: number;
  createdAt: string;
  action: string;
  viewed?: number | boolean | null;
  updated?: number | boolean | null;
  item?: InventoryItem;
  toUsername?: string;
  fromUsername?: string;
}

interface InventoryPanelProps {
  roomId: number;
  userId: number;
  isHost: boolean;
  players: { id: number; username: string; nickname: string }[];
  onClose: () => void;
  /** Bumped via SSE when an item is edited, so the panel reloads the synced content. */
  refreshKey?: number;
  readOnly?: boolean;
  /** Which view to show. "backpack" = personal items (player-aligned); "manage" = host item management. */
  view?: "backpack" | "manage";
}

export function InventoryPanel({ roomId, userId, isHost, players, onClose, refreshKey = 0, readOnly = false, view = "backpack" }: InventoryPanelProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose, "drawer");

  // Each entry point (背包 / 道具管理) opens a fixed view; the manage view requires host.
  const tab = view === "manage" && isHost ? "manage" : "backpack";
  const [filterType, setFilterType] = useState<"all" | "clue" | "info" | "character" | "item">("all");
  const [manageFilterType, setManageFilterType] = useState<"all" | "clue" | "info" | "character" | "item">("all");
  const [manageFilterDist, setManageFilterDist] = useState<"all" | "undistributed" | "distributed">("all");
  const [myItems, setMyItems] = useState<Distribution[]>([]);
  const [roomItems, setRoomItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Create / edit form state (shared form; editingItemId !== null means edit mode)
  const [showCreate, setShowCreate] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemType, setItemType] = useState<"clue" | "info" | "character" | "item">("info");
  const [title, setTitle] = useState("");
  const [contentFields, setContentFields] = useState({ text: "", basicInfo: "", detail: "", appearance: "", extra: "" });

  // Distribute state
  const [distributeTargets, setDistributeTargets] = useState<number[]>([]);
  const [distributeItemId, setDistributeItemId] = useState<number | null>(null);

  // Detail state
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [detailDist, setDetailDist] = useState<Distribution | null>(null);

  // Share state
  const [shareTarget, setShareTarget] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      if (isHost) {
        const [items, dists, mine] = await Promise.all([
          getRoomItems(roomId),
          getDistributionHistory(roomId),
          getMyInventory(roomId),
        ]);
        setRoomItems(items as InventoryItem[]);
        setHistory(dists as Distribution[]);
        setMyItems(mine as Distribution[]);
      } else {
        const mine = await getMyInventory(roomId);
        setMyItems(mine as Distribution[]);
      }
    } catch { /* */ }
    setLoading(false);
  };

  // On open: load the inventory FIRST (so freshly-received "new" and edited
  // "updated" copies still render their highlight this session), THEN acknowledge
  // them server-side so the next open is clean. Marking before the read would clear
  // the flags mid-race and the highlight would never appear.
  useEffect(() => {
    void (async () => {
      await loadData();
      await markInventoryViewedAction(roomId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-sync: reload when the host edits an item (refreshKey bumped via SSE in RoomClient).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (refreshKey > 0) void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Keep an open detail modal in sync after a live reload. The contentJson guard
  // prevents redundant state updates / render loops.
  useEffect(() => {
    if (!detailItem) return;
    const pool: InventoryItem[] = isHost ? roomItems : myItems.map((d) => d.item).filter((x): x is InventoryItem => !!x);
    const fresh = pool.find((it) => it && it.id === detailItem.id);
    if (fresh && (fresh.contentJson !== detailItem.contentJson || fresh.title !== detailItem.title || fresh.type !== detailItem.type)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetailItem(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomItems, myItems]);

  const resetForm = () => {
    setShowCreate(false);
    setEditingItemId(null);
    setItemType("info");
    setTitle("");
    setContentFields({ text: "", basicInfo: "", detail: "", appearance: "", extra: "" });
  };

  // Prefill the shared form from an existing item and switch it into edit mode.
  const startEdit = (item: InventoryItem) => {
    let c: Record<string, string> = {};
    try { c = JSON.parse(item.contentJson) || {}; } catch { /* */ }
    setEditingItemId(item.id);
    setItemType(item.type);
    setTitle(item.title);
    setContentFields({
      text: c.text || "",
      basicInfo: c.basicInfo || "",
      detail: c.detail || "",
      appearance: c.appearance || "",
      extra: c.extra || "",
    });
    setShowCreate(true);
    setDetailItem(null);
  };

  const handleSubmit = async () => {
    let contentJson: Record<string, string> = {};
    if (itemType === "clue") contentJson = { text: contentFields.text };
    else if (itemType === "info") contentJson = { text: contentFields.text };
    else if (itemType === "character") contentJson = { basicInfo: contentFields.basicInfo, detail: contentFields.detail };
    else contentJson = { appearance: contentFields.appearance, extra: contentFields.extra };

    const content = JSON.parse(JSON.stringify(contentJson));
    try {
      if (editingItemId !== null) {
        await updateInventoryItemAction(roomId, editingItemId, { type: itemType, title, content });
      } else {
        await createInventoryItemAction(roomId, { type: itemType, title, content });
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : tCommon("error"));
      return;
    }
    resetForm();
    router.refresh();
    void loadData();
  };

  const handleDistribute = async (targets: number[] | "all") => {
    if (!distributeItemId || !targets) return;
    try {
      if (targets === "all") {
        await distributeItemAction(roomId, distributeItemId, "all");
      } else {
        if (targets.length === 0) return;
        await Promise.all(targets.map(uid => distributeItemAction(roomId, distributeItemId, uid)));
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t("distributeFailed"));
    }
    setDistributeItemId(null);
    setDistributeTargets([]);
    router.refresh();
    void loadData();
  };

  const handleDeleteItem = async (itemId: number, itemTitle: string) => {
    const confirmMsg = t("deleteConfirm", { title: itemTitle });
    if (!confirm(confirmMsg)) return;
    try {
      await deleteInventoryItemAction(roomId, itemId);
      router.refresh();
      void loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    }
  };

  const handleShare = async (itemId: number) => {
    if (!shareTarget) return;
    try {
      await shareItemAction(roomId, itemId, shareTarget);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    }
    setShareTarget(null);
    setDetailItem(null);
    router.refresh();
    loadData();
  };

  const formatContent = (item: InventoryItem): string => {
    try {
      const c = JSON.parse(item.contentJson);
      if (item.type === "clue" || item.type === "info") return c.text || "";
      if (item.type === "character") return `${c.basicInfo || ""}\n${c.detail || ""}`;
      return `${c.appearance || ""}\n${c.extra || ""}`;
    } catch { return item.contentJson; }
  };

  const typeLabel = (tStr: string) => ({ clue: t("typeClue"), info: t("typeInfo"), character: t("typeChar"), item: t("typeItem") }[tStr] || tStr);
  const typeTabLabel = (tStr: string) => ({ clue: t("tabClue"), info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[tStr] || tStr);
  const typeEmoji = (tStr: string) => ({ clue: "🃏", info: "📄", character: "👤", item: "🎒" }[tStr] || "📦");
  // Unread = freshly received OR edited-since-viewed. `updated` distinguishes the two
  // so the backpack can flag a host edit differently from a brand-new hand-off.
  const isUnread = (d: { viewed?: boolean | number | null }) => d.viewed === false || d.viewed === 0;
  const isUpdated = (d: { updated?: boolean | number | null }) => d.updated === true || d.updated === 1;
  const isNew = (d: { viewed?: boolean | number | null; updated?: boolean | number | null }) => isUnread(d) && !isUpdated(d);

  // Filter backpack dynamically
  const filteredBackpack = myItems.filter(d => {
    const item = d.item;
    if (filterType === "all") return true;
    return item?.type === filterType;
  });

  return (
    <div className="fixed inset-0 z-50 flex font-theme" onClick={close}>
      <div className={`absolute inset-0 bg-black/30 ${backdropClass}`} />
      <div className={`relative ml-auto w-full sm:w-96 bg-surface border-l border-border shadow-2xl h-full overflow-y-auto ${panelClass}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">{tab === "manage" ? t("tabManage") : t("tabBackpack")}</h3>
          <button onClick={close} className="text-text-muted hover:text-text text-xl transition cursor-pointer">×</button>
        </div>

        <div className="p-5">
          {loading ? (
            tab === "manage" && isHost ? <ManageSkeleton /> : <BackpackSkeleton />
          ) : tab === "manage" && isHost ? (
            /* === KP MANAGEMENT VIEW === */
            <div className="flex flex-col gap-5">
              {/* Create button — opens the create modal */}
              <button onClick={() => { resetForm(); setShowCreate(true); }}
                className="w-full flex items-center justify-center gap-1.5 bg-success hover:bg-primary-hover text-white py-3 rounded-theme font-bold transition cursor-pointer">
                <Icons.Plus className="w-4 h-4" /> {t("createItem")}
              </button>

              {/* Quick Filters */}
              <div className="flex flex-col gap-2.5 bg-surface-alt/50 border border-border/40 rounded-theme p-3 theme-border shadow-sm mb-2">
                <div className="flex gap-1.5 items-center">
                  <span className="text-[11px] font-bold text-text-dim w-10 shrink-0">{t("typeFilter")}</span>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setManageFilterType("all")}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all duration-200 cursor-pointer ${
                        manageFilterType === "all" 
                          ? "bg-primary text-primary-foreground shadow-sm filter-tab-active" 
                          : "bg-surface text-text-muted hover:text-text border border-border/50"
                      }`}>
                      {t("filterAll")}
                    </button>
                    {(["clue", "info", "character", "item"] as const).map(typeKey => (
                      <button key={typeKey} onClick={() => setManageFilterType(typeKey)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all duration-200 cursor-pointer ${
                          manageFilterType === typeKey
                            ? "bg-primary text-primary-foreground shadow-sm filter-tab-active"
                            : "bg-surface text-text-muted hover:text-text border border-border/50"
                        }`}>
                        {typeTabLabel(typeKey)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1.5 items-center">
                  <span className="text-[11px] font-bold text-text-dim w-10 shrink-0">{t("statusFilter")}</span>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setManageFilterDist("all")}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all duration-200 cursor-pointer ${
                        manageFilterDist === "all" 
                          ? "bg-primary text-primary-foreground shadow-sm filter-tab-active" 
                          : "bg-surface text-text-muted hover:text-text border border-border/50"
                      }`}>
                      {t("filterAll")}
                    </button>
                    <button onClick={() => setManageFilterDist("undistributed")}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all duration-200 cursor-pointer ${
                        manageFilterDist === "undistributed" 
                          ? "bg-success text-white shadow-sm" 
                          : "bg-surface text-text-muted hover:text-text border border-border/50"
                      }`}>
                      {t("filterUnsent")}
                    </button>
                    <button onClick={() => setManageFilterDist("distributed")}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all duration-200 cursor-pointer ${
                        manageFilterDist === "distributed" 
                          ? "bg-accent text-accent-foreground shadow-sm" 
                          : "bg-surface text-text-muted hover:text-text border border-border/50"
                      }`}>
                      {t("filterSent")}
                    </button>
                  </div>
                </div>
              </div>

              {/* Room items for distribution */}
              <div>
                <h4 className="text-xs text-text-dim font-medium mb-2 uppercase tracking-wider">{t("listHeader")}</h4>
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

                        return (
                          <div key={item.id} className={`rounded-theme border inventory-card transition-colors duration-200 ${
                            !hasBeenDistributed
                              ? "border-success/40 bg-success/5"
                              : "border-border bg-surface-alt hover:border-primary/30"
                          }`}>
                            {/* Info — click to view full detail */}
                            <div className="p-3 cursor-pointer" onClick={() => setDetailItem(item)}>
                              <div className="flex items-start gap-2.5">
                                <span className="text-lg leading-none mt-0.5 shrink-0">{typeEmoji(item.type)}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-sm font-bold text-text truncate">{item.title}</span>
                                    {!hasBeenDistributed ? (
                                      <span className="shrink-0 bg-success/15 text-success text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-success/30 select-none">
                                        {t("statusUnsent")}
                                      </span>
                                    ) : (
                                      <span className="shrink-0 bg-primary/10 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-primary/20 select-none">
                                        {t("statusSentCount", { count: distCount })}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-text-dim mt-0.5">{typeLabel(item.type)}</div>
                                  <div className="text-xs text-text-muted line-clamp-2 mt-1">{formatContent(item).slice(0, 80)}</div>
                                  {uniqueRecipients.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2 items-center">
                                      <span className="text-[10px] text-text-dim">{t("holders")}</span>
                                      {uniqueRecipients.slice(0, 3).map((hName, hIdx) => (
                                        <span key={hIdx} className="bg-surface text-text-muted text-[9px] px-1.5 py-0.5 rounded border border-border/50 font-medium max-w-[80px] truncate">
                                          👤 {hName}
                                        </span>
                                      ))}
                                      {uniqueRecipients.length > 3 && (
                                        <span className="text-[9px] text-text-dim leading-none ml-0.5">
                                          {t("holdersOthers", { count: uniqueRecipients.length })}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* Actions — separated from the info above */}
                            <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border/40">
                              <button onClick={() => { setDistributeItemId(item.id); setDistributeTargets([]); }}
                                className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary py-1.5 rounded-md text-xs font-bold transition cursor-pointer">
                                <Icons.Send className="w-3.5 h-3.5" /> {t("distribute")}
                              </button>
                              <button onClick={() => startEdit(item)} title={t("edit")}
                                className="flex items-center justify-center px-2.5 py-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent/10 transition cursor-pointer">
                                <Icons.Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteItem(item.id, item.title)} title={t("delete")}
                                className="flex items-center justify-center px-2.5 py-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition cursor-pointer">
                                <Icons.Trash2 className="w-3.5 h-3.5" />
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
                        <span className="ml-2 text-text-dim">{h.action === "shared" ? `🔄${t("logShared")}` : `📤${t("logSent")}`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* === PLAYER BACKPACK VIEW (Unified RPG Grid with Filters) === */
            <div className="flex flex-col gap-4">
              {/* Filter Pills */}
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setFilterType("all")}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                    filterType === "all"
                      ? "bg-primary text-primary-foreground shadow-sm filter-tab-active"
                      : "bg-surface-alt text-text-muted hover:text-text border border-border/50"
                  }`}>
                  {t("filterAll")}
                </button>
                {(["clue", "info", "character", "item"] as const).map(typeKey => (
                  <button key={typeKey} onClick={() => setFilterType(typeKey)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                      filterType === typeKey
                        ? "bg-primary text-primary-foreground shadow-sm filter-tab-active"
                        : "bg-surface-alt text-text-muted hover:text-text border border-border/50"
                    }`}>
                    {typeTabLabel(typeKey)}
                  </button>
                ))}
              </div>

              {filteredBackpack.length === 0 ? (
                <div className="text-center text-text-muted py-12 text-sm">
                  <div className="text-4xl mb-3 opacity-30">🎒</div>
                  <p>{t("emptyBackpack", { type: filterType === "all" ? "" : typeTabLabel(filterType) })}</p>
                  <p className="text-xs mt-1 opacity-60">{t("waitingKp")}</p>
                </div>
              ) : (
                (() => {
                  const GRID_COLS = 4;
                  // Render minimum 12 slots for RPG grid layout
                  const totalSlots = Math.max(12, Math.ceil(filteredBackpack.length / GRID_COLS) * GRID_COLS);
                  const gridItems = [];

                  for (let i = 0; i < totalSlots; i++) {
                    const d = i < filteredBackpack.length ? filteredBackpack[i] : null;
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
                        onClick={() => { if (d) { setDetailItem(d.item ?? null); setDetailDist(d); } }}
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
          )}

          {/* === CREATE / EDIT MODAL === */}
          {showCreate && (
            <Portal>
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overlay-backdrop" onClick={resetForm}>
              <div className="bg-surface rounded-theme theme-border p-6 max-w-md w-full mx-4 max-h-[88vh] overflow-y-auto shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg text-text">{editingItemId !== null ? t("editItem") : t("createItem")}</h3>
                  <button onClick={resetForm} className="text-text-muted hover:text-text text-xl leading-none cursor-pointer">×</button>
                </div>
                <div className="flex flex-col gap-3">
                  <select value={itemType} onChange={e => setItemType(e.target.value as typeof itemType)}
                    className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary">
                    <option value="clue">{t("typeClue")}</option>
                    <option value="info">{t("typeInfo")}</option>
                    <option value="character">{t("typeChar")}</option>
                    <option value="item">{t("typeItem")}</option>
                  </select>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder={t("titlePlaceholder")} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
                  {(itemType === "clue" || itemType === "info") && (
                    <textarea value={contentFields.text} onChange={e => setContentFields({...contentFields, text: e.target.value})}
                      placeholder={t("contentPlaceholder")} rows={4} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
                  )}
                  {itemType === "character" && (<>
                    <textarea value={contentFields.basicInfo} onChange={e => setContentFields({...contentFields, basicInfo: e.target.value})}
                      placeholder={t("basicInfoPlaceholder")} rows={2} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
                    <textarea value={contentFields.detail} onChange={e => setContentFields({...contentFields, detail: e.target.value})}
                      placeholder={t("detailPlaceholder")} rows={4} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
                  </>)}
                  {itemType === "item" && (<>
                    <textarea value={contentFields.appearance} onChange={e => setContentFields({...contentFields, appearance: e.target.value})}
                      placeholder={t("appearancePlaceholder")} rows={2} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
                    <textarea value={contentFields.extra} onChange={e => setContentFields({...contentFields, extra: e.target.value})}
                      placeholder={t("extraPlaceholder")} rows={3} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
                  </>)}
                  <div className="flex gap-2 mt-1">
                    <button onClick={resetForm} className="flex-1 px-3 py-2 rounded-md text-text-muted hover:text-text hover:bg-surface-alt text-sm font-bold cursor-pointer transition">{tCommon("cancel")}</button>
                    <button onClick={handleSubmit} disabled={!title}
                      className="flex-1 bg-success hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded-md font-bold text-sm cursor-pointer transition">{t("confirm")}</button>
                  </div>
                </div>
              </div>
            </div>
            </Portal>
          )}

          {/* === DISTRIBUTE MODAL === */}
          {distributeItemId !== null && (() => {
            const distItem = roomItems.find(it => it.id === distributeItemId);
            const otherPlayers = players.filter(p => p.id !== userId);
            return (
              <Portal>
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overlay-backdrop"
                onClick={() => { setDistributeItemId(null); setDistributeTargets([]); }}>
                <div className="bg-surface rounded-theme theme-border p-6 max-w-md w-full mx-4 shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-lg text-text">{t("selectTarget")}</h3>
                      {distItem && <p className="text-xs text-text-muted truncate mt-0.5">{typeEmoji(distItem.type)} {distItem.title}</p>}
                    </div>
                    <button onClick={() => { setDistributeItemId(null); setDistributeTargets([]); }} className="text-text-muted hover:text-text text-xl leading-none cursor-pointer shrink-0">×</button>
                  </div>

                  {/* Distribute to all */}
                  <button type="button" onClick={() => handleDistribute("all")}
                    className="w-full bg-accent hover:bg-accent-hover text-accent-foreground py-2 rounded-md font-bold text-sm cursor-pointer transition flex items-center justify-center gap-1.5 shadow-sm">
                    {t("distributeAll")}
                  </button>

                  <div className="flex items-center gap-2 text-text-dim text-[11px] my-3">
                    <span className="h-px bg-border flex-1"></span>
                    <span>{t("selectMultipleHint")}</span>
                    <span className="h-px bg-border flex-1"></span>
                  </div>

                  {/* Player list */}
                  <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto pr-1">
                    {otherPlayers.map(p => {
                      const isSelected = distributeTargets.includes(p.id);
                      const toggle = () => setDistributeTargets(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]);
                      return (
                        <div key={p.id} role="checkbox" aria-checked={isSelected} tabIndex={0}
                          onClick={toggle}
                          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}
                          className={`flex justify-between items-center py-2 px-3 rounded-md text-sm text-left border cursor-pointer select-none transition ${
                            isSelected ? "bg-primary/10 border-primary/40 text-primary font-medium" : "bg-surface border-border/60 text-text hover:bg-surface-alt"
                          }`}>
                          <span>👤 {p.nickname || p.username}</span>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${isSelected ? "bg-primary border-primary text-white" : "border-input-border bg-input-bg"}`}>
                            {isSelected && "✓"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                    <button type="button" onClick={() => { setDistributeItemId(null); setDistributeTargets([]); }}
                      className="flex-1 py-2 rounded-md text-xs font-bold text-text-muted hover:text-text hover:bg-surface-alt cursor-pointer transition">
                      {tCommon("cancel")}
                    </button>
                    <button type="button" onClick={() => handleDistribute(distributeTargets)} disabled={distributeTargets.length === 0}
                      className="flex-1 bg-success hover:bg-success/90 disabled:opacity-40 text-white py-2 rounded-md font-bold text-xs cursor-pointer transition">
                      {t("distributeConfirm", { count: distributeTargets.length })}
                    </button>
                  </div>
                </div>
              </div>
              </Portal>
            );
          })()}

          {/* === ITEM DETAIL MODAL === */}
          {detailItem && (
            <Portal>
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overlay-backdrop" onClick={() => { setDetailItem(null); setShareTarget(null); }}>
              <div className="bg-surface rounded-theme theme-border p-6 max-w-md w-full mx-4 shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs text-text-muted">{typeLabel(detailItem.type)}</span>
                    <h3 className="font-bold text-lg text-text">{detailItem.title}</h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isHost && !detailDist && (
                      <button onClick={() => startEdit(detailItem)}
                        className="bg-surface-alt hover:bg-surface text-text border border-border px-2.5 py-1 rounded text-xs font-bold cursor-pointer">
                        {t("edit")}
                      </button>
                    )}
                    <button onClick={() => { setDetailItem(null); setShareTarget(null); }} className="text-text-muted hover:text-text cursor-pointer text-lg leading-none">×</button>
                  </div>
                </div>

                <div className="bg-surface-alt rounded-theme p-4 text-sm text-text whitespace-pre-wrap border border-border item-detail-panel">
                  {formatContent(detailItem)}
                </div>

                {detailItem.imageUrl && (
                  <div className="mt-3 p-2 bg-surface-alt rounded border border-border text-xs text-text-muted">
                    {t("imgPlaceholder", { url: detailItem.imageUrl })}
                  </div>
                )}

                {/* Host view: Distribution History */}
                {isHost && (
                  (() => {
                    const itemDists = history.filter((h) => h.itemId === detailItem.id);
                    return (
                      <div className="mt-4 pt-4 border-t border-border">
                        <h4 className="text-xs font-bold text-text-dim uppercase tracking-wider mb-3">{t("historyCount", { count: itemDists.length })}</h4>
                        {itemDists.length === 0 ? (
                          <div className="text-center py-4 bg-surface-alt rounded-theme border border-dashed border-border/50">
                            <p className="text-xs text-text-muted">{t("historyEmpty")}</p>
                            <button onClick={() => { setDistributeItemId(detailItem.id); setDistributeTargets([]); setDetailItem(null); }}
                              className="mt-2 bg-primary hover:bg-primary-hover text-white text-[11px] font-bold px-3 py-1.5 rounded cursor-pointer transition">
                              {t("distributeNow")}
                            </button>
                          </div>
                        ) : (
                          <div className="relative border-l border-border pl-4 ml-2 flex flex-col gap-4 max-h-48 overflow-y-auto pr-1 py-1">
                            {itemDists.map((d) => (
                              <div key={d.id} className="relative text-xs">
                                {/* Timeline Bullet */}
                                <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-surface shadow-sm"></span>
                                
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="font-semibold text-text">
                                      {d.toUsername || `#${d.toUserId}`}
                                    </span>
                                    <span className="text-[10px] text-text-muted ml-2">
                                      {d.action === "shared" ? t("sharedGain") : t("sentGain")}
                                    </span>
                                  </div>
                                  <span className="text-[9px] text-text-dim bg-surface-alt px-1.5 py-0.5 rounded border border-border/40">
                                    {new Date(d.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                {d.fromUsername && d.fromUserId !== userId && (
                                  <p className="text-[10px] text-text-dim mt-0.5">
                                    {t("fromPlayer", { name: d.fromUsername || "" })}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}

                {/* Share section */}
                {detailDist && !readOnly && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <h4 className="text-sm font-bold text-text mb-2">{t("shareToOthers")}</h4>
                    {!shareTarget ? (
                      <div className="flex flex-col gap-1">
                        {players.filter(p => p.id !== userId).map(p => (
                          <button key={p.id} onClick={() => setShareTarget(p.id)}
                            className="text-left px-3 py-2 rounded hover:bg-surface-alt text-text text-sm transition cursor-pointer">
                            👤 {p.nickname || p.username}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <span className="text-sm text-text">{t("shareConfirmHint", { name: players.find(p => p.id === shareTarget)?.nickname || "" })}</span>
                        <button onClick={() => handleShare(detailDist.itemId)}
                          className="bg-accent hover:bg-accent-hover text-accent-foreground px-3 py-1.5 rounded text-xs font-bold cursor-pointer">{t("confirm")}</button>
                        <button onClick={() => setShareTarget(null)} className="text-xs text-text-muted cursor-pointer">{t("cancel")}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            </Portal>
          )}
        </div>
      </div>
    </div>
  );
}

/* Renders children at document.body so nested fixed-position modals are sized
   to the viewport, not the drawer panel. The drawer uses transform/will-change
   for its slide animation, which would otherwise become the containing block
   for `position: fixed` and trap the modals inside the sidebar's width. */
function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/* Loading placeholders — content-shaped grey skeletons shown while the panel
   fetches data, so opening it never flashes a blank/empty drawer. The shapes
   mirror the real layouts to avoid a jump when content swaps in. */
function BackpackSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-14 rounded-full bg-border/70 animate-pulse" />
        ))}
      </div>
      {/* Item grid */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-theme bg-surface-alt border border-border/60 flex flex-col items-center justify-center gap-2 p-2 animate-pulse"
            style={{ animationDelay: `${(i % 4) * 80}ms` }}>
            <div className="w-7 h-7 rounded-full bg-border/70" />
            <div className="h-2 w-9 rounded bg-border/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ManageSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      {/* Create button */}
      <div className="h-11 w-full rounded-theme bg-border/70 animate-pulse" />
      {/* Filters card */}
      <div className="rounded-theme border border-border/40 bg-surface-alt/50 p-3 flex flex-col gap-2.5">
        {[5, 3].map((count, row) => (
          <div key={row} className="flex gap-1.5 items-center">
            <div className="h-3 w-10 rounded bg-border/60 animate-pulse shrink-0" />
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="h-6 w-12 rounded-full bg-border/60 animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* List rows */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface-alt rounded-theme p-3 border border-border flex justify-between items-center gap-3 animate-pulse"
            style={{ animationDelay: `${i * 90}ms` }}>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="h-3.5 w-2/3 rounded bg-border/70" />
              <div className="h-2.5 w-1/2 rounded bg-border/60" />
            </div>
            <div className="flex gap-2 shrink-0">
              <div className="h-7 w-11 rounded bg-border/70" />
              <div className="h-7 w-11 rounded bg-border/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
