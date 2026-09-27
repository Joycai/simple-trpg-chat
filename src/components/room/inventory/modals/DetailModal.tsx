"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { ImagePreview } from "@/components/shared/ImagePreview";
import { useHostLabel, usePlayerLabel } from "@/components/shared/host-label";
import {
  formatContent, type InventoryItem, type Distribution,
} from "../inventory-types";
import {
  typeIcon, typeColorClass, sourceKey, visibilityKey, relationKey, categoryKey, relationBadgeClass,
} from "../inventory-styles";

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
  const hostLabel = useHostLabel();
  const playerLabel = usePlayerLabel();
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
    <>
    <OverlayShell portal onClose={onClose} layerClassName="z-[60]" scrimClassName="bg-scrim/50" rootClassName="p-4"
      panelClassName="bg-surface rounded-theme theme-border p-6 max-w-lg w-full max-h-[88vh] overflow-y-auto shadow-2xl border border-border overlay-modal">
      {(close) => (
        <>
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
                <span className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-ai text-white">{t(sourceKey[mSource], { host: hostLabel, player: playerLabel })}</span>
              )}
              {type === "character" && (
                <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full border ${relationBadgeClass[mRelation]}`}>{t(relationKey[mRelation])}</span>
              )}
              <button onClick={close} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
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
                <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-scrim/55 text-on-scrim flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
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
                {mVisibility === "kp" ? <Icons.Lock className="w-4 h-4 text-text-muted shrink-0" /> : <Icons.Eye className="w-4 h-4 text-text-muted shrink-0" />} <span className="text-text">{t(visibilityKey[mVisibility], { host: hostLabel })}</span>
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
        </>
      )}
    </OverlayShell>
      {previewOpen && detailItem.imageUrl && (
        <ImagePreview src={detailItem.imageUrl} alt={detailItem.title} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}
