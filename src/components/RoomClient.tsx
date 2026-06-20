"use client";

// Decrementing counter for local-only ephemeral message IDs (never persisted to DB).
// Negative IDs guarantee no collision with real DB auto-increment IDs.
let localEphemeralId = -1;

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";

// Run before the browser paints on the client, but fall back to useEffect during
// SSR so React doesn't warn. Used to settle the sidebar's collapsed state ahead
// of the first paint so it never flashes open then closes on room entry.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { CharacterPanel } from "./CharacterPanel";
import { RoomSettings } from "./RoomSettings";
import { InventoryPanel } from "./InventoryPanel";
import { BotManager } from "./BotManager";
import { AiImportPanel } from "./AiImportPanel";
import { ExportButton } from "./ExportButton";
import { RoomInfoPanel } from "./RoomInfoPanel";
import { ConversationPanel } from "./ConversationPanel";
import { HostCheckDialog } from "./HostCheckDialog";
import { SkillSetPrompt } from "./SkillSetPrompt";
import { SkillPanel } from "./SkillPanel";
import { UserSettingsPanel } from "./UserSettingsPanel";
import { OverlayShell } from "./OverlayShell";
import { RoomTopBar } from "./room/RoomTopBar";
import { MembersDialog } from "./room/MembersDialog";
import { sendMessageAction, updateNicknameAction, rollDiceAction, executeCommandAction, markDMReadAction, getUnreadDMCountAction, loadMoreMessagesAction, updateRoomNameAction, respondToCheckRequestAction } from "@/app/actions/room";
import { getUnreadInventoryCountAction, markInventoryViewedAction } from "@/app/actions/inventory";
import { getCharacterDataAction } from "@/app/actions/character";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { getBotStatus } from "@/lib/botStatus";
import type { Message, RoomClientProps } from "./room/types";
import { canSee, channelOf, countsAsDmUnread, isAudience } from "@/lib/messaging/audience";

export function RoomClient({
  room,
  messages: initialMessages,
  userId,
  isHost,
  currentNickname,
  roomTheme,
  roomDiceRules,
  players = [],
  characterData,
  aiEnabled = false,
  validProviderIds = [],
  userName,
  userRole,
}: RoomClientProps) {
  const t = useTranslations("room");
  const tra = useTranslations("roomActions");
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  // Track all seen message IDs to prevent duplicates from SSE listener accumulation or race conditions
  const seenIdsRef = useRef<Set<string>>(new Set(initialMessages.map(m => String(m.id))));
  const [nickname, setNickname] = useState(currentNickname);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [hasMore, setHasMore] = useState(initialMessages.length >= 100);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showItemManager, setShowItemManager] = useState(false);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [skillRefreshKey, setSkillRefreshKey] = useState(0);
  const [showBotManager, setShowBotManager] = useState(false);
  const [showAiImport, setShowAiImport] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [checkMode, setCheckMode] = useState<null | "check" | "psychology" | "sancheck">(null);
  const [showCheckMenu, setShowCheckMenu] = useState(false);
  const [pendingSkillCheck, setPendingSkillCheck] = useState<{ messageId: number; skillName: string } | null>(null);
  const [showSkills, setShowSkills] = useState(false);
  const [showSystemMenu, setShowSystemMenu] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  // Inline room-name editing (host only, top bar)
  const [editingRoomName, setEditingRoomName] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(room.name);
  const [savingRoomName, setSavingRoomName] = useState(false);
  const [activeTab, setActiveTab] = useState<"public" | number>("public");
  const [unreadItems, setUnreadItems] = useState(0);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [sidebarWidth, setSidebarWidth] = useState<number>(200);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  // True only while actively dragging the resize handle, so the sidebar can
  // suppress its width transition (instant drag) without losing the smooth
  // collapse/expand animation.
  const [sidebarResizing, setSidebarResizing] = useState<boolean>(false);
  // False until the first viewport check runs; gates the open/close animation
  // so the initial collapsed state doesn't slide on page load.
  const [sidebarHydrated, setSidebarHydrated] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [viewingPlayerId, setViewingPlayerId] = useState<number | null>(null);
  const [viewingPlayerNickname, setViewingPlayerNickname] = useState<string>("");
  const [viewingPlayerCharData, setViewingPlayerCharData] = useState<string | null>(null);
  const [loadingPlayerCard, setLoadingPlayerCard] = useState<boolean>(false);
  const [typingBots, setTypingBots] = useState<Record<number, { nickname: string; typing: boolean; isPrivate?: boolean; targetUserId?: number }>>({});

  // Frozen rooms are read-only for players; the host can still operate.
  const readOnly = !!room.frozen && !isHost;

  const handleSaveRoomName = async () => {
    const trimmed = roomNameDraft.trim();
    if (!trimmed || trimmed === room.name) {
      setEditingRoomName(false);
      return;
    }
    setSavingRoomName(true);
    try {
      await updateRoomNameAction(room.id, trimmed);
      setEditingRoomName(false);
      router.refresh();
    } catch {
      // Revert draft on failure; keep editor open so the host can retry
      setRoomNameDraft(room.name);
    } finally {
      setSavingRoomName(false);
    }
  };

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    getUnreadDMCountAction(room.id).then((serverCounts) => {
      const merged: Record<number, number> = {};
      for (const [uid, count] of Object.entries(serverCounts)) {
        merged[Number(uid)] = count as number;
      }
      setUnreadCounts(merged);
    }).catch(() => {});
    const savedWidth = localStorage.getItem("trpg-sidebar-width");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedWidth) setSidebarWidth(Number(savedWidth));
  }, [room.id]);

  // Settle the collapsed state before the first paint so entering a room shows
  // the sidebar already in its correct state — never open-then-close.
  useIsomorphicLayoutEffect(() => {
    const checkIsMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      } else {
        const savedCollapsed = localStorage.getItem("trpg-sidebar-collapsed");
        setSidebarCollapsed(savedCollapsed === "true");
      }
    };
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  // Enable the open/close transition only on the frame after the initial state
  // has been applied. Doing it in a later commit (not the same one as the
  // collapse above) means the on-load state snaps in without animating, while
  // every subsequent user toggle still animates.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSidebarHydrated(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Incremental pruning: when seenIdsRef exceeds 500, drop the oldest half
  // instead of rebuilding from messages (avoids O(n) rebuild on every batch).
  useEffect(() => {
    if (seenIdsRef.current.size > 500) {
      const toDelete = Array.from(seenIdsRef.current).slice(0, 250);
      for (const id of toDelete) seenIdsRef.current.delete(id);
    }
  }, [messages.length]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    setSidebarResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Constraint width between 160px and 360px
      const newWidth = Math.max(160, Math.min(360, startWidth + deltaX));
      setSidebarWidth(newWidth);
      localStorage.setItem("trpg-sidebar-width", String(newWidth));
    };

    const handleMouseUp = () => {
      setSidebarResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleTabChange = useCallback((tab: "public" | number) => {
    setActiveTab(tab);
    if (tab !== "public") {
      setUnreadCounts((prev) => ({
        ...prev,
        [tab]: 0,
      }));
      markDMReadAction(room.id, tab).catch(() => {});
    }
    if (isMobile) {
      setSidebarCollapsed(true);
      localStorage.setItem("trpg-sidebar-collapsed", "true");
    }
  }, [room.id, isMobile]);

  // Build mention targets (players + bots, excluding self)
  const mentionTargets = useMemo(() => {
    return (players || [])
      .filter((p: { users?: { id?: number }; user_id?: number }) => (p.users?.id || p.user_id) !== userId)
      .map((p: { users?: { id?: number; isBot?: boolean; botConfigJson?: string | null; displayName?: string }; user?: { id?: number; isBot?: boolean; botConfigJson?: string | null; displayName?: string }; user_id?: number; room_members?: { nickname?: string } }) => {
        const u = p.users || p.user;
        const { isBotDisabled, isProviderError } = getBotStatus(u, aiEnabled, validProviderIds);
        return {
          id: (u?.id || p.user_id) ?? 0,
          nickname: p.room_members?.nickname || u?.displayName || `#${u?.id || p.user_id}`,
          isBot: !!u?.isBot,
          isBotDisabled,
          isProviderError,
        };
      });
  }, [players, userId, aiEnabled, validProviderIds]);

  // Build DM conversations
  const dmConversations = useMemo(() => {
    return mentionTargets.map(p => ({
      userId: p.id,
      nickname: p.nickname,
      isBot: p.isBot,
      unread: unreadCounts[p.id] || 0,
      isBotDisabled: p.isBotDisabled,
      isProviderError: p.isProviderError,
    }));
  }, [mentionTargets, unreadCounts]);

  const totalUnread = useMemo(() => {
    return Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  }, [unreadCounts]);

  const roomIsCoc7th = room.ruleTemplate === "coc7th" || room.diceRules === "coc7th";

  const botCount = (players || []).filter((p: { users?: { isBot?: boolean } }) => p.users?.isBot).length;
  const playerCount = (players || []).filter((p: { users?: { isBot?: boolean } }) => !p.users?.isBot).length;

  // Bucket each visible message into its channel/tab. `messages` already only
  // contains rows this viewer may see (filtered by the SSE route + initial query),
  // so we just route by audience: channelOf returns "public" (everyone/self/
  // directed/gm render inline there) or the DM partner's userId.
  const tabMessages = useMemo(() => {
    return messages.filter(m => channelOf(m, userId) === activeTab);
  }, [messages, activeTab, userId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const statusRef = useRef(status);
  const isAtBottomRef = useRef(true);

  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    getUnreadInventoryCountAction(room.id).then(setUnreadItems).catch(() => {});
  }, [room.id]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.type === "system" && (lastMsg.content.includes("道具") || lastMsg.content.toLowerCase().includes("item"))) {
      getUnreadInventoryCountAction(room.id).then(setUnreadItems).catch(() => {});
    }
  }, [messages, room.id]);

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

      // Infinite scroll load more (R8)
      if (el.scrollTop < 10 && hasMore && !loadingMore && messages.length > 0) {
        setLoadingMore(true);
        const oldestId = messages[0].id;
        try {
          const older = await loadMoreMessagesAction(room.id, oldestId, 50) as unknown as Message[];
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

            // Adjust scroll position after rendering to keep it stable
            requestAnimationFrame(() => {
              if (scrollRef.current) {
                const delta = scrollRef.current.scrollHeight - prevScrollHeight;
                scrollRef.current.scrollTop = delta;
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
  }, [room.id, hasMore, loadingMore, messages.length]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }
  }, [tabMessages, typingBots]); // Re-scroll when switching tabs or typing state changes

  useEffect(() => {
    const abortController = new AbortController();
    let reconnectTimeout: NodeJS.Timeout;
    let retryCount = 0;
    const maxRetries = 5;

    const setupSSE = () => {
      if (abortController.signal.aborted) return;
      if (sseRef.current) sseRef.current.close();
      setStatus("connecting");
      const es = new EventSource(`/api/rooms/${room.id}/events`);
      sseRef.current = es;

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
                markDMReadAction(room.id, data.userId).catch(() => {});
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
      if (sseRef.current) sseRef.current.close();
      clearTimeout(reconnectTimeout);
    };
  }, [room.id, userId, isHost]);

  // Re-fetch the current user's sheet so an open 角色卡 / 技能 panel reflects command-driven
  // changes (.st / .sc) without a full page reload. router.refresh() updates the
  // characterData prop (synced into CharacterPanel); the key bump reloads SkillPanel.
  const refreshSelfSheet = useCallback(() => {
    router.refresh();
    setSkillRefreshKey(k => k + 1);
  }, [router]);

  const handleSendMessage = useCallback(async (
    content: string,
    type: "text" | "dice" | "image",
    diceDetail?: string,
    isPrivate?: boolean,
    targetUserId?: number
  ) => {
    // Override isPrivate and targetUserId if we are in a DM tab
    let finalIsPrivate = isPrivate;
    let finalTargetId = targetUserId;

    if (activeTab !== "public") {
      finalIsPrivate = true;
      finalTargetId = activeTab;
    }

    // .st / .sc mutate the character sheet — refresh the open panels afterwards (both
    // command prefixes, and whether intercepted on the client or inside sendMessageAction).
    // No \b after st/sc: the compact form (.stsan60) has no boundary, and no other
    // command token starts with "st"/"sc", so a bare prefix match is correct.
    const isSheetMutationCmd = type === "text" && /^[.。]\s*(st|sc)/i.test(content.trim());

    // Commands are also intercepted server-side in sendMessageAction; both guards must stay in sync.
    // Pass the channel context so command feedback stays inside a DM instead of broadcasting publicly.
    if (content.startsWith(".") && type === "text") {
      try {
        const result = await executeCommandAction(room.id, userId, content, finalIsPrivate, finalTargetId);
        if (!result.success && result.error) {
          const errorMsg = {
            id: localEphemeralId--, roomId: room.id, userId, nickname: "SYSTEM",
            content: tra("commandError", { error: result.error }),
            type: "system" as const, audience: "self" as const, isPrivate: true, diceDetail: null,
            createdAt: new Date().toISOString()
          };
          seenIdsRef.current.add(String(errorMsg.id));
          setMessages(prev => [...prev, errorMsg]);
        }
      } catch (e) { console.error(e); }
      if (isSheetMutationCmd) refreshSelfSheet();
      return;
    }
    try {
      if (type === "dice" && diceDetail) {
        const detail = JSON.parse(diceDetail);
        const faces = parseInt(detail.dice.replace("d", ""));
        await rollDiceAction(room.id, faces, detail.count, finalIsPrivate, finalTargetId);
      } else {
        await sendMessageAction(room.id, content, type, diceDetail, finalIsPrivate, finalTargetId);
      }
      if (isSheetMutationCmd) refreshSelfSheet();
    } catch (e) { console.error(e); }
  }, [room.id, userId, activeTab, refreshSelfSheet]);

  const handleNicknameSave = async (newNickname: string) => {
    await updateNicknameAction(room.id, newNickname);
    setNickname(newNickname);
  };

  const handleViewPlayerCard = useCallback(async (targetUserId: number, targetNickname: string) => {
    setShowMembers(false);
    setViewingPlayerId(targetUserId);
    setViewingPlayerNickname(targetNickname);
    setLoadingPlayerCard(true);
    try {
      const data = await getCharacterDataAction(room.id, targetUserId);
      setViewingPlayerCharData(data ? JSON.stringify(data) : null);
    } catch (e) {
      console.error("Failed to load player character card", e);
    } finally {
      setLoadingPlayerCard(false);
    }
  }, [room.id]);

  // Roll the check on the server. Returns { needsSkill } when the stat isn't set yet
  // (so the caller can open the prompt); otherwise surfaces any error inline.
  const respondCheck = useCallback(async (messageId: number): Promise<{ needsSkill?: boolean }> => {
    const result = await respondToCheckRequestAction(room.id, messageId);
    if (result.needsSkill) return { needsSkill: true };
    if (!result.success && result.error) {
      const errorMsg = {
        id: localEphemeralId--, roomId: room.id, userId, nickname: "SYSTEM",
        content: tra("commandError", { error: result.error }),
        type: "system" as const, audience: "self" as const, isPrivate: true, diceDetail: null,
        createdAt: new Date().toISOString(),
      };
      seenIdsRef.current.add(String(errorMsg.id));
      setMessages(prev => [...prev, errorMsg]);
    } else if (result.success) {
      // A sanity check deducts 理智值 — refresh the open sheet/skill panels.
      refreshSelfSheet();
    }
    return {};
  }, [room.id, userId, tra, refreshSelfSheet]);

  const handleCheckRequest = useCallback((messageId: number, skillName: string) => {
    // Let the server roll the check. If the stat isn't set, it reports needsSkill and we
    // open a themed in-page prompt. The server (lookupCheckTarget) is the source of truth,
    // so COC attributes/resources already on the character sheet won't trigger the prompt.
    respondCheck(messageId).then(r => {
      if (r.needsSkill) setPendingSkillCheck({ messageId, skillName });
    });
  }, [respondCheck]);

  // Player confirmed a skill value in the prompt: set it via the .st command (which applies
  // the COC 7th rule adaptation — attributes/resources go to the character sheet, not skills),
  // then roll the check.
  const handleConfirmSkillSet = useCallback(async (value: number) => {
    if (!pendingSkillCheck) return;
    const { messageId, skillName } = pendingSkillCheck;
    setPendingSkillCheck(null);
    await executeCommandAction(room.id, userId, `.st ${skillName}${value}`);
    await respondCheck(messageId);
  }, [pendingSkillCheck, room.id, userId, respondCheck]);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("trpg-sidebar-collapsed", String(next));
      return next;
    });
  };

  const handleToggleInventory = () => {
    setShowInventory((v) => !v);
    markInventoryViewedAction(room.id);
    setUnreadItems(0);
  };

  return (
    <div className="flex flex-col h-dvh bg-bg overflow-hidden text-text">
      <RoomTopBar
        room={room}
        isHost={isHost}
        nickname={nickname}
        status={status}
        roomIsCoc7th={roomIsCoc7th}
        playerCount={playerCount}
        botCount={botCount}
        sidebarCollapsed={sidebarCollapsed}
        totalUnread={totalUnread}
        onToggleSidebar={handleToggleSidebar}
        editingRoomName={editingRoomName}
        roomNameDraft={roomNameDraft}
        savingRoomName={savingRoomName}
        setRoomNameDraft={setRoomNameDraft}
        setEditingRoomName={setEditingRoomName}
        onSaveRoomName={handleSaveRoomName}
        showCharacter={showCharacter}
        setShowCharacter={setShowCharacter}
        showSkills={showSkills}
        setShowSkills={setShowSkills}
        showInventory={showInventory}
        unreadItems={unreadItems}
        onToggleInventory={handleToggleInventory}
        checkMode={checkMode}
        setCheckMode={setCheckMode}
        showCheckMenu={showCheckMenu}
        setShowCheckMenu={setShowCheckMenu}
        showItemManager={showItemManager}
        setShowItemManager={setShowItemManager}
        showAiMenu={showAiMenu}
        setShowAiMenu={setShowAiMenu}
        setShowAiImport={setShowAiImport}
        setShowBotManager={setShowBotManager}
        showSystemMenu={showSystemMenu}
        setShowSystemMenu={setShowSystemMenu}
        setShowMembers={setShowMembers}
        setShowRoomInfo={setShowRoomInfo}
        setShowExport={setShowExport}
        setShowSettings={setShowSettings}
        setShowUserSettings={setShowUserSettings}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Conversation TAB (Task #43) */}
        <ConversationPanel
          activeTab={activeTab}
          onTabChange={handleTabChange}
          dmConversations={dmConversations}
          onStartDM={() => setShowMembers(true)}
          roomId={room.id}
          userId={userId}
          width={sidebarWidth}
          collapsed={sidebarCollapsed}
          resizing={sidebarResizing || !sidebarHydrated}
          onToggleCollapse={() => {
            setSidebarCollapsed((prev) => {
              const val = !prev;
              localStorage.setItem("trpg-sidebar-collapsed", String(val));
              return val;
            });
          }}
        />

        {/* Backdrop for mobile sidebar — stays mounted so it can fade in/out
            in step with the drawer slide. */}
        {isMobile && (
          <div
            aria-hidden={sidebarCollapsed}
            className={`fixed inset-0 bg-black/40 z-20 transition-opacity duration-300 ${
              sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100 cursor-pointer"
            }`}
            onClick={() => {
              setSidebarCollapsed(true);
              localStorage.setItem("trpg-sidebar-collapsed", "true");
            }}
          />
        )}

        {/* Resize Handle */}
        {!sidebarCollapsed && !isMobile && (
          <div
            onMouseDown={handleResizeStart}
            className="w-1 hover:w-1.5 active:w-1.5 h-full bg-border hover:bg-primary/50 active:bg-primary cursor-col-resize select-none transition-all duration-150 shrink-0 relative z-10 group"
            title={t("tooltipResize")}
            onDoubleClick={() => {
              setSidebarWidth(200);
              localStorage.setItem("trpg-sidebar-width", "200");
            }}
          >
            {/* Collapse toggle button on the handle (like VS Code or Notion) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-4 h-8 bg-surface border border-border hover:border-primary/50 rounded flex items-center justify-center shadow-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-20"
              onClick={(e) => {
                e.stopPropagation();
                setSidebarCollapsed(true);
                localStorage.setItem("trpg-sidebar-collapsed", "true");
              }}
              title={t("tooltipCollapseSidebar")}
            >
              <span className="text-[9px] text-text-muted hover:text-primary select-none">◀</span>
            </div>
          </div>
        )}

        {/* Main Content: Chat Area */}
        <div className="flex-1 flex flex-col relative min-w-0">
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth">
            <div className="max-w-4xl mx-auto flex flex-col gap-1">
              {tabMessages.map((msg) => {
                const playerData = players.find((p: { users?: { id?: number }; user_id?: number; user?: { id?: number } }) => (p.users?.id || p.user_id || p.user?.id) === msg.userId);
                return (
                  <ChatMessage
                    key={msg.id}
                    nickname={msg.nickname}
                    content={msg.content}
                    type={msg.type as "text" | "dice" | "system" | "clue" | "image" | "check_request"}
                    diceDetail={msg.diceDetail}
                    isPrivate={msg.isPrivate}
                    createdAt={msg.createdAt}
                    isOwn={msg.userId === userId}
                    userId={userId}
                    senderId={msg.userId}
                    isHost={isHost}
                    onViewCharacter={handleViewPlayerCard}
                    onStartDM={handleTabChange}
                    onCheckRequest={handleCheckRequest}
                    messageId={msg.id}
                    isBot={!!playerData?.users?.isBot}
                    roomId={room.id}
                    hostId={room.hostId}
                    avatarColor={playerData?.room_members?.avatarColor}
                    avatar={playerData?.room_members?.avatar}
                  />
                );
              })}
              {Object.entries(typingBots)
                .filter(([botId, bot]) => {
                  if (bot.isPrivate) {
                    return activeTab === Number(botId);
                  } else {
                    return activeTab === "public";
                  }
                })
                .map(([botId, bot]) => (
                  <div key={botId} className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-dim bg-surface/50 border border-border/40 rounded-theme max-w-max animate-pulse my-1 font-mono">
                    <span>🤖</span>
                    <span>{t("botThinking", { nickname: bot.nickname })}</span>
                  </div>
                ))}
              {tabMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-50 py-20">
                  <span className="text-4xl mb-4">{activeTab === "public" ? "🏠" : "🔒"}</span>
                  <p>{activeTab === "public" ? t("publicEmpty") : t("dmEmpty")}</p>
                </div>
              )}
            </div>
          </div>

          {showScrollButton && (
            <button onClick={() => scrollToBottom(true)} className="absolute bottom-28 right-8 z-10 bg-scroll-btn hover:opacity-90 text-white w-10 h-10 rounded-full shadow-2xl flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 group" title={t("scrollToBottom")}>
              <span className="text-xl group-hover:animate-bounce">↓</span>
            </button>
          )}

          <div className="bg-surface-alt border-t border-border px-4 py-3 shrink-0">
            <div className="max-w-4xl mx-auto">
              {activeTab !== "public" && (
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-widest bg-accent/5 py-1 px-2 rounded-md border border-accent/20 animate-pulse">
                    <span>{t("dmPrefix", { nickname: dmConversations.find(c => c.userId === activeTab)?.nickname ?? "" })}</span>
                    <button onClick={() => handleTabChange("public")} className="ml-auto text-text-muted hover:text-accent font-bold cursor-pointer">{t("dmExit")}</button>
                  </div>
                )}
              <ChatInput onSendMessage={handleSendMessage} roomId={room.id} mentions={mentionTargets} readOnly={readOnly} />
            </div>
          </div>
        </div>
      </div>

      {showCharacter && (
        <CharacterPanel
          roomId={room.id}
          userId={userId}
          currentNickname={nickname}
          characterData={characterData}
          roomRuleTemplate={(room as { ruleTemplate?: string }).ruleTemplate || "basic"}
          onClose={() => setShowCharacter(false)}
          onNicknameChange={(newNick) => setNickname(newNick)}
          readOnly={readOnly}
          refreshKey={skillRefreshKey}
          avatarColor={players.find((p: { users?: { id?: number }; user_id?: number; user?: { id?: number }; room_members?: { avatarColor?: string | null } }) => (p.users?.id || p.user_id || p.user?.id) === userId)?.room_members?.avatarColor}
          avatar={players.find((p: { users?: { id?: number }; user_id?: number; user?: { id?: number }; room_members?: { avatar?: string | null } }) => (p.users?.id || p.user_id || p.user?.id) === userId)?.room_members?.avatar}
        />
      )}
      {viewingPlayerId !== null && (
        <CharacterPanel
          roomId={room.id}
          userId={viewingPlayerId}
          currentNickname={viewingPlayerNickname}
          characterData={viewingPlayerCharData}
          roomRuleTemplate={(room as { ruleTemplate?: string }).ruleTemplate || "basic"}
          onClose={() => {
            setViewingPlayerId(null);
            setViewingPlayerCharData(null);
            setViewingPlayerNickname("");
          }}
          onNicknameChange={() => {}}
          readOnly={true}
          targetUserId={viewingPlayerId}
          loading={loadingPlayerCard}
          avatarColor={players.find((p: { users?: { id?: number }; user_id?: number; user?: { id?: number }; room_members?: { avatarColor?: string | null } }) => (p.users?.id || p.user_id || p.user?.id) === viewingPlayerId)?.room_members?.avatarColor}
          avatar={players.find((p: { users?: { id?: number }; user_id?: number; user?: { id?: number }; room_members?: { avatar?: string | null } }) => (p.users?.id || p.user_id || p.user?.id) === viewingPlayerId)?.room_members?.avatar}
          isGM={isHost}
        />
      )}
      {showBotManager && (
        <BotManager roomId={room.id} isHost={isHost} onClose={() => setShowBotManager(false)} aiEnabled={aiEnabled} validProviderIds={validProviderIds} />
      )}
      {showAiImport && (
        <AiImportPanel roomId={room.id} onClose={() => setShowAiImport(false)} />
      )}
      {checkMode && (
        <HostCheckDialog
          roomId={room.id}
          mode={checkMode}
          players={activeTab === "public" ? mentionTargets : mentionTargets.filter(p => p.id === activeTab)}
          isPrivate={activeTab !== "public"}
          channelTargetUserId={activeTab !== "public" ? activeTab : undefined}
          onClose={() => setCheckMode(null)}
        />
      )}
      {pendingSkillCheck && (
        <SkillSetPrompt
          skillName={pendingSkillCheck.skillName}
          onConfirm={handleConfirmSkillSet}
          onClose={() => setPendingSkillCheck(null)}
        />
      )}
      {showMembers && (
        <MembersDialog
          players={players}
          userId={userId}
          hostId={room.hostId}
          isHost={isHost}
          aiEnabled={aiEnabled}
          validProviderIds={validProviderIds}
          playerCount={playerCount}
          botCount={botCount}
          onViewPlayerCard={handleViewPlayerCard}
          onStartDM={handleTabChange}
          onClose={() => setShowMembers(false)}
        />
      )}
      {showInventory && (
        <InventoryPanel view="backpack" roomId={room.id} userId={userId} isHost={isHost} refreshKey={inventoryRefreshKey} players={players.map((m: { users?: { id?: number; username?: string }; user_id?: number; room_members?: { nickname?: string }; nickname?: string }) => ({ id: (m.users?.id || m.user_id) ?? 0, username: m.users?.username || "", nickname: m.room_members?.nickname || m.nickname || "" }))} onClose={() => setShowInventory(false)} readOnly={readOnly} />
      )}
      {showItemManager && isHost && (
        <InventoryPanel view="manage" roomId={room.id} userId={userId} isHost={isHost} refreshKey={inventoryRefreshKey} players={players.map((m: { users?: { id?: number; username?: string }; user_id?: number; room_members?: { nickname?: string }; nickname?: string }) => ({ id: (m.users?.id || m.user_id) ?? 0, username: m.users?.username || "", nickname: m.room_members?.nickname || m.nickname || "" }))} onClose={() => setShowItemManager(false)} readOnly={readOnly} />
      )}
      {showSettings && (
        <RoomSettings roomId={room.id} roomName={room.name} currentTheme={roomTheme || "default"} currentDiceRules={roomDiceRules || "basic"} currentRuleTemplate={(room as { ruleTemplate?: string }).ruleTemplate || "basic"} onClose={() => setShowSettings(false)} />
      )}
      {showRoomInfo && (
        <RoomInfoPanel room={{ ...room, diceRules: room.diceRules ?? "basic", ruleTemplate: room.ruleTemplate ?? "basic", createdAt: room.createdAt ?? "" }} isHost={isHost} userId={userId} onClose={() => setShowRoomInfo(false)} />
      )}
      {showExport && (
        <OverlayShell onClose={() => setShowExport(false)} panelClassName="max-w-md w-full mx-4">
          {() => <ExportButton roomId={room.id} roomName={room.name} />}
        </OverlayShell>
      )}
      {showSkills && (
        <SkillPanel roomId={room.id} userId={userId} onClose={() => setShowSkills(false)} readOnly={readOnly} refreshKey={skillRefreshKey} />
      )}
      {showUserSettings && (
        <UserSettingsPanel userName={userName} userRole={userRole} onClose={() => setShowUserSettings(false)} />
      )}
    </div>
  );
}
