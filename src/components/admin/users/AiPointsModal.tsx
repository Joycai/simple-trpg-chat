"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CircleDollarSign, X } from "lucide-react";
import { updateUserAiPoints } from "@/app/admin/actions";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { Notice } from "@/components/shared/Notice";
import type { User, PointsMode } from "./types";

// Resolve the final balance from the chosen mode + entered amount.
const finalPoints = (current: number, mode: PointsMode, amount: number) =>
  mode === "set" ? Math.max(0, amount)
  : mode === "subtract" ? Math.max(0, current - amount)
  : current + amount;

export function AiPointsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const t = useTranslations("admin");
  const router = useRouter();

  const [mode, setMode] = useState<PointsMode>("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<"" | "success" | "error">("");

  const current = Number(user.aiPoints ?? 0);
  const amt = parseFloat(amount);
  const preview = isNaN(amt) || amt < 0 ? current : finalPoints(current, mode, amt);
  const sign = mode === "add" ? "+" : mode === "subtract" ? "−" : "=";
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const modes: { key: PointsMode; label: string; active: string }[] = [
    { key: "add", label: t("pointsAdd"), active: "border-success/50 bg-success/10 text-success" },
    { key: "subtract", label: t("pointsSubtract"), active: "border-danger/50 bg-danger/10 text-danger" },
    { key: "set", label: t("pointsSet"), active: "border-primary/50 bg-primary/10 text-primary" },
  ];
  const confirmLabel = mode === "add" ? t("confirmAdd") : mode === "subtract" ? t("confirmSubtract") : t("confirmSet");

  const handleUpdate = async (close: () => void) => {
    const value = parseFloat(amount);
    if (isNaN(value) || value < 0) {
      setMsg(t("pointsRequireAmount"));
      setStatus("error");
      return;
    }
    const final = finalPoints(current, mode, value);
    try {
      await updateUserAiPoints(user.id, final, note.trim() || undefined);
      router.refresh();
      close();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : t("pointsUpdateFail"));
      setStatus("error");
    }
  };

  return (
    <OverlayShell
      onClose={onClose}
      rootClassName="p-4"
      panelClassName="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
            <h3 className="font-bold text-text text-lg font-theme-display flex items-center gap-2">
              <CircleDollarSign className="w-5 h-5 text-ai" />
              {t("aiPointsColumn")}
            </h3>
            <button onClick={close} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 flex flex-col gap-4">
            {/* Balance card */}
            <div className="rounded-theme border border-border bg-surface-alt/40 py-5 text-center">
              <div className="text-xs text-text-muted">{user.displayName} · {t("currentBalance")}</div>
              <div className="text-4xl font-bold text-ai font-theme-display mt-1">{fmt(current)}</div>
            </div>

            {/* Mode */}
            <div className="grid grid-cols-3 gap-2">
              {modes.map(m => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`py-2.5 rounded-theme text-sm font-medium border transition cursor-pointer ${
                    mode === m.key ? m.active : "border-border text-text-muted hover:text-text hover:bg-surface-alt"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-text-dim font-medium">{t("amountLabel")}</label>
              <div className="flex items-center gap-2 px-3.5 py-3 bg-input-bg border border-input-border rounded-theme transition focus-within:ring-[3px] focus-within:ring-ai/[0.18] focus-within:border-ai">
                <span className="text-lg font-bold text-ai">{sign}</span>
                <input
                  type="number" step="0.01" min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && handleUpdate(close)}
                  className="flex-1 min-w-0 bg-transparent outline-none text-text text-lg font-bold placeholder:text-text-dim"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {[100, 500, 1000].map(v => (
                  <button key={v} type="button" onClick={() => setAmount(String(v))}
                    className="px-3 py-1.5 rounded-theme text-xs font-medium border border-border text-text-muted hover:text-ai hover:border-ai/40 hover:bg-ai/10 transition cursor-pointer">
                    {mode === "set" ? v : `${sign}${v}`}
                  </button>
                ))}
                <button type="button" onClick={() => setAmount("")}
                  className="px-3 py-1.5 rounded-theme text-xs font-medium border border-border text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                  {t("custom")}
                </button>
              </div>
            </div>

            {/* Note */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-text-dim font-medium">{t("noteLabel")}</label>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={200}
                placeholder={t("notePlaceholder")}
                className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary"
              />
            </div>

            {/* After-balance preview */}
            <div className="flex items-center justify-between px-3.5 py-3 rounded-theme border border-border bg-surface-alt/40">
              <span className="text-sm text-text-muted">{t("afterBalance")}</span>
              <span className="text-lg font-bold text-success font-theme-display">{fmt(preview)}</span>
            </div>

            {msg && <Notice variant={status === "error" ? "error" : "success"}>{msg}</Notice>}

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={close} className="px-4 py-2 text-sm text-text-muted hover:text-text transition cursor-pointer">{t("cancel")}</button>
              <button onClick={() => handleUpdate(close)}
                className="px-6 py-2.5 bg-gradient-to-b from-ai to-ai/80 hover:brightness-110 text-ai-foreground rounded-theme font-bold text-sm transition cursor-pointer shadow-[0_0_18px_rgb(var(--theme-ai)/0.4)]">
                {confirmLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </OverlayShell>
  );
}
