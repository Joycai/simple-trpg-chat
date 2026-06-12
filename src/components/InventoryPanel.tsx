"use client";

import { useState, useEffect } from "react";
import { createInventoryItemAction, distributeItemAction, getRoomItems, getDistributionHistory, getMyInventory, shareItemAction, markInventoryViewedAction, deleteInventoryItemAction } from "@/app/actions/inventory";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

interface InventoryItem {
  id: number;
  type: "info" | "character" | "item";
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
}

export function InventoryPanel({ roomId, userId, isHost, players, onClose }: InventoryPanelProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [tab, setTab] = useState<string>(isHost ? "manage" : "backpack");
  const [filterType, setFilterType] = useState<"all" | "info" | "character" | "item">("all");
  const [manageFilterType, setManageFilterType] = useState<"all" | "info" | "character" | "item">("all");
  const [manageFilterDist, setManageFilterDist] = useState<"all" | "undistributed" | "distributed">("all");
  const [myItems, setMyItems] = useState<any[]>([]);
  const [roomItems, setRoomItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Mark all as viewed when opening the panel
  useEffect(() => {
    markInventoryViewedAction(roomId);
  }, [roomId]);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [itemType, setItemType] = useState<"info" | "character" | "item">("info");
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
        setRoomItems(items as any[]);
        setHistory(dists as any[]);
        setMyItems(mine as any[]);
      } else {
        const mine = await getMyInventory(roomId);
        setMyItems(mine as any[]);
      }
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleCreate = async () => {
    let contentJson: Record<string, string> = {};
    if (itemType === "info") contentJson = { text: contentFields.text };
    else if (itemType === "character") contentJson = { basicInfo: contentFields.basicInfo, detail: contentFields.detail };
    else contentJson = { appearance: contentFields.appearance, extra: contentFields.extra };

    await createInventoryItemAction(roomId, { type: itemType, title, content: JSON.parse(JSON.stringify(contentJson)) });
    setShowCreate(false);
    setTitle("");
    setContentFields({ text: "", basicInfo: "", detail: "", appearance: "", extra: "" });
    router.refresh();
    loadData();
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
    } catch (err: any) {
      alert(err.message || t("distributeFailed"));
    }
    setDistributeItemId(null);
    setDistributeTargets([]);
    router.refresh();
    loadData();
  };

  const handleDeleteItem = async (itemId: number, itemTitle: string) => {
    const confirmMsg = t("deleteConfirm", { title: itemTitle });
    if (!confirm(confirmMsg)) return;
    try {
      await deleteInventoryItemAction(roomId, itemId);
      router.refresh();
      loadData();
    } catch (err: any) {
      alert(err.message || tCommon("error"));
    }
  };

  const handleShare = async (itemId: number) => {
    if (!shareTarget) return;
    try {
      await shareItemAction(roomId, itemId, shareTarget);
    } catch (err: any) {
      alert(err.message || tCommon("error"));
    }
    setShareTarget(null);
    setDetailItem(null);
    router.refresh();
    loadData();
  };

  const formatContent = (item: InventoryItem): string => {
    try {
      const c = JSON.parse(item.contentJson);
      if (item.type === "info") return c.text || "";
      if (item.type === "character") return `${c.basicInfo || ""}\n${c.detail || ""}`;
      return `${c.appearance || ""}\n${c.extra || ""}`;
    } catch { return item.contentJson; }
  };

  const typeLabel = (tStr: string) => ({ info: t("typeInfo"), character: t("typeChar"), item: t("typeItem") }[tStr] || tStr);
  const typeTabLabel = (tStr: string) => ({ info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[tStr] || tStr);
  const typeEmoji = (tStr: string) => ({ info: "📄", character: "👤", item: "🎒" }[tStr] || "📦");
  const isNew = (d: any) => d.viewed === false || d.viewed === 0;

  // Filter backpack dynamically
  const filteredBackpack = myItems.filter(d => {
    const item = (d as any).item as InventoryItem | undefined;
    if (filterType === "all") return true;
    return item?.type === filterType;
  });

  return (
    <div className="fixed inset-0 z-50 flex font-theme" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative ml-auto w-full sm:w-96 bg-surface border-l border-border shadow-2xl h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">{t("title")}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl transition cursor-pointer">×</button>
        </div>

        {/* Tabs (host only) */}
        {isHost && (
          <div className="flex border-b border-border">
            <button onClick={() => setTab("manage")}
              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${tab === "manage" ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-text-muted hover:text-text"}`}>
              ⚙️ {t("tabManage")}
            </button>
            <button onClick={() => setTab("backpack")}
              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${tab === "backpack" ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-text-muted hover:text-text"}`}>
              🎒 {t("tabBackpack")}
            </button>
          </div>
        )}

        <div className="p-5">
          {loading ? (
            <div className="text-center text-text-muted py-8">{tCommon("loading")}</div>
          ) : tab === "manage" && isHost ? (
            /* === KP MANAGEMENT VIEW === */
            <div className="flex flex-col gap-5">
              {/* Create button */}
              {!showCreate ? (
                <button onClick={() => setShowCreate(true)}
                  className="w-full bg-success hover:bg-primary-hover text-white py-3 rounded-theme font-bold transition cursor-pointer">
                  ＋ {t("createItem")}
                </button>
              ) : (
                <div className="bg-surface-alt rounded-theme theme-border p-4 border border-border flex flex-col gap-3">
                  <h4 className="font-bold text-text text-sm">{t("createItem")}</h4>
                  <select value={itemType} onChange={e => setItemType(e.target.value as any)}
                    className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none">
                    <option value="info">{t("typeInfo")}</option>
                    <option value="character">{t("typeChar")}</option>
                    <option value="item">{t("typeItem")}</option>
                  </select>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder={t("titlePlaceholder")} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
                  {itemType === "info" && (
                    <textarea value={contentFields.text} onChange={e => setContentFields({...contentFields, text: e.target.value})}
                      placeholder={t("contentPlaceholder")} rows={3} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
                  )}
                  {itemType === "character" && (<>
                    <textarea value={contentFields.basicInfo} onChange={e => setContentFields({...contentFields, basicInfo: e.target.value})}
                      placeholder={t("basicInfoPlaceholder")} rows={2} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
                    <textarea value={contentFields.detail} onChange={e => setContentFields({...contentFields, detail: e.target.value})}
                      placeholder={t("detailPlaceholder")} rows={3} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
                  </>)}
                  {itemType === "item" && (<>
                    <textarea value={contentFields.appearance} onChange={e => setContentFields({...contentFields, appearance: e.target.value})}
                      placeholder={t("appearancePlaceholder")} rows={2} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
                    <textarea value={contentFields.extra} onChange={e => setContentFields({...contentFields, extra: e.target.value})}
                      placeholder={t("extraPlaceholder")} rows={2} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
                  </>)}
                  <div className="flex gap-2">
                    <button onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 text-text-muted text-sm cursor-pointer">{tCommon("cancel")}</button>
                    <button onClick={handleCreate} disabled={!title}
                      className="flex-1 bg-success hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded font-bold text-sm cursor-pointer">{t("confirm")}</button>
                  </div>
                </div>
              )}

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
                    {(["info", "character", "item"] as const).map(typeKey => (
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
                          ? "bg-accent text-white shadow-sm" 
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
                    const distCount = history.filter((h: any) => h.itemId === item.id).length;
                    if (manageFilterDist === "undistributed" && distCount > 0) return false;
                    if (manageFilterDist === "distributed" && distCount === 0) return false;
                    return true;
                  });

                  if (filteredRoomItems.length === 0) {
                    return <p className="text-sm text-text-muted py-4 text-center">{t("emptyList")}</p>;
                  }

                  const sortedRoomItems = [...filteredRoomItems].sort((a, b) => {
                    const countA = history.filter((h: any) => h.itemId === a.id).length;
                    const countB = history.filter((h: any) => h.itemId === b.id).length;
                    
                    if (countA === 0 && countB > 0) return -1;
                    if (countA > 0 && countB === 0) return 1;
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                  });

                  return (
                    <div className="flex flex-col gap-2">
                      {sortedRoomItems.map(item => {
                        const itemHistory = history.filter((h: any) => h.itemId === item.id);
                        const distCount = itemHistory.length;
                        const hasBeenDistributed = distCount > 0;
                        const uniqueRecipients = Array.from(new Set(itemHistory.map((h: any) => h.toUsername).filter(Boolean)));

                        return (
                          <div key={item.id} className={`bg-surface-alt rounded-theme p-3 border flex justify-between items-center inventory-card transition-all duration-200 ${
                            !hasBeenDistributed 
                              ? "border-success/40 bg-success/5 shadow-[0_0_8px_rgb(var(--theme-success)/15%)] hover:shadow-[0_0_12px_rgb(var(--theme-success)/25%)]" 
                              : "border-border hover:border-primary/30"
                          }`}>
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailItem(item)}>
                              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                <span className="text-sm font-bold text-text truncate">{typeLabel(item.type)} {item.title}</span>
                                {!hasBeenDistributed ? (
                                  <span className="bg-success/15 text-success text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-success/30 select-none animate-pulse">
                                    {t("statusUnsent")}
                                  </span>
                                ) : (
                                  <span className="bg-primary/10 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-primary/20 select-none">
                                    {t("statusSentCount", { count: distCount })}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-text-muted truncate mt-0.5">{formatContent(item).slice(0, 60)}</div>
                              {uniqueRecipients.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                                  <span className="text-[10px] text-text-dim">{t("holders")}</span>
                                  {uniqueRecipients.slice(0, 2).map((hName, hIdx) => (
                                    <span key={hIdx} className="bg-surface/80 text-text-muted text-[9px] px-1.5 py-0.5 rounded border border-border/50 font-medium max-w-[80px] truncate">
                                      👤 {hName}
                                    </span>
                                  ))}
                                  {uniqueRecipients.length > 2 && (
                                    <span className="text-[9px] text-text-dim leading-none ml-0.5">
                                      {t("holdersOthers", { count: uniqueRecipients.length })}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => { setDistributeItemId(item.id); setDistributeTargets([]); }}
                                className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded text-xs font-bold cursor-pointer">
                                {t("distribute")}
                              </button>
                              <button onClick={() => handleDeleteItem(item.id, item.title)}
                                className="bg-danger hover:opacity-90 text-white px-3 py-1.5 rounded text-xs font-bold cursor-pointer">
                                {t("delete")}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Distribute dialog */}
              {distributeItemId !== null && (
                <div className="bg-surface rounded-theme border border-border theme-border p-4 flex flex-col gap-3 shadow-md">
                  <h4 className="font-bold text-text text-sm mb-1">{t("selectTarget")}</h4>
                  
                  {/* Pinned "Distribute to All" */}
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDistribute("all"); }}
                    className="w-full bg-accent hover:bg-accent-hover text-white py-2 rounded font-bold text-sm cursor-pointer transition flex items-center justify-center gap-1.5 shadow-sm">
                    {t("distributeAll")}
                  </button>

                  <div className="flex items-center gap-2 text-text-dim text-[11px] my-1">
                    <span className="h-px bg-border flex-1"></span>
                    <span>{t("selectMultipleHint")}</span>
                    <span className="h-px bg-border flex-1"></span>
                  </div>

                  {/* Player List */}
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {players.filter(p => p.id !== userId).map(p => {
                      const isSelected = distributeTargets.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onClick={() => {
                            setDistributeTargets(prev =>
                              prev.includes(p.id)
                                ? prev.filter(id => id !== p.id)
                                : [...prev, p.id]
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              setDistributeTargets(prev =>
                                prev.includes(p.id)
                                  ? prev.filter(id => id !== p.id)
                                  : [...prev, p.id]
                              );
                            }
                          }}
                          className={`flex justify-between items-center py-2 px-3 rounded text-sm text-left border cursor-pointer select-none ${
                            isSelected
                              ? "bg-primary/10 border-primary/40 text-primary font-medium"
                              : "bg-surface border-border/60 text-text hover:bg-surface-alt"
                          }`}
                        >
                          <span>👤 {p.nickname || p.username}</span>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${
                            isSelected
                              ? "bg-primary border-primary text-white"
                              : "border-input-border bg-input-bg"
                          }`}>
                            {isSelected && "✓"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDistributeItemId(null); setDistributeTargets([]); }}
                      className="flex-1 py-2 text-xs font-bold text-text-muted hover:text-text cursor-pointer text-center"
                    >
                      {tCommon("cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDistribute(distributeTargets); }}
                      disabled={distributeTargets.length === 0}
                      className="flex-1 bg-success hover:bg-success/90 disabled:opacity-40 disabled:hover:bg-success text-white py-2 rounded font-bold text-xs cursor-pointer text-center"
                    >
                      {t("distributeConfirm", { count: distributeTargets.length })}
                    </button>
                  </div>
                </div>
              )}

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
                {(["info", "character", "item"] as const).map(typeKey => (
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
                          ? `relative bg-surface-alt rounded-theme border cursor-pointer hover:scale-105 hover:shadow-lg hover:border-primary/40 transition-all duration-200 aspect-square flex flex-col items-center justify-center p-2 group inventory-card ${d.viewed === false || d.viewed === 0 ? "border-primary/40 bg-primary/5 ring-1 ring-primary/30" : "border-border"}`
                          : "bg-bg/50 rounded-theme border border-dashed border-border/30 aspect-square opacity-40"
                        }
                        onClick={() => { if (d) { setDetailItem((d as any).item); setDetailDist(d); } }}
                        title={d ? d.item?.title || "" : ""}
                      >
                        {d && (
                          <>
                            {isNew(d) && (
                              <span className="absolute -top-1.5 -right-1.5 bg-danger text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow animate-pulse z-10">
                                NEW
                              </span>
                            )}
                            <span className="text-2xl mb-1">{typeEmoji((d as any).item?.type || "item")}</span>
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

          {/* === ITEM DETAIL MODAL === */}
          {detailItem && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => { setDetailItem(null); setShareTarget(null); }}>
              <div className="bg-surface rounded-theme theme-border p-6 max-w-md w-full mx-4 shadow-2xl border border-border" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs text-text-muted">{typeLabel(detailItem.type)}</span>
                    <h3 className="font-bold text-lg text-text">{detailItem.title}</h3>
                  </div>
                  <button onClick={() => { setDetailItem(null); setShareTarget(null); }} className="text-text-muted hover:text-text cursor-pointer">×</button>
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
                    const itemDists = history.filter((h: any) => h.itemId === detailItem.id);
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
                            {itemDists.map((d: any) => (
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
                {detailDist && (
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
                          className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-xs font-bold cursor-pointer">{t("confirm")}</button>
                        <button onClick={() => setShareTarget(null)} className="text-xs text-text-muted cursor-pointer">{t("cancel")}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
