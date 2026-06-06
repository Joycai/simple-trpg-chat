"use client";

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

const RULE_LABELS: Record<string, string> = {
  basic: "🎲 通用 d100",
  coc7th: "🐙 COC 7th",
};

const DICE_LABELS: Record<string, string> = {
  basic: "基础投点",
  coc7th: "COC 7th 大成功/大失败",
};

const THEME_LABELS: Record<string, string> = {
  default: "默认",
  parchment: "🏺 羊皮卷",
  cthulhu: "🦑 克苏鲁",
  shrine: "⛩️ 神社",
};

export function RoomInfoPanel({ room, isHost, userId, onClose }: RoomInfoPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative ml-auto w-80 bg-surface border-l border-border shadow-2xl h-full overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">ℹ️ 房间信息</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl">×</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Room name */}
          <div>
            <label className="text-[10px] text-text-dim uppercase tracking-wider font-medium mb-1 block">房间名称</label>
            <p className="text-text font-bold text-lg">{room.name}</p>
            <p className="text-[10px] text-text-muted font-mono">#{room.id}</p>
          </div>

          {/* Rules */}
          <div className="bg-surface-alt rounded-theme p-4 border border-border">
            <label className="text-[10px] text-text-dim uppercase tracking-wider font-medium mb-3 block">规则配置</label>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-muted">规则模版</span>
                <span className="text-xs font-bold text-text">{RULE_LABELS[room.ruleTemplate] || room.ruleTemplate}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-muted">投点规则</span>
                <span className="text-xs font-bold text-text">{DICE_LABELS[room.diceRules] || room.diceRules}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-muted">主题</span>
                <span className="text-xs font-bold text-text">{THEME_LABELS[room.theme] || room.theme}</span>
              </div>
            </div>
          </div>

          {/* Host info */}
          <div>
            <label className="text-[10px] text-text-dim uppercase tracking-wider font-medium mb-1 block">主持人</label>
            <p className="text-sm text-text">
              {isHost ? "你（主持人）" : `ID: ${room.hostId}`}
            </p>
          </div>

          {/* Secret key — Host only */}
          {isHost && (
            <div className="bg-danger/5 border border-danger/20 rounded-theme p-4">
              <label className="text-[10px] text-danger uppercase tracking-wider font-medium mb-1 block">⚠️ 房间密钥</label>
              <code className="block bg-bg border border-danger/20 rounded p-2 font-mono font-bold text-sm text-center text-danger tracking-widest select-all">
                {room.secretKey}
              </code>
              <p className="text-[10px] text-text-dim mt-1">仅主持人可见，勿泄露给玩家</p>
            </div>
          )}

          {/* Status & Created */}
          <div className="border-t border-border pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-text-muted">状态</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                room.status === "active" ? "bg-success/10 text-success" : "bg-text-dim/10 text-text-dim"
              }`}>
                {room.status === "active" ? "🟢 运行中" : "⚫ 已关闭"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-text-muted">创建时间</span>
              <span className="text-xs text-text-dim font-mono">{room.createdAt}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
