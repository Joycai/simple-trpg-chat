"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { publishEventAction, addEventViewersAction, type EventView } from "@/app/actions/event";
import type { EventPlayer } from "./event-helpers";

interface EventPublishDialogProps {
  roomId: number;
  event: EventView;
  players: EventPlayer[];
  /** "publish" (choose all/limited) or "add" (append knowers to a partial event). */
  variant: "publish" | "add";
  /** Player ids that already know the event — hidden in "add" mode. */
  knownIds?: number[];
  onClose: () => void;
  onDone: () => void;
}

export function EventPublishDialog({ roomId, event, players, variant, knownIds = [], onClose, onDone }: EventPublishDialogProps) {
  const t = useTranslations("event");
  const tCommon = useTranslations("common");
  const known = new Set(knownIds);
  const selectable = players.filter((p) => !p.isBot && (variant === "publish" || !known.has(p.id)));

  const [scope, setScope] = useState<"all" | "limited">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const isAdd = variant === "add";
  const canSubmit = isAdd ? selected.size > 0 : scope === "all" || selected.size > 0;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (isAdd) {
        await addEventViewersAction(roomId, event.id, [...selected]);
      } else {
        await publishEventAction(roomId, event.id, scope === "all" ? "all" : [...selected]);
      }
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon("error"));
      setBusy(false);
    }
  };

  const PlayerRow = ({ p }: { p: EventPlayer }) => {
    const on = selected.has(p.id);
    return (
      <button
        onClick={() => toggle(p.id)}
        className={`flex items-center gap-3 px-3 py-2 rounded-theme border text-sm transition cursor-pointer ${
          on ? "border-primary/50 bg-primary/8" : "border-border bg-surface/50 hover:bg-surface-alt"
        }`}
      >
        <span className={`w-[17px] h-[17px] rounded-[5px] border-2 flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary" : "border-text-muted"}`}>
          {on && <Icons.Check className="w-3 h-3 text-primary-foreground" />}
        </span>
        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-primary-foreground shrink-0" style={{ background: p.avatarColor || "rgb(var(--theme-primary))" }}>
          {p.nickname.slice(0, 1)}
        </span>
        <span className="flex-1 text-left truncate text-text">{p.nickname}</span>
      </button>
    );
  };

  return (
    <OverlayShell onClose={onClose} panelClassName="w-full max-w-md mx-4 bg-surface theme-border rounded-theme shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
      {(close) => (
        <>
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border shrink-0">
            <Icons.Send className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-text flex-1 truncate">
              {isAdd ? t("addViewersTitle", { title: event.title }) : t("publishTitle", { title: event.title })}
            </h3>
            <button onClick={close} className="text-text-muted hover:text-text cursor-pointer"><Icons.X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
            {!isAdd && (
              <>
                <label className={`flex gap-3 p-3 rounded-theme border cursor-pointer ${scope === "all" ? "border-primary bg-primary/8" : "border-border bg-surface-alt/40"}`}>
                  <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} className="sr-only" />
                  <span className={`w-[18px] h-[18px] rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${scope === "all" ? "border-primary" : "border-text-muted"}`}>
                    {scope === "all" && <span className="w-2 h-2 rounded-full bg-primary shadow-[var(--theme-glow)]" />}
                  </span>
                  <span>
                    <span className="block font-bold text-text text-sm">{t("scopeAll")}</span>
                    <span className="block text-xs text-text-muted mt-0.5">{t("scopeAllDesc")}</span>
                  </span>
                </label>
                <label className={`flex gap-3 p-3 rounded-theme border cursor-pointer ${scope === "limited" ? "border-primary bg-primary/8" : "border-border bg-surface-alt/40"}`}>
                  <input type="radio" checked={scope === "limited"} onChange={() => setScope("limited")} className="sr-only" />
                  <span className={`w-[18px] h-[18px] rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${scope === "limited" ? "border-primary" : "border-text-muted"}`}>
                    {scope === "limited" && <span className="w-2 h-2 rounded-full bg-primary shadow-[var(--theme-glow)]" />}
                  </span>
                  <span>
                    <span className="block font-bold text-text text-sm">{t("scopeLimited")}</span>
                    <span className="block text-xs text-text-muted mt-0.5">{t("scopeLimitedDesc")}</span>
                  </span>
                </label>
              </>
            )}

            {(isAdd || scope === "limited") && (
              <div className="flex flex-col gap-1.5">
                {selectable.length === 0 ? (
                  <p className="text-sm text-text-dim italic py-2">{t("noSelectablePlayers")}</p>
                ) : (
                  selectable.map((p) => <PlayerRow key={p.id} p={p} />)
                )}
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border shrink-0">
            <button onClick={close} className="px-4 py-2 rounded-theme border border-border text-text text-sm font-bold hover:bg-surface-alt transition cursor-pointer">{tCommon("cancel")}</button>
            <button
              onClick={submit}
              disabled={!canSubmit || busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-theme bg-primary text-primary-foreground text-sm font-bold shadow-[var(--theme-glow)] hover:bg-primary-hover transition disabled:opacity-50 cursor-pointer"
            >
              {busy && <Icons.Loader2 className="w-4 h-4 animate-spin" />}
              <Icons.Send className="w-4 h-4" />
              {isAdd
                ? t("addConfirm", { count: selected.size })
                : scope === "all"
                  ? t("publishAllConfirm")
                  : t("publishLimitedConfirm", { count: selected.size })}
            </button>
          </div>
        </>
      )}
    </OverlayShell>
  );
}
