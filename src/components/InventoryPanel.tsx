"use client";

import { useState, useEffect } from "react";
import { createInventoryItemAction, distributeItemAction, getRoomItems, getDistributionHistory, getMyInventory, shareItemAction, markInventoryViewedAction, deleteInventoryItemAction } from "@/app/actions/inventory";
import { useRouter } from "next/navigation";

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
  const [tab, setTab] = useState<string>(isHost ? "manage" : "backpack");
  const [filterType, setFilterType] = useState<"all" | "info" | "character" | "item">("all");
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
  const [distributeTarget, setDistributeTarget] = useState<number | "all" | null>(null);
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

  const handleDistribute = async () => {
    if (!distributeItemId || !distributeTarget) return;
    await distributeItemAction(roomId, distributeItemId, distributeTarget);
    setDistributeItemId(null);
    setDistributeTarget(null);
    router.refresh();
    loadData();
  };

  const handleDeleteItem = async (itemId: number, itemTitle: string) => {
    if (!confirm(`确定要删除道具【${itemTitle}】吗？删除后所有玩家背包中的该道具也将同步消失。`)) return;
    try {
      await deleteInventoryItemAction(roomId, itemId);
      router.refresh();
      loadData();
    } catch (err: any) {
      alert(err.message || "删除失败");
    }
  };

  const handleShare = async (itemId: number) => {
    if (!shareTarget) return;
    try {
      await shareItemAction(roomId, itemId, shareTarget);
    } catch (err: any) {
      alert(err.message || "分享失败");
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

  const typeLabel = (t: string) => ({ info: "📄 信息", character: "👤 人物", item: "🎒 物品" }[t] || t);
  const typeTabLabel = (t: string) => ({ info: "信息", character: "人物", item: "物品" }[t] || t);
  const typeEmoji = (t: string) => ({ info: "📄", character: "👤", item: "🎒" }[t] || "📦");
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
      <div className="relative ml-auto w-96 bg-surface border-l border-border shadow-2xl h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">📦 道具栏</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl transition cursor-pointer">×</button>
        </div>

        {/* Tabs (host only) */}
        {isHost && (
          <div className="flex border-b border-border">
            <button onClick={() => setTab("manage")}
              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${tab === "manage" ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-text-muted hover:text-text"}`}>
              ⚙️ 道具管理
            </button>
            <button onClick={() => setTab("backpack")}
              className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${tab === "backpack" ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-text-muted hover:text-text"}`}>
              🎒 我的背包
            </button>
          </div>
        )}

        <div className="p-5">
          {loading ? (
            <div className="text-center text-text-muted py-8">加载中...</div>
          ) : tab === "manage" && isHost ? (
            /* === KP MANAGEMENT VIEW === */
            <div className="flex flex-col gap-5">
              {/* Create button */}
              {!showCreate ? (
                <button onClick={() => setShowCreate(true)}
                  className="w-full bg-success hover:bg-primary-hover text-white py-3 rounded-theme font-bold transition cursor-pointer">
                  ＋ 创建新道具
                </button>
              ) : (
                <div className="bg-surface-alt rounded-theme theme-border p-4 border border-border flex flex-col gap-3">
                  <h4 className="font-bold text-text text-sm">创建道具</h4>
                  <select value={itemType} onChange={e => setItemType(e.target.value as any)}
                    className="p-2 border border-input-border bg-input-bg rounded text-text text-sm">
                    <option value="info">📄 信息</option>
                    <option value="character">👤 人物信息</option>
                    <option value="item">🎒 物品</option>
                  </select>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="道具名称（标题）" className="p-2 border border-input-border bg-input-bg rounded text-text text-sm" />
                  {itemType === "info" && (
                    <textarea value={contentFields.text} onChange={e => setContentFields({...contentFields, text: e.target.value})}
                      placeholder="文本内容" rows={3} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none" />
                  )}
                  {itemType === "character" && (<>
                    <textarea value={contentFields.basicInfo} onChange={e => setContentFields({...contentFields, basicInfo: e.target.value})}
                      placeholder="基本信息" rows={2} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none" />
                    <textarea value={contentFields.detail} onChange={e => setContentFields({...contentFields, detail: e.target.value})}
                      placeholder="详细描述" rows={3} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none" />
                  </>)}
                  {itemType === "item" && (<>
                    <textarea value={contentFields.appearance} onChange={e => setContentFields({...contentFields, appearance: e.target.value})}
                      placeholder="外形描述" rows={2} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none" />
                    <textarea value={contentFields.extra} onChange={e => setContentFields({...contentFields, extra: e.target.value})}
                      placeholder="补充信息" rows={2} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none" />
                  </>)}
                  <div className="flex gap-2">
                    <button onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 text-text-muted text-sm cursor-pointer">取消</button>
                    <button onClick={handleCreate} disabled={!title}
                      className="flex-1 bg-success hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded font-bold text-sm cursor-pointer">创建</button>
                  </div>
                </div>
              )}

              {/* Room items for distribution */}
              <div>
                <h4 className="text-xs text-text-dim font-medium mb-2 uppercase tracking-wider">道具列表</h4>
                {roomItems.length === 0 ? (
                  <p className="text-sm text-text-muted">还没有创建道具</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(() => {
                      const sortedRoomItems = [...roomItems].sort((a, b) => {
                        const countA = history.filter((h: any) => h.itemId === a.id).length;
                        const countB = history.filter((h: any) => h.itemId === b.id).length;
                        
                        if (countA === 0 && countB > 0) return -1;
                        if (countA > 0 && countB === 0) return 1;
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                      });

                      return sortedRoomItems.map(item => {
                        const itemHistory = history.filter((h: any) => h.itemId === item.id);
                        const distCount = itemHistory.length;
                        const hasBeenDistributed = distCount > 0;

                        return (
                          <div key={item.id} className={`bg-surface-alt rounded-theme p-3 border flex justify-between items-center inventory-card transition-all duration-200 ${
                            !hasBeenDistributed 
                              ? "border-success/40 bg-success/5 shadow-sm ring-1 ring-success/20" 
                              : "border-border"
                          }`}>
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailItem(item)}>
                              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                <span className="text-sm font-bold text-text truncate">{typeLabel(item.type)} {item.title}</span>
                                {!hasBeenDistributed ? (
                                  <span className="bg-success/15 text-success text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-success/30 select-none animate-pulse">
                                    ✨ 未发放
                                  </span>
                                ) : (
                                  <span className="bg-primary/10 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-primary/20 select-none">
                                    📤 已发: {distCount}人
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-text-muted truncate mt-0.5">{formatContent(item).slice(0, 60)}</div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => { setDistributeItemId(item.id); setDistributeTarget(null); }}
                                className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded text-xs font-bold cursor-pointer">
                                发放
                              </button>
                              <button onClick={() => handleDeleteItem(item.id, item.title)}
                                className="bg-danger hover:opacity-90 text-white px-3 py-1.5 rounded text-xs font-bold cursor-pointer">
                                删除
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* Distribute dialog */}
              {distributeItemId !== null && (
                <div className="bg-accent/10 border border-accent/30 rounded-theme theme-border p-4">
                  <h4 className="font-bold text-text text-sm mb-3">选择发放目标</h4>
                  <div className="flex flex-col gap-2 mb-3">
                    <button onClick={() => { setDistributeTarget("all"); handleDistribute(); }}
                      className="bg-accent hover:bg-accent-hover text-white py-2 rounded font-bold text-sm cursor-pointer">🌐 全员发放</button>
                    {players.filter(p => p.id !== userId).map(p => (
                      <button key={p.id} onClick={() => { setDistributeTarget(p.id); handleDistribute(); }}
                        className="bg-surface hover:bg-surface-alt text-text py-2 px-3 rounded text-sm text-left transition cursor-pointer">
                        👤 {p.nickname || p.username}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setDistributeItemId(null)} className="text-xs text-text-muted hover:text-text cursor-pointer">取消</button>
                </div>
              )}

              {/* History */}
              <div>
                <h4 className="text-xs text-text-dim font-medium mb-2 uppercase tracking-wider">发放历史</h4>
                {history.length === 0 ? (
                  <p className="text-sm text-text-muted">暂无记录</p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                    {history.map(h => (
                      <div key={h.id} className="text-xs text-text-muted py-1 border-b border-border/50">
                        <span className="font-bold text-text">{h.item?.title || `#${h.itemId}`}</span>
                        {" → "}
                        <span>{h.toUsername || `#${h.toUserId}`}</span>
                        <span className="ml-2 text-text-dim">{h.action === "shared" ? "🔄共享" : "📤发放"}</span>
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
                  全部
                </button>
                {(["info", "character", "item"] as const).map(t => (
                  <button key={t} onClick={() => setFilterType(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                      filterType === t 
                        ? "bg-primary text-primary-foreground shadow-sm filter-tab-active" 
                        : "bg-surface-alt text-text-muted hover:text-text border border-border/50"
                    }`}>
                    {typeTabLabel(t)}
                  </button>
                ))}
              </div>

              {filteredBackpack.length === 0 ? (
                <div className="text-center text-text-muted py-12 text-sm">
                  <div className="text-4xl mb-3 opacity-30">🎒</div>
                  <p>暂无{filterType === "all" ? "" : typeTabLabel(filterType)}道具</p>
                  <p className="text-xs mt-1 opacity-60">等待 KP 发放中...</p>
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
                    🖼️ 图片预留 (imageUrl: {detailItem.imageUrl})
                  </div>
                )}

                {/* Host view: Distribution History */}
                {isHost && (
                  (() => {
                    const itemDists = history.filter((h: any) => h.itemId === detailItem.id);
                    return (
                      <div className="mt-4 pt-4 border-t border-border">
                        <h4 className="text-xs font-bold text-text-dim uppercase tracking-wider mb-2">📋 分发历史 ({itemDists.length} 次)</h4>
                        {itemDists.length === 0 ? (
                          <p className="text-xs text-text-muted">该道具尚未发放给任何人。</p>
                        ) : (
                          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                            {itemDists.map((d: any) => (
                              <div key={d.id} className="flex justify-between items-center text-xs bg-surface-alt p-2 rounded border border-border/50">
                                <span className="text-text-muted">
                                  {d.action === "shared" ? "🤝 共享自 " : "📤 发送给 "}
                                  <strong className="text-text">{d.toUsername || `#${d.toUserId}`}</strong>
                                </span>
                                <span className="text-text-dim text-[10px]">
                                  {new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
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
                    <h4 className="text-sm font-bold text-text mb-2">🔄 共享给其他玩家</h4>
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
                        <span className="text-sm text-text">共享给 {players.find(p => p.id === shareTarget)?.nickname}？</span>
                        <button onClick={() => handleShare(detailDist.itemId)}
                          className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-xs font-bold cursor-pointer">确认</button>
                        <button onClick={() => setShareTarget(null)} className="text-xs text-text-muted cursor-pointer">取消</button>
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
