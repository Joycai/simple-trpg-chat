"use client";

import { useState } from "react";
import { requestSkillCheckAction } from "@/app/actions/room";
import { useTranslations } from "next-intl";

interface Player {
  id: number;
  nickname: string;
  isBot?: boolean;
}

interface Props {
  roomId: number;
  players: Player[];
  isPrivate?: boolean;
  channelTargetUserId?: number;
  onClose: () => void;
}

export function HostCheckDialog({ roomId, players, isPrivate = false, channelTargetUserId, onClose }: Props) {
  const t = useTranslations("hostCheck");
  const [step, setStep] = useState<"players" | "skill">("players");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [skillName, setSkillName] = useState("");
  const [diceType, setDiceType] = useState("d100");

  const nonBotIds = players.filter(p => !p.isBot).map(p => p.id);
  const allNonBotSelected = nonBotIds.length > 0 && nonBotIds.every(id => selectedIds.has(id));

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
    await requestSkillCheckAction(roomId, targets, skillName.trim(), diceType, isPrivate, channelTargetUserId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-sm mx-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-text">{t("title")}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl cursor-pointer">×</button>
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
            <button onClick={() => setStep("skill")} disabled={selectedIds.size === 0}
              className="bg-primary hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded font-bold text-sm mt-2 cursor-pointer">
              {t("btnNext")}
            </button>
          </div>
        )}

        {/* Step 2: Skill + dice */}
        {step === "skill" && (
          <div className="flex flex-col gap-3">
            <button onClick={() => setStep("players")} className="text-xs text-text-muted hover:text-text self-start cursor-pointer">
              {t("btnBack")}
            </button>
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
          </div>
        )}
      </div>
    </div>
  );
}
