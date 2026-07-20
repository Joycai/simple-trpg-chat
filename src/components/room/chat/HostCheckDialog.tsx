"use client";

import { useEffect, useState } from "react";
import { requestSkillCheckAction, psychologyHiddenRollAction, requestSanCheckAction } from "@/app/actions/room";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "@/components/shared/icons";
import { ThemedSelect } from "@/components/shared/ThemedSelect";
import type { RuleCapabilities } from "@/lib/rules";
import { useHostLabel, usePlayerLabel } from "@/components/shared/host-label";

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
  /** Rule-declared check-request specialization (狩魂者: DC + 时髦骰, name optional). */
  checkOptions?: RuleCapabilities["checkRequestOptions"];
  onClose: () => void;
}

export function HostCheckDialog({ roomId, players, isPrivate = false, channelTargetUserId, mode = "check", checkOptions, onClose }: Props) {
  const t = useTranslations("hostCheck");
  const tCommon = useTranslations("common");
  const hostLabel = useHostLabel();
  const playerLabel = usePlayerLabel();
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [skillName, setSkillName] = useState("");
  const [diceType, setDiceType] = useState("d100");
  const [successExpr, setSuccessExpr] = useState("0");
  const [failureExpr, setFailureExpr] = useState("1d6");
  // Rule-specialized fields (狩魂者): optional DC + style-dice count.
  const [dcInput, setDcInput] = useState("");
  const [styleDice, setStyleDice] = useState(0);
  const styleBounds = checkOptions?.styleDiceField;

  // Recent skill-name history — last 10 entries, per-room, stored client-side.
  // KP's habitual skill names are a local convenience; no server round-trip needed.
  const [history, setHistory] = useState<string[]>([]);
  const historyKey = `trpg-check-history-${roomId}`;

  useEffect(() => {
    if (mode !== "check") return;
    try {
      const raw = localStorage.getItem(historyKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHistory(parsed.filter((x): x is string => typeof x === "string").slice(0, 10));
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, [historyKey, mode]);

  const pushHistory = (name: string) => {
    const next = [name, ...history.filter(h => h !== name)].slice(0, 10);
    setHistory(next);
    try {
      localStorage.setItem(historyKey, JSON.stringify(next));
    } catch {
      /* storage unavailable — non-fatal */
    }
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(historyKey);
    } catch {
      /* non-fatal */
    }
  };

  const nonBotIds = players.filter(p => !p.isBot).map(p => p.id);
  const allNonBotSelected = nonBotIds.length > 0 && nonBotIds.every(id => selectedIds.has(id));

  // Identity tone per check type (drives checkboxes / focus rings); the submit
  // button uses the host action tone (accent) except psychology (ai/violet).
  const tone = mode === "psychology" ? "ai" : mode === "sancheck" ? "accent" : "primary";
  const btnTone = mode === "psychology" ? "ai" : "accent";

  const title = mode === "psychology" ? t("psyTitle") : mode === "sancheck" ? t("sanTitle") : t("title");
  const TitleIcon = mode === "psychology" ? Icons.Eye : mode === "sancheck" ? Icons.Droplet : null;
  const submitLabel = mode === "psychology" ? t("psySubmit") : mode === "sancheck" ? t("sanSubmit") : t("btnSubmit");

  const togglePlayer = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // "Require everyone (excluding bots)" — selects all non-bot players, or clears if already all selected.
  const requireAllNoBot = () => {
    if (allNonBotSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(nonBotIds));
  };

  // DC is optional even for specialized rules (blank → rule default); style
  // dice must parse within the declared bounds.
  const dcParsed = dcInput.trim() === "" ? undefined : parseInt(dcInput, 10);
  const dcValid = dcParsed === undefined || (!isNaN(dcParsed) && dcParsed >= 0 && dcParsed <= 999);

  const canSubmit = selectedIds.size > 0 && (
    mode === "psychology" ? true
      : mode === "sancheck" ? !!successExpr.trim() && !!failureExpr.trim()
        : checkOptions ? dcValid && (checkOptions.skillNameOptional || !!skillName.trim())
          : !!skillName.trim()
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const targets = [...selectedIds];
    if (mode === "psychology") {
      await psychologyHiddenRollAction(roomId, targets, isPrivate ? channelTargetUserId : undefined);
    } else if (mode === "sancheck") {
      await requestSanCheckAction(roomId, targets, successExpr.trim(), failureExpr.trim(), isPrivate, channelTargetUserId);
    } else {
      const name = skillName.trim();
      await requestSkillCheckAction(
        roomId, targets, name, checkOptions ? "d20" : diceType, isPrivate, channelTargetUserId,
        checkOptions ? { dc: dcParsed, styleDice } : undefined
      );
      if (name) pushHistory(name);
    }
    close();
  };

  const titleToneCls = tone === "primary" ? "text-primary" : tone === "ai" ? "text-ai" : "text-accent";
  const linkToneCls = titleToneCls;
  const ringCls = tone === "primary"
    ? "focus:ring-primary/[0.18] focus:border-primary"
    : tone === "ai" ? "focus:ring-ai/[0.18] focus:border-ai" : "focus:ring-accent/[0.18] focus:border-accent";
  const fieldCls = `w-full px-3.5 py-3 border border-input-border bg-input-bg rounded-theme text-text text-sm outline-none focus:ring-[3px] placeholder:text-text-dim transition ${ringCls}`;

  const rowCls = (sel: boolean) => sel
    ? (tone === "primary" ? "border-primary/50 bg-primary/10" : tone === "ai" ? "border-ai/50 bg-ai/10" : "border-accent/50 bg-accent/10")
    : "border-border bg-surface-alt/30 hover:bg-surface-alt";
  const boxCls = (sel: boolean) => sel
    ? (tone === "primary" ? "bg-primary border-primary text-primary-foreground"
      : tone === "ai" ? "bg-ai border-ai text-ai-foreground" : "bg-accent border-accent text-accent-foreground")
    : "border-input-border bg-input-bg text-transparent";
  const btnCls = btnTone === "ai"
    ? "bg-gradient-to-b from-ai to-ai/80 text-ai-foreground shadow-[0_0_18px_rgb(var(--theme-ai)/0.4)]"
    : "bg-gradient-to-b from-accent to-accent/80 text-accent-foreground shadow-[0_0_18px_rgb(var(--theme-accent)/0.4)]";

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 ${backdropClass}`} onClick={close}>
      <div className={`bg-surface theme-border overlay-modal rounded-theme shadow-2xl p-6 w-full max-w-md ${panelClass}`}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h3 className="flex items-center gap-2 font-bold text-xl text-text font-theme-display">
            {TitleIcon && <TitleIcon className={`w-5 h-5 ${titleToneCls}`} />}
            {title}
          </h3>
          <button onClick={close} aria-label={tCommon("close")}
            className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Psychology hidden-roll notice */}
          {mode === "psychology" && (
            <div className="flex gap-2.5 px-4 py-3 rounded-theme border border-ai/30 bg-ai/5">
              <Icons.Info className="w-4 h-4 text-ai shrink-0 mt-0.5" />
              <span className="text-sm text-text-muted leading-relaxed">{t("psyHint", { host: hostLabel, player: playerLabel })}</span>
            </div>
          )}

          {/* Player selection (title is rule-specific: 调查员 / 冒险者 / 特工 / …) */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">{t("selectPlayers", { player: playerLabel })}</span>
              {nonBotIds.length > 0 && (
                <button onClick={requireAllNoBot} className={`text-sm font-medium hover:underline cursor-pointer ${linkToneCls}`}>
                  {allNonBotSelected ? t("deselectAll") : t("requireAllNoBot")}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
              {players.map(p => {
                const sel = selectedIds.has(p.id);
                return (
                  <label key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-theme border cursor-pointer transition select-none ${rowCls(sel)}`}>
                    <input type="checkbox" checked={sel} onChange={() => togglePlayer(p.id)} className="sr-only" />
                    <span className={`flex items-center justify-center w-5 h-5 rounded-[6px] border shrink-0 transition ${boxCls(sel)}`}>
                      <Icons.Check className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-[15px] text-text">{p.nickname}</span>
                    {p.isBot && (
                      <span className="text-[10px] font-bold text-ai border border-ai/40 rounded px-1.5 py-0.5 leading-none">
                        {t("botBadge")}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Normal check: skill + dice */}
          {mode === "check" && (
            <>
              <div>
                <label className="text-sm text-text-muted mb-2 block">{t("skillName")}</label>
                <input value={skillName} onChange={e => setSkillName(e.target.value)}
                  placeholder={checkOptions?.skillNameOptional ? t("skillOptionalPlaceholder") : t("skillPlaceholder")}
                  className={fieldCls} autoFocus onKeyDown={e => e.key === "Enter" && handleSubmit()} />

                {/* Recent skill-name history — click a tag to fill the input. */}
                {history.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex-1 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
                      <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-text-dim">
                        <Icons.Clock className="w-3 h-3 text-accent" />
                        {t("recentChecks")}
                      </span>
                      <span className="flex-1 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {history.map((name, i) => (
                        <button key={name} type="button" onClick={() => setSkillName(name)}
                          className={`px-2.5 py-1 rounded-theme text-[13px] transition cursor-pointer ${
                            i === 0
                              ? "bg-primary text-primary-foreground border border-primary-hover"
                              : "bg-surface-alt text-text border border-accent/40 hover:bg-primary/10 hover:border-primary/50"
                          }`}>
                          {name}
                        </button>
                      ))}
                      <button type="button" onClick={clearHistory}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-theme text-[12px] text-text-muted border border-dashed border-border hover:text-text hover:border-text-dim transition cursor-pointer">
                        <Icons.Trash2 className="w-3 h-3" />
                        {t("clearHistory")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {checkOptions ? (
                /* Rule-specialized fields (狩魂者): optional DC + style dice. */
                <div className="grid grid-cols-2 gap-3">
                  {checkOptions.dcField && (
                    <div>
                      <label className="text-sm text-text-muted mb-2 block">{t("dcLabel")}</label>
                      <input type="number" min={0} max={999} value={dcInput}
                        onChange={e => setDcInput(e.target.value)} placeholder={t("dcPlaceholder")}
                        className={fieldCls} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
                    </div>
                  )}
                  {styleBounds && (
                    <div>
                      <label className="text-sm text-text-muted mb-2 block">
                        {t("styleDiceLabel", { min: styleBounds.min, max: styleBounds.max })}
                      </label>
                      <input type="number" min={styleBounds.min} max={styleBounds.max} value={styleDice}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10);
                          setStyleDice(isNaN(v) ? 0 : Math.min(styleBounds.max, Math.max(styleBounds.min, v)));
                        }}
                        className={fieldCls} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-sm text-text-muted mb-2 block">{t("diceType")}</label>
                  <ThemedSelect value={diceType} onChange={e => setDiceType(e.target.value)}>
                    <option value="d100">d100</option>
                    <option value="d20">d20</option>
                    <option value="d10">d10</option>
                  </ThemedSelect>
                </div>
              )}
            </>
          )}

          {/* Sanity check: success / failure loss */}
          {mode === "sancheck" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-text-muted mb-2 block">{t("sanSuccessLoss")}</label>
                <input value={successExpr} onChange={e => setSuccessExpr(e.target.value)} placeholder={t("sanLossPlaceholder")}
                  className={fieldCls} autoFocus />
              </div>
              <div>
                <label className="text-sm text-text-muted mb-2 block">{t("sanFailureLoss")}</label>
                <input value={failureExpr} onChange={e => setFailureExpr(e.target.value)} placeholder={t("sanLossPlaceholder")}
                  className={fieldCls} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
              </div>
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!canSubmit}
            className={`w-full py-3 rounded-theme font-bold text-sm transition hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:shadow-none ${btnCls}`}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
