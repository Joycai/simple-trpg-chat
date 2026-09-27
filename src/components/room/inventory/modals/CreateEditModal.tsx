"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { ThemedSelect } from "@/components/shared/ThemedSelect";
import { ImageCropper } from "@/components/shared/ImageCropper";
import { Notice } from "@/components/shared/Notice";
import { useHostLabel, usePlayerLabel } from "@/components/shared/host-label";
import type { InventoryItemType, ContentFields, ItemMeta } from "../inventory-types";
import {
  typeIcon, typeColorClass, typeActiveClass,
} from "../inventory-styles";
const TYPE_KEYS = ["clue", "info", "character", "item"] as const;
/** Mirrors `CHAT_IMAGE_MAX_BYTES` in src/lib/media/uploads.ts (server enforces the same cap). */
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
  /** Resolves true once saved — the modal then plays its exit and calls `onCancel`. */
  onSubmit: () => Promise<boolean>;
  /** Why the last save failed; shown above the footer. */
  error?: string | null;
  /** Save in flight — blocks the submit button. */
  busy?: boolean;
}

export function CreateEditModal({
  roomId, editingItemId, itemType, onItemTypeChange, title, onTitleChange,
  contentFields, onContentFieldsChange, meta, onMetaChange, imageUrl, onImageChange, onCancel, onSubmit,
  error, busy = false,
}: CreateEditModalProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const hostLabel = useHostLabel();
  const playerLabel = usePlayerLabel();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Source file the user picked, handed to the cropper. Null = cropper closed. */
  const [cropSource, setCropSource] = useState<File | null>(null);
  /** When true, the content editor takes over the whole modal — the other
   *  fields collapse away so there's room to write. */
  const [contentExpanded, setContentExpanded] = useState(false);
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
    <>
    <OverlayShell portal onClose={onCancel} layerClassName="z-[60]" scrimClassName="bg-scrim/50" rootClassName="p-4"
      panelClassName={`bg-surface rounded-theme theme-border p-6 max-w-lg w-full ${contentExpanded ? "h-[86vh] max-h-[720px] min-h-[560px]" : "max-h-[88vh]"} flex flex-col overflow-hidden shadow-2xl border border-border overlay-modal`}>
      {(close) => (
        <>
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h3 className={`font-bold text-xl font-theme-display ${typeColorClass[itemType]}`}>
              {editingItemId !== null ? t("editItem") : t("createTyped", { type: typeTabLabel(itemType) })}
            </h3>
            <button onClick={close} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <Icons.X className="w-5 h-5" />
            </button>
          </div>

          {/* Body: the content editor stays put while every other field lives in a
              grid-rows collapse group that eases shut when the editor expands. */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            {/* Collapsible top group: type / title / type-specific meta */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-[var(--ease-spring-smooth)] ${contentExpanded ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
              <div className={`min-h-0 overflow-hidden flex flex-col gap-4 pb-4 transition-opacity duration-200 ${contentExpanded ? "opacity-0" : "opacity-100"}`}>
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
                      {([["kp", t("sourceKp", { host: hostLabel })], ["player", t("sourcePlayer", { player: playerLabel })], ["system", t("sourceSystem")]] as const).map(([v, label]) => (
                        <button key={v} type="button" onClick={() => onMetaChange({ ...meta, source: v })} className={pillCls(source === v, "border-ai bg-ai text-white")}>{label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Character — relationship */}
                {itemType === "character" && (
                  <div>
                    <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("relationLabel", { player: playerLabel })}</label>
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
              </div>
            </div>

            {/* Content / Traits / Description — expandable to the full window */}
            <div className={contentExpanded ? "flex-1 min-h-0 flex flex-col" : ""}>
              <div className="flex items-center justify-between mb-1.5 shrink-0">
                <label className="text-xs text-text-dim font-medium">
                  {itemType === "character" ? t("traitsLabel") : itemType === "item" ? t("descLabel") : t("contentLabel")}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-dim">{t("markdownHint")}</span>
                  <button type="button" onClick={() => setContentExpanded(v => !v)} aria-pressed={contentExpanded}
                    title={contentExpanded ? t("collapseEditor") : t("expandEditor")}
                    className={`p-1 rounded-theme transition cursor-pointer ${contentExpanded ? "text-primary" : "text-text-muted hover:text-text hover:bg-surface-alt"}`}>
                    {contentExpanded ? <Icons.Minimize2 className="w-4 h-4" /> : <Icons.Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {(itemType === "clue" || itemType === "info") && (
                <textarea value={contentFields.text} onChange={e => onContentFieldsChange({...contentFields, text: e.target.value})}
                  placeholder={t("contentPlaceholder")} rows={5} className={`${fieldCls} resize-none leading-relaxed ${contentExpanded ? "flex-1 min-h-0" : ""}`} />
              )}
              {itemType === "character" && (
                <textarea value={contentFields.detail} onChange={e => onContentFieldsChange({...contentFields, detail: e.target.value})}
                  placeholder={t("detailPlaceholder")} rows={4} className={`${fieldCls} resize-none leading-relaxed ${contentExpanded ? "flex-1 min-h-0" : ""}`} />
              )}
              {itemType === "item" && (
                <textarea value={contentFields.appearance} onChange={e => onContentFieldsChange({...contentFields, appearance: e.target.value})}
                  placeholder={t("appearancePlaceholder")} rows={4} className={`${fieldCls} resize-none leading-relaxed ${contentExpanded ? "flex-1 min-h-0" : ""}`} />
              )}
            </div>

            {/* Collapsible bottom group: visibility / image / quantity */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-[var(--ease-spring-smooth)] ${contentExpanded ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
              <div className={`min-h-0 overflow-hidden flex flex-col gap-4 pt-4 transition-opacity duration-200 ${contentExpanded ? "opacity-0" : "opacity-100"}`}>
                {/* Info — visibility */}
                {itemType === "info" && (
                  <div>
                    <label className="text-xs text-text-dim font-medium mb-1.5 block">{t("visibilityLabel")}</label>
                    <div className="grid grid-cols-2 gap-3">
                      {([["all", t("visibilityAll"), Icons.Eye], ["kp", t("visibilityKp", { host: hostLabel }), Icons.Lock]] as const).map(([v, label, Ico]) => (
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
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-scrim/60 text-on-scrim flex items-center justify-center hover:bg-scrim/80">
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
              </div>
            </div>
          </div>

          {error && <Notice variant="error" className="mt-4 shrink-0">{error}</Notice>}

          {/* Footer */}
          <div className="flex gap-3 justify-end pt-4 items-center shrink-0">
            <button onClick={close} className="px-5 py-2.5 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt text-sm font-bold cursor-pointer transition">{tCommon("cancel")}</button>
            <button onClick={async () => { if (await onSubmit()) close(); }} disabled={!title || busy}
              className="btn-primary inline-flex items-center gap-1.5 px-6 py-2.5 rounded-theme bg-gradient-to-b from-success to-success/80 text-primary-foreground font-bold text-sm cursor-pointer transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none shadow-[0_0_16px_rgb(var(--theme-success)/0.35)]">
              {busy && <Icons.Loader2 className="w-4 h-4 animate-spin" />}
              {editingItemId !== null ? t("confirm") : t("create")}
            </button>
          </div>
        </>
      )}
    </OverlayShell>
      {/* Character avatars crop square; clue/item photos stay free-form. */}
      {cropSource && (
        <ImageCropper
          file={cropSource}
          aspectRatio={itemType === "character" ? 1 : undefined}
          onCancel={() => setCropSource(null)}
          onConfirm={handleCroppedUpload}
        />
      )}
    </>
  );
}
