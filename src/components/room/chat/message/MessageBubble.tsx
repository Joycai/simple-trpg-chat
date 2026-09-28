"use client";

import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { formatTime } from "@/lib/format/time";
import { ImagePreview } from "@/components/shared/ImagePreview";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { Icons } from "@/components/shared/icons";
import { ResourceStatusTooltip } from "@/components/room/chat/ResourceStatusTooltip";
import { getContrastColor, getRandomColorForUser } from "@/lib/ui/avatar-colors";
import type { Audience } from "@/lib/messaging/audience";
import { useHostLabel } from "@/components/shared/host-label";
import { DiceResultDisplay, RollIcon, type DiceDetailJson } from "./dice";
import type { DiceView } from "./dice-view";
import { useAvatarHoverCard } from "./useAvatarHoverCard";

// Stable `useSyncExternalStore` callbacks. The store never changes, so subscribe
// is a no-op; the snapshot pair gives us a "true on client / false on server"
// mount flag without a `useEffect`.
const subscribeNoop = () => () => {};
const getClientTrue = () => true;
const getServerFalse = () => false;

/**
 * A regular chat row — avatar (with the resource hover card), header line
 * (name, badges, visibility / command echo, sender menu, time) and the bubble:
 * dice result, sticker, image or markdown text, plus the 投娘 quip.
 */
export const MessageBubble = memo(function MessageBubble({
  nickname,
  content,
  type,
  diceDetail,
  parsedDetail,
  dice,
  isPrivate,
  audience,
  createdAt,
  entered,
  rowEnterClass,
  isOwn,
  senderId,
  isHost,
  hostId,
  roomId,
  canView,
  displayNickname,
  displayAvatar,
  displayAvatarColor,
  displayIsBot,
  onViewCharacter,
  onStartDM,
}: {
  nickname: string;
  content: string;
  type: "text" | "dice" | "image" | "sticker" | "clue";
  diceDetail?: string | null;
  /** diceDetail parsed once by ChatMessage. */
  parsedDetail: Record<string, unknown> | null;
  /** Dice derivations (null unless a dice row). */
  dice: DiceView | null;
  isPrivate: boolean;
  audience?: Audience;
  createdAt: string;
  entered: boolean;
  rowEnterClass: string;
  isOwn: boolean;
  senderId?: number;
  isHost: boolean;
  hostId?: number;
  roomId?: number;
  /** Whether the viewer may open this sender's resource hover card. */
  canView: boolean;
  /** Header identity — the sender's, or the 投娘 bot's when it announces the roll. */
  displayNickname: string;
  displayAvatar: string | null | undefined;
  displayAvatarColor: string | null | undefined;
  displayIsBot: boolean;
  onViewCharacter?: (userId: number, nickname: string) => void;
  onStartDM?: (userId: number) => void;
}) {
  const t = useTranslations("chat");
  const tRoom = useTranslations("room");
  const hostLabel = useHostLabel();
  // `formatTime` reads `new Date()` and diverges between SSR and client.
  // useSyncExternalStore returns the server snapshot (false) during SSR and the
  // client snapshot (true) thereafter, avoiding the setState-in-effect pattern.
  const mounted = useSyncExternalStore(subscribeNoop, getClientTrue, getServerFalse);
  const [showMenu, setShowMenu] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // 投娘 quip placeholder: shown while quipPending, auto-hidden after 8s so a
  // missed SSE patch doesn't breathe forever (re-appears if the quip patches
  // in later, or on next full reload once it's landed in diceDetail).
  const [showQuipPlaceholder, setShowQuipPlaceholder] = useState(true);
  useEffect(() => {
    if (type !== "dice") return;
    const pending = !!dice?.announcer?.quipPending;
    if (!pending) return;
    const timer = setTimeout(() => setShowQuipPlaceholder(false), 8000);
    return () => clearTimeout(timer);
    // Mount-once: each ChatMessage instance is keyed by message id in ChatArea,
    // so it never needs to re-arm for the same card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { avatarRef, isHovered, charData, loading, coords, handleMouseEnter, handleMouseLeave } =
    useAvatarHoverCard({ roomId, senderId, canView });

  useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = () => setShowMenu(false);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [showMenu]);

  const isDice = type === "dice";
  const isImage = type === "image";
  const isSticker = type === "sticker";
  const diceMeta = dice?.meta ?? null;
  const diceCommandEcho = dice?.commandEcho ?? null;
  const diceRollKind = dice?.rollKind ?? "plain";
  const diceCardKind = dice?.cardKind ?? null;
  const diceProxyNick = dice?.proxyNick ?? null;
  const diceAnnouncer = dice?.announcer ?? null;
  // The sender-name menu: DM for a member's messages, plus 编辑角色卡 for the
  // host — also on a bot's messages (the card entry rule includes bots).
  const canOpenMenu = !!senderId && !isOwn && (!displayIsBot || (isHost && !!onViewCharacter && !diceAnnouncer));

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
        onMouseLeave={handleMouseLeave}
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
            className={`text-[13px] font-semibold text-text-muted inline-flex items-center gap-1 ${canOpenMenu ? "cursor-pointer hover:underline select-none" : ""}`}
            onClick={(e) => {
              if (canOpenMenu) {
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
              {/* Same rule as the member list: the host, on someone else's message — bots included. */}
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
              {onStartDM && !displayIsBot && (
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
