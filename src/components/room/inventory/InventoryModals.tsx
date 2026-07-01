"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Portal } from "./InventorySkeletons";
import { Icons } from "@/components/shared/icons";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { ThemedSelect } from "@/components/shared/ThemedSelect";
import { ImageCropper } from "@/components/shared/ImageCropper";
import { ImagePreview } from "@/components/shared/ImagePreview";
import { getRandomColorForUser, getContrastColor } from "@/lib/avatar-colors";
import {
  formatContent, typeIcon, typeColorClass, typeActiveClass,
  sourceKey, visibilityKey, relationKey, categoryKey, relationBadgeClass,
  type InventoryItem, type Distribution, type InventoryPlayer, type InventoryItemType, type ContentFields, type ItemMeta,
} from "./inventory-helpers";

const TYPE_KEYS = ["clue", "info", "character", "item"] as const;

/** Mirrors `CHAT_IMAGE_MAX_BYTES` in src/lib/uploads.ts (server enforces the same cap). */
const CHAT_IMAGE_MAX_BYTES = 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** Convert a base64 data URL into a File ready for multipart upload. */
function dataUrlToFile(url: string, filename: string): File {
  const [meta, b64] = url.split(",", 2);
  const mime = meta.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

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
  meta: ItemMeta;
  onMetaChange: (v: ItemMeta) => void;
  imageUrl: string | null;
  onImageChange: (v: string | null) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function CreateEditModal({
  roomId, editingItemId, itemType, onItemTypeChange, title, onTitleChange,
  contentFields, onContentFieldsChange, meta, onMetaChange, imageUrl, onImageChange, onCancel, onSubmit,
}: CreateEditModalProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Source file the user picked, handed to the cropper. Null = cropper closed. */
  const [cropSource, setCropSource] = useState<File | null>(null);
  const typeTabLabel = (tp: string) => ({ clue: t("tabClue"), info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[tp] || tp);

  // Type-specific metadata is persisted (lifted to the parent). The 初始持有人 select
  // remains UI-only for now — initial-holder distribution is tracked in backlog
  // (docs/spec/room_left_side.md).
  const { source, visibility, relation, category, quantity } = meta;
  const [holder, setHolder] = useState("");

  const fieldCls = "w-full px-3 py-2.5 border border-input-border bg-input-bg rounded-theme text-text text-sm outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary placeholder:text-text-dim";
  const pillCls = (active: boolean, activeCls: string) =>
    `px-3.5 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${active ? activeCls : "border-border bg-surface-alt/40 text-text-muted hover:text-text hover:border-primary/30"}`;

  /* Open the cropper instead of uploading directly: it always re-encodes as JPEG
     and caps the output bytes, which both eliminates the silent oversized-image
     failure and gives the host control over framing. */
  const handlePick = (file: File | undefined) => {
    setUploadError(null);
    if (!file) return;
    if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
      setUploadError(t("errorImageType"));
      return;
    }
    setCropSource(file);
  };

  /* Receives the cropper's base64 dataURL → uploads it → surfaces server errors. */
  const handleCroppedUpload = async (dataUrl: string) => {
    setUploading(true);
    setUploadError(null);
    try {
      const cropped = dataUrlToFile(dataUrl, `inventory-${Date.now()}.jpg`);
      if (cropped.size > CHAT_IMAGE_MAX_BYTES) {
        setUploadError(t("errorImageTooLarge"));
        return;
      }
      const fd = new FormData();
      fd.append("file", cropped);
      const res = await fetch(`/api/rooms/${roomId}/images`, { method: "POST", body: fd });
      if (!res.ok) {
        let msg = tCommon("error");
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        if (res.status === 413) msg = t("errorImageTooLarge");
        else if (res.status === 415) msg = t("errorImageType");
        setUploadError(msg);
        return;
      }
      const { url } = await res.json();
      onImageChange(url);
      setCropSource(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : tCommon("error"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overlay-backdrop p-4" onClick={onCancel}>
        <div className="bg-surface rounded-theme theme-border p-6 max-w-lg w-full max-h-[88vh] overflow-y-auto shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-5">
            <h3 className={`font-bold text-xl font-theme-display ${typeColorClass[itemType]}`}>
              {editingItemId !== null ? t("editItem") : t("createTyped", { type: typeTabLabel(itemType) })}
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
                        active ? typeActiveClass[tp] : "border-border bg-surface-alt/40 hover:border-primary/30"
                      }`}>
                      <Icon className={`w-5 h-5 ${active ? typeColorClass[tp] : "text-text-muted"}`} strokeWidth={1.75} />
                      <span className={`text-xs font-bold ${active ? typeColorClass[tp] : "text-text-muted"}`}>{typeTabLabel(tp)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title / Name (+ Identity for character) */}
            {itemType === "character" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("charNameLabel")}</label>
                  <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder={t("charNamePlaceholder")} className={fieldCls} />
                </div>
                <div>
                  <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("identityLabel")}</label>
                  <input value={contentFields.basicInfo} onChange={e => onContentFieldsChange({...contentFields, basicInfo: e.target.value})}
                    placeholder={t("identityPlaceholder")} className={fieldCls} />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-text-dim font-medium mb-1.5 block">{itemType === "item" ? t("itemNameLabel") : t("titleLabel")}</label>
                <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder={t("titlePlaceholder")} className={fieldCls} />
              </div>
            )}

            {/* Info — source */}
            {itemType === "info" && (
              <div>
                <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("sourceLabel")}</label>
                <div className="flex flex-wrap gap-2">
                  {([["kp", t("sourceKp")], ["player", t("sourcePlayer")], ["system", t("sourceSystem")]] as const).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => onMetaChange({ ...meta, source: v })} className={pillCls(source === v, "border-ai bg-ai text-white")}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Character — relationship */}
            {itemType === "character" && (
              <div>
                <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("relationLabel")}</label>
                <div className="flex flex-wrap gap-2">
                  {([["ally", t("relationAlly"), "border-success bg-success text-white"],
                     ["neutral", t("relationNeutral"), "border-accent bg-accent text-accent-foreground"],
                     ["hostile", t("relationHostile"), "border-danger bg-danger text-white"],
                     ["unknown", t("relationUnknown"), "border-text-dim bg-text-dim text-surface"]] as const).map(([v, label, cls]) => (
                    <button key={v} type="button" onClick={() => onMetaChange({ ...meta, relation: v })} className={pillCls(relation === v, cls)}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Item — category */}
            {itemType === "item" && (
              <div>
                <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("categoryLabel")}</label>
                <div className="flex flex-wrap gap-2">
                  {([["weapon", t("catWeapon")], ["tool", t("catTool")], ["consumable", t("catConsumable")], ["other", t("catOther")]] as const).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => onMetaChange({ ...meta, category: v })} className={pillCls(category === v, "border-success bg-success text-white")}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Content / Traits / Description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-text-dim font-medium">
                  {itemType === "character" ? t("traitsLabel") : itemType === "item" ? t("descLabel") : t("contentLabel")}
                </label>
                <span className="text-[10px] text-text-dim">{t("markdownHint")}</span>
              </div>
              {(itemType === "clue" || itemType === "info") && (
                <textarea value={contentFields.text} onChange={e => onContentFieldsChange({...contentFields, text: e.target.value})}
                  placeholder={t("contentPlaceholder")} rows={5} className={`${fieldCls} resize-none leading-relaxed`} />
              )}
              {itemType === "character" && (
                <textarea value={contentFields.detail} onChange={e => onContentFieldsChange({...contentFields, detail: e.target.value})}
                  placeholder={t("detailPlaceholder")} rows={4} className={`${fieldCls} resize-none leading-relaxed`} />
              )}
              {itemType === "item" && (
                <textarea value={contentFields.appearance} onChange={e => onContentFieldsChange({...contentFields, appearance: e.target.value})}
                  placeholder={t("appearancePlaceholder")} rows={4} className={`${fieldCls} resize-none leading-relaxed`} />
              )}
            </div>

            {/* Info — visibility */}
            {itemType === "info" && (
              <div>
                <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("visibilityLabel")}</label>
                <div className="grid grid-cols-2 gap-3">
                  {([["all", t("visibilityAll"), Icons.Eye], ["kp", t("visibilityKp"), Icons.Lock]] as const).map(([v, label, Ico]) => (
                    <button key={v} type="button" onClick={() => onMetaChange({ ...meta, visibility: v })}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-theme border text-sm font-bold transition cursor-pointer ${
                        visibility === v ? "border-ai/50 bg-ai/10 text-text" : "border-border bg-surface-alt/40 text-text-muted hover:text-text"
                      }`}>
                      <Ico className="w-4 h-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence / avatar / item image (clue + character + item) */}
            {(itemType === "clue" || itemType === "character" || itemType === "item") && (
              <div>
                <label className="text-xs text-text-dim font-medium mb-1.5 block">
                  {itemType === "character" ? t("avatarLabel") : itemType === "item" ? t("itemImageLabel") : t("imageLabel")}
                </label>
                {imageUrl ? (
                  <div className="relative rounded-theme overflow-hidden border border-border">
                    {/* User-supplied image URL (arbitrary domain or data URL) — next/image can't optimize these. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="" className="w-full max-h-48 object-cover" />
                    <button onClick={() => onImageChange(null)} aria-label={tCommon("close")}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                      <Icons.X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 py-6 rounded-theme border border-dashed border-border text-text-muted hover:border-primary/40 hover:text-text transition cursor-pointer">
                    {uploading ? <Icons.Loader2 className="w-5 h-5 animate-spin" /> : (itemType === "character" ? <Icons.User className="w-5 h-5" /> : <Icons.Image className="w-5 h-5" />)}
                    <span className="text-sm">{uploading ? tCommon("loading") : (itemType === "character" ? t("avatarUploadHint") : itemType === "item" ? t("itemUploadHint") : t("uploadHint"))}</span>
                    <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden"
                      onChange={e => { handlePick(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                )}
                <p className="mt-1.5 text-[11px] text-text-dim">{t("uploadConstraintHint")}</p>
                {uploadError && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-theme border border-danger/40 bg-danger/10 text-xs text-danger">
                    <Icons.AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Item — quantity + initial holder */}
            {itemType === "item" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("quantityLabel")}</label>
                  <ThemedSelect value={quantity} onChange={e => onMetaChange({ ...meta, quantity: Number(e.target.value) })}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                  </ThemedSelect>
                </div>
                <div>
                  <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("holderLabel")}</label>
                  <ThemedSelect value={holder} onChange={e => setHolder(e.target.value)}>
                    <option value="">{t("holderPlaceholder")}</option>
                  </ThemedSelect>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 justify-end mt-1 items-center">
              <button onClick={onCancel} className="px-5 py-2.5 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt text-sm font-bold cursor-pointer transition">{tCommon("cancel")}</button>
              <button onClick={onSubmit} disabled={!title}
                className="btn-primary px-6 py-2.5 rounded-theme bg-gradient-to-b from-success to-success/80 text-primary-foreground font-bold text-sm cursor-pointer transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none shadow-[0_0_16px_rgb(var(--theme-success)/0.35)]">{editingItemId !== null ? t("confirm") : t("create")}</button>
            </div>
          </div>
        </div>
      </div>
      {/* Character avatars crop square; clue/item photos stay free-form. */}
      {cropSource && (
        <ImageCropper
          file={cropSource}
          aspectRatio={itemType === "character" ? 1 : undefined}
          onCancel={() => setCropSource(null)}
          onConfirm={handleCroppedUpload}
        />
      )}
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
                  <span className="inline-flex items-center gap-1.5"><Icons.User className="w-3.5 h-3.5" /> {p.nickname || p.username}</span>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${isSelected ? "bg-primary border-primary text-white" : "border-input-border bg-input-bg"}`}>
                    {isSelected && <Icons.Check className="w-3 h-3" />}
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
  readOnly: boolean;
  onClose: () => void;
  onEdit: (item: InventoryItem) => void;
  onShareOpen: () => void;
  onDistribute: (itemId: number) => void;
}

export function DetailModal({
  detailItem, detailDist, isHost, history, readOnly,
  onClose, onEdit, onShareOpen, onDistribute,
}: DetailModalProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const [previewOpen, setPreviewOpen] = useState(false);
  const typeLabel = (tStr: string) => ({ clue: t("tabClue"), info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[tStr] || tStr);
  const TypeIcon = typeIcon[detailItem.type];
  const type = detailItem.type;

  const recipients = Array.from(new Set(history.filter(h => h.itemId === detailItem.id).map(h => h.toUsername).filter(Boolean)));
  // Players don't receive distribution history; fall back to their own holding.
  const holderNames = recipients.length > 0 ? recipients.join(" · ") : (detailDist?.toUsername || "");
  const timeline = history.filter(h => h.itemId === detailItem.id)
    .slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const fmtTime = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  };
  const fmtClock = (d: string) => {
    const dt = new Date(d);
    return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  };
  // Character: basicInfo is shown as the identity subtitle, so the body is the detail field only.
  const parsed = (() => { try { return JSON.parse(detailItem.contentJson); } catch { return {}; } })();
  const identity: string = type === "character" ? (parsed.basicInfo || "") : "";
  const bodyContent = type === "character" ? (parsed.detail || "") : formatContent(detailItem);
  const showImage = type === "clue" || type === "item";
  // Persisted metadata (older items may be null → fall back to the create defaults).
  const mSource = detailItem.source || "kp";
  const mVisibility = detailItem.visibility || "all";
  const mRelation = detailItem.relation || "ally";
  const mCategory = detailItem.category || "tool";
  const mQuantity = detailItem.quantity ?? 1;

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overlay-backdrop p-4" onClick={onClose}>
        <div className="bg-surface rounded-theme theme-border p-6 max-w-lg w-full max-h-[88vh] overflow-y-auto shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
          {/* Type badge (+ category for item) ... source/relation badge + close */}
          <div className="flex justify-between items-start mb-3 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border border-current/50 bg-surface-alt/40 ${typeColorClass[type]}`}>
                <TypeIcon className="w-3.5 h-3.5" /> {typeLabel(type)}
              </span>
              {type === "item" && (
                <span className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full border border-border bg-surface-alt/40 text-text-muted">{t(categoryKey[mCategory])}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {type === "info" && (
                <span className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-ai text-white">{t(sourceKey[mSource])}</span>
              )}
              {type === "character" && (
                <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full border ${relationBadgeClass[mRelation]}`}>{t(relationKey[mRelation])}</span>
              )}
              <button onClick={onClose} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                <Icons.X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Title — character gets an avatar badge + identity subtitle */}
          {type === "character" ? (
            <div className="flex items-start gap-3 mb-4">
              {detailItem.imageUrl ? (
                <button type="button" onClick={() => setPreviewOpen(true)} aria-label={t("imageEnlarge")}
                  className="shrink-0 rounded-theme overflow-hidden border border-accent/40 cursor-zoom-in hover:brightness-110 transition">
                  {/* User-supplied image URL (arbitrary domain or data URL) — next/image can't optimize these. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={detailItem.imageUrl} alt={detailItem.title} className="w-14 h-14 object-cover block" />
                </button>
              ) : (
                <div className="w-14 h-14 rounded-theme flex items-center justify-center bg-accent/15 border border-accent/40 text-accent font-bold text-2xl shrink-0 font-theme-display">{detailItem.title.charAt(0)}</div>
              )}
              <div className="min-w-0">
                <h3 className="font-bold text-2xl text-text leading-tight">{detailItem.title}</h3>
                {identity && <p className="text-sm text-text-muted mt-0.5">{identity}</p>}
              </div>
            </div>
          ) : (
            <h3 className="font-bold text-2xl text-text mb-4">{detailItem.title}</h3>
          )}

          {/* Evidence / item image — clue + item only */}
          {showImage && (
            detailItem.imageUrl ? (
              <button type="button" onClick={() => setPreviewOpen(true)} aria-label={t("imageEnlarge")}
                className="block w-full mb-4 rounded-theme overflow-hidden border border-border cursor-zoom-in hover:brightness-105 transition group relative">
                {/* User-supplied image URL (arbitrary domain or data URL) — next/image can't optimize these. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detailItem.imageUrl} alt={detailItem.title} className="w-full max-h-72 object-cover block" />
                <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <Icons.Search className="w-3.5 h-3.5" />
                </span>
              </button>
            ) : (
              <div className="rounded-theme border border-border bg-surface-alt flex items-center justify-center h-44 mb-4"
                style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 14px, transparent 14px 28px)" }}>
                <span className="text-text-dim text-sm bg-surface/60 px-3 py-1 rounded-theme">{type === "item" ? t("itemPhoto") : t("evidencePhoto")}</span>
              </div>
            )
          )}

          {/* Content (markdown) — plain body text, no surrounding panel */}
          {bodyContent.trim() && (
            <div className="text-sm text-text leading-relaxed">
              <MarkdownRenderer content={bodyContent} />
            </div>
          )}

          {/* Metadata row(s) per type */}
          {type === "character" ? (
            <div className="mt-4 flex flex-col gap-1.5 px-3 py-2.5 rounded-theme border border-border bg-surface-alt/40 text-sm">
              <div className="flex items-center gap-2">
                <Icons.Clock className="w-4 h-4 text-text-muted shrink-0" />
                <span className="text-text-dim shrink-0">{t("createdTime")}:</span>
                <span className="text-text">{fmtClock(detailItem.createdAt)}</span>
              </div>
            </div>
          ) : type === "info" ? (
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-theme border border-border bg-surface-alt/40">
                {mVisibility === "kp" ? <Icons.Lock className="w-4 h-4 text-text-muted shrink-0" /> : <Icons.Eye className="w-4 h-4 text-text-muted shrink-0" />} <span className="text-text">{t(visibilityKey[mVisibility])}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-theme border border-border bg-surface-alt/40 min-w-0">
                <Icons.User className="w-4 h-4 text-text-muted shrink-0" /> <span className="text-text-dim shrink-0">{t("holderInline")}</span> <span className="text-text truncate">{holderNames}</span>
              </div>
            </div>
          ) : type === "item" ? (
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-3 text-sm">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-theme border border-border bg-surface-alt/40 min-w-0">
                <Icons.User className="w-4 h-4 text-text-muted shrink-0" /> <span className="text-text-dim shrink-0">{t("holderInline")}</span> <span className="text-text truncate">{holderNames}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-theme border border-success/40 bg-success/10 text-success font-bold">
                <Icons.Package className="w-4 h-4" /> ×{mQuantity}
              </div>
            </div>
          ) : holderNames && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-theme border border-border bg-surface-alt/40 text-sm">
              <Icons.User className="w-4 h-4 text-text-muted shrink-0" />
              <span className="text-text-dim shrink-0">{t("holderInline")}</span>
              <span className="text-text truncate">{holderNames}</span>
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

          {/* Footer — player viewing their own copy: wood 分发 button → opens the share modal */}
          {detailDist && !readOnly && (
            <div className="mt-5">
              <button onClick={onShareOpen}
                className="btn-primary w-full inline-flex items-center justify-center gap-2 py-3 rounded-theme bg-gradient-to-b from-primary to-primary/80 text-primary-foreground font-bold text-sm cursor-pointer transition hover:brightness-110 shadow-[var(--theme-glow)]">
                <Icons.Send className="w-4 h-4" /> {type === "item" ? t("itemUseShare") : t("shareAction")}
              </button>
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
                className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-theme bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">
                <Icons.Send className="w-4 h-4" /> {t("distribute")}
              </button>
            </div>
          )}
        </div>
      </div>
      {previewOpen && detailItem.imageUrl && (
        <ImagePreview src={detailItem.imageUrl} alt={detailItem.title} onClose={() => setPreviewOpen(false)} />
      )}
    </Portal>
  );
}

/* === SHARE MODAL — player-side "分发道具" (multi-select, host excluded) === */
interface ShareModalProps {
  item: InventoryItem;
  fromName: string | null;
  players: InventoryPlayer[];
  userId: number;
  hostId?: number;
  onCancel: () => void;
  onShare: (targetIds: number[]) => void;
}

export function ShareModal({ item, fromName, players, userId, hostId, onCancel, onShare }: ShareModalProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const TypeIcon = typeIcon[item.type];
  const typeLabel = (s: string) => ({ clue: t("tabClue"), info: t("tabInfo"), character: t("tabChar"), item: t("tabItem") }[s] || s);

  // Targets exclude the viewer and the host. Bots are always selectable (they have no
  // SSE presence); human members are selectable only while online.
  const targets = players.filter(p => p.id !== userId && p.id !== hostId);
  const isSelectable = (p: InventoryPlayer) => !!p.isBot || !!p.isOnline;
  const selectableIds = targets.filter(isSelectable).map(p => p.id);
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (id: number) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.includes(id));

  // Item summary meta line: 类型 [· 来源/关系] [· 类别 · ×数量].
  const metaParts = [typeLabel(item.type)];
  if (item.type === "info" && item.source) metaParts.push(t(sourceKey[item.source]));
  if (item.type === "character" && item.relation) metaParts.push(t(relationKey[item.relation]));
  if (item.type === "item") { metaParts.push(t(categoryKey[item.category || "tool"])); metaParts.push(`×${item.quantity ?? 1}`); }
  const metaLine = metaParts.join(" · ");

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 overlay-backdrop p-4" onClick={onCancel}>
        <div className="bg-surface rounded-theme theme-border p-6 max-w-md w-full max-h-[88vh] overflow-y-auto shadow-2xl border border-border overlay-modal" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-xl text-text font-theme-display">{t("shareTitle")}</h3>
            <button onClick={onCancel} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <Icons.X className="w-5 h-5" />
            </button>
          </div>

          {/* Item summary */}
          <div className="flex items-center gap-3 px-3 py-3 rounded-theme border border-border bg-surface-alt/40 mb-4">
            <div className={`w-11 h-11 rounded-theme flex items-center justify-center border ${typeActiveClass[item.type]} ${typeColorClass[item.type]}`}>
              <TypeIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-text truncate">{item.title}</div>
              <div className="text-xs text-text-muted truncate">{metaLine}</div>
            </div>
            {fromName && <div className="text-xs text-text-dim shrink-0">{t("shareFrom", { name: fromName })}</div>}
          </div>

          {/* Distribute-to header + select all */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-dim font-medium">{t("shareTo")}</span>
            {selectableIds.length > 0 && (
              <button onClick={() => setSelected(allSelected ? [] : selectableIds)} className="text-xs font-bold text-primary hover:text-primary-hover cursor-pointer">{t("shareSelectAll")}</button>
            )}
          </div>

          {/* Player list */}
          <div className="flex flex-col gap-2 max-h-[42vh] overflow-y-auto pr-1">
            {targets.map(p => {
              const selectable = isSelectable(p);
              const isSel = selected.includes(p.id);
              const color = p.avatarColor || getRandomColorForUser(p.id);
              const name = p.nickname || p.username;
              return (
                <button key={p.id} type="button" disabled={!selectable} onClick={() => selectable && toggle(p.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-theme border text-left transition ${
                    !selectable ? "border-border/60 bg-surface-alt/20 opacity-50 cursor-not-allowed"
                      : isSel ? "border-primary/60 bg-primary/10 cursor-pointer"
                        : "border-border bg-surface-alt/40 hover:border-primary/30 cursor-pointer"
                  }`}>
                  <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: color, color: getContrastColor(color) }}>{name.charAt(0)}</span>
                  <span className="flex-1 min-w-0 truncate text-text font-medium">{name}</span>
                  {p.isBot && <span className="text-[10px] font-bold text-ai border border-ai/40 bg-ai/10 px-1.5 py-0.5 rounded shrink-0">BOT</span>}
                  {!selectable && <span className="text-xs text-text-dim shrink-0">{t("shareOffline")}</span>}
                  <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isSel ? "bg-primary border-primary text-white" : "border-input-border bg-input-bg"}`}>
                    {isSel && <Icons.Check className="w-3.5 h-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Info note */}
          <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-theme border border-border bg-surface-alt/30 text-xs text-text-muted">
            <Icons.Info className="w-4 h-4 shrink-0 mt-0.5" /> <span>{t("shareNote")}</span>
          </div>

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-3">
            <button onClick={onCancel} className="px-5 py-2.5 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt text-sm font-bold cursor-pointer transition">{tCommon("cancel")}</button>
            <button onClick={() => onShare(selected)} disabled={selected.length === 0}
              className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-theme bg-gradient-to-b from-primary to-primary/80 text-primary-foreground font-bold text-sm cursor-pointer transition hover:brightness-110 disabled:opacity-40 shadow-[var(--theme-glow)]">
              <Icons.Send className="w-4 h-4" /> {t("shareConfirmCount", { count: selected.length })}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
