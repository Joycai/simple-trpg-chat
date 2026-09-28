"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ConversationPanel } from "@/components/room/chat/ConversationPanel";
import { RoomTopBar } from "@/components/room/RoomTopBar";
import { RoomBackground } from "@/components/room/RoomBackground";
import { ChatArea } from "@/components/room/chat/ChatArea";
import { RoomOverlays } from "@/components/room/RoomOverlays";
import { useRoomEvents } from "@/components/room/hooks/useRoomEvents";
import { useSidebar } from "@/components/room/hooks/useSidebar";
import { useChatScroll } from "@/components/room/hooks/useChatScroll";
import { useUnreadDmCounts } from "@/components/room/hooks/useUnreadDmCounts";
import { useRoomEventsData } from "@/components/room/hooks/useRoomEventsData";
import { useUnreadInventoryCount } from "@/components/room/hooks/useUnreadInventoryCount";
import { useRoomThemeMode } from "@/components/room/hooks/useRoomThemeMode";
import { usePlayerCardViewer } from "@/components/room/hooks/usePlayerCardViewer";
import { useCheckFlow } from "@/components/room/hooks/useCheckFlow";
import { useRoomNameEditor } from "@/components/room/hooks/useRoomNameEditor";
import { useChatSend } from "@/components/room/hooks/useChatSend";
import { useRoomShortcuts } from "@/components/room/hooks/useRoomShortcuts";
import { useMessageLog } from "@/components/room/hooks/useMessageLog";
import { useLivePlayers } from "@/components/room/hooks/useLivePlayers";
import { useOverlayVisibility } from "@/components/room/hooks/useOverlayVisibility";
import { RoomHotkeyHelp } from "@/components/room/RoomHotkeyHelp";
import { HotkeyHintToast, hotkeyHintStore } from "@/components/room/HotkeyHintToast";
import { SidebarBackdrop, SidebarResizeHandle } from "@/components/room/SidebarControls";
import { EventDataProvider } from "@/components/room/event/EventDataContext";
import { useTranslations } from "next-intl";
import { buildMentionTargets, buildDmConversations, totalUnread, countRoster, countOnline } from "@/lib/room/mention-targets";
import { countIncomplete } from "@/lib/room/card-access";
import type { RoomClientProps, ConnectionStatus, TypingBots } from "@/components/room/types";
import { channelOf } from "@/lib/messaging/audience";
import { getRuleForRoom, type StatusEntry } from "@/lib/rules";
import type { CompletionSummary } from "@/lib/character/completion";
import { useRouter } from "next/navigation";
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
  // Loaded messages + the seen-id / live-arrival / latest-list refs.
  const { messages, setMessages, seenIdsRef, liveEnterRef, messagesRef } = useMessageLog(initialMessages);
  const [nickname, setNickname] = useState(currentNickname);
  // Members, patched by SSE and re-seeded on each server render.
  const { players, setPlayers } = useLivePlayers(initialPlayers);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [skillRefreshKey, setSkillRefreshKey] = useState(0);
  // Open/closed state for the room's panels, dialogs and top-bar menus (see
  // useOverlayVisibility for the ones that keep their own state).
  const overlays = useOverlayVisibility();
  const { setters: overlaySetters } = overlays;
  const openHotkeyHelp = useCallback(() => {
    hotkeyHintStore.markSeen();
    overlaySetters.hotkeyHelp(true);
  }, [overlaySetters]);
  // Inline room-name editing (host only, top bar)
  const { editingRoomName, setEditingRoomName, roomNameDraft, setRoomNameDraft, savingRoomName, handleSaveRoomName } =
    useRoomNameEditor(room);
  const [activeTab, setActiveTab] = useState<"public" | number>("public");
  const { unreadCounts, setUnreadCounts, markTabRead } = useUnreadDmCounts(room.id, initialSnapshot.unreadDms);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  // Live overrides pushed by SSE, keyed by userId — one entry per member,
  // holding the rule's primary vital (HP where the rule has one).
  const [characterResources, setCharacterResources] = useState<Map<number, StatusEntry>>(new Map());
  // Required-field completion per member (own always; everyone's for the
  // host), seeded by the page and kept live by `character_updated`.
  const toCompletionMap = (c: Record<number, CompletionSummary>) =>
    new Map(Object.entries(c).map(([k, v]) => [Number(k), v] as const));
  const [completions, setCompletions] = useState(() => toCompletionMap(initialSnapshot.completions));
  // A fresh server render (router.refresh after a rule switch, a reconnect)
  // re-grades everyone; adopt it — SSE keeps it live from there.
  const [seenCompletions, setSeenCompletions] = useState(initialSnapshot.completions);
  if (seenCompletions !== initialSnapshot.completions) {
    setSeenCompletions(initialSnapshot.completions);
    setCompletions(toCompletionMap(initialSnapshot.completions));
  }
  // What to reload when someone else writes a sheet — set once the card
  // viewer below exists; read by the SSE router through the ref.
  const onCharacterUpdatedRef = useRef<(userId: number, by: number | null) => void>(() => {});
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

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

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
    () => buildMentionTargets(players || [], userId, aiEnabled, validProviderIds, room.ruleTemplate ?? undefined),
    [players, userId, aiEnabled, validProviderIds, room.ruleTemplate],
  );
  const dmConversations = useMemo(
    () => buildDmConversations(mentionTargets, unreadCounts, onlineUserIds, characterResources, completions),
    [mentionTargets, unreadCounts, onlineUserIds, characterResources, completions],
  );
  const totalUnreadCount = useMemo(() => totalUnread(unreadCounts), [unreadCounts]);

  // Capabilities drive every rule-specific UI gate (TopBar check menu,
  // tooltips, host-only buttons). Looked up once per render so child props
  // stay stable.
  const ruleCapabilities = getRuleForRoom(room).capabilities;

  // "Set up your character" nudge on the 角色档案 top-bar icon: some field the
  // room's rule requires is still unset.
  const ownCompletion = completions.get(userId);
  // The host usually plays without a card (the overview leaves it out too).
  const characterMissing = !isHost && ownCompletion ? ownCompletion.requiredTotal - ownCompletion.requiredSet : 0;
  // Host overview badge: members (not the host) whose required fields aren't all set.
  const incompleteMembers = isHost ? countIncomplete(completions, [room.hostId]) : 0;
  // Reloads the host overview when a sheet changes elsewhere.
  const [sheetsRefreshKey, setSheetsRefreshKey] = useState(0);

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

  // Roster counts for the top bar, and the live online count it shares with
  // the roster panel (presence comes from SSE, not the roster).
  const { botCount, playerCount } = countRoster(players || []);
  const onlineCount = useMemo(() => countOnline(players || [], userId, onlineUserIds), [players, onlineUserIds, userId]);

  // Bucket each visible message into its channel/tab. `messages` already only
  // contains rows this viewer may see (filtered by the SSE route + initial query),
  // so we just route by audience: channelOf returns "public" (everyone/self/
  // directed/gm render inline there) or the DM partner's userId.
  const tabMessages = useMemo(() => {
    return messages.filter(m => channelOf(m, userId) === activeTab);
  }, [messages, activeTab, userId]);

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
    setCompletions,
    onCharacterUpdatedRef,
  });

  // Light/dark for the room (configured, or following the timeline).
  useRoomThemeMode({ room, messages, initialTimelineMode });

  // Sending (messages, dice, commands, divider withdrawal) and the two helpers
  // the check flow shares: local error rows and the self-sheet refresh.
  const { pushLocalError, refreshSelfSheet, handleSendMessage, handleWithdrawTimeline } = useChatSend({
    roomId: room.id,
    userId,
    activeTab,
    seenIdsRef,
    liveEnterRef,
    setMessages,
    setSkillRefreshKey,
  });

  // Another member's card, read-only; opening one closes the members panel.
  const closeMembers = useCallback(() => overlaySetters.members(false), [overlaySetters]);
  const {
    viewingPlayerId, viewingPlayerNickname, viewingPlayerCharData, loadingPlayerCard,
    viewedCardRefreshKey, handleViewPlayerCard, closeViewingPlayer, reloadViewedCard,
  } = usePlayerCardViewer(room.id, closeMembers);

  // Someone else wrote a sheet: reload what shows it. Our own writes refresh
  // themselves where they happen (panel save, .st, the skills tab).
  const router = useRouter();
  useEffect(() => {
    onCharacterUpdatedRef.current = (uid, by) => {
      if (by === userId) return;
      if (isHost) setSheetsRefreshKey((k) => k + 1);
      if (uid === userId) {
        router.refresh();
        bumpSkills();
      }
      if (uid === viewingPlayerId) reloadViewedCard();
    };
  }, [userId, isHost, viewingPlayerId, router, bumpSkills, reloadViewedCard]);

  // Check requests, the 加骰 / set-skill prompts, host proxy rolls, and the
  // top-bar check dialog/menu.
  const {
    checkMode, setCheckMode, showCheckMenu, setShowCheckMenu,
    pendingSkillCheck, setPendingSkillCheck, pendingBonusDice, setPendingBonusDice,
    handleCheckRequest, handleConfirmBonusDice, handleProxyCheckRequest, loadProxyTargets, handleConfirmSkillSet,
  } = useCheckFlow({ roomId: room.id, userId, pushLocalError, refreshSelfSheet });

  // Stable identity matters: this reaches every ChatMessage via ChatArea, and
  // one unstable prop defeats the whole list's memo() bail-out.
  const handleToggleInventory = useCallback(() => {
    overlaySetters.inventory((v) => !v);
    // Clear only the local unread dot here. The server-side "viewed" flags are
    // acknowledged by the InventoryPanel *after* it loads, so the new/updated
    // highlights still render this session instead of being cleared mid-open.
    setUnreadItems(0);
  }, [overlaySetters, setUnreadItems]); // both stable, so this callback still is

  // Room-wide keyboard shortcuts (bindings in src/lib/ui/hotkeys.ts).
  useRoomShortcuts({
    isHost, readOnly, checkMenuModes: ruleCapabilities.checkMenuModes,
    activeTab, tabPartners: dmConversations, onTabChange: handleTabChange,
    toggleInventory: handleToggleInventory, toggleSidebar,
    overlaySetters, setShowCheckMenu, setCheckMode,
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
        characterMissing={characterMissing}
        incompleteMembers={incompleteMembers}
        unreadItems={unreadItems}
        onToggleInventory={handleToggleInventory}
        unreadEvents={unreadEvents}
        checkMode={checkMode}
        setCheckMode={setCheckMode}
        showCheckMenu={showCheckMenu}
        setShowCheckMenu={setShowCheckMenu}
        overlays={overlays}
        onOpenHotkeyHelp={openHotkeyHelp}
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

        {isMobile && <SidebarBackdrop collapsed={sidebarCollapsed} onCollapse={() => setSidebarCollapsed(true)} />}
        {!sidebarCollapsed && !isMobile && (
          <SidebarResizeHandle
            onResizeStart={handleResizeStart}
            onResetWidth={resetSidebarWidth}
            onCollapse={() => setSidebarCollapsed(true)}
          />
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
        completions={completions}
        activeTab={activeTab}
        viewingPlayerId={viewingPlayerId}
        viewingPlayerNickname={viewingPlayerNickname}
        viewingPlayerCharData={viewingPlayerCharData}
        loadingPlayerCard={loadingPlayerCard}
        viewedCardRefreshKey={viewedCardRefreshKey}
        sheetsRefreshKey={sheetsRefreshKey}
        onCloseViewingPlayer={closeViewingPlayer}
        eventsRefreshKey={eventsRefreshKey}
        onEventsChanged={bumpEvents}
        onEventBadgeChanged={refreshEventBadge}
        eventDetailId={eventDetailId}
        setEventDetailId={setEventDetailId}
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
        overlays={overlays}
      />

      <HotkeyHintToast onOpenHelp={openHotkeyHelp} />


      {overlays.shown.hotkeyHelp && (
        <RoomHotkeyHelp isHost={isHost} onClose={() => overlaySetters.hotkeyHelp(false)} />
      )}
    </div>
    </EventDataProvider>
    </RuleTemplateProvider>
  );
}
