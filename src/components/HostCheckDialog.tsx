"use client";

import { useState } from "react";
import { requestSkillCheckAction, psychologyHiddenRollAction, requestSanCheckAction } from "@/app/actions/room";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";

interface Player {
  id: number;
  nickname: string;
  isBot?: boolean;
}

type CheckMode = "check" | "psychology" | "sancheck";

interface Props {
  roomId: number;
  players: Player[];
  isPrivate?: boolean;
  channelTargetUserId?: number;
  mode?: CheckMode;
  onClose: () => void;
}

export function HostCheckDialog({ roomId, players, isPrivate = false, channelTargetUserId, mode = "check", onClose }: Props) {
  const t = useTranslations("hostCheck");
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose);
  const [step, setStep] = useState<"players" | "params">("players");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [skillName, setSkillName] = useState("");
  const [diceType, setDiceType] = useState("d100");
  const [successExpr, setSuccessExpr] = useState("0");
  const [failureExpr, setFailureExpr] = useState("1d6");

  const nonBotIds = players.filter(p => !p.isBot).map(p => p.id);
  const allNonBotSelected = nonBotIds.length > 0 && nonBotIds.every(id => selectedIds.has(id));

  const title = mode === "psychology" ? t("psyTitle") : mode === "sancheck" ? t("sanTitle") : t("title");

  const togglePlayer = (id: number) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  // "Require everyone (excluding bots)" — selects all non-bot players, or clears if already all selected.
  const requireAllNoBot = () => {
    if (allNonBotSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(nonBotIds));
  };

  const handleSubmit = async () => {
    const targets = [...selectedIds];
    if (targets.length === 0) return;
    if (mode === "psychology") {
      await psychologyHiddenRollAction(roomId, targets, isPrivate ? channelTargetUserId : undefined);
    } else if (mode === "sancheck") {
      if (!successExpr.trim() || !failureExpr.trim()) return;
      await requestSanCheckAction(roomId, targets, successExpr.trim(), failureExpr.trim(), isPrivate, channelTargetUserId);
    } else {
      if (!skillName.trim()) return;
      await requestSkillCheckAction(roomId, targets, skillName.trim(), diceType, isPrivate, channelTargetUserId);
    }
    close();
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${backdropClass}`} onClick={close}>
      <div className={`bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-sm mx-4 ${panelClass}`}
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-text">{title}</h3>
          <button onClick={close} className="text-text-muted hover:text-text text-xl cursor-pointer">×</button>
        </div>

        {/* Step 1: Select players */}
        {step === "players" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{t("selectPlayers")}</span>
              {nonBotIds.length > 0 && (
                <button onClick={requireAllNoBot} className="text-xs text-primary hover:underline cursor-pointer">
                  {allNonBotSelected ? t("deselectAll") : t("requireAllNoBot")}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {players.map(p => (
                <label key={p.id}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer transition ${
                    selectedIds.has(p.id) ? "bg-primary/10 border border-primary/30" : "hover:bg-surface-alt"
                  }`}>
                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => togglePlayer(p.id)}
                    className="accent-primary" />
                  <span className="text-sm text-text">{p.nickname}</span>
                  {p.isBot && (
                    <span className="text-[10px] font-bold text-accent border border-accent/40 rounded px-1 py-0.5 leading-none">
                      {t("botBadge")}
                    </span>
                  )}
                </label>
              ))}
            </div>
            {mode === "psychology" ? (
              <button onClick={handleSubmit} disabled={selectedIds.size === 0}
                className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-accent-foreground py-2 rounded font-bold text-sm mt-2 cursor-pointer">
                {t("psySubmit")}
              </button>
            ) : (
              <button onClick={() => setStep("params")} disabled={selectedIds.size === 0}
                className="bg-primary hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded font-bold text-sm mt-2 cursor-pointer">
                {t("btnNext")}
              </button>
            )}
          </div>
        )}

        {/* Step 2: mode-specific params */}
        {step === "params" && (
          <div className="flex flex-col gap-3">
            <button onClick={() => setStep("players")} className="text-xs text-text-muted hover:text-text self-start cursor-pointer">
              {t("btnBack")}
            </button>

            {mode === "sancheck" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">{t("sanSuccessLoss")}</label>
                  <input value={successExpr} onChange={e => setSuccessExpr(e.target.value)}
                    placeholder={t("sanLossPlaceholder")}
                    className="p-2 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary"
                    autoFocus />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">{t("sanFailureLoss")}</label>
                  <input value={failureExpr} onChange={e => setFailureExpr(e.target.value)}
                    placeholder={t("sanLossPlaceholder")}
                    className="p-2 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={e => e.key === "Enter" && handleSubmit()} />
                </div>
                <button onClick={handleSubmit} disabled={!successExpr.trim() || !failureExpr.trim()}
                  className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-accent-foreground py-2 rounded font-bold text-sm mt-2 cursor-pointer">
                  {t("sanSubmit")}
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">{t("skillName")}</label>
                  <input value={skillName} onChange={e => setSkillName(e.target.value)}
                    placeholder={t("skillPlaceholder")}
                    className="p-2 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                    onKeyDown={e => e.key === "Enter" && handleSubmit()} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">{t("diceType")}</label>
                  <select value={diceType} onChange={e => setDiceType(e.target.value)}
                    className="p-2 border border-input-border bg-input-bg rounded text-sm text-text outline-none">
                    <option value="d100">d100</option>
                    <option value="d20">d20</option>
                    <option value="d10">d10</option>
                  </select>
                </div>
                <button onClick={handleSubmit} disabled={!skillName.trim()}
                  className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-accent-foreground py-2 rounded font-bold text-sm mt-2 cursor-pointer">
                  {t("btnSubmit")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
