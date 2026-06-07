"use client";

import { useState, useEffect } from "react";
import { createBotAction, getRoomBotsAction, updateBotAction } from "@/app/actions/bot";
import { getHostAiConfig } from "@/app/actions/ai";
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
  const [model, setModel] = useState("");
  const [activation, setActivation] = useState("@mention");
  const [enableTools, setEnableTools] = useState<string[]>(["send_message", "roll_dice"]);
  const [editingBot, setEditingBot] = useState<BotInfo | null>(null);

  // Fetch host AI config to align model default
  useEffect(() => {
    getHostAiConfig().then(cfg => {
      if (cfg?.model) setModel(cfg.model);
    }).catch(() => setModel("gpt-4o-mini"));
  }, []);

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
      enableTools,
    });
    setShowCreate(false);
    setBotName("");
    setBotNickname("");
    setSystemPrompt("");
    router.refresh();
    loadBots();
  };

  const handleUpdate = async () => {
    if (!editingBot || !botName || !botNickname) return;
    await updateBotAction(roomId, editingBot.id, {
      name: botName,
      nickname: botNickname,
      systemPrompt: systemPrompt || "你是一个TRPG跑团助手。",
      model,
      activation,
    });
    setEditingBot(null);
    setBotName("");
    setBotNickname("");
    setSystemPrompt("");
    router.refresh();
    loadBots();
  };

  const startEdit = (bot: BotInfo) => {
    setEditingBot(bot);
    setBotName(bot.config.name || "");
    setBotNickname(bot.nickname || "");
    setSystemPrompt(bot.config.systemPrompt || "");
    setModel(bot.config.model || "gpt-4o-mini");
    setActivation(bot.config.activation || "@mention");
    setShowCreate(false);
  };

  const cancelEdit = () => {
    setEditingBot(null);
    setBotName("");
    setBotNickname("");
    setSystemPrompt("");
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
            {/* Work Directory Info */}
            <div className="bg-surface-alt rounded-theme p-3 border border-border text-xs">
              <div className="flex items-center gap-2 mb-1 text-text-dim font-medium">
                <span>📁 Work Directory</span>
              </div>
              <code className="block text-text-muted font-mono text-[11px] break-all bg-surface p-1.5 rounded mt-1">
                {typeof window !== "undefined" ? window.location.origin : ""}/api/rooms/{roomId}
              </code>
              <div className="text-[10px] text-text-dim mt-2 space-y-0.5">
                <div>• SQLite DB: <code className="text-text-muted">simple-trpg-chat/sqlite.db</code></div>
                <div>• Bot 数据: <code className="text-text-muted">users 表（is_bot=true）+ botConfigJson 字段</code></div>
                <div>• 上下文: <code className="text-text-muted">inventory_distributions（道具）+ messages（聊天历史）</code></div>
              </div>
            </div>

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
                        <div className="text-[10px] text-text-muted">{bot.config.model || "gpt-4o-mini"} · {bot.config.activation || "@mention"} 激活</div>
                      </div>
                      <button
                        onClick={() => startEdit(bot)}
                        className="text-xs text-text-muted hover:text-primary px-2 py-1 rounded hover:bg-surface transition"
                      >
                        ✏️ 编辑
                      </button>
                      <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold">ACTIVE</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!showCreate && !editingBot && isHost && (
              <button onClick={() => setShowCreate(true)}
                className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-theme font-bold transition">
                ＋ 创建新 Bot
              </button>
            )}

            {/* Create / Edit form */}
            {(showCreate || editingBot) && (
              <div className="bg-surface-alt rounded-theme p-4 border border-primary/30 flex flex-col gap-3">
                <h4 className="font-bold text-text text-sm">{editingBot ? "✏️ 编辑 Bot" : "创建 AI Bot"}</h4>
                
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
                    <input value={model} onChange={e => setModel(e.target.value)}
                      placeholder="如 gpt-4o / deepseek-chat / claude-3-opus"
                      className="p-2 border border-input-border bg-input-bg rounded text-text text-sm font-mono" />
                    <p className="text-[10px] text-text-muted">默认对齐 Host AI 配置的模型，可手动修改</p>
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

                {/* Tool Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">启用工具</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { key: "send_message", label: "💬 发送消息" },
                      { key: "roll_dice", label: "🎲 投骰子" },
                      { key: "inspect_item", label: "🔍 查看道具" },
                      { key: "my_inventory", label: "🎒 我的背包" },
                      { key: "my_clues", label: "🃏 我的线索" },
                      { key: "my_character", label: "👤 角色状态" },
                      { key: "search_history", label: "📜 搜索历史" },
                    ].map(tool => (
                      <label key={tool.key} className={`flex items-center gap-1.5 p-1.5 rounded text-xs cursor-pointer transition ${
                        enableTools.includes(tool.key) ? "bg-primary/10 text-primary" : "bg-surface text-text-muted"
                      }`}>
                        <input type="checkbox" checked={enableTools.includes(tool.key)}
                          onChange={e => {
                            if (e.target.checked) setEnableTools([...enableTools, tool.key]);
                            else setEnableTools(enableTools.filter(t => t !== tool.key));
                          }}
                          className="w-3.5 h-3.5 accent-primary" />
                        {tool.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => {
                    setShowCreate(false);
                    cancelEdit();
                  }}
                    className="flex-1 px-3 py-2 text-text-muted text-sm">取消</button>
                  <button onClick={editingBot ? handleUpdate : handleCreate} disabled={!botName || !botNickname}
                    className="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded font-bold text-sm">
                    {editingBot ? "保存修改" : "创建 Bot"}
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
