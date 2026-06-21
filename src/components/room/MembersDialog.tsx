"use client";

import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { getRandomColorForUser, getContrastColor } from "@/lib/avatar-colors";
import { getBotStatus } from "@/lib/botStatus";
import type { PlayerEntry } from "@/components/room/types";

interface MembersDialogProps {
  players: PlayerEntry[];
  userId: number;
  hostId: number;
  isHost: boolean;
  aiEnabled: boolean;
  validProviderIds: number[];
  playerCount: number;
  botCount: number;
  onViewPlayerCard: (targetUserId: number, targetNickname: string) => void;
  onStartDM: (targetUserId: number) => void;
  onClose: () => void;
}

export function MembersDialog({
  players,
  userId,
  hostId,
  isHost,
  aiEnabled,
  validProviderIds,
  playerCount,
  botCount,
  onViewPlayerCard,
  onStartDM,
  onClose,
}: MembersDialogProps) {
  const t = useTranslations("room");
  const tCommon = useTranslations("common");

  return (
    <OverlayShell
      onClose={onClose}
      panelClassName="bg-surface border border-border rounded-theme shadow-2xl p-5 w-full max-w-md mx-4"
    >
      {(close) => (
       <>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg text-text leading-tight">{t("titleMembers")}</h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center text-[11px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t("labelPlayers", { count: playerCount })}</span>
              {botCount > 0 && <span className="inline-flex items-center text-[11px] font-medium bg-accent/10 text-accent px-2 py-0.5 rounded-full">{t("labelBots", { count: botCount })}</span>}
            </div>
          </div>
          <button onClick={close} title={tCommon("close")}
            className="p-1.5 -mr-1.5 -mt-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer shrink-0">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Member list */}
        <div className="flex flex-col gap-0.5 max-h-[55vh] overflow-y-auto -mx-1.5 px-1.5">
          {(players || []).map((p: { users?: { id?: number; isBot?: boolean; displayName?: string; username?: string }; user?: { id?: number; isBot?: boolean; displayName?: string; username?: string }; user_id?: number; room_members?: { nickname?: string; avatarColor?: string | null; avatar?: string | null }; nickname?: string }, i: number) => {
            const u = p.users || p.user || { id: p.user_id, displayName: p.nickname || "Player", isBot: false };
            const nick = p.room_members?.nickname || u.displayName || u.username || "#" + u.id;
            const isBot = !!u.isBot;
            const isMe = u.id === userId;
            const isHostMember = u.id === hostId;
            const roleLabel = isBot ? t("roleBot") : isHostMember ? t("roleHost") : t("rolePlayer");
            const badgeColor = p.room_members?.avatarColor || getRandomColorForUser(u.id);
            const { isBotDisabled, isProviderError } = getBotStatus(u, aiEnabled, validProviderIds);
            return (
              <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-alt transition">
                {/* Avatar */}
                <div className="relative shrink-0">
                  {p.room_members?.avatar ? (
                    <img src={p.room_members.avatar} alt={nick} className="w-9 h-9 rounded-full object-cover border border-border shadow-sm" />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-sm font-theme-mono"
                      style={{ backgroundColor: badgeColor, color: getContrastColor(badgeColor) }}
                    >
                      {isBot ? "🤖" : nick.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {isBot && isBotDisabled && (
                    <div className="absolute -bottom-1 -right-1 bg-surface rounded-full text-[8px] leading-none border border-border p-[1px] shadow-sm select-none animate-pulse" title={t("aiDisabled")}>🚫</div>
                  )}
                  {isBot && !isBotDisabled && isProviderError && (
                    <div className="absolute -bottom-1 -right-1 bg-surface rounded-full text-[8px] leading-none border border-border p-[1px] shadow-sm select-none" title={t("providerError")}>⚠️</div>
                  )}
                </div>

                {/* Name + role */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-sm truncate ${isMe ? "font-bold text-primary" : "font-medium text-text"}`}>{nick}</span>
                    {isMe && <span className="shrink-0 text-[11px] text-text-muted">{t("suffixMe")}</span>}
                    {isBot && isBotDisabled && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 rounded-sm bg-red-500/10 text-red-500 border border-red-500/20 select-none">
                        {t("tagDisabled")}
                      </span>
                    )}
                    {isBot && !isBotDisabled && isProviderError && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 rounded-sm bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 select-none animate-pulse">
                        {t("tagProviderError")}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-text-dim truncate mt-0.5">{roleLabel}</div>
                </div>

                {/* Actions */}
                {!isMe && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isHost && (
                      <button
                        onClick={() => onViewPlayerCard(u.id ?? 0, nick)}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition cursor-pointer"
                      >
                        {t("btnViewCard")}
                      </button>
                    )}
                    <button
                      onClick={() => { onStartDM(u.id ?? 0); close(); }}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-accent/10 hover:bg-accent/20 text-accent transition cursor-pointer"
                    >
                      🔒 {t("btnDm")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
       </>
      )}
    </OverlayShell>
  );
}
