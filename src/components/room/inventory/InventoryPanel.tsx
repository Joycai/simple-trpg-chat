"use client";

import { useState, useEffect } from "react";
import { createInventoryItemAction, updateInventoryItemAction, distributeItemAction, getRoomItems, getDistributionHistory, getMyInventory, shareItemAction, markInventoryViewedAction, deleteInventoryItemAction } from "@/app/actions/inventory";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { BackpackSkeleton, ManageSkeleton } from "./InventorySkeletons";
import { ManageView } from "./ManageView";
import { BackpackView } from "./BackpackView";
import { CreateEditModal, DistributeModal, DetailModal } from "./InventoryModals";
import type { InventoryItem, Distribution, ContentFields, InventoryItemType } from "./inventory-helpers";

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
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose, "drawer");

  // Each entry point (背包 / 道具管理) opens a fixed view; the manage view requires host.
  const tab = view === "manage" && isHost ? "manage" : "backpack";
  const [filterType, setFilterType] = useState<"all" | InventoryItemType>("all");
  const [manageFilterType, setManageFilterType] = useState<"all" | InventoryItemType>("all");
  const [manageFilterDist, setManageFilterDist] = useState<"all" | "undistributed" | "distributed">("all");
  const [myItems, setMyItems] = useState<Distribution[]>([]);
  const [roomItems, setRoomItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Create / edit form state (shared form; editingItemId !== null means edit mode)
  const [showCreate, setShowCreate] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemType, setItemType] = useState<InventoryItemType>("info");
  const [title, setTitle] = useState("");
  const [contentFields, setContentFields] = useState<ContentFields>({ text: "", basicInfo: "", detail: "", appearance: "", extra: "" });

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

  // Opening the distribute modal: select the item, reset target selection, and
  // close any open detail modal (the distribute flow replaces it).
  const openDistribute = (itemId: number) => {
    setDistributeItemId(itemId);
    setDistributeTargets([]);
    setDetailItem(null);
  };

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
            <ManageView
              roomItems={roomItems}
              history={history}
              manageFilterType={manageFilterType}
              onManageFilterTypeChange={setManageFilterType}
              manageFilterDist={manageFilterDist}
              onManageFilterDistChange={setManageFilterDist}
              onCreateClick={() => { resetForm(); setShowCreate(true); }}
              onViewDetail={setDetailItem}
              onEdit={startEdit}
              onDelete={handleDeleteItem}
              onDistribute={openDistribute}
            />
          ) : (
            <BackpackView
              filteredItems={filteredBackpack}
              filterType={filterType}
              onFilterChange={setFilterType}
              userId={userId}
              onSelect={(item, dist) => { setDetailItem(item); setDetailDist(dist); }}
            />
          )}

          {showCreate && (
            <CreateEditModal
              editingItemId={editingItemId}
              itemType={itemType}
              onItemTypeChange={setItemType}
              title={title}
              onTitleChange={setTitle}
              contentFields={contentFields}
              onContentFieldsChange={setContentFields}
              onCancel={resetForm}
              onSubmit={handleSubmit}
            />
          )}

          {distributeItemId !== null && (
            <DistributeModal
              distributeItemId={distributeItemId}
              roomItems={roomItems}
              players={players}
              userId={userId}
              distributeTargets={distributeTargets}
              setDistributeTargets={setDistributeTargets}
              onCancel={() => { setDistributeItemId(null); setDistributeTargets([]); }}
              onDistribute={handleDistribute}
            />
          )}

          {detailItem && (
            <DetailModal
              detailItem={detailItem}
              detailDist={detailDist}
              isHost={isHost}
              history={history}
              players={players}
              userId={userId}
              readOnly={readOnly}
              shareTarget={shareTarget}
              onShareTargetChange={setShareTarget}
              onClose={() => { setDetailItem(null); setShareTarget(null); }}
              onEdit={startEdit}
              onShare={handleShare}
              onDistribute={openDistribute}
            />
          )}
        </div>
      </div>
    </div>
  );
}
