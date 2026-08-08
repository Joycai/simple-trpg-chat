"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Megaphone, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { getDiceAnnouncerSettingsAction, setDiceAnnouncerAction } from "@/app/actions/room";

interface BotOption {
  id: number;
  nickname: string;
}

/**
 * Host-side 投娘 (dice announcer) picker — RoomSettings → 通用 tab.
 * Self-contained like RoomBackgroundManager: fetches its own state and
 * applies each change immediately via its own server action, independent of
 * the surrounding settings form. Design: docs/design/dice-announcer.md.
 */
export function DiceAnnouncerSettings({ roomId }: { roomId: number }) {
  const t = useTranslations("diceAnnouncer");
  const [bots, setBots] = useState<BotOption[]>([]);
  const [botId, setBotId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getDiceAnnouncerSettingsAction(roomId).then((res) => {
      if (cancelled) return;
      if (res.success) {
        setBots(res.bots);
        setBotId(res.botId);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const enabled = botId !== null;
  const noBots = bots.length === 0;

  const applyBotId = useCallback(
    async (next: number | null) => {
      setSaving(true);
      setError("");
      const res = await setDiceAnnouncerAction(roomId, next);
      if (!res.success) {
        setError(res.error);
      } else {
        setBotId(next);
      }
      setSaving(false);
    },
    [roomId]
  );

  const handleToggle = () => {
    if (enabled) {
      applyBotId(null);
    } else if (bots.length > 0) {
      applyBotId(bots[0].id);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-text-dim">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="bg-danger/10 border border-danger/30 text-text text-sm px-3 py-2 rounded-theme flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <label className="flex items-center gap-3 px-4 py-3 rounded-theme border border-border hover:border-text-muted transition cursor-pointer select-none">
        <span className="flex items-center justify-center shrink-0 text-ai">
          <Megaphone className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-text">{t("toggleLabel")}</span>
          <span className="block text-xs text-text-muted mt-0.5">
            {noBots ? t("noBotsHint") : t("toggleHint")}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("toggleLabel")}
          disabled={saving || (noBots && !enabled)}
          onClick={handleToggle}
          className={`relative w-11 h-6 rounded-full shrink-0 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            enabled ? "bg-ai" : "bg-input-border"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </label>

      {enabled && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-dim font-medium">{t("botSelectLabel")}</label>
          <select
            value={botId ?? ""}
            disabled={saving}
            onChange={(e) => applyBotId(Number(e.target.value))}
            className="bg-input-bg border border-input-border rounded-theme px-3 py-2 text-sm text-text outline-none focus:border-primary disabled:opacity-50"
          >
            {botId !== null && !bots.some((b) => b.id === botId) && (
              <option value={botId}>{t("unknownBot")}</option>
            )}
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nickname}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-xs text-text-dim">{t("providerHint")}</p>
    </div>
  );
}
