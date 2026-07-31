"use client";

import { useState, useEffect } from "react";
import { createInventoryItemAction, updateInventoryItemAction, distributeItemAction, getRoomItems, getDistributionHistory, getMyInventory, shareItemAction, markInventoryViewedAction, deleteInventoryItemAction } from "@/app/actions/inventory";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { BackpackSkeleton, ManageSkeleton } from "./InventorySkeletons";
import { ManageView } from "./ManageView";
import { BackpackView } from "./BackpackView";
import { CreateEditModal, DistributeModal, DetailModal, ShareModal } from "./InventoryModals";
import { Icons } from "@/components/shared/icons";
import { useHostLabel } from "@/components/shared/host-label";
import type { InventoryItem, Distribution, ContentFields, InventoryItemType, ItemMeta } from "./inventory-helpers";
import { DEFAULT_ITEM_META } from "./inventory-helpers";

interface InventoryPanelProps {
  roomId: number;
  userId: number;
  isHost: boolean;
  /** Room host's user id — excluded as a share/distribute target on the player side. */
  hostId?: number;
  players: { id: number; username: string; nickname: string; isOnline?: boolean; avatarColor?: string | null; isBot?: boolean }[];
  onClose: () => void;
  /** Bumped via SSE when an item is edited, so the panel reloads the synced content. */
  refreshKey?: number;
  readOnly?: boolean;
  /** Which view to show. "backpack" = personal items (player-aligned); "manage" = host item management. */
  view?: "backpack" | "manage";
}

export function InventoryPanel({ roomId, userId, isHost, hostId, players, onClose, refreshKey = 0, readOnly = false, view = "backpack" }: InventoryPanelProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const hostLabel = useHostLabel();
  const { close, panelRef, backdropRef, panelClass } = useOverlayTransition(onClose, "drawer");

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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [contentFields, setContentFields] = useState<ContentFields>({ text: "", basicInfo: "", detail: "", appearance: "", extra: "" });
  const [meta, setMeta] = useState<ItemMeta>({ ...DEFAULT_ITEM_META });

  // Distribute state
  const [distributeTargets, setDistributeTargets] = useState<number[]>([]);
  const [distributeItemId, setDistributeItemId] = useState<number | null>(null);

  // Detail state
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [detailDist, setDetailDist] = useState<Distribution | null>(null);

  // Share state — the player-side "分发道具" modal (multi-select)
  const [shareItem, setShareItem] = useState<InventoryItem | null>(null);
  const [shareDist, setShareDist] = useState<Distribution | null>(null);

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
    setImageUrl(null);
    setContentFields({ text: "", basicInfo: "", detail: "", appearance: "", extra: "" });
    setMeta({ ...DEFAULT_ITEM_META });
  };

  // Prefill the shared form from an existing item and switch it into edit mode.
  const startEdit = (item: InventoryItem) => {
    let c: Record<string, string> = {};
    try { c = JSON.parse(item.contentJson) || {}; } catch { /* */ }
    setEditingItemId(item.id);
    setItemType(item.type);
    setTitle(item.title);
    setImageUrl(item.imageUrl ?? null);
    setContentFields({
      text: c.text || "",
      basicInfo: c.basicInfo || "",
      detail: c.detail || "",
      appearance: c.appearance || "",
      extra: c.extra || "",
    });
    setMeta({
      source: (item.source as ItemMeta["source"]) || DEFAULT_ITEM_META.source,
      visibility: (item.visibility as ItemMeta["visibility"]) || DEFAULT_ITEM_META.visibility,
      relation: (item.relation as ItemMeta["relation"]) || DEFAULT_ITEM_META.relation,
      category: (item.category as ItemMeta["category"]) || DEFAULT_ITEM_META.category,
      quantity: item.quantity ?? DEFAULT_ITEM_META.quantity,
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

    // Persist only the metadata relevant to the chosen type; clear the rest.
    const metaFields = {
      source: itemType === "info" ? meta.source : null,
      visibility: itemType === "info" ? meta.visibility : null,
      relation: itemType === "character" ? meta.relation : null,
      category: itemType === "item" ? meta.category : null,
      quantity: itemType === "item" ? meta.quantity : null,
    };

    const content = JSON.parse(JSON.stringify(contentJson));
    try {
      if (editingItemId !== null) {
        await updateInventoryItemAction(roomId, editingItemId, { type: itemType, title, content, imageUrl: imageUrl ?? null, ...metaFields });
      } else {
        await createInventoryItemAction(roomId, { type: itemType, title, content, imageUrl: imageUrl ?? undefined, ...metaFields });
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
    // Soft constraint: a KP-only info is host prep material — confirm before it
    // leaves the KP's hands (the server then flips it to 全体可见).
    const distItem = roomItems.find((it) => it.id === distributeItemId);
    if (distItem?.type === "info" && distItem.visibility === "kp") {
      if (!confirm(t("distributeKpConfirm", { title: distItem.title, host: hostLabel }))) return;
    }
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

  // Open the share modal for the item the player is currently viewing.
  const openShare = (item: InventoryItem, dist: Distribution | null) => {
    setShareItem(item);
    setShareDist(dist);
    setDetailItem(null); // close the detail view; the share modal stands alone
  };

  // Share copies of the item to every selected target (skipping any that error,
  // e.g. a recipient who already owns it).
  const handleShareMulti = async (targetIds: number[]) => {
    if (!shareItem || targetIds.length === 0) return;
    let lastErr: string | null = null;
    for (const id of targetIds) {
      try {
        await shareItemAction(roomId, shareItem.id, id);
      } catch (err: unknown) {
        lastErr = err instanceof Error ? err.message : tCommon("error");
      }
    }
    if (lastErr) alert(lastErr);
    setShareItem(null);
    setShareDist(null);
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

  // Backpack filtering lives in BackpackView now: its category rail shows a
  // per-type count, which needs the unfiltered list, and its search box narrows
  // the same set. Passing the whole backpack keeps both in one place.

  return (
    <div className="fixed inset-0 z-50 flex font-theme" onClick={close}>
      <div ref={backdropRef} className="absolute inset-0 bg-black/30" />
      {/* Flex column rather than one scrolling block with a sticky header (the
          shape CharacterPanel / NotebookPanel already use): it gives the body a
          definite height, which is what lets the backpack's category rail — and
          its divider — run the full height of the drawer. */}
      <div ref={panelRef} className={`relative ml-auto w-full sm:w-[36rem] bg-surface border-l border-border shadow-2xl h-full flex flex-col overflow-hidden ${panelClass}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="shrink-0 bg-surface border-b border-border px-6 py-5 flex justify-between items-center gap-3">
          <h3 className="font-bold text-text text-xl font-theme-display flex items-center gap-2.5 min-w-0">
            <Icons.Package className="w-5 h-5 shrink-0 text-accent" />
            <span className="truncate">{tab === "manage" ? t("tabManage") : t("tabBackpack")}</span>
          </h3>
          <button onClick={close} className="text-text-muted hover:text-text p-1 rounded-theme hover:bg-surface-alt transition cursor-pointer" aria-label={tCommon("close")}>
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
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
              items={myItems}
              filterType={filterType}
              onFilterChange={setFilterType}
              userId={userId}
              onSelect={(item, dist) => { setDetailItem(item); setDetailDist(dist); }}
            />
          )}

          {showCreate && (
            <CreateEditModal
              roomId={roomId}
              editingItemId={editingItemId}
              itemType={itemType}
              onItemTypeChange={setItemType}
              title={title}
              onTitleChange={setTitle}
              contentFields={contentFields}
              onContentFieldsChange={setContentFields}
              meta={meta}
              onMetaChange={setMeta}
              imageUrl={imageUrl}
              onImageChange={setImageUrl}
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
              readOnly={readOnly}
              onClose={() => setDetailItem(null)}
              onEdit={startEdit}
              onShareOpen={() => openShare(detailItem, detailDist)}
              onDistribute={openDistribute}
            />
          )}

          {shareItem && (
            <ShareModal
              item={shareItem}
              fromName={shareDist?.fromUsername || null}
              players={players}
              userId={userId}
              hostId={hostId}
              onCancel={() => { setShareItem(null); setShareDist(null); }}
              onShare={handleShareMulti}
            />
          )}
        </div>
      </div>
    </div>
  );
}
