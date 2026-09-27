"use client";

import { useState, useEffect, useMemo, useRef, useSyncExternalStore, memo } from "react";
import { formatTime } from "@/lib/format/time";
import { ImagePreview } from "@/components/shared/ImagePreview";
import { useTranslations } from "next-intl";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { Icons } from "@/components/shared/icons";
import { ResourceStatusTooltip } from "@/components/room/chat/ResourceStatusTooltip";
import { TimelineDivider } from "@/components/room/chat/TimelineDivider";
import { getCharacterDataAction } from "@/app/actions/character";
import { type CharacterData } from "@/lib/character/types";
import { getContrastColor, getRandomColorForUser } from "@/lib/ui/avatar-colors";
import { parseTimelinePayload } from "@/lib/messaging/timeline-payload";
import { EventCard } from "@/components/room/event/EventCard";
import { parseEventCardPayload, parseEventReceiptPayload } from "@/lib/room/story-events";
import type { Audience } from "@/lib/messaging/audience";
import type { PlayerEntry } from "@/components/room/types";
import { useHostLabel } from "@/components/shared/host-label";
import {
  DiceResultDisplay,
  RollIcon,
  diceCardType,
  getRollKind,
  parseDiceMeta,
  type DiceDetailJson,
  type DiceMetaSource,
  type RollKind,
} from "@/components/room/chat/message/DiceResult";
import {
  HelpCard,
  SYSTEM_PILL_META,
  SystemPillContent,
  renderCheckProgress,
  renderCheckRequestContent,
} from "@/components/room/chat/message/SystemContent";
import { DispatchPill, ReceiptPill } from "@/components/room/chat/message/InventoryPills";

// Stable `useSyncExternalStore` callbacks. The store never changes, so subscribe
// is a no-op; the snapshot pair gives us a "true on client / false on server"
// mount flag without a `useEffect`.
const subscribeNoop = () => () => {};
const getClientTrue = () => true;
const getServerFalse = () => false;

// LRU-capped cache (max 200 entries) for character resource data, keyed by `${roomId}-${senderId}`
const CHAR_CACHE_MAX = 200;
const characterCache = new Map<
  string,
  {
    data: CharacterData | null;
    promise?: Promise<CharacterData | null>;
  }
>();

function setCacheEntry(key: string, value: { data: CharacterData | null; promise?: Promise<CharacterData | null> }) {
  if (!characterCache.has(key) && characterCache.size >= CHAR_CACHE_MAX) {
    // Evict oldest entry
    const oldest = characterCache.keys().next().value;
    if (oldest !== undefined) characterCache.delete(oldest);
  }
  characterCache.set(key, value);
}

interface ChatMessageProps {
  nickname: string;
  content: string;
  type: "text" | "dice" | "system" | "check_request" | "image" | "sticker" | "clue";
  /** Subtype for type='system' messages. Drives the kind-specific pill / help card render. */
  systemKind?: "st" | "error" | "room-event" | "scene-marker" | "help" | "inventory-dispatch" | "inventory-receipt" | "timeline-divider" | "event-card" | "event-receipt" | null;
  diceDetail?: string | null;
  isPrivate: boolean;
  audience?: Audience;
  createdAt: string;
  /** True when this message arrived live moments ago — plays the entrance
   *  animation. Captured once on mount, so later re-renders can't replay it. */
  enter?: boolean;
  isOwn: boolean;
  isBot?: boolean;
  userId?: number;
  senderId?: number;
  isHost?: boolean;
  onViewCharacter?: (userId: number, nickname: string) => void;
  onStartDM?: (userId: number) => void;
  onCheckRequest?: (messageId: number, skillName: string, opts?: { bonusDicePrompt?: boolean }) => void;
  /** Host proxy roll. Present only for the host; when set, the check pill shows the
   *  seal button alongside the regular viewer icon. */
  onProxyCheckRequest?: (messageId: number, onBehalfOfUserId: number) => void;
  /** Loads pending targets + each player's resolved skill value for the popover preview. */
  onLoadProxyTargets?: (messageId: number) => Promise<{
    success: boolean; error?: string; skillName?: string; isSanityCheck?: boolean;
    targets?: Array<{ userId: number; nickname: string; value: number | null }>;
  }>;
  /** Called when the receipt-pill CTA (`查看背包`) is clicked — opens the inventory drawer. */
  onOpenInventory?: () => void;
  /** Set of event ids the viewer may read — decides an event card's locked/unlocked face. */
  visibleEventIds?: Set<number>;
  /** Opens an event's detail modal (from an event card / receipt). */
  onOpenEvent?: (eventId: number) => void;
  /** Host-only: withdraw (delete) a timeline-divider message by id. */
  onWithdrawTimeline?: (messageId: number) => void | Promise<void>;
  messageId?: number;
  roomId?: number;
  hostId?: number;
  avatarColor?: string | null;
  avatar?: string | null;
  /** Full member roster — used to resolve the 投娘 (dice announcer) bot's own
   *  avatar/color when a dice card is re-skinned under its identity. */
  players?: PlayerEntry[];
}

export const ChatMessage = memo(function ChatMessage({
  nickname,
  content,
  type,
  systemKind,
  diceDetail,
  isPrivate,
  audience,
  createdAt,
  enter = false,
  isOwn,
  isBot = false,
  userId,
  senderId,
  isHost = false,
  onViewCharacter,
  onStartDM,
  onCheckRequest,
  onProxyCheckRequest,
  onLoadProxyTargets,
  onOpenInventory,
  visibleEventIds,
  onOpenEvent,
  onWithdrawTimeline,
  messageId,
  roomId,
  hostId,
  avatarColor,
  avatar,
  players,
}: ChatMessageProps) {
  const t = useTranslations("chat");
  const tRoom = useTranslations("room");
  const hostLabel = useHostLabel();
  // `formatTime` reads `new Date()` and diverges between SSR and client.
  // useSyncExternalStore returns the server snapshot (false) during SSR and the
  // client snapshot (true) thereafter, avoiding the setState-in-effect pattern.
  const mounted = useSyncExternalStore(subscribeNoop, getClientTrue, getServerFalse);
  // Capture the entrance flag once — the row is keyed by message id, so this
  // stays true for the animation's lifetime and never re-arms on re-render.
  const [entered] = useState(enter);
  const rowEnterClass = entered ? "animate-in fade-in slide-in-from-bottom-1" : "";
  const pillEnterClass = entered ? "animate-in fade-in" : "";
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [charData, setCharData] = useState<CharacterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [imgError, setImgError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [proxyTargets, setProxyTargets] = useState<Array<{ userId: number; nickname: string; value: number | null }> | null>(null);
  // 投娘 quip placeholder: shown while quipPending, auto-hidden after 8s so a
  // missed SSE patch doesn't breathe forever (re-appears if the quip patches
  // in later, or on next full reload once it's landed in diceDetail).
  const [showQuipPlaceholder, setShowQuipPlaceholder] = useState(true);
  // diceDetail parsed exactly once per unique payload — every consumer below
  // (dice meta, dice card fields, check_request pill, quip placeholder,
  // DiceResultDisplay) previously re-ran JSON.parse on the same string.
  // null covers both "no detail" and "malformed detail".
  const parsedDetail = useMemo<Record<string, unknown> | null>(() => {
    if (!diceDetail) return null;
    try { return JSON.parse(diceDetail); } catch { return null; }
  }, [diceDetail]);
  useEffect(() => {
    if (type !== "dice") return;
    const pending = !!(parsedDetail as { announcer?: { quipPending?: boolean } } | null)?.announcer?.quipPending;
    if (!pending) return;
    const timer = setTimeout(() => setShowQuipPlaceholder(false), 8000);
    return () => clearTimeout(timer);
    // Mount-once: each ChatMessage instance is keyed by message id in ChatArea,
    // so it never needs to re-arm for the same card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [proxyLoading, setProxyLoading] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const proxyAnchorRef = useRef<HTMLDivElement>(null);
  // Hover-intent timer: the tooltip only mounts if the cursor rests on the
  // avatar for 120ms, so sweeping the cursor down the avatar column doesn't
  // replay the enter animation on every message.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = () => setShowMenu(false);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [showMenu]);

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

  const canView = !!(roomId && hostId && senderId && !isOwn && (
    senderId !== hostId && (isHost ? true : !isBot)
  ));

  useEffect(() => {
    if (!isHovered || !canView) return;

    const updatePosition = () => {
      if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect();
        setCoords({
          top: rect.top,
          left: rect.right + 8,
        });
      }
    };

    updatePosition();

    // rAF-throttled like the main chat scroll handler: the raw scroll event
    // fires several times per frame, and each updatePosition is a forced
    // layout (getBoundingClientRect) plus a React commit on this message.
    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    };

    // Find nearest scrollable container
    const scrollParent = avatarRef.current?.closest(".overflow-y-auto");
    if (scrollParent) {
      scrollParent.addEventListener("scroll", scheduleUpdate);
    }
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", scheduleUpdate);
      }
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [isHovered, canView]);

  const handleMouseEnter = () => {
    // Hover intent: delay the tooltip mount; the data prefetch below stays
    // immediate (fetching early is harmless).
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setIsHovered(true), 120);
    if (!canView || !roomId || !senderId) return;

    const cacheKey = `${roomId}-${senderId}`;
    const cached = characterCache.get(cacheKey);

    if (cached) {
      if (cached.promise) {
        setLoading(true);
        cached.promise.then((data) => {
          setCharData(data);
          setLoading(false);
        });
      } else {
        setCharData(cached.data);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    const promise = getCharacterDataAction(roomId, senderId)
      .then((data) => {
        setCacheEntry(cacheKey, { data, promise: undefined });
        return data;
      })
      .catch((err) => {
        console.error("Failed to fetch character data for tooltip:", err);
        characterCache.delete(cacheKey);
        return null;
      });

    setCacheEntry(cacheKey, { data: null, promise });

    promise.then((data) => {
      setCharData(data);
      setLoading(false);
    });
  };

  // Check request rendering
  if (type === "check_request") {
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
  }

  if (type === "system") {
    // Help renders as a structured 2-column card, not a pill.
    if (systemKind === "help") {
      return (
        <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`} data-kind="help">
          <HelpCard visSelfLabel={t("visSelf")} />
        </div>
      );
    }
    // Inventory dispatch: structured icon + chip pill driven by `diceDetail`.
    if (systemKind === "inventory-dispatch") {
      return <DispatchPill content={content} diceDetail={diceDetail} enter={entered} />;
    }
    // Inventory receipt: recipient-side notification with NEW/更新 badge + 查看背包 CTA.
    if (systemKind === "inventory-receipt") {
      return <ReceiptPill content={content} diceDetail={diceDetail} onOpenInventory={onOpenInventory} enter={entered} />;
    }
    // Event announcement card — locked/unlocked/retracted decided client-side.
    if (systemKind === "event-card") {
      const payload = parseEventCardPayload(diceDetail);
      if (!payload) return null;
      const unlocked = isHost || !!visibleEventIds?.has(payload.eventId);
      return (
        <div className={`flex justify-center py-2 ${pillEnterClass}`}>
          <EventCard payload={payload} unlocked={unlocked} onOpen={() => onOpenEvent?.(payload.eventId)} />
        </div>
      );
    }
    // Event receipt: a personal "you got a new event" pill opening its detail modal.
    if (systemKind === "event-receipt") {
      const r = parseEventReceiptPayload(diceDetail);
      return (
        <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`} data-kind="event-receipt">
          <button
            onClick={() => r && onOpenEvent?.(r.eventId)}
            className="system-pill-body inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full text-primary bg-primary/10 border border-primary/30 hover:bg-primary/20 transition cursor-pointer"
          >
            <Icons.ScrollText className="w-3.5 h-3.5" />
            <span>{r ? t("eventReceipt", { title: r.title }) : content}</span>
          </button>
        </div>
      );
    }
    // Timeline divider: host date separator, with a host-only withdraw affordance.
    if (systemKind === "timeline-divider") {
      return (
        <TimelineDivider
          data={parseTimelinePayload(diceDetail)}
          fallback={content}
          isHost={isHost}
          onWithdraw={
            isHost && onWithdrawTimeline && messageId !== undefined
              ? () => onWithdrawTimeline(messageId)
              : undefined
          }
        />
      );
    }
    // Legacy multi-line messages keep the block-card fallback (no system_kind set).
    const isBlock = !systemKind && content.includes("\n");
    if (isBlock) {
      return (
        <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`} data-block="true">
          <div className="system-pill-body bg-surface-alt border border-border rounded-theme px-4 py-3 text-sm text-text max-w-lg text-left">
            <SystemPillContent content={content} block />
          </div>
        </div>
      );
    }
    // Kind-tagged pill (st / error / room-event / scene-marker) or the default
    // neutral pill. `help` is already handled above, so by here `systemKind` is
    // either one of the four pill kinds or null/undefined.
    const meta = systemKind ? SYSTEM_PILL_META[systemKind] : null;
    const KindIcon = meta?.icon;
    return (
      <div
        className={`system-pill flex justify-center py-2 ${pillEnterClass}`}
        data-kind={systemKind ?? undefined}
      >
        <span
          className={`system-pill-body inline-flex items-center gap-1.5 text-xs italic px-3 py-1 rounded-full ${
            meta
              ? `${meta.className} not-italic`
              : "text-text-dim bg-surface-alt"
          }`}
        >
          {KindIcon && <KindIcon className="w-3.5 h-3.5 system-pill-icon" />}
          <span className="system-pill-text">
            {systemKind === "scene-marker" ? `— ${content} —` : content}
          </span>
        </span>
      </div>
    );
  }

  const isDice = type === "dice";
  const isImage = type === "image";
  const isSticker = type === "sticker";
  const diceMeta = isDice ? parseDiceMeta(parsedDetail as DiceMetaSource) : null;
  // Extract command echo + roll kind from diceDetail so they can be lifted out
  // of the bubble: echo into the header line, kind onto a data-attr for theming.
  let diceCommandEcho: string | null = null;
  let diceRollKind: RollKind = "plain";
  let diceCardKind: "sanity" | "breakdown" | "pool" | "bp" | "d20" | null = null;
  let diceProxyNick: string | null = null;
  let diceAnnouncer: { userId: number; nickname: string; quip?: string; quipPending?: boolean } | null = null;
  if (isDice && parsedDetail) {
    const d = parsedDetail as DiceDetailJson & {
      proxiedByNickname?: string;
      announcer?: { userId: number; nickname: string; quip?: string; quipPending?: boolean };
    };
    if (typeof d.command === "string" && d.command.trim()) {
      diceCommandEcho = d.command.trim();
    }
    diceRollKind = getRollKind(d);
    diceCardKind = diceCardType(d);
    if (typeof d.proxiedByNickname === "string" && d.proxiedByNickname) {
      diceProxyNick = d.proxiedByNickname;
    }
    if (d.announcer) {
      diceAnnouncer = d.announcer;
    }
  }

  // 投娘 (dice announcer): re-skin the card's avatar/name under the bot's
  // identity. The message keeps its real ownership (audience/isOwn/etc. all
  // stay keyed on the roller) — only the header visuals swap.
  const announcerMember = diceAnnouncer
    ? players?.find((p) => (p.users?.id ?? p.user?.id ?? p.user_id) === diceAnnouncer!.userId)
    : undefined;
  const displayNickname = diceAnnouncer ? diceAnnouncer.nickname : nickname;
  const displayAvatar = diceAnnouncer ? announcerMember?.room_members?.avatar ?? null : avatar;
  const displayAvatarColor = diceAnnouncer ? announcerMember?.room_members?.avatarColor ?? null : avatarColor;
  const displayIsBot = diceAnnouncer ? true : isBot;

  // Visibility badge shown next to the nickname. Driven by the message audience
  // (not the legacy isPrivate flag) so a DM whisper isn't mislabelled as a GM
  // hidden roll. `everyone` shows nothing; system/clue notices render elsewhere.
  const visibilityBadge =
    audience === "self" ? t("visSelf")
    : audience === "dm" ? t("visDm")
    : audience === "directed" ? t("visDirected")
    : audience === "gm" ? t("visGm", { host: hostLabel })
    : null;

  return (
    <div className={`flex gap-3 py-1.5 group ${rowEnterClass} ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar Wrapper */}
      <div
        ref={avatarRef}
        className="relative shrink-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
          setIsHovered(false);
        }}
      >
        {displayAvatar ? (
          // Avatar is a base64 data URL — next/image can't optimize these.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayAvatar}
            alt={displayNickname}
            className={`w-8 h-8 rounded-theme flex-shrink-0 transition shadow-sm ${
              isPrivate
                ? "border-2 border-private-border"
                : isOwn
                ? "border border-primary/30"
                : "border border-border"
            }`}
          />
        ) : (
          <div
            className={`w-8 h-8 rounded-theme flex items-center justify-center text-xs font-bold transition shadow-sm ${
              isPrivate
                ? "border-2 border-private-border"
                : isOwn
                ? "border border-primary/30"
                : "border border-border"
            }`}
            style={{
              backgroundColor: displayAvatarColor || getRandomColorForUser((diceAnnouncer ? diceAnnouncer.userId : senderId) || 0),
              color: getContrastColor(displayAvatarColor || getRandomColorForUser((diceAnnouncer ? diceAnnouncer.userId : senderId) || 0)),
            }}
          >
            {displayNickname.charAt(0).toUpperCase()}
          </div>
        )}

        {isHovered && canView && (
          <ResourceStatusTooltip
            loading={loading}
            charData={charData}
            nickname={nickname}
            coords={coords}
          />
        )}
      </div>

      {/* Bubble */}
      <div className={`flex flex-col max-w-[90%] sm:max-w-[85%] md:max-w-[80%] ${isOwn ? "items-end" : ""}`}>
        <div className={`flex items-center gap-2 mb-0.5 ${isOwn ? "flex-row-reverse" : ""} relative`}>
          <span
            className={`text-[13px] font-semibold text-text-muted inline-flex items-center gap-1 ${(!displayIsBot && !isOwn && senderId) ? "cursor-pointer hover:underline select-none" : ""}`}
            onClick={(e) => {
              if (!displayIsBot && !isOwn && senderId) {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }
            }}
          >
            {displayNickname}
            {displayIsBot && <Icons.Bot className="w-3.5 h-3.5 text-ai" aria-label="Bot" />}
          </span>
          {diceAnnouncer && (
            <span
              className="dice-announcer-chip inline-flex items-center gap-1 text-[10px] text-ai border border-dashed border-ai/50 bg-ai/[0.06] rounded px-1.5 py-0.5"
              title={t("announcerBadgeTitle", { nickname: diceAnnouncer.nickname })}
            >
              <Icons.Bot className="w-3 h-3" />
              {t("announcerBadge")}
            </span>
          )}
          {!diceAnnouncer && senderId !== undefined && hostId !== undefined && senderId === hostId && (
            <span className="text-[10px] font-bold text-ai bg-ai/15 border border-ai/30 px-1.5 py-0.5 rounded">
              {hostLabel}
            </span>
          )}
          {isDice && diceProxyNick && (
            <span
              className="dice-proxy-chip inline-flex items-center gap-1 text-[10px] text-primary border border-dashed border-primary/60 bg-primary/[0.06] rounded px-1.5 py-0.5"
              title={t("proxyRolledByTitle", { hostNick: diceProxyNick, host: hostLabel })}
            >
              <Icons.Stamp className="w-3 h-3" />
              {t("proxyRolledBy", { hostNick: diceProxyNick })}
            </span>
          )}
          {isDice && diceMeta?.psy ? (
            // Psychology hidden roll: header shows eye icon + the rule's "仅 <主持人> 可见" + the
            // descriptive content line ("守秘人对 苏雨 进行心理学检定"). Replaces
            // both the regular visibility badge and the command echo.
            <span className="dice-psy-header inline-flex items-center gap-1 text-[11px] text-text-dim">
              <Icons.Eye className="w-3 h-3" />
              {t("visKpOnly", { host: hostLabel })} · <span className="dice-psy-desc">{content}</span>
            </span>
          ) : (
            <>
              {visibilityBadge && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-text-dim">
                  <Icons.Lock className="w-3 h-3" />{visibilityBadge}
                </span>
              )}
              {diceCommandEcho && (
                <span className="dice-echo text-[11px] text-text-dim font-theme-mono">
                  「{diceCommandEcho}」
                </span>
              )}
            </>
          )}

          {showMenu && senderId && (
            <div
              className={`absolute bg-surface border border-border rounded-lg shadow-xl py-1.5 min-w-[120px] z-30 animate-in fade-in zoom-in-95 ${
                isOwn ? "right-0" : "left-0"
              }`}
              style={{ top: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              {isHost && onViewCharacter && (
                <button
                  onClick={() => {
                    onViewCharacter(senderId, nickname);
                    setShowMenu(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface-alt transition cursor-pointer"
                >
                  {tRoom("btnViewCard")}
                </button>
              )}
              {onStartDM && (
                <button
                  onClick={() => {
                    onStartDM(senderId);
                    setShowMenu(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface-alt transition cursor-pointer"
                >
                  <Icons.Lock className="w-3.5 h-3.5" /> {tRoom("btnDm")}
                </button>
              )}
            </div>
          )}

          <span className="text-[11px] text-text-dim opacity-0 group-hover:opacity-100 transition">
            {mounted ? formatTime(createdAt, t) : ""}
          </span>
        </div>

        {diceAnnouncer && (
          <div className={`dice-announcer-roller text-[11px] text-text-dim mb-0.5 ${isOwn ? "text-right" : ""}`}>
            <span className="font-bold text-text">{nickname}</span> {t("announcerRollerSuffix")}
          </div>
        )}

        <div
          className={`chat-bubble ${isOwn ? "chat-bubble-own" : "chat-bubble-other"} ${
            isDice ? "chat-bubble-dice" : isPrivate ? "chat-bubble-private" : isSticker ? "chat-bubble-sticker" : isImage ? "chat-bubble-image" : "chat-bubble-text"
          } break-words transition-colors ${isSticker ? "" : "rounded-theme shadow-sm"} ${isSticker ? "p-0" : isImage ? "p-1" : "px-3 py-2"} ${
            isDice
              ? "bg-dice-card-bg border border-dice-card-border text-text"
              : isPrivate
              ? "bg-private-bg border border-private-border text-text"
              : isSticker
              ? ""
              : isImage
              ? "bg-surface border border-border text-text"
              : isOwn
              ? "bg-primary/10 border border-primary/40 text-text"
              : "bg-surface border border-border text-text"
          } ${entered && isDice ? "dice-flourish" : ""}`}
          data-grade={isDice ? diceMeta?.grade : undefined}
          data-kind={isDice ? diceMeta?.kind : undefined}
          data-roll-kind={isDice ? diceRollKind : undefined}
          data-layout={isDice ? (diceCardKind ? "card" : "inline") : undefined}
          data-card={isDice ? (diceCardKind ?? undefined) : undefined}
          data-audience={isDice ? (audience ?? "everyone") : undefined}
          data-insanity={isDice && diceMeta?.insanity ? "true" : undefined}
          data-psy={isDice && diceMeta?.psy ? "true" : undefined}
        >
          {isDice ? (
            diceCardKind !== null ? (
              // Card layouts (理智 / 狩魂 / pool) render their own header/body —
              // no outer flex/icon wrapper.
              <DiceResultDisplay diceDetail={diceDetail || content} preParsed={diceDetail ? (parsedDetail as DiceDetailJson | null) : undefined} fallback={content} t={t} />
            ) : (
              <div className="dice-bubble flex items-center gap-2 flex-wrap">
                <span className="dice-icon flex items-center justify-center w-7 h-7 rounded-theme bg-primary/10 text-primary border border-primary/30 shrink-0">
                  <RollIcon kind={diceRollKind} grade={diceMeta?.grade ?? "none"} psy={diceMeta?.psy} />
                </span>
                <span className="dice-result inline-flex items-baseline gap-1 font-theme-mono text-sm leading-tight flex-wrap">
                  <DiceResultDisplay diceDetail={diceDetail || content} preParsed={diceDetail ? (parsedDetail as DiceDetailJson | null) : undefined} fallback={content} t={t} />
                </span>
              </div>
            )
          ) : isSticker ? (
            imgError ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-dim italic">
                <Icons.Smile className="w-4 h-4 not-italic" />
                <span>{t("stickerUnavailable")}</span>
              </div>
            ) : (
              // Sticker is served from an arbitrary /api path with an onError fallback — next/image adds no value here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={content}
                alt={t("stickerAlt")}
                loading="lazy"
                onError={() => setImgError(true)}
                className="max-h-32 max-w-full w-auto object-contain select-none"
                draggable={false}
              />
            )
          ) : isImage ? (
            imgError ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-text-dim italic">
                <Icons.Image className="w-4 h-4 not-italic" />
                <span>{t("imageUnavailable")}</span>
              </div>
            ) : (
              <>
                {/* Chat image is a user-supplied URL (internal /api path or arbitrary external https) — next/image
                    would require enumerating remotePatterns for domains we cannot know ahead of time. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={content}
                  alt={t("imageAlt")}
                  loading="lazy"
                  onError={() => setImgError(true)}
                  onClick={() => setPreviewOpen(true)}
                  className="max-h-64 max-w-full w-auto rounded-theme object-contain cursor-zoom-in"
                />
                {previewOpen && (
                  <ImagePreview src={content} alt={t("imageAlt")} onClose={() => setPreviewOpen(false)} />
                )}
              </>
            )
          ) : (
            <MarkdownRenderer content={content} />
          )}

          {isDice && diceAnnouncer && (
            diceAnnouncer.quip ? (
              <div className="dice-announcer-quip mt-1.5 pt-1.5 border-t border-dice-card-border/60 text-xs italic text-text-dim">
                “{diceAnnouncer.quip}”
              </div>
            ) : showQuipPlaceholder ? (
              <div className="dice-announcer-quip mt-1.5 pt-1.5 border-t border-dice-card-border/60 text-xs italic text-text-dim animate-pulse">
                ···
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
});
