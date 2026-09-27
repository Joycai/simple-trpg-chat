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
import { useChatScroll } from "@/components/room/hooks/useChatScroll";
import { useUnreadDmCounts } from "@/components/room/hooks/useUnreadDmCounts";
import { useCharacterHint } from "@/components/room/hooks/useCharacterHint";
import { useRoomEventsData } from "@/components/room/hooks/useRoomEventsData";
import { useUnreadInventoryCount } from "@/components/room/hooks/useUnreadInventoryCount";
import { useRoomThemeMode } from "@/components/room/hooks/useRoomThemeMode";
import { usePlayerCardViewer } from "@/components/room/hooks/usePlayerCardViewer";
import { useCheckFlow } from "@/components/room/hooks/useCheckFlow";
import { useRoomHotkeys } from "@/components/room/hooks/useRoomHotkeys";
import { RoomHotkeyHelp } from "@/components/room/RoomHotkeyHelp";
import { TOGGLE_DICE_EVENT, TOGGLE_QUICK_CHECK_EVENT, HOTKEY_HINT_SEEN_KEY, formatHotkey, type RoomHotkeyAction } from "@/lib/ui/hotkeys";
import { Icons } from "@/components/shared/icons";
import { sendMessageAction, rollDiceAction, executeCommandAction, withdrawTimelineDividerAction } from "@/app/actions/messages";
import { updateRoomNameAction } from "@/app/actions/room";
import { EventDataProvider } from "@/components/room/event/EventDataContext";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { buildMentionTargets, buildDmConversations, totalUnread } from "@/lib/room/mention-targets";
import type { Message, RoomClientProps, ConnectionStatus, TypingBots } from "@/components/room/types";

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
import { getRuleForRoom, type StatusEntry } from "@/lib/rules";
import { RuleTemplateProvider } from "@/components/shared/host-label";

export function RoomClient({
  room,
  messages: initialMessages,
  userId,
  isHost,
  currentNickname,
  roomTheme,
  roomThemeMode,
  initialTimelineMode,
  players: initialPlayers = [],
  characterData,
  aiEnabled = false,
  validProviderIds = [],
  userName,
  userRole,
  backgroundUrl = null,
  isObserver = false,
  initialSnapshot,
}: RoomClientProps) {
  const t = useTranslations("room");
  const tra = useTranslations("roomActions");
  const tCommon = useTranslations("common");
  const tHotkeys = useTranslations("hotkeys");
  const router = useRouter();
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
  const [nickname, setNickname] = useState(currentNickname);
  // Live member list: seeded from the server, patched in place by
  // `member_updated` SSE deltas (nickname / color / avatar changes) so those
  // no longer cost every client a full router.refresh(). A real server
  // re-render (navigation, or the remaining refresh events) re-seeds it via
  // the render-time reset below (React's derive-state-from-props pattern —
  // re-renders immediately without committing the stale tree).
  const [players, setPlayers] = useState(initialPlayers);
  const [seededPlayers, setSeededPlayers] = useState(initialPlayers);
  if (seededPlayers !== initialPlayers) {
    setSeededPlayers(initialPlayers);
    setPlayers(initialPlayers);
  }
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showNotebook, setShowNotebook] = useState(false);
  const [showItemManager, setShowItemManager] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showEventManage, setShowEventManage] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [skillRefreshKey, setSkillRefreshKey] = useState(0);
  const [showBotManager, setShowBotManager] = useState(false);
  const [showAiImport, setShowAiImport] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
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
  const { unreadCounts, setUnreadCounts, markTabRead } = useUnreadDmCounts(room.id, initialSnapshot.unreadDms);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  // Live overrides pushed by SSE, keyed by userId — one entry per member,
  // holding the rule's primary vital (HP where the rule has one).
  const [characterResources, setCharacterResources] = useState<Map<number, StatusEntry>>(new Map());
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
    const res = await updateRoomNameAction(room.id, trimmed)
      .catch(() => ({ success: false as const }));
    setSavingRoomName(false);
    if (!res.success) {
      // Revert draft on failure; keep editor open so the host can retry
      setRoomNameDraft(room.name);
      return;
    }
    setEditingRoomName(false);
    router.refresh();
  };

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

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
    if (tab !== "public") markTabRead(tab);
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [markTabRead, isMobile, setSidebarCollapsed]);

  // Mention targets (players + bots, excluding self), the DM list and its
  // badge total — pure derivations in lib/room/mention-targets.
  const mentionTargets = useMemo(
    () => buildMentionTargets(players || [], userId, aiEnabled, validProviderIds),
    [players, userId, aiEnabled, validProviderIds],
  );
  const dmConversations = useMemo(
    () => buildDmConversations(mentionTargets, unreadCounts, onlineUserIds, characterResources),
    [mentionTargets, unreadCounts, onlineUserIds, characterResources],
  );
  const totalUnreadCount = useMemo(() => totalUnread(unreadCounts), [unreadCounts]);

  // Capabilities drive every rule-specific UI gate (TopBar check menu,
  // tooltips, host-only buttons). Looked up once per render so child props
  // stay stable.
  const ruleCapabilities = getRuleForRoom(room).capabilities;

  // "Set up your character" nudge on the 角色档案 top-bar icon.
  const characterHint = useCharacterHint({
    room,
    characterData,
    skillRefreshKey,
    initialSkillsEmpty: initialSnapshot.skillsEmpty,
  });

  // Events for this viewer: the EventDataContext list, the chat-card unlock
  // set, the top-bar badge and the open detail modal.
  const {
    eventsRefreshKey, setEventsRefreshKey,
    visibleEventIds, unreadEvents,
    eventDetailId, setEventDetailId, handleOpenEvent,
    bumpEvents, refreshEventBadge, eventData,
  } = useRoomEventsData({
    roomId: room.id,
    initialEvents: initialSnapshot.events,
    initialUnreadEvents: initialSnapshot.unreadEvents,
    inventoryRefreshKey,
  });

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

  const statusRef = useRef(status);

  useEffect(() => { statusRef.current = status; }, [status]);

  // Backpack badge: seeded from the page, recounted on later item messages.
  const { unreadItems, setUnreadItems } = useUnreadInventoryCount({
    roomId: room.id,
    initialUnread: initialSnapshot.unreadItems,
    initialMessages,
    messages,
  });

  // Stick-to-bottom, the back-to-bottom button, older-page loading and the
  // in-memory window cap.
  const { scrollRef, handleScroll, showScrollButton, scrollToBottom } = useChatScroll({
    roomId: room.id,
    initialCount: initialMessages.length,
    messagesRef,
    messagesLength: messages.length,
    seenIdsRef,
    setMessages,
    tabMessages,
    typingBots,
  });

  // Single SSE connection: routes inbound events into the right state setter.
  useRoomEvents({
    roomId: room.id,
    userId,
    isHost,
    activeTabRef,
    seenIdsRef,
    liveEnterRef,
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
  });

  // Light/dark for the room (configured, or following the timeline).
  useRoomThemeMode({ room, messages, initialTimelineMode });

  // Re-fetch the current user's sheet so an open 角色卡 reflects command-driven
  // changes (.st / .sc) without a full page reload. router.refresh() updates the
  // characterData prop; the key bump reloads the CharacterPanel's 技能 tab.
  const refreshSelfSheet = useCallback(() => {
    router.refresh();
    setSkillRefreshKey(k => k + 1);
  }, [router]);

  // A self-only SYSTEM error row that never reached the server — how command,
  // send and withdraw failures surface in the feed. Gone on reload.
  const pushLocalError = useCallback((content: string, channelUserId: number | null = null) => {
    const errorMsg = {
      id: localEphemeralId--, roomId: room.id, userId, nickname: "SYSTEM",
      content,
      type: "system" as const, audience: "self" as const,
      systemKind: "error" as const,
      targetUserId: null, channelUserId,
      isPrivate: true, diceDetail: null,
      createdAt: new Date().toISOString()
    };
    seenIdsRef.current.add(String(errorMsg.id));
    liveEnterRef.current.set(String(errorMsg.id), Date.now());
    setMessages(prev => [...prev, errorMsg]);
  }, [room.id, userId]);

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
          pushLocalError(tra("commandError", { error: result.error }), channelPartner ?? null);
        }
      } catch (e) {
        console.error(e);
        pushLocalError(tra("sendFailed", { error: tCommon("error") }), channelPartner ?? null);
      }
      if (isSheetMutationCmd) refreshSelfSheet();
      return;
    }
    try {
      let res: { success: true } | { success: false; error: string };
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
        res = await rollDiceAction(room.id, faces, detail.count, hidden, channelPartner);
      } else {
        res = await sendMessageAction(room.id, content, type, finalIsPrivate, finalTargetId);
      }
      if (!res.success) {
        pushLocalError(tra("sendFailed", { error: res.error }), channelPartner ?? null);
        return;
      }
      if (isSheetMutationCmd) refreshSelfSheet();
    } catch (e) {
      console.error(e);
      pushLocalError(tra("sendFailed", { error: tCommon("error") }), channelPartner ?? null);
    }
  }, [room.id, userId, activeTab, tra, tCommon, refreshSelfSheet, pushLocalError]);

  // Another member's card, read-only; opening one closes the members panel.
  const closeMembers = useCallback(() => setShowMembers(false), []);
  const {
    viewingPlayerId, viewingPlayerNickname, viewingPlayerCharData, loadingPlayerCard,
    handleViewPlayerCard, closeViewingPlayer,
  } = usePlayerCardViewer(room.id, closeMembers);

  // Check requests, the 加骰 / set-skill prompts, host proxy rolls, and the
  // top-bar check dialog/menu.
  const {
    checkMode, setCheckMode, showCheckMenu, setShowCheckMenu,
    pendingSkillCheck, setPendingSkillCheck, pendingBonusDice, setPendingBonusDice,
    handleCheckRequest, handleConfirmBonusDice, handleProxyCheckRequest, loadProxyTargets, handleConfirmSkillSet,
  } = useCheckFlow({ roomId: room.id, userId, pushLocalError, refreshSelfSheet });

  // Host withdraws a timeline divider. The row is removed for everyone via the
  // `message_deleted` SSE event (handled in useRoomEvents), including this client.
  const handleWithdrawTimeline = useCallback(async (messageId: number) => {
    const res = await withdrawTimelineDividerAction(room.id, messageId)
      .catch(() => ({ success: false as const, error: tCommon("error") }));
    if (!res.success) pushLocalError(tra("withdrawFailed", { error: res.error }));
  }, [room.id, pushLocalError, tra, tCommon]);

  // Stable identity matters: this reaches every ChatMessage via ChatArea, and
  // one unstable prop defeats the whole list's memo() bail-out.
  const handleToggleInventory = useCallback(() => {
    setShowInventory((v) => !v);
    // Clear only the local unread dot here. The server-side "viewed" flags are
    // acknowledged by the InventoryPanel *after* it loads, so the new/updated
    // highlights still render this session instead of being cleared mid-open.
    setUnreadItems(0);
  }, [setUnreadItems]); // a state setter: stable, so this callback still is

  // Alt+↑/↓: cycle through the conversation tabs (public first, then the DM
  // list in sidebar order). Wraps around at both ends.
  const cycleTab = useCallback((dir: 1 | -1) => {
    const order: ("public" | number)[] = ["public", ...dmConversations.map((c) => c.userId)];
    const i = order.indexOf(activeTab);
    handleTabChange(order[(Math.max(i, 0) + dir + order.length) % order.length]);
  }, [dmConversations, activeTab, handleTabChange]);

  // Room-wide keyboard shortcuts (bindings defined in src/lib/ui/hotkeys.ts).
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
        case "toggle-quick-check":
          // The ChatInput no-ops this when the rule declares no quickCheckPanel.
          if (!readOnly) window.dispatchEvent(new CustomEvent(TOGGLE_QUICK_CHECK_EVENT));
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
        totalUnread={totalUnreadCount}
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
            className={`fixed inset-0 bg-scrim/40 z-20 transition-opacity duration-300 ${
              sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100 cursor-pointer"
            }`}
            onClick={() => setSidebarCollapsed(true)}
          />
        )}

        {/* Resize Handle */}
        {!sidebarCollapsed && !isMobile && (
          <div
            onMouseDown={handleResizeStart}
            className="w-1 hover:w-1.5 active:w-1.5 h-full bg-border hover:bg-primary/50 active:bg-primary cursor-col-resize select-none transition-colors duration-150 shrink-0 relative z-10 group"
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
          liveEnterRef={liveEnterRef}
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
          onOpenEvent={handleOpenEvent}
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
        onCloseViewingPlayer={closeViewingPlayer}
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
          style={{ transformOrigin: "bottom right", "--overlay-pop-y": "6px" } as React.CSSProperties} role="status">
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
