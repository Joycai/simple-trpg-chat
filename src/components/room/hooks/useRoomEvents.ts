"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markDMReadAction, catchUpMessagesAction } from "@/app/actions/room";
import { canSee, isAudience, countsAsDmUnread } from "@/lib/messaging/audience";
import type { Message, ConnectionStatus, TypingBots, PlayerEntry } from "@/components/room/types";
import type { StatusEntry } from "@/lib/rules";

interface UseRoomEventsParams {
  roomId: number;
  userId: number;
  isHost: boolean;
  activeTabRef: React.RefObject<"public" | number>;
  seenIdsRef: React.RefObject<Set<string>>;
  /** Live view of the loaded messages — read on reconnect to compute the catch-up cursor. */
  messagesRef: React.RefObject<Message[]>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setPlayers: React.Dispatch<React.SetStateAction<PlayerEntry[]>>;
  setStatus: React.Dispatch<React.SetStateAction<ConnectionStatus>>;
  setUnreadCounts: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setTypingBots: React.Dispatch<React.SetStateAction<TypingBots>>;
  setInventoryRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  setEventsRefreshKey: React.Dispatch<React.SetStateAction<number>>;
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
  messagesRef,
  setMessages,
  setPlayers,
  setStatus,
  setUnreadCounts,
  setTypingBots,
  setInventoryRefreshKey,
  setEventsRefreshKey,
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
    // Set on the first error so the next successful open knows it must heal a
    // gap; `connected` gates the online/visibility wake-up handlers below.
    let hadDrop = false;
    let connected = false;

    // The server emits no `id:` on SSE frames, so the browser's Last-Event-ID
    // replay can't recover messages sent while the stream was down. Instead,
    // after every reconnect we fetch everything visible past the newest loaded
    // message and merge it in (dedup against both live-delivered rows and the
    // optimistic placeholders, which keep negative ids and stay at the tail).
    const catchUpMissedMessages = async () => {
      const sinceId = messagesRef.current.reduce(
        (max, m) => (typeof m.id === "number" && m.id > max ? m.id : max), 0);
      try {
        const missed = (await catchUpMessagesAction(roomId, sinceId)) as unknown as Message[];
        if (abortController.signal.aborted || missed.length === 0) return;
        setMessages((prev) => {
          const present = new Set(prev.map((m) => String(m.id)));
          const fresh = missed.filter((m) => !present.has(String(m.id)));
          if (fresh.length === 0) return prev;
          for (const m of fresh) {
            seenIdsRef.current.add(String(m.id));
            // Same DM-unread accounting the live path performs per event.
            const view = { userId: m.userId, targetUserId: m.targetUserId ?? null, audience: m.audience };
            if (countsAsDmUnread(view, userId) && activeTabRef.current !== m.userId) {
              setUnreadCounts((c) => ({ ...c, [m.userId]: (c[m.userId] || 0) + 1 }));
            }
          }
          const rank = (m: Message) =>
            typeof m.id === "number" && m.id < 0 ? Number.POSITIVE_INFINITY : Number(m.id);
          return [...prev, ...fresh].sort((a, b) => rank(a) - rank(b));
        });
      } catch {
        // Leave hadDrop logic alone — the next reconnect retries the catch-up.
      }
    };

    const setupSSE = () => {
      if (abortController.signal.aborted) return;
      if (sse) sse.close();
      setStatus("connecting");
      const es = new EventSource(`/api/rooms/${roomId}/events`);
      sse = es;

      es.onopen = () => {
        setStatus("connected");
        retryCount = 0; // Reset retry count on successful connection
        connected = true;
        if (hadDrop) {
          hadDrop = false;
          catchUpMissedMessages();
        }
      };

      es.onmessage = (event) => {
        if (abortController.signal.aborted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "room_settings_updated") {
            router.refresh();
            return;
          }
          if (data.type === "member_updated") {
            // Member-level delta (nickname / color / avatar). These used to
            // ride room_settings_updated, costing every client a full
            // router.refresh() — a multi-MB re-render fan-out in a 10-member
            // room for a one-field change. Patch the live list in place.
            setPlayers((prev) => prev.map((p) => {
              const uid = p.users?.id ?? p.user?.id ?? p.user_id;
              if (uid !== data.userId) return p;
              return {
                ...p,
                room_members: {
                  ...p.room_members,
                  ...(data.nickname !== undefined ? { nickname: data.nickname as string } : {}),
                  ...(data.avatarColor !== undefined ? { avatarColor: data.avatarColor as string } : {}),
                  ...(data.avatar !== undefined ? { avatar: data.avatar as string | null } : {}),
                },
              };
            }));
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
          if (data.type === "dice_quip_update") {
            // 投娘 (dice announcer) generated its quip asynchronously — patch it
            // into the already-delivered dice card. Mirrors check_update above.
            const idStr = String(data.messageId);
            setMessages((prev) => prev.map((m) => {
              if (String(m.id) !== idStr || !m.diceDetail) return m;
              try {
                const detail = JSON.parse(m.diceDetail);
                if (detail?.announcer) {
                  detail.announcer.quip = data.quip;
                  delete detail.announcer.quipPending;
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
          if (data.type === "events_updated") {
            // Any event mutation (publish/edit/reorder/add-viewer/promote/retract):
            // bump so open event panels reload AND the viewer's visible-id set
            // refreshes, re-evaluating each chat card's locked/unlocked state.
            setEventsRefreshKey((k) => k + 1);
            return;
          }
          if (data.type === "presence_update") {
            // Presence broadcasts fire on every connect/disconnect anywhere in
            // the room (including another tab's reconnect churn). Returning the
            // previous Set when membership is unchanged lets React bail out of
            // the render entirely instead of recomputing the whole room UI.
            const next = new Set(data.onlineUserIds as number[]);
            setOnlineUserIds((prev) => {
              if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
              return next;
            });
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
        connected = false;
        hadDrop = true;

        // Never give up for good: fast exponential backoff first, then keep
        // probing on a slow interval — a room left open overnight must come
        // back on its own, not require a manual reload.
        retryCount++;
        const backoffDelay = retryCount <= maxRetries
          ? Math.min(1000 * Math.pow(2, retryCount - 1), 16000)
          : 30000;
        console.warn(`SSE connection failed. Retrying in ${backoffDelay}ms (attempt ${retryCount})...`);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(setupSSE, backoffDelay);
      };
    };

    // Browser signals (network back / tab refocused) cut the wait short: when
    // disconnected, drop any pending backoff and reconnect immediately.
    const wakeUp = () => {
      if (abortController.signal.aborted || connected) return;
      if (document.visibilityState === "hidden") return;
      retryCount = 0;
      clearTimeout(reconnectTimeout);
      setupSSE();
    };
    window.addEventListener("online", wakeUp);
    document.addEventListener("visibilitychange", wakeUp);

    setupSSE();

    return () => {
      abortController.abort();
      if (sse) sse.close();
      clearTimeout(reconnectTimeout);
      window.removeEventListener("online", wakeUp);
      document.removeEventListener("visibilitychange", wakeUp);
    };
  }, [roomId, userId, isHost]); // eslint-disable-line react-hooks/exhaustive-deps
}
