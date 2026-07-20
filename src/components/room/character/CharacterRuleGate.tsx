"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { OverlayShell } from "@/components/shared/OverlayShell";
import {
  ensureCharacterSheetAction,
  rebuildCharacterForRoomRuleAction,
} from "@/app/actions/character";
import { getRule } from "@/lib/rules";

/** localStorage key holding the rule id the player already declined for this room. */
const dismissKey = (roomId: number) => `trpg:sheetRuleDismiss:${roomId}`;

interface CharacterRuleGateProps {
  roomId: number;
  /** The room's active rule — changing it (host switched rules) re-runs the check. */
  roomRuleTemplate: string;
  /** Observers and frozen-room players neither seed nor get prompted. */
  disabled?: boolean;
}

/**
 * Keeps a member's character sheet aligned with the room's rule template.
 *
 * On entry (and again whenever `roomRuleTemplate` changes — the host's switch
 * broadcasts `room_settings_updated`, which refreshes this prop) it asks the
 * server to reconcile: a missing sheet is seeded silently, a sheet built for a
 * different rule raises a confirm dialog. Declining is remembered per room +
 * rule, so the prompt doesn't reappear on every reload — but a switch to yet
 * another rule asks again.
 *
 * Renders nothing unless a mismatch needs the player's decision.
 */
export function CharacterRuleGate({ roomId, roomRuleTemplate, disabled = false }: CharacterRuleGateProps) {
  const t = useTranslations("character");
  const tRules = useTranslations("roomSettings");
  const router = useRouter();

  const [prompt, setPrompt] = useState<{ sheetRule: string; roomRule: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;

    ensureCharacterSheetAction(roomId).then((res) => {
      if (cancelled) return;
      if (res.status === "initialized") {
        router.refresh();
        return;
      }
      if (res.status !== "mismatch") return;
      let dismissed: string | null = null;
      try {
        dismissed = window.localStorage.getItem(dismissKey(roomId));
      } catch { /* private mode / storage disabled — just prompt */ }
      if (dismissed === res.roomRule) return;
      setPrompt({ sheetRule: res.sheetRule, roomRule: res.roomRule });
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [roomId, roomRuleTemplate, disabled, router]);

  const ruleLabel = useCallback((id: string) => {
    const key = getRule(id).labelKey;
    const label = tRules(key);
    return label === key ? id : label;
  }, [tRules]);

  const handleRebuild = async () => {
    setBusy(true);
    try {
      await rebuildCharacterForRoomRuleAction(roomId);
      try {
        window.localStorage.removeItem(dismissKey(roomId));
      } catch { /* ignore */ }
      setPrompt(null);
      router.refresh();
    } catch {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    if (prompt) {
      try {
        window.localStorage.setItem(dismissKey(roomId), prompt.roomRule);
      } catch { /* ignore */ }
    }
    setPrompt(null);
  };

  if (!prompt) return null;

  return (
    <OverlayShell
      onClose={handleDismiss}
      closeOnBackdrop={false}
      panelClassName="bg-surface theme-border overlay-modal rounded-theme shadow-2xl p-6 w-full max-w-md mx-4"
    >
      {() => (
        <>
          <div className="flex items-start gap-3">
            <span className="shrink-0 mt-0.5 w-9 h-9 rounded-theme bg-primary/15 text-primary inline-flex items-center justify-center">
              <RefreshCw className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-bold text-lg text-text font-theme-display leading-tight">
                {t("ruleChangedTitle")}
              </h3>
              <p className="mt-2 text-sm text-text-muted">
                {t("ruleChangedBody", { from: ruleLabel(prompt.sheetRule), to: ruleLabel(prompt.roomRule) })}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-theme border border-warning/40 bg-warning/10 text-xs text-text">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-px text-warning" />
            <span>{t("ruleChangedWarn")}</span>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={handleDismiss}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center py-2.5 rounded-theme border border-border text-text font-bold text-sm hover:bg-surface-alt transition cursor-pointer disabled:opacity-50"
            >
              {t("ruleChangedDismiss")}
            </button>
            <button
              onClick={handleRebuild}
              disabled={busy}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-theme bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)] disabled:opacity-50"
            >
              {t("ruleChangedConfirm")}
            </button>
          </div>
        </>
      )}
    </OverlayShell>
  );
}
