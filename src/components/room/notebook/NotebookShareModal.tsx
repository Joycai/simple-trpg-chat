"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { Portal } from "@/components/room/inventory/InventorySkeletons";
import { getRandomColorForUser, getContrastColor } from "@/lib/avatar-colors";
import type { InventoryPlayer } from "@/components/room/inventory/inventory-helpers";
import type { Note } from "./notebook-helpers";

interface NotebookShareModalProps {
  note: Note;
  players: InventoryPlayer[];
  /** The sharing user — excluded from the recipient list. */
  userId: number;
  onCancel: () => void;
  onShare: (targetIds: number[]) => void;
  sending: boolean;
}

/**
 * Pick recipients for a note copy. Unlike inventory sharing, a note copy is
 * async + persistent, so offline members are valid targets (they see it on
 * their next open); bots have no notebook and are excluded. The copy is
 * independent — the modal's info line spells that out so the sender knows edits
 * won't sync.
 */
export function NotebookShareModal({ note, players, userId, onCancel, onShare, sending }: NotebookShareModalProps) {
  const t = useTranslations("notebook");
  const tCommon = useTranslations("common");

  const targets = players.filter((p) => p.id !== userId && !p.isBot);
  const targetIds = targets.map((p) => p.id);
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (id: number) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allSelected = targetIds.length > 0 && targetIds.every((id) => selected.includes(id));

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 overlay-backdrop p-4" onClick={onCancel}>
        <div className="bg-surface rounded-theme theme-border p-6 max-w-md w-full max-h-[88vh] overflow-y-auto shadow-2xl border border-border overlay-modal" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-xl text-text font-theme-display">{t("shareTitle")}</h3>
            <button onClick={onCancel} aria-label={tCommon("close")} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <Icons.X className="w-5 h-5" />
            </button>
          </div>

          {/* Note summary */}
          <div className="flex items-center gap-3 px-3 py-3 rounded-theme border border-border bg-surface-alt/40 mb-4">
            <div className="w-11 h-11 rounded-theme flex items-center justify-center border border-accent/40 bg-accent/10 text-accent shrink-0">
              <Icons.NotebookPen className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-text truncate">{note.title}</div>
              <div className="text-xs text-text-muted truncate">{t("shareSummary")}</div>
            </div>
          </div>

          {/* Recipients header + select all */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-dim font-medium">{t("shareTo")}</span>
            {targetIds.length > 0 && (
              <button onClick={() => setSelected(allSelected ? [] : targetIds)} className="text-xs font-bold text-primary hover:text-primary-hover cursor-pointer">{t("shareSelectAll")}</button>
            )}
          </div>

          {/* Member list */}
          {targets.length === 0 ? (
            <p className="text-sm text-text-dim text-center py-8">{t("shareNoMembers")}</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[42vh] overflow-y-auto pr-1">
              {targets.map((p) => {
                const isSel = selected.includes(p.id);
                const color = p.avatarColor || getRandomColorForUser(p.id);
                const name = p.nickname || p.username;
                return (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-theme border text-left transition cursor-pointer ${
                      isSel ? "border-primary/60 bg-primary/10" : "border-border bg-surface-alt/40 hover:border-primary/30"
                    }`}>
                    <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: color, color: getContrastColor(color) }}>{name.charAt(0)}</span>
                    <span className="flex-1 min-w-0 truncate text-text font-medium">{name}</span>
                    <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isSel ? "bg-primary border-primary text-white" : "border-input-border bg-input-bg"}`}>
                      {isSel && <Icons.Check className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Copy note */}
          <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-theme border border-border bg-surface-alt/30 text-xs text-text-muted">
            <Icons.Info className="w-4 h-4 shrink-0 mt-0.5" /> <span>{t("shareCopyNote")}</span>
          </div>

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-3">
            <button onClick={onCancel} className="px-5 py-2.5 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt text-sm font-bold cursor-pointer transition">{tCommon("cancel")}</button>
            <button onClick={() => onShare(selected)} disabled={selected.length === 0 || sending}
              className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-theme bg-gradient-to-b from-primary to-primary/80 text-primary-foreground font-bold text-sm cursor-pointer transition hover:brightness-110 disabled:opacity-40 shadow-[var(--theme-glow)]">
              {sending ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Send className="w-4 h-4" />}
              {t("shareConfirmCount", { count: selected.length })}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
