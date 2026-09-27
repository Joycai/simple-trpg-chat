"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { Notice } from "@/components/shared/Notice";
import { getRandomColorForUser, getContrastColor } from "@/lib/ui/avatar-colors";
import { useHostLabel, usePlayerLabel } from "@/components/shared/host-label";
import type { InventoryItem, InventoryPlayer } from "../inventory-types";
import {
  typeIcon, typeColorClass, typeActiveClass, sourceKey, relationKey, categoryKey,
} from "../inventory-styles";

/* === SHARE MODAL — player-side "分发道具" (multi-select, host excluded) === */
interface ShareModalProps {
  item: InventoryItem;
  fromName: string | null;
  players: InventoryPlayer[];
  userId: number;
  hostId?: number;
  onCancel: () => void;
  /** Resolves to `"done"` when every copy went out (the modal then plays its
   *  exit and calls `onCancel`), else to the ids that failed — the selection
   *  narrows to them, since the others already hold a copy and a retry would
   *  only be refused. */
  onShare: (targetIds: number[]) => Promise<number[] | "done">;
  /** Per-recipient failures from the last send; shown above the footer. */
  error?: ReactNode;
  /** Send in flight — blocks the send button. */
  busy?: boolean;
}

export function ShareModal({ item, fromName, players, userId, hostId, onCancel, onShare, error, busy = false }: ShareModalProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const hostLabel = useHostLabel();
  const playerLabel = usePlayerLabel();
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
  if (item.type === "info" && item.source) metaParts.push(t(sourceKey[item.source], { host: hostLabel, player: playerLabel }));
  if (item.type === "character" && item.relation) metaParts.push(t(relationKey[item.relation]));
  if (item.type === "item") { metaParts.push(t(categoryKey[item.category || "tool"])); metaParts.push(`×${item.quantity ?? 1}`); }
  const metaLine = metaParts.join(" · ");

  return (
    <OverlayShell portal onClose={onCancel} layerClassName="z-[70]" scrimClassName="bg-scrim/50" rootClassName="p-4"
      panelClassName="bg-surface rounded-theme theme-border p-6 max-w-md w-full max-h-[88vh] overflow-y-auto shadow-2xl border border-border overlay-modal">
      {(close) => (
        <>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-xl text-text font-theme-display">{t("shareTitle")}</h3>
            <button onClick={close} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
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
              <button onClick={() => setSelected(allSelected ? [] : selectableIds)} className="text-xs font-bold text-primary hover:text-primary-hover cursor-pointer">{t("shareSelectAll", { player: playerLabel })}</button>
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

          {error && <Notice variant="error" className="mt-4">{error}</Notice>}

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-3">
            <button onClick={close} className="px-5 py-2.5 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt text-sm font-bold cursor-pointer transition">{tCommon("cancel")}</button>
            <button onClick={async () => {
              const res = await onShare(selected);
              if (res === "done") close(); else setSelected(res);
            }} disabled={selected.length === 0 || busy}
              className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-theme bg-gradient-to-b from-primary to-primary/80 text-primary-foreground font-bold text-sm cursor-pointer transition hover:brightness-110 disabled:opacity-40 shadow-[var(--theme-glow)]">
              {busy ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Send className="w-4 h-4" />} {t("shareConfirmCount", { count: selected.length })}
            </button>
          </div>
        </>
      )}
    </OverlayShell>
  );
}
