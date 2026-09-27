"use client";

import { useState, useRef, useEffect } from "react";
import { getUnreadInventoryCountAction } from "@/app/actions/inventory";
import type { Message } from "@/components/room/types";

/**
 * The backpack's unread badge. Seeded from the server render; recounted when a
 * new item system message arrives, and cleared locally by the caller when the
 * backpack opens (`setUnreadItems(0)`).
 */
export function useUnreadInventoryCount({
  roomId,
  initialUnread,
  initialMessages,
  messages,
}: {
  roomId: number;
  initialUnread: number;
  initialMessages: Message[];
  messages: Message[];
}) {
  const [unreadItems, setUnreadItems] = useState(initialUnread);

  // The badge's first value comes with the page (initialSnapshot), so the
  // message the room opened on doesn't trigger a recount — only later ones do.
  const firstPaintLastMsgIdRef = useRef(initialMessages[initialMessages.length - 1]?.id);
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.id === firstPaintLastMsgIdRef.current) return;
    if (lastMsg?.type === "system" && (lastMsg.content.includes("道具") || lastMsg.content.toLowerCase().includes("item"))) {
      getUnreadInventoryCountAction(roomId).then(setUnreadItems).catch(() => {});
    }
  }, [messages, roomId]);

  return { unreadItems, setUnreadItems };
}
