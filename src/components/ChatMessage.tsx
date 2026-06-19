"use client";

import { useState, useEffect, useRef, memo } from "react";
import { formatTime, formatDiceResult } from "@/lib/utils";
import { ImagePreview } from "./ImagePreview";
import { useTranslations } from "next-intl";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ResourceStatusTooltip } from "./ResourceStatusTooltip";
import { getCharacterDataAction } from "@/app/actions/character";
import { type CharacterData } from "@/lib/character-types";
import { getContrastColor, getRandomColorForUser } from "@/lib/avatar-colors";

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
  type: "text" | "dice" | "system" | "check_request" | "image" | "clue";
  diceDetail?: string | null;
  isPrivate: boolean;
  createdAt: string;
  isOwn: boolean;
  isBot?: boolean;
  userId?: number;
  senderId?: number;
  isHost?: boolean;
  onViewCharacter?: (userId: number, nickname: string) => void;
  onStartDM?: (userId: number) => void;
  onCheckRequest?: (messageId: number, skillName: string, diceType: string) => void;
  messageId?: number;
  roomId?: number;
  hostId?: number;
  avatarColor?: string | null;
  avatar?: string | null;
}

export const ChatMessage = memo(function ChatMessage({
  nickname,
  content,
  type,
  diceDetail,
  isPrivate,
  createdAt,
  isOwn,
  isBot = false,
  userId,
  senderId,
  isHost = false,
  onViewCharacter,
  onStartDM,
  onCheckRequest,
  messageId,
  roomId,
  hostId,
  avatarColor,
  avatar,
}: ChatMessageProps) {
  const t = useTranslations("chat");
  const tRoom = useTranslations("room");
  const [mounted, setMounted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [charData, setCharData] = useState<CharacterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [imgError, setImgError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = () => setShowMenu(false);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [showMenu]);

  useEffect(() => {
    setMounted(true);
  }, []);

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

    // Find nearest scrollable container
    const scrollParent = avatarRef.current?.closest(".overflow-y-auto");
    if (scrollParent) {
      scrollParent.addEventListener("scroll", updatePosition);
    }
    window.addEventListener("resize", updatePosition);

    return () => {
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", updatePosition);
      }
      window.removeEventListener("resize", updatePosition);
    };
  }, [isHovered, canView]);

  const handleMouseEnter = () => {
    setIsHovered(true);
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
    type CheckInfo = { checkRequest?: { targetUserIds?: number[]; skillName?: string; diceType?: string; respondedUserIds?: number[] } };
    let checkInfo: CheckInfo | null = null;
    try { checkInfo = diceDetail ? JSON.parse(diceDetail) as CheckInfo : null; } catch {}
    const cr = checkInfo?.checkRequest;
    const targetIds = cr?.targetUserIds ?? [];
    const respondedIds = cr?.respondedUserIds ?? [];
    const isTarget = userId !== undefined && targetIds.includes(userId);
    const alreadyResponded = userId !== undefined && respondedIds.includes(userId);
    const totalCount = targetIds.length;
    const doneCount = respondedIds.length;

    return (
      <div className="flex justify-center py-2 animate-in fade-in">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
          isTarget && !alreadyResponded ? "bg-accent/10 border border-accent/30" : "bg-surface-alt"
        }`}>
          <span className="text-sm text-text">{content}</span>
          {totalCount > 0 && (
            <span className="text-xs text-text-muted whitespace-nowrap">
              {t("checkProgress", { done: doneCount, total: totalCount })}
            </span>
          )}
          {isTarget && !alreadyResponded && onCheckRequest && messageId !== undefined && (
            <button
              onClick={() => onCheckRequest(messageId, cr?.skillName ?? "", cr?.diceType ?? "")}
              className="bg-accent hover:bg-accent-hover text-accent-foreground w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition animate-bounce"
              title={t("clickCheck")}
            >
              🎲
            </button>
          )}
          {isTarget && alreadyResponded && (
            <span className="text-accent text-base" title={t("checkDone")}>✅</span>
          )}
        </div>
      </div>
    );
  }

  if (type === "system") {
    return (
      <div className="flex justify-center py-2 animate-in fade-in">
        <span className="text-xs text-text-dim italic bg-surface-alt px-3 py-1 rounded-full">
          {content}
        </span>
      </div>
    );
  }

  const isDice = type === "dice";
  const isImage = type === "image";

  return (
    <div className={`flex gap-3 py-1.5 group animate-in fade-in slide-in-from-bottom-1 ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar Wrapper */}
      <div
        ref={avatarRef}
        className="relative shrink-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={nickname}
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
              backgroundColor: avatarColor || getRandomColorForUser(senderId || 0),
              color: getContrastColor(avatarColor || getRandomColorForUser(senderId || 0)),
            }}
          >
            {nickname.charAt(0).toUpperCase()}
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
            className={`text-[13px] font-semibold text-text-muted ${(!isBot && !isOwn && senderId) ? "cursor-pointer hover:underline select-none" : ""}`}
            onClick={(e) => {
              if (!isBot && !isOwn && senderId) {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }
            }}
          >
            {nickname}
            {isBot && " 🤖"}
            {isPrivate && ` (🔒 ${t("privateRoll")})`}
          </span>

          {showMenu && senderId && (
            <div
              className={`absolute bg-surface border border-border rounded-lg shadow-xl py-1.5 min-w-[120px] z-30 animate-in fade-in zoom-in-95 duration-100 ${
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
                  🎴 {tRoom("btnViewCard")}
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
                  🔒 {tRoom("btnDm")}
                </button>
              )}
            </div>
          )}

          <span className="text-[11px] text-text-dim opacity-0 group-hover:opacity-100 transition">
            {mounted ? formatTime(createdAt, t) : ""}
          </span>
        </div>

        <div
          className={`chat-bubble ${isOwn ? "chat-bubble-own" : "chat-bubble-other"} rounded-theme shadow-sm break-words transition-colors ${isImage ? "p-1" : "px-3 py-2"} ${
            isDice
              ? "bg-dice-card-bg border border-dice-card-border text-text"
              : isPrivate
              ? "bg-private-bg border border-private-border text-text"
              : isImage
              ? "bg-surface border border-border text-text"
              : isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-surface border border-border text-text"
          }`}
        >
          {isDice ? (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">🎲</span>
                <div>
                  <span className="font-bold font-theme-mono text-sm leading-tight">
                    {formatDiceResult(diceDetail || content, t)}
                  </span>
                </div>
              </div>
            </div>
          ) : isImage ? (
            imgError ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-text-dim italic">
                <span className="text-lg not-italic">🖼️</span>
                <span>{t("imageUnavailable")}</span>
              </div>
            ) : (
              <>
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
        </div>
      </div>
    </div>
  );
});
