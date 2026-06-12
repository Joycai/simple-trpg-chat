"use client";

import { useTranslations } from "next-intl";

interface RoomInfoPanelProps {
  room: {
    id: number;
    name: string;
    hostId: number;
    secretKey: string;
    theme: string;
    diceRules: string;
    ruleTemplate: string;
    status: string;
    createdAt: string;
  };
  isHost: boolean;
  userId: number;
  onClose: () => void;
}

export function RoomInfoPanel({ room, isHost, userId, onClose }: RoomInfoPanelProps) {
  const t = useTranslations("roomInfo");
  const ts = useTranslations("roomSettings");
  const tt = useTranslations("themes");

  const getRuleTemplateLabel = (val: string) => {
    if (val === "basic") return ts("ruleTemplateBasic");
    if (val === "coc7th") return ts("ruleTemplateCoc7th");
    return val;
  };

  const getDiceRulesLabel = (val: string) => {
    if (val === "basic") return ts("diceRulesBasic");
    if (val === "coc7th") return ts("diceRulesCoc7th");
    return val;
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative ml-auto w-full sm:w-80 bg-surface border-l border-border shadow-2xl h-full overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">{t("title")}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl">×</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Room name */}
          <div>
            <label className="text-[10px] text-text-dim uppercase tracking-wider font-medium mb-1 block">{t("nameLabel")}</label>
            <p className="text-text font-bold text-lg">{room.name}</p>
            <p className="text-[10px] text-text-muted font-mono">#{room.id}</p>
          </div>

          {/* Rules */}
          <div className="bg-surface-alt rounded-theme p-4 border border-border">
            <label className="text-[10px] text-text-dim uppercase tracking-wider font-medium mb-3 block">{t("configLabel")}</label>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-muted">{t("ruleTemplate")}</span>
                <span className="text-xs font-bold text-text">{getRuleTemplateLabel(room.ruleTemplate)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-muted">{t("diceRules")}</span>
                <span className="text-xs font-bold text-text">{getDiceRulesLabel(room.diceRules)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-muted">{t("theme")}</span>
                <span className="text-xs font-bold text-text">{tt(`${room.theme}.name`) || room.theme}</span>
              </div>
            </div>
          </div>

          {/* Host info */}
          <div>
            <label className="text-[10px] text-text-dim uppercase tracking-wider font-medium mb-1 block">{t("host")}</label>
            <p className="text-sm text-text">
              {isHost ? t("hostMe") : `ID: ${room.hostId}`}
            </p>
          </div>

          {/* Secret key — Host only */}
          {isHost && (
            <div className="bg-danger/5 border border-danger/20 rounded-theme p-4">
              <label className="text-[10px] text-danger uppercase tracking-wider font-medium mb-1 block">{t("secretKey")}</label>
              <code className="block bg-bg border border-danger/20 rounded p-2 font-mono font-bold text-sm text-center text-danger tracking-widest select-all">
                {room.secretKey}
              </code>
              <p className="text-[10px] text-text-dim mt-1">{t("secretKeyDesc")}</p>
            </div>
          )}

          {/* Status & Created */}
          <div className="border-t border-border pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-text-muted">{t("status")}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                room.status === "active" ? "bg-success/10 text-success" : "bg-text-dim/10 text-text-dim"
              }`}>
                {room.status === "active" ? t("statusActive") : t("statusClosed")}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-text-muted">{t("createdAt")}</span>
              <span className="text-xs text-text-dim font-mono">{room.createdAt}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
