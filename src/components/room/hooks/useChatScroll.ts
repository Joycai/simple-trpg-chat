"use client";

import { useState, useRef, useEffect, useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { loadMoreMessagesAction } from "@/app/actions/messages";
import type { Message, TypingBots } from "@/components/room/types";

/** Page size of the initial server render; a full page means older rows may exist. */
const INITIAL_PAGE = 100;

/**
 * The chat log's scroll behaviour: stick to the bottom while the reader is
 * there, show the "back to bottom" button when they aren't, load older pages
 * when they reach the top (keeping their place), and cap the in-memory window
 * while they sit at the bottom.
 */
export function useChatScroll({
  roomId,
  initialCount,
  messagesRef,
  messagesLength,
  seenIdsRef,
  setMessages,
  tabMessages,
  typingBots,
}: {
  roomId: number;
  /** Number of messages the page rendered with. */
  initialCount: number;
  /** Live messages snapshot, read by the scroll handler without re-creating it. */
  messagesRef: MutableRefObject<Message[]>;
  messagesLength: number;
  seenIdsRef: MutableRefObject<Set<string>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  /** The active tab's messages — a change re-scrolls to the bottom when stuck there. */
  tabMessages: Message[];
  typingBots: TypingBots;
}) {
  const [hasMore, setHasMore] = useState(initialCount >= INITIAL_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const scrollToBottom = (smooth = true) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });
      isAtBottomRef.current = true;
      setShowScrollButton(false);
    }
  };

  const scrollTimeoutRef = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current !== null) return;
    scrollTimeoutRef.current = window.requestAnimationFrame(async () => {
      scrollTimeoutRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const threshold = 150;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      isAtBottomRef.current = atBottom;
      setShowScrollButton(!atBottom);

      // Infinite scroll load more (R8) — read the live snapshot via ref so the
      // handler needn't list `messages` as a dep (which would recreate it on every message).
      const currentMessages = messagesRef.current;
      if (el.scrollTop < 10 && hasMore && !loadingMore && currentMessages.length > 0) {
        setLoadingMore(true);
        const oldestId = currentMessages[0].id;
        try {
          const older = await loadMoreMessagesAction(roomId, oldestId, 50) as unknown as Message[];
          if (older.length < 50) {
            setHasMore(false);
          }
          if (older.length > 0) {
            const prevScrollHeight = el.scrollHeight;

            // Add to seenIdsRef
            older.forEach(m => seenIdsRef.current.add(String(m.id)));

            setMessages(prev => {
              const filteredOlder = older.filter(o => !prev.some(p => p.id === o.id));
              return [...filteredOlder, ...prev];
            });

            // Adjust scroll position after rendering to keep it stable.
            // Must be an explicit `instant` scroll: the container carries
            // `scroll-smooth`, and a bare scrollTop assignment scrolls with
            // behavior `auto` — which scroll-behavior turns into an ANIMATED
            // glide from ~0 down to delta. Besides the visible lurch, the
            // intermediate scroll events still satisfy `scrollTop < 10` after
            // `loadingMore` resets, spuriously fetching a second page.
            requestAnimationFrame(() => {
              if (scrollRef.current) {
                const delta = scrollRef.current.scrollHeight - prevScrollHeight;
                scrollRef.current.scrollTo({ top: delta, behavior: "instant" });
              }
            });
          }
        } catch (err) {
          console.error("Failed to load more messages:", err);
        } finally {
          setLoadingMore(false);
        }
      }
    });
  }, [roomId, hasMore, loadingMore, messagesRef, seenIdsRef, setMessages]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }
  }, [tabMessages, typingBots]); // Re-scroll when switching tabs or typing state changes

  // Cap the in-memory list: SSE only ever appends, so a multi-hour session
  // accumulates thousands of mounted ChatMessage trees. While the user sits at
  // the bottom (i.e. not reading scrollback), trim to the newest window and
  // re-arm `hasMore` — scrolling up refetches the trimmed rows via
  // loadMoreMessagesAction exactly like the initial 100-row page.
  useEffect(() => {
    const MAX = 400, KEEP = 300;
    if (messagesLength > MAX && isAtBottomRef.current) {
      setMessages((prev) => (prev.length > MAX ? prev.slice(prev.length - KEEP) : prev));
      setHasMore(true);
    }
  }, [messagesLength, setMessages]);

  return { scrollRef, handleScroll, showScrollButton, scrollToBottom };
}
