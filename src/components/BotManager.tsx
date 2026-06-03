"use client";

import { useState, useEffect } from "react";
import { createBotAction, getRoomBotsAction } from "@/app/actions/bot";
import { useRouter } from "next/navigation";

interface BotInfo {
  id: number;
  nickname: string;
  memberId: number;
  config: { name?: string; systemPrompt?: string; model?: string; activation?: string };
}

interface BotManagerProps {
  roomId: number;
  isHost: boolean;
  onClose: () => void;
}

export function BotManager({ roomId, isHost, onClose }: BotManagerProps) {
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Create form
  const [botName, setBotName] = useState("");
  const [botNickname, setBotNickname] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [activation, setActivation] = useState("@mention");

  const loadBots = async () => {
    try {
      const data = await getRoomBotsAction(roomId);
      setBots(data as BotInfo[]);
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { loadBots(); }, [roomId]);

  const handleCreate = async () => {
    if (!botName || !botNickname) return;
    await createBotAction(roomId, {
      name: botName,
      nickname: botNickname,
      systemPrompt: systemPrompt || "你是一个TRPG跑团助手，熟悉COC规则。你需要帮助玩家和主持人推进剧情。",
      model,
      activation,
    });
    setShowCreate(false);
    setBotName("");
    setBotNickname("");
    setSystemPrompt("");
    router.refresh();
    loadBots();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-text">🤖 AI 助手管理</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl">×</button>
        </div>

        {loading ? (
          <div className="text-center text-text-muted py-8">加载中...</div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Existing bots */}
            {bots.length > 0 && (
              <div>
                <h4 className="text-xs text-text-dim font-medium mb-2 uppercase">已创建的 Bot</h4>
                <div className="flex flex-col gap-2">
                  {bots.map(bot => (
                    <div key={bot.id} className="bg-surface-alt rounded-theme p-3 border border-border flex items-center gap-3">
                      <span className="text-xl">🤖</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-text">{bot.nickname}</div>
                        <div className="text-[10px] text-text-muted">{bot.config.model || "gpt-4o-mini"} · @mention 激活</div>
                      </div>
                      <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold">ACTIVE</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!showCreate && isHost && (
              <button onClick={() => setShowCreate(true)}
                className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-theme font-bold transition">
                ＋ 创建新 Bot
              </button>
            )}

            {/* Create form */}
            {showCreate && (
              <div className="bg-surface-alt rounded-theme p-4 border border-primary/30 flex flex-col gap-3">
                <h4 className="font-bold text-text text-sm">创建 AI Bot</h4>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">Bot 名称</label>
                  <input value={botName} onChange={e => setBotName(e.target.value)}
                    placeholder="如：克苏鲁守秘人助手" className="p-2 border border-input-border bg-input-bg rounded text-text text-sm" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">显示昵称（用于 @提及）</label>
                  <input value={botNickname} onChange={e => setBotNickname(e.target.value)}
                    placeholder="如：KP小助手" className="p-2 border border-input-border bg-input-bg rounded text-text text-sm font-mono" />
                  <p className="text-[10px] text-text-muted">玩家发送 @{botNickname || "昵称"} 即可激活 Bot</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">System Prompt（角色设定）</label>
                  <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                    placeholder="你是一个TRPG跑团助手..." rows={4}
                    className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none font-mono" />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-xs text-text-dim">模型</label>
                    <select value={model} onChange={e => setModel(e.target.value)}
                      className="p-2 border border-input-border bg-input-bg rounded text-text text-sm">
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </select>
                  </div>
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-xs text-text-dim">激活方式</label>
                    <select value={activation} onChange={e => setActivation(e.target.value)}
                      className="p-2 border border-input-border bg-input-bg rounded text-text text-sm">
                      <option value="@mention">@提及</option>
                      <option value="manual">手动</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowCreate(false)}
                    className="flex-1 px-3 py-2 text-text-muted text-sm">取消</button>
                  <button onClick={handleCreate} disabled={!botName || !botNickname}
                    className="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded font-bold text-sm">
                    创建 Bot
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
