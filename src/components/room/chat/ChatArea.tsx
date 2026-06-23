"use client";

import { useTranslations } from "next-intl";
import { ChatMessage } from "@/components/room/chat/ChatMessage";
import { ChatInput } from "@/components/room/chat/ChatInput";
import { Icons } from "@/components/shared/icons";
import type { Message, PlayerEntry, TypingBots, MentionTarget } from "@/components/room/types";

interface ChatAreaProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  tabMessages: Message[];
  players: PlayerEntry[];
  userId: number;
  isHost: boolean;
  roomId: number;
  hostId: number;
  typingBots: TypingBots;
  activeTab: "public" | number;
  showScrollButton: boolean;
  scrollToBottom: (smooth?: boolean) => void;
  dmConversations: { userId: number; nickname: string }[];
  mentionTargets: MentionTarget[];
  readOnly: boolean;
  onViewCharacter: (targetUserId: number, targetNickname: string) => void;
  onStartDM: (tab: "public" | number) => void;
  onCheckRequest: (messageId: number, skillName: string) => void;
  onSendMessage: (content: string, type: "text" | "dice" | "image", diceDetail?: string, isPrivate?: boolean, targetUserId?: number) => void;
}

export function ChatArea({
  scrollRef, onScroll, tabMessages, players, userId, isHost, roomId, hostId,
  typingBots, activeTab, showScrollButton, scrollToBottom, dmConversations,
  mentionTargets, readOnly, onViewCharacter, onStartDM, onCheckRequest, onSendMessage,
}: ChatAreaProps) {
  const t = useTranslations("room");

  return (
    <div className="flex-1 flex flex-col relative min-w-0">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth">
        <div className="max-w-4xl mx-auto flex flex-col gap-1">
          {tabMessages.map((msg) => {
            const playerData = players.find((p) => (p.users?.id || p.user_id || p.user?.id) === msg.userId);
            return (
              <ChatMessage
                key={msg.id}
                nickname={msg.nickname}
                content={msg.content}
                type={msg.type as "text" | "dice" | "system" | "clue" | "image" | "check_request"}
                diceDetail={msg.diceDetail}
                isPrivate={msg.isPrivate}
                audience={msg.audience}
                createdAt={msg.createdAt}
                isOwn={msg.userId === userId}
                userId={userId}
                senderId={msg.userId}
                isHost={isHost}
                onViewCharacter={onViewCharacter}
                onStartDM={onStartDM}
                onCheckRequest={onCheckRequest}
                messageId={msg.id}
                isBot={!!playerData?.users?.isBot}
                roomId={roomId}
                hostId={hostId}
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
                <Icons.Bot className="w-3.5 h-3.5" />
                <span>{t("botThinking", { nickname: bot.nickname })}</span>
              </div>
            ))}
          {tabMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-50 py-20">
              {activeTab === "public"
                ? <Icons.Navigation className="w-10 h-10 mb-4" />
                : <Icons.Lock className="w-10 h-10 mb-4" />}
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
              <button onClick={() => onStartDM("public")} className="ml-auto text-text-muted hover:text-accent font-bold cursor-pointer">{t("dmExit")}</button>
            </div>
          )}
          <ChatInput onSendMessage={onSendMessage} roomId={roomId} mentions={mentionTargets} readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}
