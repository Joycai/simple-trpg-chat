"use client";

import { useState, useRef, useEffect } from "react";
import type { Message } from "@/components/room/types";

/**
 * The room's loaded messages and the bookkeeping every writer shares: the ids
 * already seen (so SSE, catch-up and pagination never duplicate a row), which
 * rows arrived live (so only those animate in), and a ref to the latest list
 * for handlers that must not be re-created per message.
 */
export function useMessageLog(initialMessages: Message[]) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  // Track all seen message IDs to prevent duplicates from SSE listener accumulation or race conditions
  const seenIdsRef = useRef<Set<string>>(new Set(initialMessages.map(m => String(m.id))));
  // Message id → arrival timestamp for messages that arrived live (SSE, reconnect
  // catch-up, or local error pills). ChatArea consults it so only genuinely new
  // messages play the entrance animation — history loads / pagination / tab
  // switches mount silently. Entries are never deleted (the 3s window simply
  // lapses), which keeps it safe under StrictMode double-mounting.
  const liveEnterRef = useRef(new Map<string, number>());
  // Latest messages snapshot for event handlers (e.g. infinite-scroll) that must read the
  // current oldest id without being re-created on every message change. Synced in an effect
  // (see below) rather than during render, per react-hooks/refs.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Incremental pruning: when seenIdsRef exceeds 500, drop the oldest half
  // instead of rebuilding from messages (avoids O(n) rebuild on every batch).
  useEffect(() => {
    if (seenIdsRef.current.size > 500) {
      const toDelete = Array.from(seenIdsRef.current).slice(0, 250);
      for (const id of toDelete) seenIdsRef.current.delete(id);
    }
  }, [messages.length]);

  return { messages, setMessages, seenIdsRef, liveEnterRef, messagesRef };
}
