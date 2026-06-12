"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { CharacterPanel } from "./CharacterPanel";
import { RoomSettings } from "./RoomSettings";
import { InventoryPanel } from "./InventoryPanel";
import { BotManager } from "./BotManager";
import { ClueManager } from "./ClueManager";
import { AiImportPanel } from "./AiImportPanel";
import { Icons } from "./icons";
import { ExportButton } from "./ExportButton";
import { RoomInfoPanel } from "./RoomInfoPanel";
import { ConversationPanel } from "./ConversationPanel";
import { HostCheckDialog } from "./HostCheckDialog";
import { SkillPanel } from "./SkillPanel";
import { sendMessageAction, updateNicknameAction, rollDiceAction, executeCommandAction, markDMReadAction, getUnreadDMCountAction, loadMoreMessagesAction } from "@/app/actions/room";
import { getUnreadInventoryCountAction, markInventoryViewedAction } from "@/app/actions/inventory";
import { upsertSkillAction, getMySkillsAction } from "@/app/actions/skills";
import { getCharacterDataAction } from "@/app/actions/character";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ThemeId } from "@/themes/types";
import { getRandomColorForUser, getContrastColor } from "@/lib/avatar-colors";
import Link from "next/link";

interface Room {
  id: number;
  name: string;
  hostId: number;
  secretKey: string;
  status: string;
  theme: string;
}

interface Message {
  id: number;
  roomId: number;
  userId: number;
  targetUserId?: number | null;
  nickname: string;
  content: string;
  type: "text" | "dice" | "system" | "clue" | "check_request";
  diceDetail: string | null;
  isPrivate: boolean;
  createdAt: string;
}

interface RoomClientProps {
  room: Room;
  messages: Message[];
  userId: number;
  isHost: boolean;
  currentNickname: string;
  roomTheme?: ThemeId;
  roomDiceRules?: string;
  players?: any[];
  characterData?: string | null;
}

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
}: RoomClientProps) {
  const t = useTranslations("room");
  const tn = useTranslations("nav");
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
  const [showBotManager, setShowBotManager] = useState(false);
  const [showClueManager, setShowClueManager] = useState(false);
  const [showAiImport, setShowAiImport] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showCheckDialog, setShowCheckDialog] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showSystemMenu, setShowSystemMenu] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [activeTab, setActiveTab] = useState<"public" | number>("public");
  const [unreadItems, setUnreadItems] = useState(0);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [sidebarWidth, setSidebarWidth] = useState<number>(200);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [viewingPlayerId, setViewingPlayerId] = useState<number | null>(null);
  const [viewingPlayerNickname, setViewingPlayerNickname] = useState<string>("");
  const [viewingPlayerCharData, setViewingPlayerCharData] = useState<string | null>(null);
  const [loadingPlayerCard, setLoadingPlayerCard] = useState<boolean>(false);
  const [typingBots, setTypingBots] = useState<Record<number, { nickname: string; typing: boolean; isPrivate?: boolean; targetUserId?: number }>>({});

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
    if (savedWidth) setSidebarWidth(Number(savedWidth));
  }, [room.id]);

  useEffect(() => {
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

  // Periodically prune seenIdsRef to prevent memory leaks in long-running sessions
  useEffect(() => {
    if (seenIdsRef.current.size > 500) {
      // Rebuild from current messages — keeps dedup for visible messages, frees old IDs
      seenIdsRef.current = new Set(messages.map(m => String(m.id)));
    }
  }, [messages.length]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Constraint width between 160px and 360px
      const newWidth = Math.max(160, Math.min(360, startWidth + deltaX));
      setSidebarWidth(newWidth);
      localStorage.setItem("trpg-sidebar-width", String(newWidth));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleTabChange = (tab: "public" | number) => {
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
  };

  // Build mention targets (players + bots, excluding self)
  const mentionTargets = useMemo(() => {
    return (players || [])
      .filter((p: any) => (p.users?.id || p.user_id) !== userId)
      .map((p: any) => ({
        id: p.users?.id || p.user_id,
        nickname: p.room_members?.nickname || p.users?.displayName || `#${p.users?.id || p.user_id}`,
        isBot: !!p.users?.isBot,
      }));
  }, [players, userId]);

  // Build DM conversations
  const dmConversations = useMemo(() => {
    return mentionTargets.map(p => ({
      userId: p.id,
      nickname: p.nickname,
      isBot: p.isBot,
      unread: unreadCounts[p.id] || 0,
    }));
  }, [mentionTargets, unreadCounts]);

  const totalUnread = useMemo(() => {
    return Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  }, [unreadCounts]);

  const botCount = (players || []).filter((p: any) => p.users?.isBot).length;
  const playerCount = (players || []).filter((p: any) => !p.users?.isBot).length;

  // Filter messages by active tab (Task #43)
  const tabMessages = useMemo(() => {
    if (activeTab === "public") {
      // Show public messages and private messages that are system warnings, check-requests,
      // or belong inline to the public channel (e.g. private GM rolls/system warning messages)
      return messages.filter(m => {
        if (!m.isPrivate) return true;
        
        // Show private system/check messages only to the sender or target in the public feed
        if (m.type === "system" || m.type === "check_request") {
          return m.userId === userId || m.targetUserId === userId;
        }
        
        // Show other private messages (like private rolls) in public only if they have no specific target (private to GM)
        return !m.targetUserId;
      });
    }
    // Show private messages between current user and active target
    return messages.filter(m => 
      m.isPrivate && 
      (
        (m.userId === userId && m.targetUserId === activeTab) ||
        (m.userId === activeTab && m.targetUserId === userId)
      )
    );
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

  const handleScroll = async () => {
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
        const older: any[] = await loadMoreMessagesAction(room.id, oldestId, 50);
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
  };

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
            if (data.isPrivate) {
              const isSender = data.userId === userId;
              const isTarget = data.targetUserId === userId;
              if (data.targetUserId) {
                if (!isSender && !isTarget) return;
              } else {
                if (!isSender && !isHost) return;
              }
              // Update unread count if we are the recipient
              if (isTarget) {
                if (activeTabRef.current !== data.userId) {
                  setUnreadCounts((prev) => ({
                    ...prev,
                    [data.userId]: (prev[data.userId] || 0) + 1,
                  }));
                } else {
                  markDMReadAction(room.id, data.userId).catch(() => {});
                }
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
                  typeof m.id === 'number' && m.id > 1000000000000
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

  const handleSendMessage = async (
    content: string, 
    type: "text" | "dice", 
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

    if (content.startsWith(".") && type === "text") {
      try {
        const result = await executeCommandAction(room.id, userId, content);
        if (!result.success && result.error) {
          const errorMsg = {
            id: Date.now(), roomId: room.id, userId, nickname: "SYSTEM",
            content: tra("commandError", { error: result.error }),
            type: "system" as const, isPrivate: true, diceDetail: null,
            createdAt: new Date().toISOString()
          };
          seenIdsRef.current.add(String(errorMsg.id));
          setMessages(prev => [...prev, errorMsg]);
        }
      } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
  };

  const handleNicknameSave = async (newNickname: string) => {
    await updateNicknameAction(room.id, newNickname);
    setNickname(newNickname);
  };

  const handleViewPlayerCard = async (targetUserId: number, targetNickname: string) => {
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
  };

  const handleCheckRequest = (skillName: string, diceType: string) => {
    getMySkillsAction(room.id).then(async (skills) => {
      const skill = skills.find((s: any) => s.skillName === skillName);
      if (skill) {
        if (diceType === "d100") {
          await executeCommandAction(room.id, userId, `.rc ${skillName}`);
        } else {
          const faces = parseInt(diceType.replace("d", ""));
          await rollDiceAction(room.id, faces, 1);
        }
      } else {
        const value = prompt(t("promptNoSkill", { skillName }), "50");
        if (value && !isNaN(parseInt(value))) {
          const v = parseInt(value);
          await upsertSkillAction(room.id, skillName, v);
          if (diceType === "d100") {
            await executeCommandAction(room.id, userId, `.rc ${skillName}`);
          } else {
            const faces = parseInt(diceType.replace("d", ""));
            await rollDiceAction(room.id, faces, 1);
          }
        }
      }
    });
  };

  return (
    <div className="flex flex-col h-dvh bg-bg overflow-hidden text-text">
      <header className="bg-header-bg border-b border-header-border shadow-sm px-4 py-2 sm:py-3 shrink-0 z-20 relative">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-3 md:gap-4 justify-between items-stretch md:items-center">
          <div className="flex items-center justify-between md:justify-start gap-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-text-muted hover:text-text transition text-sm font-medium">← {tn("lobby")}</Link>
              {sidebarCollapsed && (
                <button
                  onClick={() => {
                    setSidebarCollapsed(false);
                    localStorage.setItem("trpg-sidebar-collapsed", "false");
                  }}
                  className="relative p-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                  title={t("tooltipExpandDm")}
                >
                  <span className="text-sm">💬</span>
                  <span className="text-xs font-bold hidden sm:inline">{t("btnDm")}</span>
                  {totalUnread > 0 && (
                    <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce">
                      {totalUnread > 9 ? "9+" : totalUnread}
                    </span>
                  )}
                </button>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-text leading-none">{room.name}</h2>
                  <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-success' : status === 'connecting' ? 'bg-accent animate-pulse' : 'bg-danger'}`} title={status} />
                </div>
                <div className="text-[10px] text-text-dim mt-1 uppercase tracking-wider font-mono">{tn("roomId", { id: room.id })}</div>
              </div>
            </div>
            {isHost && (
              <span className="md:hidden text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wider select-none self-center">
                {t("gm")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Group 1: 角色与能力 (Character Group) */}
            <div className="flex items-center bg-surface-alt p-1 rounded-lg border border-border shadow-sm">
              <button
                onClick={() => setShowCharacter(!showCharacter)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer ${
                  showCharacter
                    ? "bg-surface text-primary border border-border/10 shadow-sm"
                    : "text-text-muted hover:text-text hover:bg-surface/30"
                }`}
                title={t("tooltipCharacter")}
              >
                <Icons.User className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">{nickname}</span>
              </button>
              <button
                onClick={() => setShowSkills(!showSkills)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer ${
                  showSkills
                    ? "bg-surface text-primary border border-border/10 shadow-sm"
                    : "text-text-muted hover:text-text hover:bg-surface/30"
                }`}
                title={t("tooltipSkills")}
              >
                <Icons.ClipboardList className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">{t("btnSkills")}</span>
              </button>
              <button
                onClick={() => {
                  setShowInventory(!showInventory);
                  markInventoryViewedAction(room.id);
                  setUnreadItems(0);
                }}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer relative ${
                  showInventory
                    ? "bg-surface text-primary border border-border/10 shadow-sm"
                    : "text-text-muted hover:text-text hover:bg-surface/30"
                }`}
                title={t("tooltipInventory")}
              >
                <Icons.Package className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">{t("btnInventory")}</span>
                {unreadItems > 0 && (
                  <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce shadow-md">
                    {unreadItems > 9 ? "9+" : unreadItems}
                  </span>
                )}
              </button>
            </div>

            {/* Group 2: 跑团工具 (TRPG Tools Group) */}
            {(!isMobile || isHost) && (
              <div className="flex items-center bg-surface-alt p-1 rounded-lg border border-border shadow-sm">
                {isHost && (
                  <button
                    onClick={() => setShowCheckDialog(!showCheckDialog)}
                    className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer ${
                      showCheckDialog
                        ? "bg-accent/20 text-accent border border-accent/40 shadow-sm"
                        : "text-accent/90 hover:text-accent hover:bg-accent/10"
                    }`}
                    title={t("tooltipCheck")}
                  >
                    <Icons.Crosshair className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="hidden sm:inline">{t("btnCheck")}</span>
                  </button>
                )}
                <button
                  onClick={() => setShowClueManager(!showClueManager)}
                  className={`hidden lg:flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer ${
                    showClueManager
                      ? "bg-surface text-primary border border-border/10 shadow-sm"
                      : "text-text-muted hover:text-text hover:bg-surface/30"
                  }`}
                  title={t("tooltipClues")}
                >
                  <Icons.Ticket className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">{t("btnClues")}</span>
                </button>
                {isHost && (
                  <button
                    onClick={() => setShowAiImport(true)}
                    className="hidden lg:flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer text-accent/90 hover:text-accent hover:bg-accent/10"
                    title={t("tooltipImport")}
                  >
                    <Icons.Download className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="hidden sm:inline">{t("btnImport")}</span>
                  </button>
                )}
                {isHost && (
                  <button
                    onClick={() => setShowBotManager(!showBotManager)}
                    className={`hidden lg:flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer ${
                      showBotManager
                        ? "bg-surface text-primary border border-border/10 shadow-sm"
                        : "text-text-muted hover:text-text hover:bg-surface/30"
                    }`}
                    title={t("tooltipBot")}
                  >
                    <Icons.Bot className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="hidden sm:inline">Bot</span>
                  </button>
                )}
              </div>
            )}

            {/* Group 3: 系统菜单 (System Dropdown) */}
            <div className="relative">
              <button
                onClick={() => setShowSystemMenu(!showSystemMenu)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer shadow-sm border ${
                  showSystemMenu
                    ? "bg-surface text-primary border-border"
                    : "bg-surface-alt text-text-muted hover:text-text hover:bg-border border-transparent hover:border-border"
                }`}
                title={t("tooltipSystem")}
              >
                <Icons.Menu className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">{t("btnSystem")}</span>
              </button>
              {showSystemMenu && (
                <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-xl py-1.5 min-w-[160px] z-30"
                  onClick={() => setShowSystemMenu(false)}>
                  <button onClick={() => { setShowMembers(true); }}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                    <Icons.Users className="w-4 h-4" /> {t("menuMembers")} <span className="ml-auto text-xs text-text-muted">{playerCount + botCount}</span>
                  </button>
                  <button onClick={() => { setShowRoomInfo(true); }}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                    <Icons.Info className="w-4 h-4" /> {t("menuInfo")}
                  </button>

                  {/* Mobile-only menu items */}
                  {isMobile && (
                    <div className="border-t border-border mt-1 pt-1">
                      <button onClick={() => { setShowClueManager(true); }}
                        className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                        <Icons.Ticket className="w-4 h-4" /> {t("btnClues")}
                      </button>
                      {isHost && (
                        <>
                          <button onClick={() => { setShowAiImport(true); }}
                            className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-accent hover:bg-surface-alt transition">
                            <Icons.Download className="w-4 h-4" /> {t("btnImport")}
                          </button>
                          <button onClick={() => { setShowBotManager(true); }}
                            className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                            <Icons.Bot className="w-4 h-4" /> Bot
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {isHost && (
                    <div className="border-t border-border mt-1 pt-1">
                      <button onClick={() => { setShowExport(true); }}
                        className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                        <Icons.Download className="w-4 h-4" /> {t("menuExport")}
                      </button>
                      <button onClick={() => { setShowSettings(true); }}
                        className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                        <Icons.Settings className="w-4 h-4" /> {t("menuSettings")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {isHost && (
              <span className="hidden md:inline text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 select-none">
                {t("gm")}
              </span>
            )}
          </div>
        </div>
      </header>

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
          onToggleCollapse={() => {
            setSidebarCollapsed((prev) => {
              const val = !prev;
              localStorage.setItem("trpg-sidebar-collapsed", String(val));
              return val;
            });
          }}
        />

        {/* Backdrop for mobile sidebar */}
        {!sidebarCollapsed && isMobile && (
          <div
            className="fixed inset-0 bg-black/40 z-20 transition-opacity cursor-pointer"
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
              {tabMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  nickname={msg.nickname}
                  content={msg.content}
                  type={msg.type as any}
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
                  isBot={!!players.find((p: any) => (p.users?.id || p.user_id || p.user?.id) === msg.userId)?.users?.isBot}
                  roomId={room.id}
                  hostId={room.hostId}
                  avatarColor={players.find((p: any) => (p.users?.id || p.user_id || p.user?.id) === msg.userId)?.room_members?.avatarColor}
                />
              ))}
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
                    <span>{t("dmPrefix", { nickname: dmConversations.find(c => c.userId === activeTab)?.nickname })}</span>
                    <button onClick={() => handleTabChange("public")} className="ml-auto text-text-muted hover:text-accent font-bold cursor-pointer">{t("dmExit")}</button>
                  </div>
                )}
              <ChatInput onSendMessage={handleSendMessage} isHost={isHost} mentions={mentionTargets} />
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
          roomRuleTemplate={(room as any).ruleTemplate || "basic"}
          onClose={() => setShowCharacter(false)}
          onNicknameChange={(newNick) => setNickname(newNick)}
          avatarColor={players.find((p: any) => (p.users?.id || p.user_id || p.user?.id) === userId)?.room_members?.avatarColor}
        />
      )}
      {viewingPlayerId !== null && (
        <CharacterPanel
          roomId={room.id}
          userId={viewingPlayerId}
          currentNickname={viewingPlayerNickname}
          characterData={viewingPlayerCharData}
          roomRuleTemplate={(room as any).ruleTemplate || "basic"}
          onClose={() => {
            setViewingPlayerId(null);
            setViewingPlayerCharData(null);
            setViewingPlayerNickname("");
          }}
          onNicknameChange={() => {}}
          readOnly={true}
          targetUserId={viewingPlayerId}
          loading={loadingPlayerCard}
          avatarColor={players.find((p: any) => (p.users?.id || p.user_id || p.user?.id) === viewingPlayerId)?.room_members?.avatarColor}
        />
      )}
      {showBotManager && (
        <BotManager roomId={room.id} isHost={isHost} onClose={() => setShowBotManager(false)} />
      )}
      {showClueManager && (
        <ClueManager roomId={room.id} isHost={isHost} players={mentionTargets.map(p => ({ id: p.id, nickname: p.nickname }))} onClose={() => setShowClueManager(false)} />
      )}
      {showAiImport && (
        <AiImportPanel roomId={room.id} onClose={() => setShowAiImport(false)} />
      )}
      {showCheckDialog && (
        <HostCheckDialog roomId={room.id} players={mentionTargets} onClose={() => setShowCheckDialog(false)} />
      )}
      {showMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMembers(false)}>
          <div className="bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-lg text-text">{t("titleMembers")} <span className="text-sm text-text-muted font-normal ml-2">{t("countMembers", { count: playerCount + botCount })}</span></h3>
              <button onClick={() => setShowMembers(false)} className="text-text-muted hover:text-text text-xl">×</button>
            </div>
            <div className="flex gap-3 mb-4 text-xs">
              <span className="bg-primary/10 text-primary px-2 py-1 rounded font-medium">{t("labelPlayers", { count: playerCount })}</span>
              {botCount > 0 && <span className="bg-accent/10 text-accent px-2 py-1 rounded font-medium">{t("labelBots", { count: botCount })}</span>}
            </div>
            <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
              {(players || []).map((p: any, i: number) => {
                const u = p.users || p.user || { id: p.user_id, displayName: p.nickname || "Player", isBot: false };
                const nick = p.room_members?.nickname || u.displayName || u.username || "#" + u.id;
                const isBot = !!u.isBot;
                const isMe = u.id === userId;
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-surface-alt transition">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm shrink-0 font-theme-mono"
                      style={{
                        backgroundColor: p.room_members?.avatarColor || getRandomColorForUser(u.id),
                        color: getContrastColor(p.room_members?.avatarColor || getRandomColorForUser(u.id)),
                      }}
                    >
                      {isBot ? "🤖" : nick.charAt(0).toUpperCase()}
                    </div>
                    <span className={`text-sm flex-1 ${isMe ? "font-bold text-primary" : "text-text"}`}>{nick}{isMe ? t("suffixMe") : ""}</span>
                    <div className="flex gap-2">
                        {isHost && !isMe && !isBot && (
                          <button
                            onClick={() => handleViewPlayerCard(u.id, nick)}
                            className="bg-primary/10 hover:bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded transition cursor-pointer"
                          >
                            {t("btnViewCard")}
                          </button>
                        )}
                        {!isMe && (
                          <button 
                             onClick={() => { handleTabChange(u.id); setShowMembers(false); }}
                             className="bg-accent/10 hover:bg-accent/20 text-accent text-[10px] px-2 py-0.5 rounded transition cursor-pointer"
                          >
                           🔒 {t("btnDm")}
                         </button>
                       )}
                       <span className="text-[10px] text-text-dim font-mono self-center">@{nick}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {showInventory && (
        <InventoryPanel roomId={room.id} userId={userId} isHost={isHost} players={players.map((m: any) => ({ id: m.users?.id || m.user_id, username: m.users?.username || "", nickname: m.room_members?.nickname || m.nickname || "" }))} onClose={() => setShowInventory(false)} />
      )}
      {showSettings && (
        <RoomSettings roomId={room.id} roomName={room.name} currentTheme={roomTheme || "default"} currentDiceRules={roomDiceRules || "basic"} currentRuleTemplate={(room as any).ruleTemplate || "basic"} onClose={() => setShowSettings(false)} />
      )}
      {showRoomInfo && (
        <RoomInfoPanel room={room as any} isHost={isHost} userId={userId} onClose={() => setShowRoomInfo(false)} />
      )}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowExport(false)}>
          <div className="max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <ExportButton roomId={room.id} roomName={room.name} />
          </div>
        </div>
      )}
      {showSkills && (
        <SkillPanel roomId={room.id} userId={userId} onClose={() => setShowSkills(false)} />
      )}
    </div>
  );
}
