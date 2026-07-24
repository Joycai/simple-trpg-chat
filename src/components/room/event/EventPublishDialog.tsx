"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { publishEventAction, addEventViewersAction, type EventView } from "@/app/actions/event";
import { EventTimeLabel, type EventPlayer } from "./event-helpers";

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
  const showList = isAdd || scope === "limited";
  const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((p) => p.id)));
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

  const scopeBtn = (active: boolean, tone: "success" | "warning") =>
    `flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-theme border text-sm font-bold transition cursor-pointer ${
      active
        ? tone === "success"
          ? "border-success/60 bg-success/10 text-success"
          : "border-warning/60 bg-warning/10 text-warning"
        : "border-border bg-surface/50 text-text-muted hover:bg-surface-alt"
    }`;

  const PlayerRow = ({ p }: { p: EventPlayer }) => {
    const on = selected.has(p.id);
    return (
      <button
        onClick={() => toggle(p.id)}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-theme border text-sm transition cursor-pointer ${
          on ? "border-primary/50 bg-primary/8" : "border-border bg-surface/50 hover:bg-surface-alt"
        }`}
      >
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0" style={{ background: p.avatarColor || "rgb(var(--theme-primary))" }}>
          {p.nickname.slice(0, 1)}
        </span>
        <span className="flex-1 text-left truncate text-text font-medium">{p.nickname}</span>
        <span className={`w-[18px] h-[18px] rounded-[6px] border-2 flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary" : "border-text-muted"}`}>
          {on && <Icons.Check className="w-3 h-3 text-primary-foreground" />}
        </span>
      </button>
    );
  };

  return (
    <OverlayShell onClose={onClose} portal panelClassName="w-full max-w-md mx-4 h-[78vh] max-h-[600px] min-h-[440px] bg-surface theme-border rounded-theme shadow-2xl flex flex-col overflow-hidden">
      {(close) => (
        <>
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border shrink-0">
            <h3 className="font-bold text-text text-lg font-theme-display flex-1 truncate">
              {isAdd ? t("addViewersTitle", { title: event.title }) : t("publishTitle", { title: event.title })}
            </h3>
            <button onClick={close} className="text-text-muted hover:text-text cursor-pointer"><Icons.X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col px-5 py-4 gap-4">
            {/* event summary */}
            <div className="shrink-0 flex items-center gap-3 p-3 rounded-theme border border-accent/25 bg-accent/[0.06]">
              <span className="w-10 h-10 rounded-theme shrink-0 flex items-center justify-center border border-accent/30 bg-accent/12 text-accent">
                <Icons.Flag className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-bold text-text truncate">{event.title}</div>
                <EventTimeLabel payload={event.timePayload} className="text-xs text-text-muted mt-0.5" />
              </div>
            </div>

            {/* scope toggle (publish only) */}
            {!isAdd && (
              <div className="shrink-0">
                <div className="text-xs font-bold text-text-muted mb-1.5">{t("publishScope")}</div>
                <div className="flex gap-2.5">
                  <button onClick={() => setScope("all")} className={scopeBtn(scope === "all", "success")}>
                    <Icons.Users className="w-4 h-4" /> {t("scopeEveryone")}
                  </button>
                  <button onClick={() => setScope("limited")} className={scopeBtn(scope === "limited", "warning")}>
                    <Icons.User className="w-4 h-4" /> {t("scopeLimited")}
                  </button>
                </div>
              </div>
            )}

            {/* list region — fixed height, scrolls; a placeholder keeps the height
                constant in "everyone" mode so the dialog never resizes */}
            <div className="flex-1 min-h-0 flex flex-col">
              {showList ? (
                <>
                  <div className="flex items-center justify-between shrink-0 mb-1.5">
                    <span className="text-xs font-bold text-text-muted">{t("selectViewers")}</span>
                    {selectable.length > 0 && (
                      <button onClick={toggleAll} className="text-xs font-bold text-primary hover:underline cursor-pointer">
                        {allSelected ? t("clearAll") : t("selectAll")}
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
                    {selectable.length === 0 ? (
                      <p className="text-sm text-text-dim italic py-2">{t("noSelectablePlayers")}</p>
                    ) : (
                      selectable.map((p) => <PlayerRow key={p.id} p={p} />)
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-2 text-text-dim">
                  <span className="w-11 h-11 rounded-full flex items-center justify-center bg-success/10 text-success"><Icons.Users className="w-5 h-5" /></span>
                  <p className="text-sm max-w-[15rem]">{t("scopeAllDesc")}</p>
                </div>
              )}
            </div>

            {error && <p className="text-sm text-danger shrink-0">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border shrink-0">
            <button onClick={close} className="px-4 py-2 rounded-theme border border-border text-text text-sm font-bold hover:bg-surface-alt transition cursor-pointer">{tCommon("cancel")}</button>
            <button
              onClick={submit}
              disabled={!canSubmit || busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-theme bg-accent text-accent-foreground text-sm font-bold shadow-[var(--theme-glow)] hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
            >
              {busy ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Eye className="w-4 h-4" />}
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
