"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markDMReadAction } from "@/app/actions/room";
import { canSee, isAudience, countsAsDmUnread } from "@/lib/messaging/audience";
import type { Message, ConnectionStatus, TypingBots } from "@/components/room/types";
import type { StatusEntry } from "@/lib/rules";

interface UseRoomEventsParams {
  roomId: number;
  userId: number;
  isHost: boolean;
  activeTabRef: React.RefObject<"public" | number>;
  seenIdsRef: React.RefObject<Set<string>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setStatus: React.Dispatch<React.SetStateAction<ConnectionStatus>>;
  setUnreadCounts: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setTypingBots: React.Dispatch<React.SetStateAction<TypingBots>>;
  setInventoryRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  setOnlineUserIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCharacterResources: React.Dispatch<React.SetStateAction<Map<number, StatusEntry>>>;
}

/* Owns the room's single SSE connection: subscribes to /api/rooms/[id]/events,
   routes each event type into the right state setter, and reconnects with
   exponential backoff. Extracted from RoomClient to keep the component lean. */
export function useRoomEvents({
  roomId,
  userId,
  isHost,
  activeTabRef,
  seenIdsRef,
  setMessages,
  setStatus,
  setUnreadCounts,
  setTypingBots,
  setInventoryRefreshKey,
  setOnlineUserIds,
  setCharacterResources,
}: UseRoomEventsParams) {
  const router = useRouter();

  useEffect(() => {
    const abortController = new AbortController();
    let reconnectTimeout: NodeJS.Timeout;
    let retryCount = 0;
    const maxRetries = 5;
    let sse: EventSource | null = null;

    const setupSSE = () => {
      if (abortController.signal.aborted) return;
      if (sse) sse.close();
      setStatus("connecting");
      const es = new EventSource(`/api/rooms/${roomId}/events`);
      sse = es;

      es.onopen = () => {
        setStatus("connected");
        retryCount = 0; // Reset retry count on successful connection
      };

      es.onmessage = (event) => {
        if (abortController.signal.aborted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "room_settings_updated") {
            router.refresh();
            return;
          }
          if (data.type === "ai_import_result") {
            // Forward async AI-import results to the AiImportPanel via a window event,
            // so we reuse this single SSE connection instead of opening a second one.
            window.dispatchEvent(new CustomEvent("ai-import-result", { detail: data }));
            return;
          }
          if (data.type === "check_update") {
            // A target responded to a host check request — patch the stored respondedUserIds
            // so the x/y count updates and the roller's dice icon is disabled.
            const idStr = String(data.checkRequestId);
            setMessages((prev) => prev.map((m) => {
              if (String(m.id) !== idStr || !m.diceDetail) return m;
              try {
                const detail = JSON.parse(m.diceDetail);
                if (detail?.checkRequest) {
                  detail.checkRequest.respondedUserIds = data.respondedUserIds;
                  if (Array.isArray(data.proxiedUserIds)) {
                    detail.checkRequest.proxiedUserIds = data.proxiedUserIds;
                  }
                  return { ...m, diceDetail: JSON.stringify(detail) };
                }
              } catch { /* */ }
              return m;
            }));
            return;
          }
          if (data.type === "inventory_updated") {
            // Host edited an item — bump the key so any open InventoryPanel reloads
            // the edited content (distributed copies sync via the item relation).
            setInventoryRefreshKey((k) => k + 1);
            return;
          }
          if (data.type === "presence_update") {
            setOnlineUserIds(new Set(data.onlineUserIds as number[]));
            return;
          }
          if (data.type === "message_deleted") {
            // A host withdrew a message (e.g. a timeline divider). Drop it from
            // state and forget its id so an equal id could be re-added later.
            const idStr = String(data.messageId);
            setMessages((prev) => prev.filter((m) => String(m.id) !== idStr));
            seenIdsRef.current.delete(idStr);
            return;
          }
          if (data.type === "character_updated") {
            // `vital` is whatever the room's rule considers this character's
            // headline number (see lib/rules/status-view). It is null when the
            // sheet has nothing to show — drop the stale entry in that case.
            const uid = data.userId as number;
            const vital = data.vital as StatusEntry | null;
            setCharacterResources((prev) => {
              const next = new Map(prev);
              if (vital) next.set(uid, vital);
              else next.delete(uid);
              return next;
            });
            return;
          }
          if (data.type === "typing") {
            setTypingBots((prev) => {
              const next = { ...prev };
              if (data.typing) {
                next[data.botUserId] = {
                  nickname: data.nickname,
                  typing: true,
                  isPrivate: data.isPrivate,
                  targetUserId: data.targetUserId,
                };
              } else {
                delete next[data.botUserId];
              }
              return next;
            });
            return;
          }
          if (data.id) {
            const view = { userId: data.userId, targetUserId: data.targetUserId ?? null, audience: data.audience };
            // Defensive: the SSE route already filtered by audience, but re-check
            // so a mis-targeted row never leaks into this client's state.
            if (isAudience(data.audience) && !canSee(view, userId, isHost)) return;

            // Bump the DM unread badge only for genuine inbound 1:1 DM turns —
            // inline notices (self/directed/gm) have their own indicators.
            if (countsAsDmUnread(view, userId)) {
              if (activeTabRef.current !== data.userId) {
                setUnreadCounts((prev) => ({
                  ...prev,
                  [data.userId]: (prev[data.userId] || 0) + 1,
                }));
              } else {
                markDMReadAction(roomId, data.userId).catch(() => {});
              }
            }
            // Robust dedup: check seenIdsRef first to prevent duplicates from HMR listener accumulation
            const idStr = String(data.id);
            if (seenIdsRef.current.has(idStr)) return;
            seenIdsRef.current.add(idStr);

            setMessages((prev) => {
              // 1. Secondary dedup: array-based check (safety net)
              if (prev.some(m => String(m.id) === idStr)) return prev;

              // 2. If this is a message we sent, search for the optimistic placeholder
              if (data.userId === userId) {
                const optIndex = prev.findIndex(m =>
                  m.userId === userId &&
                  m.content === data.content &&
                  m.type === data.type &&
                  m.targetUserId === data.targetUserId &&
                  typeof m.id === 'number' && m.id < 0
                );
                if (optIndex !== -1) {
                  const copy = [...prev];
                  copy[optIndex] = data; // Replace optimistic placeholder with the real message
                  return copy;
                }
              }

              return [...prev, data];
            });
          }
        } catch { /* */ }
      };

      es.onerror = () => {
        if (abortController.signal.aborted) return;
        setStatus("error");
        es.close();

        if (retryCount < maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 16000);
          console.warn(`SSE connection failed. Retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
          retryCount++;
          reconnectTimeout = setTimeout(setupSSE, backoffDelay);
        } else {
          console.error("SSE connection failed after maximum retries.");
        }
      };
    };

    setupSSE();

    return () => {
      abortController.abort();
      if (sse) sse.close();
      clearTimeout(reconnectTimeout);
    };
  }, [roomId, userId, isHost]); // eslint-disable-line react-hooks/exhaustive-deps
}
