"use client";

// Decrementing counter for local-only ephemeral message IDs (never persisted to DB).
// Negative IDs guarantee no collision with real DB auto-increment IDs.
let localEphemeralId = -1;

import { useState, useRef, useEffect, useMemo, useCallback, useSyncExternalStore } from "react";
import { ConversationPanel } from "@/components/room/chat/ConversationPanel";
import { RoomTopBar } from "@/components/room/RoomTopBar";
import { RoomBackground } from "@/components/room/RoomBackground";
import { ChatArea } from "@/components/room/chat/ChatArea";
import { RoomOverlays } from "@/components/room/RoomOverlays";
import { useRoomEvents } from "@/components/room/hooks/useRoomEvents";
import { useSidebar } from "@/components/room/hooks/useSidebar";
import { useRoomHotkeys } from "@/components/room/hooks/useRoomHotkeys";
import { RoomHotkeyHelp } from "@/components/room/RoomHotkeyHelp";
import { TOGGLE_DICE_EVENT, HOTKEY_HINT_SEEN_KEY, formatHotkey, type RoomHotkeyAction } from "@/lib/hotkeys";
import { Icons } from "@/components/shared/icons";
import { sendMessageAction, rollDiceAction, executeCommandAction, markDMReadAction, getUnreadDMCountAction, loadMoreMessagesAction, updateRoomNameAction, respondToCheckRequestAction, getProxyCheckTargetsAction, withdrawTimelineDividerAction } from "@/app/actions/room";
import { getUnreadInventoryCountAction } from "@/app/actions/inventory";
import { getCharacterDataAction } from "@/app/actions/character";
import { getMySkillsAction } from "@/app/actions/skills";
import { getMyEventsAction, getUnreadEventCountAction, type EventView } from "@/app/actions/event";
import { EventDataProvider, type EventData } from "@/components/room/event/EventDataContext";
import { useBackpackEntities } from "@/components/room/event/event-helpers";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { getBotStatus } from "@/lib/botStatus";
import type { Message, RoomClientProps, ConnectionStatus, TypingBots, CheckMode, PendingSkillCheck } from "@/components/room/types";

/**
 * External store for the one-time hotkey-discoverability toast. Persisted in
 * localStorage per browser (not per room). `getSnapshot` also gates on a fine
 * pointer, so touch-only devices — where the shortcuts don't exist — never see
 * the toast. `markSeen` notifies same-tab subscribers directly, since the
 * native `storage` event only fires cross-tab.
 */
const hotkeyHintStore = {
  listeners: new Set<() => void>(),
  subscribe(cb: () => void) {
    hotkeyHintStore.listeners.add(cb);
    return () => {
      hotkeyHintStore.listeners.delete(cb);
    };
  },
  getSnapshot(): boolean {
    try {
      return (
        !window.localStorage.getItem(HOTKEY_HINT_SEEN_KEY) &&
        window.matchMedia("(pointer: fine)").matches
      );
    } catch {
      return false;
    }
  },
  getServerSnapshot(): boolean {
    return false;
  },
  markSeen() {
    try {
      window.localStorage.setItem(HOTKEY_HINT_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    hotkeyHintStore.listeners.forEach((l) => l());
  },
};
import { channelOf } from "@/lib/messaging/audience";
import { getRuleForRoom, primaryVital, ruleUsesStructuredSheet, attributesUnset, type StatusEntry } from "@/lib/rules";
import type { CharacterData } from "@/lib/character-types";
import { RuleTemplateProvider } from "@/components/shared/host-label";
import { useTheme } from "@/components/theme/ThemeProvider";
import { parseTimelinePayload, resolvedModeFromDivider } from "@/lib/messaging/timeline-payload";
import type { ThemeMode } from "@/themes/types";

export function RoomClient({
  room,
  messages: initialMessages,
  userId,
  isHost,
  currentNickname,
  roomTheme,
  roomThemeMode,
  initialTimelineMode,
  players = [],
  characterData,
  aiEnabled = false,
  validProviderIds = [],
  userName,
  userRole,
  backgroundUrl = null,
  isObserver = false,
}: RoomClientProps) {
  const t = useTranslations("room");
  const tra = useTranslations("roomActions");
  const tHotkeys = useTranslations("hotkeys");
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  // Track all seen message IDs to prevent duplicates from SSE listener accumulation or race conditions
  const seenIdsRef = useRef<Set<string>>(new Set(initialMessages.map(m => String(m.id))));
  // Latest messages snapshot for event handlers (e.g. infinite-scroll) that must read the
  // current oldest id without being re-created on every message change. Synced in an effect
  // (see below) rather than during render, per react-hooks/refs.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [nickname, setNickname] = useState(currentNickname);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [hasMore, setHasMore] = useState(initialMessages.length >= 100);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showNotebook, setShowNotebook] = useState(false);
  const [showItemManager, setShowItemManager] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showEventManage, setShowEventManage] = useState(false);
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);
  const [visibleEventIds, setVisibleEventIds] = useState<Set<number>>(new Set());
  const [eventsById, setEventsById] = useState<Map<number, EventView>>(new Map());
  const [eventsOrdered, setEventsOrdered] = useState<EventView[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(false);
  const [unreadEvents, setUnreadEvents] = useState(0);
  const [unreadEventsKey, setUnreadEventsKey] = useState(0);
  const [eventDetailId, setEventDetailId] = useState<number | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [skillRefreshKey, setSkillRefreshKey] = useState(0);
  const [showBotManager, setShowBotManager] = useState(false);
  const [showAiImport, setShowAiImport] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [checkMode, setCheckMode] = useState<CheckMode | null>(null);
  const [showCheckMenu, setShowCheckMenu] = useState(false);
  const [pendingSkillCheck, setPendingSkillCheck] = useState<PendingSkillCheck | null>(null);
  const [pendingBonusDice, setPendingBonusDice] = useState<{ messageId: number } | null>(null);
  const [showSystemMenu, setShowSystemMenu] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showHotkeyHelp, setShowHotkeyHelp] = useState(false);
  // One-time discoverability toast for the hotkey system. Read via
  // useSyncExternalStore (same pattern as RoomTopBar's event badge): no
  // setState-in-effect, no hydration flash — the server snapshot is always
  // "seen" (toast hidden). Desktop only; retired for good once the user closes
  // it or opens the help sheet by any path (Alt+/, gear menu, the toast).
  const showHotkeyHint = useSyncExternalStore(
    hotkeyHintStore.subscribe,
    hotkeyHintStore.getSnapshot,
    hotkeyHintStore.getServerSnapshot,
  );
  const openHotkeyHelp = useCallback(() => {
    hotkeyHintStore.markSeen();
    setShowHotkeyHelp(true);
  }, []);
  // Inline room-name editing (host only, top bar)
  const [editingRoomName, setEditingRoomName] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(room.name);
  const [savingRoomName, setSavingRoomName] = useState(false);
  const [activeTab, setActiveTab] = useState<"public" | number>("public");
  const [unreadItems, setUnreadItems] = useState(0);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  // Live overrides pushed by SSE, keyed by userId — one entry per member,
  // holding the rule's primary vital (HP where the rule has one).
  const [characterResources, setCharacterResources] = useState<Map<number, StatusEntry>>(new Map());
  const [viewingPlayerId, setViewingPlayerId] = useState<number | null>(null);
  const [viewingPlayerNickname, setViewingPlayerNickname] = useState<string>("");
  const [viewingPlayerCharData, setViewingPlayerCharData] = useState<string | null>(null);
  const [loadingPlayerCard, setLoadingPlayerCard] = useState<boolean>(false);
  const [typingBots, setTypingBots] = useState<TypingBots>({});

  // Conversation sidebar (width / collapsed / mobile + drag-to-resize).
  const {
    width: sidebarWidth,
    collapsed: sidebarCollapsed,
    resizing: sidebarResizing,
    hydrated: sidebarHydrated,
    isMobile,
    setCollapsed: setSidebarCollapsed,
    toggleCollapsed: toggleSidebar,
    resetWidth: resetSidebarWidth,
    handleResizeStart,
  } = useSidebar();

  // Frozen rooms are read-only for players; the host can still operate.
  // Admin observers (viewing a room they haven't joined) are always read-only.
  const readOnly = (!!room.frozen && !isHost) || isObserver;

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
  }, [room.id]);

  // Incremental pruning: when seenIdsRef exceeds 500, drop the oldest half
  // instead of rebuilding from messages (avoids O(n) rebuild on every batch).
  useEffect(() => {
    if (seenIdsRef.current.size > 500) {
      const toDelete = Array.from(seenIdsRef.current).slice(0, 250);
      for (const id of toDelete) seenIdsRef.current.delete(id);
    }
  }, [messages.length]);

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
    }
  }, [room.id, isMobile, setSidebarCollapsed]);

  // Build mention targets (players + bots, excluding self)
  const mentionTargets = useMemo(() => {
    return (players || [])
      .filter((p: { users?: { id?: number }; user_id?: number }) => (p.users?.id || p.user_id) !== userId)
      .map((p: { users?: { id?: number; isBot?: boolean; botConfigJson?: string | null; displayName?: string }; user?: { id?: number; isBot?: boolean; botConfigJson?: string | null; displayName?: string }; user_id?: number; room_members?: { nickname?: string; characterData?: string | null; avatar?: string | null; avatarColor?: string | null } }) => {
        const u = p.users || p.user;
        const { isBotDisabled, isProviderError } = getBotStatus(u, aiEnabled, validProviderIds);
        const charData = p.room_members?.characterData ? JSON.parse(p.room_members.characterData) : null;
        return {
          id: (u?.id || p.user_id) ?? 0,
          nickname: p.room_members?.nickname || u?.displayName || `#${u?.id || p.user_id}`,
          isBot: !!u?.isBot,
          isBotDisabled,
          isProviderError,
          vital: primaryVital(charData),
          avatar: p.room_members?.avatar ?? null,
          avatarColor: p.room_members?.avatarColor ?? null,
        };
      });
  }, [players, userId, aiEnabled, validProviderIds]);

  // Build DM conversations
  const dmConversations = useMemo(() => {
    return mentionTargets.map(p => {
      const liveRes = characterResources.get(p.id);
      return {
        userId: p.id,
        nickname: p.nickname,
        isBot: p.isBot,
        unread: unreadCounts[p.id] || 0,
        isBotDisabled: p.isBotDisabled,
        isProviderError: p.isProviderError,
        isOnline: onlineUserIds.has(p.id),
        vital: liveRes ?? p.vital,
        avatar: p.avatar,
        avatarColor: p.avatarColor,
      };
    });
  }, [mentionTargets, unreadCounts, onlineUserIds, characterResources]);

  const totalUnread = useMemo(() => {
    return Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  }, [unreadCounts]);

  // Capabilities drive every rule-specific UI gate (TopBar check menu,
  // tooltips, host-only buttons). Looked up once per render so child props
  // stay stable.
  const ruleCapabilities = getRuleForRoom(room).capabilities;

  // "Set up your character" nudge on the 角色档案 top-bar icon. Only for rules
  // with a structured sheet (coc7th/TA/DnD/狩魂; basic/通用 d100 never hints),
  // and only for the current user. Roll-up: lights up when attributes are still
  // at their rule defaults OR the user has no skills yet. Skills are counted
  // here (the top bar has no sheet/skill data of its own), keyed on the shared
  // skillRefreshKey so .st commands and in-panel skill edits keep it live.
  const [skillsEmpty, setSkillsEmpty] = useState(false);
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  useEffect(() => {
    getMySkillsAction(room.id)
      .then(s => { setSkillsEmpty(s.length === 0); setSkillsLoaded(true); })
      .catch(() => {});
  }, [room.id, skillRefreshKey]);

  // Events: one fetch for the whole room, shared through EventDataContext with
  // the chat cards, the events panel and the detail modal — see that file for
  // why this is centralized. The same response drives the readable-id set that
  // gates each chat card's lock state, plus the top-bar unread badge.
  // Re-fetched on the shared eventsRefreshKey, which the `events_updated` SSE
  // bumps, so publish/retract/promote/edit all reflect live.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const rows = await getMyEventsAction(room.id);
        if (!alive) return;
        setEventsOrdered(rows);
        setEventsById(new Map(rows.map((e) => [e.id, e])));
        setVisibleEventIds(new Set(rows.map((e) => e.id)));
        setEventsError(false);
      } catch {
        if (alive) setEventsError(true);
      } finally {
        // Never flips back to true: a refresh keeps the current list on screen
        // instead of flashing a spinner (and wiping the "updated" highlights).
        if (alive) setEventsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [room.id, eventsRefreshKey]);

  useEffect(() => {
    getUnreadEventCountAction(room.id).then(setUnreadEvents).catch(() => {});
  }, [room.id, eventsRefreshKey, unreadEventsKey]);

  const bumpEvents = useCallback(() => setEventsRefreshKey((k) => k + 1), []);
  /** Refresh only the top-bar badge. Marking events read must NOT re-fetch the
   *  list — that is what used to erase the "已更新" highlights ~300ms after the
   *  player opened the panel to look at them. */
  const refreshEventBadge = useCallback(() => setUnreadEventsKey((k) => k + 1), []);

  const eventEntities = useBackpackEntities(room.id, inventoryRefreshKey);
  const eventData = useMemo<EventData>(() => ({
    eventsById, eventsOrdered, entities: eventEntities,
    loading: eventsLoading, error: eventsError, retry: bumpEvents,
  }), [eventsById, eventsOrdered, eventEntities, eventsLoading, eventsError, bumpEvents]);

  const characterHint = useMemo(() => {
    const rule = getRuleForRoom(room);
    if (!ruleUsesStructuredSheet(rule)) return false;
    let sheet: CharacterData | null = null;
    if (characterData) {
      try { sheet = JSON.parse(characterData) as CharacterData; } catch {}
    }
    return attributesUnset(sheet, rule) || (skillsLoaded && skillsEmpty);
  }, [room, characterData, skillsLoaded, skillsEmpty]);

  const bumpSkills = useCallback(() => setSkillRefreshKey(k => k + 1), []);

  const botCount = (players || []).filter((p: { users?: { isBot?: boolean } }) => p.users?.isBot).length;
  const playerCount = (players || []).filter((p: { users?: { isBot?: boolean } }) => !p.users?.isBot).length;

  // Live "online" count: non-bot members with an active SSE connection, plus
  // self (always online as the viewer). Single source of truth shared by the
  // top bar and the left roster panel so their "X 在线" labels stay in sync —
  // presence lives in `onlineUserIds` (SSE presence_update), not the roster.
  const onlineCount = useMemo(
    () =>
      (players || []).filter((p: { users?: { id?: number; isBot?: boolean }; user?: { id?: number; isBot?: boolean }; user_id?: number }) => {
        const u = p.users || p.user;
        const id = u?.id ?? p.user_id;
        return !u?.isBot && (id === userId || onlineUserIds.has(id ?? -1));
      }).length,
    [players, onlineUserIds, userId]
  );

  // Bucket each visible message into its channel/tab. `messages` already only
  // contains rows this viewer may see (filtered by the SSE route + initial query),
  // so we just route by audience: channelOf returns "public" (everyone/self/
  // directed/gm render inline there) or the DM partner's userId.
  const tabMessages = useMemo(() => {
    return messages.filter(m => channelOf(m, userId) === activeTab);
  }, [messages, activeTab, userId]);

  const scrollRef = useRef<HTMLDivElement>(null);
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

      // Infinite scroll load more (R8) — read the live snapshot via ref so the
      // handler needn't list `messages` as a dep (which would recreate it on every message).
      const currentMessages = messagesRef.current;
      if (el.scrollTop < 10 && hasMore && !loadingMore && currentMessages.length > 0) {
        setLoadingMore(true);
        const oldestId = currentMessages[0].id;
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
  }, [room.id, hasMore, loadingMore]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }
  }, [tabMessages, typingBots]); // Re-scroll when switching tabs or typing state changes

  // Single SSE connection: routes inbound events into the right state setter.
  useRoomEvents({
    roomId: room.id,
    userId,
    isHost,
    activeTabRef,
    seenIdsRef,
    setMessages,
    setStatus,
    setUnreadCounts,
    setTypingBots,
    setInventoryRefreshKey,
    setEventsRefreshKey,
    setOnlineUserIds,
    setCharacterResources,
  });

  // Room display mode — RoomClient is the single owner of the theme context's
  // roomMode (RoomThemeSetter owns only the theme). Normally this is the room's
  // configured auto/light/dark. When themeMode is "timeline", light/dark instead
  // follows the most recent timeline divider (night → dark, morning/afternoon →
  // light). The latest divider is the max-id one in the loaded window; if none is
  // loaded we fall back to the server-resolved initial (the true latest may
  // predate the window).
  const { setRoomMode } = useTheme();
  const followsTimeline = room.themeMode === "timeline";
  const effectiveRoomMode = useMemo<ThemeMode>(() => {
    if (!followsTimeline) return (room.themeMode as ThemeMode) || "auto";
    let latest: Message | null = null;
    for (const m of messages) {
      if (m.type === "system" && m.systemKind === "timeline-divider" && (!latest || m.id > latest.id)) {
        latest = m;
      }
    }
    if (!latest) return initialTimelineMode ?? "light";
    return resolvedModeFromDivider(parseTimelinePayload(latest.diceDetail)) ?? "light";
  }, [followsTimeline, room.themeMode, messages, initialTimelineMode]);

  useEffect(() => {
    setRoomMode(effectiveRoomMode);
    // Cache for the pre-paint FOUC script (src/app/layout.tsx) on next navigation.
    try { window.sessionStorage.setItem("room-mode-" + room.id, effectiveRoomMode); } catch {}
    return () => setRoomMode(null);
  }, [effectiveRoomMode, room.id, setRoomMode]);

  // Re-fetch the current user's sheet so an open 角色卡 reflects command-driven
  // changes (.st / .sc) without a full page reload. router.refresh() updates the
  // characterData prop; the key bump reloads the CharacterPanel's 技能 tab.
  const refreshSelfSheet = useCallback(() => {
    router.refresh();
    setSkillRefreshKey(k => k + 1);
  }, [router]);

  const handleSendMessage = useCallback(async (
    content: string,
    type: "text" | "dice" | "image" | "sticker",
    diceDetail?: string,
    isPrivate?: boolean,
    targetUserId?: number
  ) => {
    // The channel we're posting in: public, or a DM with this partner.
    const channelPartner = activeTab !== "public" ? activeTab : undefined;

    // Text/image inherit the channel's privacy (a DM tab → a `dm` whisper). The
    // dice panel's 🔒 "secret" toggle is handled separately below (hidden roll),
    // so it is NOT folded into the channel here.
    let finalIsPrivate = isPrivate;
    let finalTargetId = targetUserId;
    if (channelPartner !== undefined) {
      finalIsPrivate = true;
      finalTargetId = channelPartner;
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
            type: "system" as const, audience: "self" as const,
            systemKind: "error" as const,
            targetUserId: null, channelUserId: channelPartner ?? null,
            isPrivate: true, diceDetail: null,
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
      if (type === "dice") {
        // Dice always go through rollDiceAction so the server is the source of
        // truth for the result. Skip silently if the caller didn't include the
        // detail we need — that's a programming bug, not a chat message.
        if (!diceDetail) return;
        const detail = JSON.parse(diceDetail);
        const faces = parseInt(detail.dice.replace("d", ""));
        // `isPrivate` here is the dice panel's 🔒 secret toggle → a hidden (self-only)
        // roll. `channelPartner` decides where it lands (current DM, or public).
        const hidden = !!isPrivate;
        await rollDiceAction(room.id, faces, detail.count, hidden, channelPartner);
      } else {
        await sendMessageAction(room.id, content, type, finalIsPrivate, finalTargetId);
      }
      if (isSheetMutationCmd) refreshSelfSheet();
    } catch (e) { console.error(e); }
  }, [room.id, userId, activeTab, tra, refreshSelfSheet]);

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
  const respondCheck = useCallback(async (messageId: number, onBehalfOfUserId?: number, bonusDice?: number): Promise<{ needsSkill?: boolean }> => {
    const result = await respondToCheckRequestAction(
      room.id, messageId,
      onBehalfOfUserId !== undefined || bonusDice !== undefined ? { onBehalfOfUserId, bonusDice } : undefined
    );
    if (result.needsSkill) return { needsSkill: true };
    if (!result.success && result.error) {
      const errorMsg = {
        id: localEphemeralId--, roomId: room.id, userId, nickname: "SYSTEM",
        content: tra("commandError", { error: result.error }),
        type: "system" as const, audience: "self" as const,
        systemKind: "error" as const,
        isPrivate: true, diceDetail: null,
        createdAt: new Date().toISOString(),
      };
      seenIdsRef.current.add(String(errorMsg.id));
      setMessages(prev => [...prev, errorMsg]);
    } else if (result.success && !onBehalfOfUserId) {
      // A sanity check deducts 理智值 — refresh the open sheet/skill panels.
      // (Proxy rolls deduct the proxied player's sanity, not the host's — no self refresh.)
      refreshSelfSheet();
    }
    return {};
  }, [room.id, userId, tra, refreshSelfSheet]);

  const handleCheckRequest = useCallback((messageId: number, skillName: string, opts?: { bonusDicePrompt?: boolean }) => {
    // Rule-specialized request (狩魂者): ask the player for their 加骰 count
    // first; the roll fires from the prompt's confirm.
    if (opts?.bonusDicePrompt) {
      setPendingBonusDice({ messageId });
      return;
    }
    // Let the server roll the check. If the stat isn't set, it reports needsSkill and we
    // open a themed in-page prompt. The server (lookupCheckTarget) is the source of truth,
    // so COC attributes/resources already on the character sheet won't trigger the prompt.
    respondCheck(messageId).then(r => {
      if (r.needsSkill) setPendingSkillCheck({ messageId, skillName });
    });
  }, [respondCheck]);

  // Player confirmed their 加骰 count for a rule-specialized check request.
  const handleConfirmBonusDice = useCallback((bonusDice: number) => {
    if (!pendingBonusDice) return;
    const { messageId } = pendingBonusDice;
    setPendingBonusDice(null);
    respondCheck(messageId, undefined, bonusDice);
  }, [pendingBonusDice, respondCheck]);

  /** Host proxy: roll on behalf of an absent target. Skill prompt never triggers
   *  (the host can't set another player's skill — the server returns a plain error). */
  const handleProxyCheckRequest = useCallback((messageId: number, onBehalfOfUserId: number) => {
    respondCheck(messageId, onBehalfOfUserId);
  }, [respondCheck]);

  /** Fetch pending targets + each player's resolved skill value for the popover preview. */
  const loadProxyTargets = useCallback((messageId: number) => {
    return getProxyCheckTargetsAction(room.id, messageId);
  }, [room.id]);

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

  // Host withdraws a timeline divider. The row is removed for everyone via the
  // `message_deleted` SSE event (handled in useRoomEvents), including this client.
  const handleWithdrawTimeline = useCallback(async (messageId: number) => {
    try {
      await withdrawTimelineDividerAction(room.id, messageId);
    } catch (e) {
      console.error("Failed to withdraw timeline divider:", e);
    }
  }, [room.id]);

  const handleToggleInventory = () => {
    setShowInventory((v) => !v);
    // Clear only the local unread dot here. The server-side "viewed" flags are
    // acknowledged by the InventoryPanel *after* it loads, so the new/updated
    // highlights still render this session instead of being cleared mid-open.
    setUnreadItems(0);
  };

  // Alt+↑/↓: cycle through the conversation tabs (public first, then the DM
  // list in sidebar order). Wraps around at both ends.
  const cycleTab = useCallback((dir: 1 | -1) => {
    const order: ("public" | number)[] = ["public", ...dmConversations.map((c) => c.userId)];
    const i = order.indexOf(activeTab);
    handleTabChange(order[(Math.max(i, 0) + dir + order.length) % order.length]);
  }, [dmConversations, activeTab, handleTabChange]);

  // Room-wide keyboard shortcuts (bindings defined in src/lib/hotkeys.ts).
  useRoomHotkeys({
    isHost,
    readOnly,
    onAction: (action: RoomHotkeyAction) => {
      switch (action) {
        case "toggle-character": setShowCharacter((v) => !v); break;
        case "toggle-inventory": handleToggleInventory(); break;
        case "toggle-notebook": setShowNotebook((v) => !v); break;
        case "toggle-events": setShowEvents((v) => !v); break;
        case "toggle-sidebar": toggleSidebar(); break;
        case "toggle-dice":
          if (!readOnly) window.dispatchEvent(new CustomEvent(TOGGLE_DICE_EVENT));
          break;
        case "toggle-check":
          // Mirrors the top-bar button: multi-mode rules get the dropdown,
          // single-mode rules toggle the direct check dialog, no-check rules no-op.
          if (ruleCapabilities.checkMenuModes.length > 1) setShowCheckMenu((v) => !v);
          else if (ruleCapabilities.checkMenuModes.length === 1) setCheckMode((m) => (m === "check" ? null : "check"));
          break;
        case "toggle-item-manager": setShowItemManager((v) => !v); break;
        case "toggle-timeline": setShowTimeline((v) => !v); break;
        case "prev-tab": cycleTab(-1); break;
        case "next-tab": cycleTab(1); break;
        case "help":
          hotkeyHintStore.markSeen();
          setShowHotkeyHelp((v) => !v);
          break;
      }
    },
    // Escape with no overlay mounted: close whichever top-bar dropdown is open.
    onEscape: () => {
      setShowSystemMenu(false);
      setShowAiMenu(false);
      setShowCheckMenu(false);
    },
  });

  return (
    <RuleTemplateProvider ruleTemplate={room.ruleTemplate}>
    <EventDataProvider value={eventData}>
    <div className="flex flex-col h-dvh bg-bg overflow-hidden text-text">
      {/* Ambient background: fixed z-0 layers above the root's opaque bg-bg,
          below the top bar (z-20) and the positioned content row below. */}
      <RoomBackground url={backgroundUrl} />
      <RoomTopBar
        room={room}
        isHost={isHost}
        nickname={nickname}
        status={status}
        checkMenuModes={ruleCapabilities.checkMenuModes}
        hasBackground={!!backgroundUrl}
        playerCount={playerCount}
        onlineCount={onlineCount}
        botCount={botCount}
        sidebarCollapsed={sidebarCollapsed}
        totalUnread={totalUnread}
        onToggleSidebar={toggleSidebar}
        editingRoomName={editingRoomName}
        roomNameDraft={roomNameDraft}
        savingRoomName={savingRoomName}
        setRoomNameDraft={setRoomNameDraft}
        setEditingRoomName={setEditingRoomName}
        onSaveRoomName={handleSaveRoomName}
        showCharacter={showCharacter}
        setShowCharacter={setShowCharacter}
        characterHint={characterHint}
        showInventory={showInventory}
        unreadItems={unreadItems}
        onToggleInventory={handleToggleInventory}
        showNotebook={showNotebook}
        setShowNotebook={setShowNotebook}
        showEvents={showEvents}
        setShowEvents={setShowEvents}
        unreadEvents={unreadEvents}
        checkMode={checkMode}
        setCheckMode={setCheckMode}
        showCheckMenu={showCheckMenu}
        setShowCheckMenu={setShowCheckMenu}
        showItemManager={showItemManager}
        setShowItemManager={setShowItemManager}
        setShowEventManage={setShowEventManage}
        showTimeline={showTimeline}
        setShowTimeline={setShowTimeline}
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
        setShowHotkeyHelp={(v) => {
          hotkeyHintStore.markSeen();
          setShowHotkeyHelp(v);
        }}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Conversation TAB (Task #43) */}
        <ConversationPanel
          activeTab={activeTab}
          onTabChange={handleTabChange}
          dmConversations={dmConversations}
          onlineCount={onlineCount}
          onStartDM={handleTabChange}
          onViewCard={handleViewPlayerCard}
          isHost={isHost}
          roomId={room.id}
          userId={userId}
          hostId={room.hostId}
          width={sidebarWidth}
          collapsed={sidebarCollapsed}
          resizing={sidebarResizing || !sidebarHydrated}
        />

        {/* Backdrop for mobile sidebar — stays mounted so it can fade in/out
            in step with the drawer slide. */}
        {isMobile && (
          <div
            aria-hidden={sidebarCollapsed}
            className={`fixed inset-0 bg-black/40 z-20 transition-opacity duration-300 ${
              sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100 cursor-pointer"
            }`}
            onClick={() => setSidebarCollapsed(true)}
          />
        )}

        {/* Resize Handle */}
        {!sidebarCollapsed && !isMobile && (
          <div
            onMouseDown={handleResizeStart}
            className="w-1 hover:w-1.5 active:w-1.5 h-full bg-border hover:bg-primary/50 active:bg-primary cursor-col-resize select-none transition-all duration-150 shrink-0 relative z-10 group"
            title={t("tooltipResize")}
            onDoubleClick={resetSidebarWidth}
          >
            {/* Collapse toggle button on the handle (like VS Code or Notion) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-4 h-8 bg-surface border border-border hover:border-primary/50 rounded flex items-center justify-center shadow-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-20"
              onClick={(e) => {
                e.stopPropagation();
                setSidebarCollapsed(true);
              }}
              title={t("tooltipCollapseSidebar")}
            >
              <span className="text-[9px] text-text-muted hover:text-primary select-none">◀</span>
            </div>
          </div>
        )}

        {/* Main Content: Chat Area */}
        <ChatArea
          scrollRef={scrollRef}
          onScroll={handleScroll}
          tabMessages={tabMessages}
          players={players}
          userId={userId}
          isHost={isHost}
          roomId={room.id}
          hostId={room.hostId}
          typingBots={typingBots}
          activeTab={activeTab}
          showScrollButton={showScrollButton}
          scrollToBottom={scrollToBottom}
          dmConversations={dmConversations}
          mentionTargets={mentionTargets}
          readOnly={readOnly}
          readOnlyNotice={isObserver ? t("observerNotice") : undefined}
          quickCommands={ruleCapabilities.quickRolls}
          defaultRollExpression={ruleCapabilities.defaultRollExpression}
          onViewCharacter={handleViewPlayerCard}
          onStartDM={handleTabChange}
          onCheckRequest={handleCheckRequest}
          onProxyCheckRequest={isHost ? handleProxyCheckRequest : undefined}
          onLoadProxyTargets={isHost ? loadProxyTargets : undefined}
          onOpenInventory={handleToggleInventory}
          onWithdrawTimeline={isHost ? handleWithdrawTimeline : undefined}
          onSendMessage={handleSendMessage}
          visibleEventIds={visibleEventIds}
          onOpenEvent={(id) => setEventDetailId(id)}
        />
      </div>

      <RoomOverlays
        room={room}
        userId={userId}
        isHost={isHost}
        nickname={nickname}
        characterData={characterData}
        readOnly={readOnly}
        players={players}
        aiEnabled={aiEnabled}
        validProviderIds={validProviderIds}
        userName={userName}
        userRole={userRole}
        roomTheme={roomTheme}
        roomThemeMode={roomThemeMode}
        inventoryRefreshKey={inventoryRefreshKey}
        skillRefreshKey={skillRefreshKey}
        onSkillsChanged={bumpSkills}
        mentionTargets={mentionTargets}
        onlineUserIds={onlineUserIds}
        playerCount={playerCount}
        botCount={botCount}
        activeTab={activeTab}
        viewingPlayerId={viewingPlayerId}
        viewingPlayerNickname={viewingPlayerNickname}
        viewingPlayerCharData={viewingPlayerCharData}
        loadingPlayerCard={loadingPlayerCard}
        onCloseViewingPlayer={() => {
          setViewingPlayerId(null);
          setViewingPlayerCharData(null);
          setViewingPlayerNickname("");
        }}
        showCharacter={showCharacter}
        setShowCharacter={setShowCharacter}
        showBotManager={showBotManager}
        setShowBotManager={setShowBotManager}
        showAiImport={showAiImport}
        setShowAiImport={setShowAiImport}
        showMembers={showMembers}
        setShowMembers={setShowMembers}
        showInventory={showInventory}
        setShowInventory={setShowInventory}
        showNotebook={showNotebook}
        setShowNotebook={setShowNotebook}
        showItemManager={showItemManager}
        setShowItemManager={setShowItemManager}
        showEvents={showEvents}
        setShowEvents={setShowEvents}
        showEventManage={showEventManage}
        setShowEventManage={setShowEventManage}
        eventsRefreshKey={eventsRefreshKey}
        onEventsChanged={bumpEvents}
        onEventBadgeChanged={refreshEventBadge}
        eventDetailId={eventDetailId}
        setEventDetailId={setEventDetailId}
        showTimeline={showTimeline}
        setShowTimeline={setShowTimeline}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showRoomInfo={showRoomInfo}
        setShowRoomInfo={setShowRoomInfo}
        showExport={showExport}
        setShowExport={setShowExport}
        showUserSettings={showUserSettings}
        setShowUserSettings={setShowUserSettings}
        checkMode={checkMode}
        setCheckMode={setCheckMode}
        pendingSkillCheck={pendingSkillCheck}
        setPendingSkillCheck={setPendingSkillCheck}
        onConfirmSkillSet={handleConfirmSkillSet}
        pendingBonusDice={pendingBonusDice}
        setPendingBonusDice={setPendingBonusDice}
        onConfirmBonusDice={handleConfirmBonusDice}
        onNicknameChange={(newNick) => setNickname(newNick)}
        onViewPlayerCard={handleViewPlayerCard}
        onStartDM={handleTabChange}
      />

      {showHotkeyHint && (
        <div className="fixed bottom-24 right-4 z-30 flex items-center gap-2.5 bg-surface theme-border rounded-theme shadow-xl pl-3.5 pr-2 py-2.5 overlay-pop"
          style={{ transformOrigin: "bottom right" }} role="status">
          <Icons.Keyboard className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm text-text">{tHotkeys("hintText")}</span>
          <button
            onClick={openHotkeyHelp}
            className="text-sm font-bold text-primary hover:text-primary-hover transition cursor-pointer whitespace-nowrap"
          >
            {tHotkeys("hintAction", { key: formatHotkey("Slash") })}
          </button>
          <button
            onClick={() => hotkeyHintStore.markSeen()}
            className="text-text-muted hover:text-text p-1 rounded-theme hover:bg-surface-alt transition cursor-pointer"
            aria-label={tHotkeys("hintDismiss")}
          >
            <Icons.X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showHotkeyHelp && (
        <RoomHotkeyHelp isHost={isHost} onClose={() => setShowHotkeyHelp(false)} />
      )}
    </div>
    </EventDataProvider>
    </RuleTemplateProvider>
  );
}
