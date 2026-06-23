"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Portal } from "./InventorySkeletons";
import { Icons } from "@/components/shared/icons";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import {
  formatContent, typeIcon, typeColorClass,
  type InventoryItem, type Distribution, type InventoryPlayer, type InventoryItemType, type ContentFields,
} from "./inventory-helpers";

const TYPE_KEYS = ["clue", "info", "character", "item"] as const;

/* === CREATE / EDIT MODAL === */
interface CreateEditModalProps {
  roomId: number;
  editingItemId: number | null;
  itemType: InventoryItemType;
  onItemTypeChange: (v: InventoryItemType) => void;
  title: string;
  onTitleChange: (v: string) => void;
  contentFields: ContentFields;
  onContentFieldsChange: (v: ContentFields) => void;
  imageUrl: string | null;
  onImageChange: (v: string | null) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function CreateEditModal({
  roomId, editingItemId, itemType, onItemTypeChange, title, onTitleChange,
  contentFields, onContentFieldsChange, imageUrl, onImageChange, onCancel, onSubmit,
}: CreateEditModalProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const [uploading, setUploading] = useState(false);
  const typeTabLabel = (tp: string) => ({ clue: t("tabClue"), info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[tp] || tp);

  const fieldCls = "w-full px-3 py-2.5 border border-input-border bg-input-bg rounded-theme text-text text-sm outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary placeholder:text-text-dim";

  const handleUpload = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`/api/rooms/${roomId}/images`, { method: "POST", body: fd });
      if (res.ok) { const { url } = await res.json(); onImageChange(url); }
    } catch { /* ignore */ }
    setUploading(false);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overlay-backdrop p-4" onClick={onCancel}>
        <div className="bg-surface rounded-theme theme-border p-6 max-w-lg w-full max-h-[88vh] overflow-y-auto shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-bold text-xl font-theme-display bg-gradient-to-r from-success to-primary bg-clip-text text-transparent">
              {editingItemId !== null ? t("editItem") : t("createItem")}
            </h3>
            <button onClick={onCancel} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <Icons.X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {/* Type */}
            <div>
              <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("typeFilter")}</label>
              <div className="grid grid-cols-4 gap-2">
                {TYPE_KEYS.map(tp => {
                  const Icon = typeIcon[tp]; const active = itemType === tp;
                  return (
                    <button key={tp} onClick={() => onItemTypeChange(tp)}
                      className={`flex flex-col items-center gap-2 py-3 rounded-theme border transition cursor-pointer ${
                        active ? "border-primary/60 bg-primary/10 shadow-[var(--theme-glow)]" : "border-border bg-surface-alt/40 hover:border-primary/30"
                      }`}>
                      <Icon className={`w-5 h-5 ${active ? typeColorClass[tp] : "text-text-muted"}`} strokeWidth={1.75} />
                      <span className={`text-xs font-bold ${active ? "text-text" : "text-text-muted"}`}>{typeTabLabel(tp)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("titleLabel")}</label>
              <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder={t("titlePlaceholder")} className={fieldCls} />
            </div>

            {/* Content */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-text-dim font-medium">{t("contentLabel")}</label>
                <span className="text-[10px] text-text-dim">{t("markdownHint")}</span>
              </div>
              {(itemType === "clue" || itemType === "info") && (
                <textarea value={contentFields.text} onChange={e => onContentFieldsChange({...contentFields, text: e.target.value})}
                  placeholder={t("contentPlaceholder")} rows={5} className={`${fieldCls} resize-none leading-relaxed`} />
              )}
              {itemType === "character" && (<div className="flex flex-col gap-2">
                <textarea value={contentFields.basicInfo} onChange={e => onContentFieldsChange({...contentFields, basicInfo: e.target.value})}
                  placeholder={t("basicInfoPlaceholder")} rows={2} className={`${fieldCls} resize-none`} />
                <textarea value={contentFields.detail} onChange={e => onContentFieldsChange({...contentFields, detail: e.target.value})}
                  placeholder={t("detailPlaceholder")} rows={4} className={`${fieldCls} resize-none`} />
              </div>)}
              {itemType === "item" && (<div className="flex flex-col gap-2">
                <textarea value={contentFields.appearance} onChange={e => onContentFieldsChange({...contentFields, appearance: e.target.value})}
                  placeholder={t("appearancePlaceholder")} rows={2} className={`${fieldCls} resize-none`} />
                <textarea value={contentFields.extra} onChange={e => onContentFieldsChange({...contentFields, extra: e.target.value})}
                  placeholder={t("extraPlaceholder")} rows={3} className={`${fieldCls} resize-none`} />
              </div>)}
            </div>

            {/* Evidence image (optional) */}
            <div>
              <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("imageLabel")}</label>
              {imageUrl ? (
                <div className="relative rounded-theme overflow-hidden border border-border">
                  <img src={imageUrl} alt="" className="w-full max-h-48 object-cover" />
                  <button onClick={() => onImageChange(null)} aria-label={tCommon("close")}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                    <Icons.X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 py-6 rounded-theme border border-dashed border-border text-text-muted hover:border-primary/40 hover:text-text transition cursor-pointer">
                  {uploading ? <Icons.Loader2 className="w-5 h-5 animate-spin" /> : <Icons.Image className="w-5 h-5" />}
                  <span className="text-sm">{uploading ? tCommon("loading") : t("uploadHint")}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => { handleUpload(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 justify-end mt-1">
              <button onClick={onCancel} className="px-5 py-2.5 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt text-sm font-bold cursor-pointer transition">{tCommon("cancel")}</button>
              <button onClick={onSubmit} disabled={!title}
                className="px-6 py-2.5 rounded-theme bg-gradient-to-b from-success to-success/80 text-primary-foreground font-bold text-sm cursor-pointer transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none shadow-[0_0_16px_rgb(var(--theme-success)/0.35)]">{editingItemId !== null ? t("confirm") : t("create")}</button>
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
              {distItem && <p className="text-xs text-text-muted truncate mt-0.5">{distItem.title}</p>}
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
  const tCommon = useTranslations("common");
  const typeLabel = (tStr: string) => ({ clue: t("tabClue"), info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[tStr] || tStr);
  const TypeIcon = typeIcon[detailItem.type];

  const recipients = Array.from(new Set(history.filter(h => h.itemId === detailItem.id).map(h => h.toUsername).filter(Boolean)));
  const timeline = history.filter(h => h.itemId === detailItem.id)
    .slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const fmtTime = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overlay-backdrop p-4" onClick={onClose}>
        <div className="bg-surface rounded-theme theme-border p-6 max-w-lg w-full max-h-[88vh] overflow-y-auto shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
          {/* Type badge + close */}
          <div className="flex justify-between items-center mb-3">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-theme border border-current bg-surface-alt/50 ${typeColorClass[detailItem.type]}`}>
              <TypeIcon className="w-3.5 h-3.5" /> {typeLabel(detailItem.type)}
            </span>
            <button onClick={onClose} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <Icons.X className="w-5 h-5" />
            </button>
          </div>

          <h3 className="font-bold text-2xl text-text mb-4">{detailItem.title}</h3>

          {/* Evidence image / placeholder */}
          {detailItem.imageUrl ? (
            <img src={detailItem.imageUrl} alt={detailItem.title} className="w-full max-h-72 object-cover rounded-theme border border-border mb-4" />
          ) : (
            <div className="rounded-theme border border-border bg-surface-alt flex items-center justify-center h-44 mb-4"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 14px, transparent 14px 28px)" }}>
              <span className="text-text-dim text-sm bg-surface/60 px-3 py-1 rounded-theme">{t("evidencePhoto")}</span>
            </div>
          )}

          {/* Content (markdown) */}
          <div className="text-sm text-text leading-relaxed item-detail-panel rounded-theme">
            <MarkdownRenderer content={formatContent(detailItem)} />
          </div>

          {/* Holders */}
          {recipients.length > 0 && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-theme border border-border bg-surface-alt/40 text-sm">
              <Icons.User className="w-4 h-4 text-text-muted shrink-0" />
              <span className="text-text-dim shrink-0">{t("holders")}</span>
              <span className="text-text truncate">{recipients.join(" · ")}</span>
            </div>
          )}

          {/* Distribution timeline (host view) — below the holders summary */}
          {isHost && timeline.length > 0 && (
            <div className="mt-3">
              <h4 className="text-[11px] text-text-dim font-bold uppercase tracking-wider mb-2">{t("distributeHistory")}</h4>
              <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto rounded-theme border border-border bg-surface-alt/40 p-2.5">
                {timeline.map(h => (
                  <div key={h.id} className="flex items-center gap-2 text-xs">
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${h.action === "shared" ? "bg-accent" : "bg-success"}`} />
                    <span className="text-text font-medium truncate">{h.toUsername || `#${h.toUserId}`}</span>
                    <span className="shrink-0 text-text-dim">{h.action === "shared" ? t("logShared") : t("logSent")}</span>
                    <span className="ml-auto shrink-0 text-text-dim tabular-nums">{fmtTime(h.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share section (player viewing their own copy) */}
          {detailDist && !readOnly && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm font-bold text-text mb-2">{t("shareToOthers")}</h4>
              {!shareTarget ? (
                <div className="flex flex-col gap-1">
                  {players.filter(p => p.id !== userId).map(p => (
                    <button key={p.id} onClick={() => onShareTargetChange(p.id)}
                      className="inline-flex items-center gap-2 text-left px-3 py-2 rounded-theme hover:bg-surface-alt text-text text-sm transition cursor-pointer">
                      <Icons.User className="w-4 h-4 text-text-muted" /> {p.nickname || p.username}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-text flex-1">{t("shareConfirmHint", { name: players.find(p => p.id === shareTarget)?.nickname || "" })}</span>
                  <button onClick={() => onShare(detailDist.itemId)}
                    className="bg-accent hover:bg-accent-hover text-accent-foreground px-3 py-1.5 rounded-theme text-xs font-bold cursor-pointer">{t("confirm")}</button>
                  <button onClick={() => onShareTargetChange(null)} className="text-xs text-text-muted cursor-pointer">{t("cancel")}</button>
                </div>
              )}
            </div>
          )}

          {/* Footer — host actions on a room item */}
          {isHost && !detailDist && (
            <div className="mt-5 flex gap-3">
              <button onClick={() => onEdit(detailItem)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-theme border border-border text-text font-bold text-sm hover:bg-surface-alt transition cursor-pointer">
                <Icons.Pencil className="w-4 h-4" /> {t("edit")}
              </button>
              <button onClick={() => onDistribute(detailItem.id)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-theme bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">
                <Icons.Send className="w-4 h-4" /> {t("distribute")}
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
