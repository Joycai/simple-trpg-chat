"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { getContrastColor, getRandomColorForUser } from "@/lib/ui/avatar-colors";
import { renderCheckProgress, renderCheckRequestContent } from "./SystemContent";

/**
 * A host's check request in the chat: who still has to roll, the viewer's own
 * roll button (or done tick), and — for the host — the proxy-roll control with
 * its target popover.
 */
export const CheckRequestPill = memo(function CheckRequestPill({
  content,
  parsedDetail,
  userId,
  messageId,
  onCheckRequest,
  onProxyCheckRequest,
  onLoadProxyTargets,
  pillEnterClass,
}: {
  content: string;
  /** The message's diceDetail, parsed once by ChatMessage. */
  parsedDetail: Record<string, unknown> | null;
  userId?: number;
  messageId?: number;
  onCheckRequest?: (messageId: number, skillName: string, opts?: { bonusDicePrompt?: boolean }) => void;
  onProxyCheckRequest?: (messageId: number, onBehalfOfUserId: number) => void;
  onLoadProxyTargets?: (messageId: number) => Promise<{
    success: boolean; error?: string; skillName?: string; isSanityCheck?: boolean;
    targets?: Array<{ userId: number; nickname: string; value: number | null }>;
  }>;
  pillEnterClass: string;
}) {
  const t = useTranslations("chat");
  const [proxyOpen, setProxyOpen] = useState(false);
  const [proxyTargets, setProxyTargets] = useState<Array<{ userId: number; nickname: string; value: number | null }> | null>(null);
  const [proxyLoading, setProxyLoading] = useState(false);
  const proxyAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!proxyOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (proxyAnchorRef.current && !proxyAnchorRef.current.contains(e.target as Node)) {
        setProxyOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [proxyOpen]);

  type CheckInfo = {
    checkRequest?: {
      targetUserIds?: number[];
      skillName?: string;
      diceType?: string;
      respondedUserIds?: number[];
      proxiedUserIds?: number[];
      sanCheck?: { successExpr?: string; failureExpr?: string };
      shCheck?: { dc?: number | null; styleDice?: number };
      ghost?: boolean;
    };
  };
  const checkInfo = parsedDetail as CheckInfo | null;
  const cr = checkInfo?.checkRequest;
  const targetIds = cr?.targetUserIds ?? [];
  const respondedIds = cr?.respondedUserIds ?? [];
  const isTarget = userId !== undefined && targetIds.includes(userId);
  const alreadyResponded = userId !== undefined && respondedIds.includes(userId);
  const totalCount = targetIds.length;
  const doneCount = respondedIds.length;
  const checkState: "target-pending" | "target-done" | "viewer" = isTarget
    ? alreadyResponded ? "target-done" : "target-pending"
    : "viewer";
  const allDone = totalCount > 0 && doneCount >= totalCount;
  const pendingIds = targetIds.filter((id) => !respondedIds.includes(id));
  // Derive request category for theming. sanity = carries sanCheck or 理智值
  // as skillName; ghost = explicit gm-private announcement; otherwise plain skill.
  const isSanity = !!cr?.sanCheck || cr?.skillName === "理智值";
  const isGhost = !!cr?.ghost;
  const checkKind: "skill" | "sanity" | "gm-private" = isGhost ? "gm-private" : isSanity ? "sanity" : "skill";
  // Host-side proxy: render a seal button so the host can roll on behalf of an
  // absent target. Skipped for gm-private (host-side from the start) and when
  // the host is also a target (their own dice button takes precedence).
  const canProxy =
    !!onProxyCheckRequest &&
    checkKind !== "gm-private" &&
    checkState !== "target-pending" &&
    pendingIds.length > 0 &&
    messageId !== undefined;
  const highlightToken =
    checkKind === "sanity" ? t("sanityCheckLabel")
    // skill + gm-private both pull the skill label straight from the request
    // (e.g. ".rc 心理学" → highlights "心理学").
    : (cr?.skillName ?? null);
  const KindIcon =
    checkKind === "sanity" ? Icons.Droplet
    : checkKind === "gm-private" ? Icons.Eye
    : Icons.Target;
  const sanInline = checkKind === "sanity" && cr?.sanCheck
    ? t("scExprInline", {
        successExpr: cr.sanCheck.successExpr ?? "0",
        failureExpr: cr.sanCheck.failureExpr ?? "0",
      })
    : null;
  // Rule-specialized request (狩魂者): surface the DC (host value or the
  // rule default 10) and the host-announced style dice, signed.
  const shStyle = cr?.shCheck?.styleDice ?? 0;
  const shInline = cr?.shCheck
    ? t("shCheckInline", {
        dc: cr.shCheck.dc ?? 10,
        style: shStyle > 0 ? `+${shStyle}` : `${shStyle}`,
      })
    : null;

  // Which of the three end states occupies the fixed-width swap slot below.
  // Derived up front so the slot can be omitted entirely when none of them
  // applies (a host who only sees the proxy control) — rendering an empty
  // 32px box there would pad the pill for no reason.
  const checkSlot =
    checkState === "target-pending" && onCheckRequest && messageId !== undefined ? "roll"
    : checkState === "target-done" ? "done"
    : !canProxy ? "idle"
    : null;

  return (
    <div
      className={`check-request flex justify-center py-2 ${pillEnterClass}`}
      data-state={checkState}
      data-check-kind={checkKind}
      data-complete={allDone ? "true" : undefined}
    >
      <div className={`check-request-body flex items-center gap-2 px-4 py-2 rounded-full ${
        checkState === "target-pending" ? "bg-accent/10 border border-accent/30" : "bg-surface-alt"
      }`}>
        <KindIcon className="check-request-kind-icon w-4 h-4 text-accent shrink-0" />
        <span className="check-request-text text-sm text-text">
          {renderCheckRequestContent(content, highlightToken)}
          {sanInline && <span className="check-request-sc-expr">{sanInline}</span>}
          {shInline && <span className="check-request-sh-expr text-text-muted">{shInline}</span>}
        </span>
        {totalCount > 0 && (
          <span className="check-request-progress text-xs text-text-muted whitespace-nowrap inline-flex items-center gap-1">
            {checkState === "target-done" || allDone ? (
              <Icons.Check className="check-request-progress-icon w-3 h-3 text-success" aria-hidden />
            ) : null}
            {renderCheckProgress(t("checkProgress", { done: doneCount, total: totalCount }))}
          </span>
        )}
        {checkKind === "gm-private" ? (
          <span className="check-request-ghost-badge inline-flex items-center gap-1 text-[11px] text-text-dim border border-border rounded-full px-2 py-0.5">
            <Icons.Lock className="w-3 h-3" />
            {t("ghostRollBadge")}
          </span>
        ) : checkSlot === "roll" || checkSlot === "done" ? (
          /* Fixed 32px slot, scoped to the two states one viewer actually
             moves between. Rolling your check swapped a `w-8 h-8` button for
             a `w-4 h-4` tick, so the pill snapped 16px narrower in the same
             frame — a jump-cut on the payoff moment of the core loop. The box
             holds the width steady so only the glyph changes.

             `idle` stays outside it: that branch is a *different audience*
             (a viewer who was never a target) and never swaps with these, so
             padding it to 32px would widen the common pill for nothing.

             The incoming state animates; the outgoing one is not held back
             (React unmounts it, and keeping a live action button mounted
             just to fade it out is a worse trade). In a stable box the 160ms
             fade-and-zoom covers the gap on its own. Kept under the 180ms
             default deliberately — this lands right after a click the user
             made, so anything slower reads as lag. */
          <span className="relative w-8 h-8 flex items-center justify-center shrink-0">
            {checkSlot === "roll" ? (
              <button
                onClick={() => onCheckRequest!(messageId!, cr?.skillName ?? "", cr?.shCheck ? { bonusDicePrompt: true } : undefined)}
                className="check-request-button bg-accent hover:bg-accent-hover text-accent-foreground w-8 h-8 rounded-full flex items-center justify-center transition attention-bounce shadow-[var(--theme-glow)]"
                title={t("clickCheck")}
              >
                <Icons.Dices className="w-4 h-4" />
              </button>
            ) : (
              <Icons.Check
                className="check-request-done w-4 h-4 text-success animate-in enter-fast fade-in zoom-in-95"
                aria-label={t("checkDone")}
              />
            )}
          </span>
        ) : checkSlot === "idle" ? (
          <Icons.Dices className="check-request-icon w-4 h-4 text-accent shrink-0" aria-hidden />
        ) : null}
        {canProxy && (
          <div ref={proxyAnchorRef} className="check-request-proxy relative inline-flex">
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Single pending target → fire immediately, no popover.
                if (pendingIds.length === 1) {
                  onProxyCheckRequest!(messageId!, pendingIds[0]);
                  return;
                }
                // Multi-pending → open the popover and lazy-load targets.
                setProxyOpen((open) => !open);
                if (!proxyOpen && onLoadProxyTargets) {
                  setProxyLoading(true);
                  onLoadProxyTargets(messageId!).then((r) => {
                    if (r.success && r.targets) setProxyTargets(r.targets);
                    setProxyLoading(false);
                  }).catch(() => setProxyLoading(false));
                }
              }}
              className="check-request-proxy-btn inline-flex items-center justify-center w-7 h-7 rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition shrink-0"
              title={t("proxyRoll")}
              aria-label={t("proxyRoll")}
              aria-expanded={proxyOpen}
              data-state={proxyOpen ? "open" : "closed"}
            >
              <Icons.Stamp className="w-3.5 h-3.5" />
            </button>
            {proxyOpen && pendingIds.length > 1 && (
              <div className="check-request-proxy-popover absolute top-full mt-2 left-1/2 -translate-x-1/2 z-30 min-w-[260px] bg-surface border border-border rounded-theme shadow-2xl py-1.5 animate-in fade-in zoom-in-95">
                <div className="check-request-proxy-header flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                  <Icons.Stamp className="w-3 h-3" />
                  <span>{t("proxyRollHeader", { skillName: cr?.skillName ?? "" })}</span>
                </div>
                {proxyLoading && !proxyTargets ? (
                  <div className="px-3 py-3 text-xs text-text-dim flex items-center gap-2">
                    <Icons.Loader2 className="w-3 h-3 animate-spin" />
                    {t("loading")}
                  </div>
                ) : (
                  <div className="py-1">
                    {(proxyTargets ?? pendingIds.map((id) => ({ userId: id, nickname: `#${id}`, value: null as number | null }))).map((target) => {
                      const missing = target.value == null;
                      return (
                        <button
                          key={target.userId}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Missing skill is allowed — the server falls back to a raw
                            // d100 attributed to the player (no success/failure grading).
                            onProxyCheckRequest!(messageId!, target.userId);
                            setProxyOpen(false);
                          }}
                          className="check-request-proxy-row w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm text-text hover:bg-surface-alt transition cursor-pointer"
                          data-missing={missing ? "true" : undefined}
                        >
                          <span
                            className="check-request-proxy-avatar w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                            style={{
                              backgroundColor: getRandomColorForUser(target.userId),
                              color: getContrastColor(getRandomColorForUser(target.userId)),
                            }}
                          >
                            {target.nickname.charAt(0).toUpperCase()}
                          </span>
                          <span className="flex-1 truncate">{target.nickname}</span>
                          <span
                            className={`check-request-proxy-tag text-[11px] font-theme-mono px-1.5 py-0.5 rounded ${
                              missing
                                ? "bg-warning/15 text-warning border border-warning/30"
                                : "bg-surface-alt text-text-dim"
                            }`}
                            title={missing ? t("proxyRawRollHint") : undefined}
                          >
                            {missing ? t("proxyRawRoll") : `${cr?.skillName ?? ""} · ${target.value}`}
                          </span>
                          <Icons.Dices className={`w-3.5 h-3.5 shrink-0 ${missing ? "text-warning" : "text-primary"}`} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
