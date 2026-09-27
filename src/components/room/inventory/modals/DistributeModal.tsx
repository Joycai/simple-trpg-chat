"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { Notice } from "@/components/shared/Notice";
import { usePlayerLabel } from "@/components/shared/host-label";
import type { InventoryItem, InventoryPlayer } from "../inventory-types";

/* === DISTRIBUTE MODAL === */
interface DistributeModalProps {
  distributeItemId: number;
  roomItems: InventoryItem[];
  players: InventoryPlayer[];
  userId: number;
  distributeTargets: number[];
  setDistributeTargets: React.Dispatch<React.SetStateAction<number[]>>;
  onCancel: () => void;
  /** Resolves true once every recipient got it — the modal then plays its exit
   *  and calls `onCancel`. */
  onDistribute: (targets: number[] | "all") => Promise<boolean>;
  /** Why the last hand-out failed (per recipient); shown above the actions. */
  error?: ReactNode;
  /** Hand-out in flight — blocks both distribute buttons. */
  busy?: boolean;
}

export function DistributeModal({
  distributeItemId, roomItems, players, userId,
  distributeTargets, setDistributeTargets, onCancel, onDistribute,
  error, busy = false,
}: DistributeModalProps) {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const playerLabel = usePlayerLabel();

  const distItem = roomItems.find(it => it.id === distributeItemId);
  const otherPlayers = players.filter(p => p.id !== userId);

  return (
    <OverlayShell portal onClose={onCancel} layerClassName="z-[60]" scrimClassName="bg-scrim/50"
      panelClassName="bg-surface rounded-theme theme-border p-6 max-w-md w-full mx-4 shadow-2xl border border-border overlay-modal">
      {(close) => (
        <>
          <div className="flex justify-between items-start mb-4 gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-lg text-text">{t("selectTarget")}</h3>
              {distItem && <p className="text-xs text-text-muted truncate mt-0.5">{distItem.title}</p>}
            </div>
            <button onClick={close} className="text-text-muted hover:text-text text-xl leading-none cursor-pointer shrink-0">×</button>
          </div>

          {/* Distribute to all */}
          <button type="button" onClick={async () => { if (await onDistribute("all")) close(); }} disabled={busy}
            className="disabled:opacity-40 w-full bg-accent hover:bg-accent-hover text-accent-foreground py-2 rounded-md font-bold text-sm cursor-pointer transition flex items-center justify-center gap-1.5 shadow-sm">
            {t("distributeAll")}
          </button>

          <div className="flex items-center gap-2 text-text-dim text-[11px] my-3">
            <span className="h-px bg-border flex-1"></span>
            <span>{t("selectMultipleHint", { player: playerLabel })}</span>
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

          {error && <Notice variant="error" className="mt-4">{error}</Notice>}

          {/* Actions */}
          <div className="flex gap-2 mt-4 pt-3 border-t border-border">
            <button type="button" onClick={close}
              className="flex-1 py-2 rounded-md text-xs font-bold text-text-muted hover:text-text hover:bg-surface-alt cursor-pointer transition">
              {tCommon("cancel")}
            </button>
            <button type="button" onClick={async () => { if (await onDistribute(distributeTargets)) close(); }} disabled={distributeTargets.length === 0 || busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-success hover:bg-success/90 disabled:opacity-40 text-white py-2 rounded-md font-bold text-xs cursor-pointer transition">
              {busy && <Icons.Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t("distributeConfirm", { count: distributeTargets.length })}
            </button>
          </div>
        </>
      )}
    </OverlayShell>
  );
}
