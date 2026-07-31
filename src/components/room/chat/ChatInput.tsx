"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { DiceRoller } from "@/components/room/chat/DiceRoller";
import { StickerPicker } from "@/components/room/chat/StickerPicker";
import { Icons } from "@/components/shared/icons";
import { ThemedSelect } from "@/components/shared/ThemedSelect";
import { useTranslations } from "next-intl";
import { isRollCommand, normalizeRollCommand } from "@/lib/roll-command";
import { recordRollCommand, useRecentRollCommands } from "@/components/room/hooks/useRecentRollCommands";
import { CHAT_INPUT_ATTR, TOGGLE_DICE_EVENT } from "@/lib/hotkeys";

interface MentionTarget {
  id: number;
  nickname: string;
  isBot: boolean;
  isBotDisabled?: boolean;
  isProviderError?: boolean;
}

interface ChatInputProps {
  onSendMessage: (content: string, type: "text" | "dice" | "image" | "sticker", diceDetail?: string, isPrivate?: boolean, targetUserId?: number) => void;
  roomId: number;
  mentions?: MentionTarget[];
  isPrivateLocked?: boolean;
  readOnly?: boolean;
  /** Custom notice shown when readOnly (defaults to the frozen-room notice). */
  readOnlyNotice?: string;
  /** Rule-driven quick-insert command chips shown above the input (capabilities.quickRolls). */
  quickCommands?: ReadonlyArray<string>;
  /** Active rule's default dice (capabilities.defaultRollExpression) — seeds the 🎲 panel. */
  defaultRollExpression?: string;
}

// Keep in sync with CHAT_IMAGE_MAX_BYTES in src/lib/uploads.ts
const IMAGE_MAX_BYTES = 1024 * 1024;

export function ChatInput({ onSendMessage, roomId, mentions = [], isPrivateLocked = false, readOnly = false, readOnlyNotice, quickCommands = [], defaultRollExpression }: ChatInputProps) {
  const t = useTranslations("chat");
  const tRoom = useTranslations("room");
  const [message, setMessage] = useState("");
  const [showDice, setShowDice] = useState(false);
  /** Last expression built in the dice panel, offered back as a "↺ 上次" preset. */
  const [lastRollExpression, setLastRollExpression] = useState<string | undefined>(undefined);
  const recentRolls = useRecentRollCommands(roomId);
  const [_mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  // Private chat states
  const [isPrivate, setIsPrivate] = useState(isPrivateLocked);
  const [privateTargetId, setPrivateTargetId] = useState<number | null>(null);

  // Image upload states
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Sticker picker
  const [showStickers, setShowStickers] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Sync isPrivate with isPrivateLocked prop
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPrivate(isPrivateLocked);
    if (isPrivateLocked) setPrivateTargetId(null); // When locked to a tab, we don't need the local target selector
  }, [isPrivateLocked]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Alt+R (useRoomHotkeys) asks for the dice panel via a window event — the
  // panel's open state is local to this component.
  useEffect(() => {
    if (readOnly) return;
    const onToggle = () => setShowDice((v) => !v);
    window.addEventListener(TOGGLE_DICE_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_DICE_EVENT, onToggle);
  }, [readOnly]);

  // Auto-resize textarea height based on content
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [message]);

  // Detect @mention query
  const mentionMatch = useMemo(() => {
    const idx = message.lastIndexOf("@");
    if (idx === -1) return null;
    const afterAt = message.slice(idx + 1);
    if (afterAt.includes(" ")) return null;
    return { start: idx, query: afterAt.toLowerCase() };
  }, [message]);

  const filteredMentions = useMemo(() => {
    if (!mentionMatch) return [];
    const q = mentionMatch.query;
    return mentions
      .filter(m => !q || m.nickname.toLowerCase().includes(q))
      .slice(0, 5);
  }, [mentionMatch, mentions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMentionIndex(0);
  }, [mentionMatch?.query]);

  const applyMention = (nickname: string) => {
    if (!mentionMatch) return;
    setMessage(message.slice(0, mentionMatch.start) + `@${nickname} `);
    setMentionQuery("");
    inputRef.current?.focus();
  };

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    // Remember roll commands for the recent-rolls chips. Recorded on send,
    // not on server success — a failed roll is still worth retrying via chip.
    if (isRollCommand(trimmed)) {
      const normalized = normalizeRollCommand(trimmed);
      if (!quickCommands.includes(normalized)) recordRollCommand(roomId, normalized);
    }


    // If not locked to a specific tab, but private mode is toggled, ensure target is selected
    let finalTargetId = privateTargetId;
    if (!isPrivateLocked && isPrivate && !finalTargetId) {
       if (mentions.length > 0) finalTargetId = mentions[0].id;
    }

    onSendMessage(trimmed, "text", undefined, isPrivate, finalTargetId || undefined);
    setMessage("");
    
    // If not locked, auto-exit private mode after sending
    if (!isPrivateLocked) {
      setIsPrivate(false);
      setPrivateTargetId(null);
    }
    inputRef.current?.focus();
  };

  const insertQuick = (cmd: string) => {
    setMessage(cmd + " ");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredMentions.length > 0) {
      if (e.key === "Tab" || (e.key === "Enter" && filteredMentions.length > 0)) {
        e.preventDefault();
        applyMention(filteredMentions[mentionIndex].nickname);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery("");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * The dice panel builds an expression and nothing else — it is submitted as
   * the very command a user could have typed, so mixed dice, modifiers and
   * `kN` all resolve through the one server-side parser
   * (`parseAndRollExpression`) instead of a second client-side implementation.
   * `.rh` is already "hidden roll", which is exactly what 暗骰 means.
   */
  const handleDiceRoll = (expression: string, hidden: boolean) => {
    setLastRollExpression(expression);
    // Submitted exactly like a typed command, private-chat routing included.
    let finalTargetId = privateTargetId;
    if (!isPrivateLocked && isPrivate && !finalTargetId && mentions.length > 0) {
      finalTargetId = mentions[0].id;
    }
    onSendMessage(`.${hidden ? "rh" : "r"} ${expression}`, "text", undefined, isPrivate, finalTargetId || undefined);
    // The panel closes itself (animated) after rolling — unmounting it here
    // would cut its exit transition off.
    inputRef.current?.focus();
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again re-triggers onChange.
    e.target.value = "";
    if (!file) return;

    setUploadError(null);

    if (!file.type.startsWith("image/")) {
      setUploadError(t("imageInvalidType"));
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setUploadError(t("imageTooLarge"));
      return;
    }

    // Resolve private target the same way handleSend does.
    let finalTargetId = privateTargetId;
    if (!isPrivateLocked && isPrivate && !finalTargetId && mentions.length > 0) {
      finalTargetId = mentions[0].id;
    }
    if (!isPrivateLocked && isPrivate && !finalTargetId) {
      setUploadError(t("selectMember"));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/rooms/${roomId}/images`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t("imageUploadFailed"));
      }
      const { url } = await res.json();
      onSendMessage(url, "image", undefined, isPrivate, finalTargetId || undefined);

      if (!isPrivateLocked) {
        setIsPrivate(false);
        setPrivateTargetId(null);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("imageUploadFailed"));
    } finally {
      setUploading(false);
      inputRef.current?.focus();
    }
  };

  const handleStickerPick = (url: string) => {
    setUploadError(null);

    // Resolve the private target the same way handleSend / handleImageSelect do.
    let finalTargetId = privateTargetId;
    if (!isPrivateLocked && isPrivate && !finalTargetId && mentions.length > 0) {
      finalTargetId = mentions[0].id;
    }
    if (!isPrivateLocked && isPrivate && !finalTargetId) {
      setUploadError(t("selectMember"));
      return;
    }

    onSendMessage(url, "sticker", undefined, isPrivate, finalTargetId || undefined);
    setShowStickers(false);

    if (!isPrivateLocked) {
      setIsPrivate(false);
      setPrivateTargetId(null);
    }
    inputRef.current?.focus();
  };

  if (readOnly) {
    return (
      <div className="flex items-center justify-center gap-2 bg-input-bg border border-input-border rounded-theme p-3 text-text-muted text-sm select-none">
        <Icons.Lock className="w-4 h-4" />
        <span>{readOnlyNotice ?? tRoom("frozenNotice")}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Dice panel */}
      {showDice && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-10">
          <DiceRoller
            onRoll={handleDiceRoll}
            onClose={() => setShowDice(false)}
            defaultExpression={defaultRollExpression}
            lastExpression={lastRollExpression}
          />
        </div>
      )}

      {/* @mention autocomplete */}
      {filteredMentions.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 z-20 bg-surface border border-border rounded-theme shadow-lg py-1 min-w-[200px]">
          {filteredMentions.map((m, i) => (
            <button
              key={m.id + "-" + i}
              onClick={() => applyMention(m.nickname)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition ${
                i === mentionIndex ? "bg-primary/10 text-primary" : "text-text hover:bg-surface-alt"
              }`}
            >
              <span className="shrink-0 inline-flex items-center">
                {m.isBot ? (m.isBotDisabled ? <Icons.Ban className="w-3.5 h-3.5" /> : m.isProviderError ? <Icons.AlertTriangle className="w-3.5 h-3.5" /> : <Icons.Bot className="w-3.5 h-3.5" />) : <Icons.User className="w-3.5 h-3.5" />}
              </span>
              <span className="font-mono flex-1 text-left">@{m.nickname}</span>
              {m.isBot && m.isBotDisabled && (
                <span className="text-[9px] px-1 rounded-sm bg-red-500/10 text-red-500 border border-red-500/20 select-none scale-90 shrink-0 inline-flex items-center gap-0.5">
                  <Icons.Ban className="w-2.5 h-2.5" /> {tRoom("tagDisabled")}
                </span>
              )}
              {m.isBot && !m.isBotDisabled && m.isProviderError && (
                <span className="text-[9px] px-1 rounded-sm bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 select-none scale-90 shrink-0 animate-pulse inline-flex items-center gap-0.5">
                  <Icons.AlertTriangle className="w-2.5 h-2.5" /> {tRoom("tagProviderError")}
                </span>
              )}
            </button>
          ))}
          <div className="text-[10px] text-text-dim px-3 pt-1 border-t border-border mt-1">
            {t("mentionTip")}
          </div>
        </div>
      )}

      {/* Private Chat Target Selector (Only show if manually toggled, not locked to tab) */}
      {!isPrivateLocked && isPrivate && (
        <div className="absolute bottom-full left-12 mb-2 z-10 animate-in slide-in-from-bottom-2 duration-200">
          <div className="bg-private-bg border border-private-border rounded-theme shadow-lg p-2 flex items-center gap-2">
            <span className="text-[10px] font-bold text-accent uppercase tracking-wider ml-1">{t("privateChatTarget")}</span>
            <ThemedSelect
              value={privateTargetId || ""}
              onChange={(e) => setPrivateTargetId(Number(e.target.value))}
              wrapperClassName="w-auto"
              className="w-auto bg-surface border-private-border rounded px-2 py-1 pr-7 text-xs focus:ring-1 focus:ring-accent focus:border-private-border"
              chevronClassName="w-3 h-3 right-1.5"
            >
              <option value="" disabled>{t("selectMember")}</option>
              {mentions.map(m => (
                <option key={m.id} value={m.id}>
                  {m.isBot ? (m.isBotDisabled ? "🚫" : m.isProviderError ? "⚠️" : "🤖") : "👤"}{" "}
                  {m.nickname}
                  {m.isBot && m.isBotDisabled ? ` [${tRoom("tagDisabled")}]` : ""}
                  {m.isBot && !m.isBotDisabled && m.isProviderError ? ` [${tRoom("tagProviderError")}]` : ""}
                </option>
              ))}
            </ThemedSelect>
            <button
              onClick={() => { setIsPrivate(false); setPrivateTargetId(null); }}
              className="text-text-muted hover:text-danger p-1 transition"
              aria-label="×"
            >
              <Icons.X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Image upload error */}
      {uploadError && (
        <div className="absolute bottom-full left-0 mb-1 z-20 bg-surface border border-danger/40 rounded-theme shadow-lg px-3 py-2 text-xs text-danger flex items-center gap-2">
          <Icons.Info className="w-3.5 h-3.5 shrink-0" />
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-text-muted hover:text-text" aria-label="×">
            <Icons.X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Quick command chips */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {quickCommands.map((cmd) => (
          <button
            key={cmd}
            type="button"
            onClick={() => insertQuick(cmd)}
            className="px-2.5 py-1 rounded-theme border border-primary/30 bg-primary/5 text-primary text-xs font-theme-mono hover:bg-primary/15 transition cursor-pointer"
          >
            {cmd}
          </button>
        ))}
        {/* Recent roll history — filtered against the static chips so stale
            stored values can never render a duplicate. */}
        {recentRolls.filter((cmd) => !quickCommands.includes(cmd)).map((cmd) => (
          <button
            key={`recent-${cmd}`}
            type="button"
            onClick={() => insertQuick(cmd)}
            title={t("recentRollChip")}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-theme border border-border bg-surface-alt text-text-muted text-xs font-theme-mono hover:bg-primary/10 hover:text-primary transition cursor-pointer"
          >
            <Icons.Clock className="w-3 h-3" />
            {cmd}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className={`flex items-end gap-1.5 bg-input-bg border rounded-theme p-2 shadow-sm transition-all duration-300 ${
        isPrivate ? "border-private-border ring-2 ring-private-border/20" : "border-input-border"
      }`}>
        <textarea
          ref={inputRef}
          {...{ [CHAT_INPUT_ATTR]: "" }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isPrivate ? t("whisperingPlaceholder") : t("inputPlaceholder")}
          className="flex-1 px-2 py-2 border-0 outline-none text-sm bg-transparent text-text resize-none overflow-y-auto max-h-32 min-h-[36px]"
          rows={1}
        />

        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center w-9 h-9 rounded-theme transition shrink-0 bg-transparent text-text-muted hover:bg-surface-alt hover:text-text disabled:opacity-50"
          title={t("btnImageTooltip")}
          aria-label={t("btnImageTooltip")}
        >
          {uploading
            ? <Icons.Loader2 className="w-[18px] h-[18px] animate-spin" />
            : <Icons.ImagePlus className="w-[18px] h-[18px]" />}
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />

        <div className="relative shrink-0">
          <button
            onClick={() => setShowStickers((v) => !v)}
            className={`flex items-center justify-center w-9 h-9 rounded-theme transition ${
              showStickers ? "bg-accent text-accent-foreground" : "bg-transparent text-text-muted hover:bg-surface-alt hover:text-text"
            }`}
            title={t("btnStickerTooltip")}
            aria-label={t("btnStickerTooltip")}
          >
            <Icons.Smile className="w-[18px] h-[18px]" />
          </button>
          {showStickers && (
            <StickerPicker onPick={handleStickerPick} onClose={() => setShowStickers(false)} />
          )}
        </div>

        <button
          onClick={() => setShowDice(!showDice)}
          className={`flex items-center justify-center w-9 h-9 rounded-theme transition shrink-0 ${
            showDice ? "bg-accent text-accent-foreground" : "bg-transparent text-text-muted hover:bg-surface-alt hover:text-text"
          }`}
          title={t("btnRollTooltip")}
          aria-label={t("btnRollTooltip")}
        >
          <Icons.Dices className="w-[18px] h-[18px]" />
        </button>

        {!isPrivateLocked && (
          <button
            onClick={() => setIsPrivate(!isPrivate)}
            className={`flex items-center justify-center w-9 h-9 rounded-theme transition shrink-0 ${
              isPrivate ? "bg-private-bg text-accent border border-private-border" : "bg-transparent text-text-muted hover:bg-surface-alt hover:text-text"
            }`}
            title={t("btnPrivateTooltip")}
            aria-label={t("btnPrivateTooltip")}
            aria-pressed={isPrivate}
          >
            <Icons.MessageSquareLock className="w-[18px] h-[18px]" />
          </button>
        )}

        <button
          onClick={handleSend}
          disabled={!message.trim() || (!isPrivateLocked && isPrivate && !privateTargetId)}
          title={t("send")}
          aria-label={t("send")}
          className={`flex items-center justify-center w-10 h-10 rounded-theme font-bold transition shrink-0 shadow-[var(--theme-glow)] ${
            isPrivate
              ? "bg-accent hover:bg-accent-hover text-accent-foreground"
              : "bg-primary hover:bg-primary-hover disabled:bg-text-dim disabled:shadow-none text-primary-foreground"
          }`}
        >
          <Icons.Send className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}
