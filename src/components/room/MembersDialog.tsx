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
      panelClassName="bg-surface theme-border overlay-modal rounded-theme shadow-2xl p-6 w-full max-w-md mx-4"
    >
      {(close) => (
       <>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-xl text-text font-theme-display leading-tight">{t("titleMembers")}</h3>
            <div className="flex items-center gap-2 mt-2.5">
              <span className="inline-flex items-center text-xs font-bold bg-primary/15 text-primary px-2.5 py-1 rounded-full">{t("labelPlayers", { count: playerCount })}</span>
              {botCount > 0 && <span className="inline-flex items-center text-xs font-bold bg-ai/15 text-ai px-2.5 py-1 rounded-full">{t("labelBots", { count: botCount })}</span>}
            </div>
          </div>
          <button onClick={close} aria-label={tCommon("close")}
            className="p-1.5 -mr-1.5 -mt-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer shrink-0">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Member list */}
        <div className="flex flex-col gap-1.5 max-h-[55vh] overflow-y-auto -mx-1 px-1">
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
              <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-theme border transition ${
                isMe ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-surface-alt"
              }`}>
                {/* Avatar */}
                <div className="relative shrink-0">
                  {p.room_members?.avatar ? (
                    <img src={p.room_members.avatar} alt={nick} className="w-11 h-11 rounded-full object-cover border border-border shadow-sm" />
                  ) : isMe ? (
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold bg-primary/15 text-primary ring-2 ring-primary/60 shadow-sm">
                      {t("youAvatar")}
                    </div>
                  ) : (
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shadow-sm font-theme-display"
                      style={{ backgroundColor: badgeColor, color: getContrastColor(badgeColor) }}
                    >
                      {isBot ? <Icons.Bot className="w-5 h-5" /> : nick.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {isBot && isBotDisabled && (
                    <div className="absolute -bottom-1 -right-1 bg-surface rounded-full leading-none border border-border p-0.5 shadow-sm select-none animate-pulse text-danger" title={t("aiDisabled")}>
                      <Icons.Lock className="w-2.5 h-2.5" />
                    </div>
                  )}
                </div>

                {/* Name + role */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-[15px] truncate ${isMe ? "font-bold text-primary" : "font-bold text-text"}`}>{nick}</span>
                    {isMe && <span className="shrink-0 text-xs text-text-muted">{t("suffixMe")}</span>}
                    {isBot && isBotDisabled && (
                      <span className="shrink-0 text-[10px] font-bold px-1.5 rounded bg-danger/10 text-danger border border-danger/30 select-none">
                        {t("tagDisabled")}
                      </span>
                    )}
                    {isBot && !isBotDisabled && isProviderError && (
                      <span className="shrink-0 text-[10px] font-bold px-1.5 rounded bg-warning/10 text-warning border border-warning/30 select-none animate-pulse">
                        {t("tagProviderError")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-dim truncate mt-0.5">{roleLabel}</div>
                </div>

                {/* Actions */}
                {!isMe && (
                  <div className="flex items-center gap-2 shrink-0">
                    {isHost && (
                      <button
                        onClick={() => onViewPlayerCard(u.id ?? 0, nick)}
                        className="text-xs font-bold px-3 py-1.5 rounded-theme bg-primary/10 hover:bg-primary/20 text-primary transition cursor-pointer"
                      >
                        {t("btnViewCard")}
                      </button>
                    )}
                    <button
                      onClick={() => { onStartDM(u.id ?? 0); close(); }}
                      className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-theme bg-accent/10 hover:bg-accent/20 text-accent transition cursor-pointer"
                    >
                      <Icons.Lock className="w-3 h-3" /> {t("btnDm")}
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
