"use client";

import { useState, useEffect, useRef } from "react";
import { createInventoryItemAction, updateInventoryItemAction, distributeItemAction, getRoomItems, getDistributionHistory, getMyInventory, shareItemAction, markInventoryViewedAction, deleteInventoryItemAction } from "@/app/actions/inventory";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/ui/useOverlayTransition";
import { BackpackSkeleton, ManageSkeleton } from "./InventorySkeletons";
import { ManageView } from "./ManageView";
import { BackpackView } from "./BackpackView";
import { CreateEditModal, DistributeModal, DetailModal, ShareModal } from "./InventoryModals";
import { Icons } from "@/components/shared/icons";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Notice } from "@/components/shared/Notice";
import { useHostLabel } from "@/components/shared/host-label";
import type { InventoryItem, Distribution, ContentFields, InventoryItemType, ItemMeta } from "./inventory-types";
import { DEFAULT_ITEM_META } from "./inventory-types";

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
  const { close, panelRef, backdropRef, panelClass, afterEnter } = useOverlayTransition(onClose, "drawer");

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

  // Themed stand-ins for the old alert()/confirm() calls. Errors live in the
  // modal the action came from; a delete (no modal) reports at the panel top.
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  // One entry per failed recipient; `name` is null for a hand-out to everyone.
  const [distributeErrors, setDistributeErrors] = useState<{ id: number | null; name: string | null; error: string }[]>([]);
  const [distributing, setDistributing] = useState(false);
  const [shareErrors, setShareErrors] = useState<{ id: number; name: string; error: string }[]>([]);
  const [sharing, setSharing] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  type Pending =
    | { kind: "delete"; itemId: number; title: string }
    | { kind: "distributeKp"; title: string; targets: number[] | "all" };
  const [pending, setPending] = useState<Pending | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Bumped whenever the distribute / share modal opens or closes, so a request
  // that outlives its modal can't close or annotate the next one.
  const distributeSeq = useRef(0);
  const shareSeq = useRef(0);
  const formSeq = useRef(0);

  // The fetch starts immediately; only the *commit* waits for the drawer to
  // finish sliding. Rendering a full backpack is the single heaviest thing this
  // panel does, and landing it mid-animation is what a player sees as a stutter
  // (see useOverlayTransition on why the motion no longer shares that thread —
  // this keeps the paint out of the way too). By the time a real network round
  // trip returns, the 420ms enter is usually over and `afterEnter` is a no-op.
  const loadData = async () => {
    setLoading(true);
    try {
      if (isHost) {
        const [items, dists, mine] = await Promise.all([
          getRoomItems(roomId),
          getDistributionHistory(roomId),
          getMyInventory(roomId),
        ]);
        afterEnter(() => {
          setRoomItems(items as InventoryItem[]);
          setHistory(dists as Distribution[]);
          setMyItems(mine as Distribution[]);
          setLoading(false);
        });
      } else {
        const mine = await getMyInventory(roomId);
        afterEnter(() => {
          setMyItems(mine as Distribution[]);
          setLoading(false);
        });
      }
    } catch {
      afterEnter(() => setLoading(false));
    }
  };

  // On open: load the inventory FIRST (so freshly-received "new" and edited
  // "updated" copies still render their highlight this session), THEN acknowledge
  // them server-side so the next open is clean. Marking before the read would clear
  // the flags mid-race and the highlight would never appear.
  //
  // The acknowledgement is deferred too, and for a bigger reason than its own
  // cost: it ends in `revalidatePath("/rooms/:id")`, so its response carries a
  // fresh RSC payload for the *whole room* and React re-renders the entire page
  // tree. Fired during the slide, that is the largest single stall in the
  // sequence.
  useEffect(() => {
    void (async () => {
      await loadData();
      afterEnter(() => void markInventoryViewedAction(roomId));
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
    setFormError(null);
    setFormBusy(false);
    formSeq.current++;
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
    setFormError(null);
    setFormBusy(false);
    formSeq.current++;
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
    const seq = formSeq.current;
    setFormBusy(true);
    setFormError(null);
    const res = await (editingItemId !== null
      ? updateInventoryItemAction(roomId, editingItemId, { type: itemType, title, content, imageUrl: imageUrl ?? null, ...metaFields })
      : createInventoryItemAction(roomId, { type: itemType, title, content, imageUrl: imageUrl ?? undefined, ...metaFields })
    ).catch(() => ({ success: false as const, error: tCommon("error") }));
    // The modal was closed (or reopened) meanwhile — nothing left to update.
    if (seq !== formSeq.current) { if (res.success) { router.refresh(); void loadData(); } return; }
    setFormBusy(false);
    // Keep the modal and its fields so the host can retry.
    if (!res.success) { setFormError(res.error); return; }
    resetForm();
    router.refresh();
    void loadData();
  };

  const handleDistribute = (targets: number[] | "all") => {
    if (!distributeItemId || !targets) return;
    if (targets !== "all" && targets.length === 0) return;
    // Soft constraint: a KP-only info is host prep material — confirm before it
    // leaves the KP's hands (the server then flips it to 全体可见).
    const distItem = roomItems.find((it) => it.id === distributeItemId);
    if (distItem?.type === "info" && distItem.visibility === "kp") {
      setPending({ kind: "distributeKp", title: distItem.title, targets });
      return;
    }
    void runDistribute(distributeItemId, targets);
  };

  const runDistribute = async (itemId: number, targets: number[] | "all") => {
    const seq = distributeSeq.current;
    setDistributing(true);
    setDistributeErrors([]);
    const fallback = { success: false as const, error: t("distributeFailed") };
    const ids = targets === "all" ? [null] : targets;
    const results = await Promise.all(ids.map(uid =>
      distributeItemAction(roomId, itemId, uid ?? "all").catch(() => fallback)));
    router.refresh();
    void loadData();
    if (seq !== distributeSeq.current) return;
    setDistributing(false);
    const failures = ids.flatMap((uid, i) => {
      const r = results[i];
      if (r.success) return [];
      const p = uid === null ? undefined : players.find(pl => pl.id === uid);
      return [{ id: uid, name: uid === null ? null : p?.nickname || p?.username || String(uid), error: r.error }];
    });
    if (failures.length === 0) { closeDistribute(); return; }
    // Keep the modal open, list every failure, and narrow the selection to the
    // failed members still in the room — the others already hold the item.
    setDistributeErrors(failures);
    if (targets !== "all") {
      setDistributeTargets(failures.flatMap(f => (f.id !== null && players.some(p => p.id === f.id) ? [f.id] : [])));
    }
  };

  const closeDistribute = () => {
    distributeSeq.current++;
    setDistributing(false);
    setDistributeItemId(null);
    setDistributeTargets([]);
    setDistributeErrors([]);
  };

  const handleDeleteItem = (itemId: number, itemTitle: string) => {
    setPending({ kind: "delete", itemId, title: itemTitle });
  };

  const runDelete = async (itemId: number) => {
    setDeletingId(itemId);
    setPanelError(null);
    const res = await deleteInventoryItemAction(roomId, itemId)
      .catch(() => ({ success: false as const, error: tCommon("error") }));
    setDeletingId(id => (id === itemId ? null : id));
    if (!res.success) { setPanelError(res.error); return; }
    router.refresh();
    void loadData();
  };

  const confirmPending = () => {
    const current = pending;
    if (!current) return;
    setPending(null);
    if (current.kind === "delete") void runDelete(current.itemId);
    else if (distributeItemId) void runDistribute(distributeItemId, current.targets);
  };

  // Open the share modal for the item the player is currently viewing.
  const openShare = (item: InventoryItem, dist: Distribution | null) => {
    shareSeq.current++;
    setSharing(false);
    setShareErrors([]);
    setShareItem(item);
    setShareDist(dist);
    setDetailItem(null); // close the detail view; the share modal stands alone
  };

  // Share copies of the item to every selected target (skipping any that error,
  // e.g. a recipient who already owns it).
  const handleShareMulti = async (targetIds: number[]): Promise<number[]> => {
    if (!shareItem || targetIds.length === 0) return targetIds;
    const seq = shareSeq.current;
    setSharing(true);
    setShareErrors([]);
    const failures: { id: number; name: string; error: string }[] = [];
    for (const id of targetIds) {
      const res = await shareItemAction(roomId, shareItem.id, id)
        .catch(() => ({ success: false as const, error: tCommon("error") }));
      if (!res.success) {
        const p = players.find(pl => pl.id === id);
        failures.push({ id, name: p?.nickname || p?.username || String(id), error: res.error });
      }
    }
    router.refresh();
    void loadData();
    if (seq !== shareSeq.current) return [];
    setSharing(false);
    // Any failure keeps the modal open and lists every one of them.
    if (failures.length > 0) {
      setShareErrors(failures);
      return failures.map(f => f.id);
    }
    closeShare();
    return [];
  };

  const closeShare = () => {
    shareSeq.current++;
    setSharing(false);
    setShareItem(null);
    setShareDist(null);
    setShareErrors([]);
  };

  // Opening the distribute modal: select the item, reset target selection, and
  // close any open detail modal (the distribute flow replaces it).
  const openDistribute = (itemId: number) => {
    distributeSeq.current++;
    setDistributing(false);
    setDistributeErrors([]);
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

        {/* Outside the scroll area so a failure is visible wherever the list is scrolled. */}
        {panelError && (
          <div className="shrink-0 px-6 pt-4">
            <Notice variant="error" onDismiss={() => setPanelError(null)} dismissLabel={tCommon("close")}>
              {panelError}
            </Notice>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {/* Opacity only, no rise: the skeletons are shape-matched to the real
              layouts precisely so nothing moves on the swap, and a translate
              would put the jump back. The wrapper mounts when `loading` flips
              false and then stays mounted, so switching tabs does not replay
              it — only a real reload (which shows the skeleton again) does. */}
          {loading ? (
            tab === "manage" && isHost ? <ManageSkeleton /> : <BackpackSkeleton />
          ) : (
            <div className="animate-in fade-in">
              {tab === "manage" && isHost ? (
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
                  deletingId={deletingId}
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
            </div>
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
              error={formError}
              busy={formBusy}
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
              onCancel={closeDistribute}
              onDistribute={handleDistribute}
              error={distributeErrors.length === 0 ? null
                : distributeErrors.length === 1 && distributeErrors[0].name === null ? distributeErrors[0].error
                : (
                  <>
                    {t("sharePartialFailed")}
                    {distributeErrors.map(f => (
                      <span key={f.id ?? "all"} className="block">
                        {f.name === null ? f.error : t("sharePartialFailedItem", { name: f.name, error: f.error })}
                      </span>
                    ))}
                  </>
                )}
              busy={distributing}
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
              onCancel={closeShare}
              onShare={handleShareMulti}
              busy={sharing}
              error={shareErrors.length > 0 && (
                <>
                  {t("sharePartialFailed")}
                  {shareErrors.map(f => <span key={f.id} className="block">{t("sharePartialFailedItem", { name: f.name, error: f.error })}</span>)}
                </>
              )}
            />
          )}

          {pending?.kind === "delete" && (
            <ConfirmDialog
              title={t("deleteConfirmTitle")}
              description={t("deleteConfirm", { title: pending.title })}
              confirmLabel={t("delete")}
              icon={<Icons.Trash2 className="w-5 h-5" />}
              onConfirm={confirmPending}
              onCancel={() => setPending(null)}
            />
          )}

          {pending?.kind === "distributeKp" && (
            <ConfirmDialog
              title={t("distributeKpConfirmTitle", { host: hostLabel })}
              description={t("distributeKpConfirm", { title: pending.title, host: hostLabel })}
              confirmLabel={pending.targets === "all" ? t("distributeAll") : t("distributeConfirm", { count: pending.targets.length })}
              tone="primary"
              icon={<Icons.Send className="w-5 h-5" />}
              layerClassName="z-[80]"
              onConfirm={confirmPending}
              onCancel={() => setPending(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
