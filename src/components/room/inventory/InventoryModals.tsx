"use client";

import { useLocale, useTranslations } from "next-intl";
import { Portal } from "./InventorySkeletons";
import {
  formatContent, typeEmoji,
  type InventoryItem, type Distribution, type InventoryPlayer, type InventoryItemType, type ContentFields,
} from "./inventory-helpers";

/* === CREATE / EDIT MODAL === */
interface CreateEditModalProps {
  editingItemId: number | null;
  itemType: InventoryItemType;
  onItemTypeChange: (v: InventoryItemType) => void;
  title: string;
  onTitleChange: (v: string) => void;
  contentFields: ContentFields;
  onContentFieldsChange: (v: ContentFields) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function CreateEditModal({
  editingItemId, itemType, onItemTypeChange, title, onTitleChange,
  contentFields, onContentFieldsChange, onCancel, onSubmit,
}: CreateEditModalProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overlay-backdrop" onClick={onCancel}>
        <div className="bg-surface rounded-theme theme-border p-6 max-w-md w-full mx-4 max-h-[88vh] overflow-y-auto shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-text">{editingItemId !== null ? t("editItem") : t("createItem")}</h3>
            <button onClick={onCancel} className="text-text-muted hover:text-text text-xl leading-none cursor-pointer">×</button>
          </div>
          <div className="flex flex-col gap-3">
            <select value={itemType} onChange={e => onItemTypeChange(e.target.value as InventoryItemType)}
              className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary">
              <option value="clue">{t("typeClue")}</option>
              <option value="info">{t("typeInfo")}</option>
              <option value="character">{t("typeChar")}</option>
              <option value="item">{t("typeItem")}</option>
            </select>
            <input value={title} onChange={e => onTitleChange(e.target.value)}
              placeholder={t("titlePlaceholder")} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
            {(itemType === "clue" || itemType === "info") && (
              <textarea value={contentFields.text} onChange={e => onContentFieldsChange({...contentFields, text: e.target.value})}
                placeholder={t("contentPlaceholder")} rows={4} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
            )}
            {itemType === "character" && (<>
              <textarea value={contentFields.basicInfo} onChange={e => onContentFieldsChange({...contentFields, basicInfo: e.target.value})}
                placeholder={t("basicInfoPlaceholder")} rows={2} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
              <textarea value={contentFields.detail} onChange={e => onContentFieldsChange({...contentFields, detail: e.target.value})}
                placeholder={t("detailPlaceholder")} rows={4} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
            </>)}
            {itemType === "item" && (<>
              <textarea value={contentFields.appearance} onChange={e => onContentFieldsChange({...contentFields, appearance: e.target.value})}
                placeholder={t("appearancePlaceholder")} rows={2} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
              <textarea value={contentFields.extra} onChange={e => onContentFieldsChange({...contentFields, extra: e.target.value})}
                placeholder={t("extraPlaceholder")} rows={3} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none outline-none focus:ring-1 focus:ring-primary" />
            </>)}
            <div className="flex gap-2 mt-1">
              <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-md text-text-muted hover:text-text hover:bg-surface-alt text-sm font-bold cursor-pointer transition">{tCommon("cancel")}</button>
              <button onClick={onSubmit} disabled={!title}
                className="flex-1 bg-success hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded-md font-bold text-sm cursor-pointer transition">{t("confirm")}</button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* === DISTRIBUTE MODAL === */
interface DistributeModalProps {
  distributeItemId: number;
  roomItems: InventoryItem[];
  players: InventoryPlayer[];
  userId: number;
  distributeTargets: number[];
  setDistributeTargets: React.Dispatch<React.SetStateAction<number[]>>;
  onCancel: () => void;
  onDistribute: (targets: number[] | "all") => void;
}

export function DistributeModal({
  distributeItemId, roomItems, players, userId,
  distributeTargets, setDistributeTargets, onCancel, onDistribute,
}: DistributeModalProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");

  const distItem = roomItems.find(it => it.id === distributeItemId);
  const otherPlayers = players.filter(p => p.id !== userId);

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overlay-backdrop"
        onClick={onCancel}>
        <div className="bg-surface rounded-theme theme-border p-6 max-w-md w-full mx-4 shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-4 gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-lg text-text">{t("selectTarget")}</h3>
              {distItem && <p className="text-xs text-text-muted truncate mt-0.5">{typeEmoji(distItem.type)} {distItem.title}</p>}
            </div>
            <button onClick={onCancel} className="text-text-muted hover:text-text text-xl leading-none cursor-pointer shrink-0">×</button>
          </div>

          {/* Distribute to all */}
          <button type="button" onClick={() => onDistribute("all")}
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
            <button type="button" onClick={onCancel}
              className="flex-1 py-2 rounded-md text-xs font-bold text-text-muted hover:text-text hover:bg-surface-alt cursor-pointer transition">
              {tCommon("cancel")}
            </button>
            <button type="button" onClick={() => onDistribute(distributeTargets)} disabled={distributeTargets.length === 0}
              className="flex-1 bg-success hover:bg-success/90 disabled:opacity-40 text-white py-2 rounded-md font-bold text-xs cursor-pointer transition">
              {t("distributeConfirm", { count: distributeTargets.length })}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* === ITEM DETAIL MODAL === */
interface DetailModalProps {
  detailItem: InventoryItem;
  detailDist: Distribution | null;
  isHost: boolean;
  history: Distribution[];
  players: InventoryPlayer[];
  userId: number;
  readOnly: boolean;
  shareTarget: number | null;
  onShareTargetChange: (v: number | null) => void;
  onClose: () => void;
  onEdit: (item: InventoryItem) => void;
  onShare: (itemId: number) => void;
  onDistribute: (itemId: number) => void;
}

export function DetailModal({
  detailItem, detailDist, isHost, history, players, userId, readOnly,
  shareTarget, onShareTargetChange, onClose, onEdit, onShare, onDistribute,
}: DetailModalProps) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const typeLabel = (tStr: string) => ({ clue: t("typeClue"), info: t("typeInfo"), character: t("typeChar"), item: t("typeItem") }[tStr] || tStr);

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overlay-backdrop" onClick={onClose}>
        <div className="bg-surface rounded-theme theme-border p-6 max-w-md w-full mx-4 shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-xs text-text-muted">{typeLabel(detailItem.type)}</span>
              <h3 className="font-bold text-lg text-text">{detailItem.title}</h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isHost && !detailDist && (
                <button onClick={() => onEdit(detailItem)}
                  className="bg-surface-alt hover:bg-surface text-text border border-border px-2.5 py-1 rounded text-xs font-bold cursor-pointer">
                  {t("edit")}
                </button>
              )}
              <button onClick={onClose} className="text-text-muted hover:text-text cursor-pointer text-lg leading-none">×</button>
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
                      <button onClick={() => onDistribute(detailItem.id)}
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
                    <button key={p.id} onClick={() => onShareTargetChange(p.id)}
                      className="text-left px-3 py-2 rounded hover:bg-surface-alt text-text text-sm transition cursor-pointer">
                      👤 {p.nickname || p.username}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-text">{t("shareConfirmHint", { name: players.find(p => p.id === shareTarget)?.nickname || "" })}</span>
                  <button onClick={() => onShare(detailDist.itemId)}
                    className="bg-accent hover:bg-accent-hover text-accent-foreground px-3 py-1.5 rounded text-xs font-bold cursor-pointer">{t("confirm")}</button>
                  <button onClick={() => onShareTargetChange(null)} className="text-xs text-text-muted cursor-pointer">{t("cancel")}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
