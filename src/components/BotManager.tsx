"use client";

import { useState, useEffect } from "react";
import { createBotAction, getRoomBotsAction, updateBotAction, triggerBotAction } from "@/app/actions/bot";
import { getMyProviders } from "@/app/actions/ai-providers";
import { getBotPresetsAction } from "@/app/actions/bot-presets";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PRESET_AVATAR_COLORS, getContrastColor, getRandomColorForUser } from "@/lib/avatar-colors";

interface BotInfo {
  id: number;
  nickname: string;
  memberId: number;
  name?: string;
  avatarColor?: string | null;
  config: {
    name?: string; systemPrompt?: string; model?: string;
    activation?: string; enableTools?: string[]; providerId?: number;
  };
}

interface BotManagerProps {
  roomId: number;
  isHost: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  validProviderIds: number[];
}

export function BotManager({ roomId, isHost, onClose, aiEnabled, validProviderIds }: BotManagerProps) {
  const t = useTranslations("bots");
  const tCommon = useTranslations("common");
  const tp = useTranslations("adminProviders");
  const tChar = useTranslations("character");
  const tRoom = useTranslations("room");

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
  const [botColor, setBotColor] = useState<string>("#f43f5e");
  const [providers, setProviders] = useState<any[]>([]);
  const [providerId, setProviderId] = useState<number | null>(null);

  // Preset State
  const [presets, setPresets] = useState<any[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<number | string>("");
  const [allowEditPrompt, setAllowEditPrompt] = useState(true);

  useEffect(() => {
    getMyProviders().then(list => {
      setProviders(list);
      if (list.length > 0) {
        setProviderId(list[0].id);
        setModel(list[0].model || "gpt-4o");
      } else {
        setModel("gpt-4o-mini");
      }
    }).catch(() => setModel("gpt-4o-mini"));
  }, []);

  useEffect(() => {
    getBotPresetsAction().then(setPresets).catch(console.error);
  }, []);

  const loadBots = async () => {
    try {
      const data = await getRoomBotsAction(roomId);
      setBots(data as BotInfo[]);
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { loadBots(); }, [roomId]);

  const handlePresetChange = (presetIdVal: string) => {
    setSelectedPresetId(presetIdVal);
    if (!presetIdVal) {
      setAllowEditPrompt(true);
      return;
    }
    const preset = presets.find(p => p.id === parseInt(presetIdVal));
    if (preset) {
      setBotName(preset.name);
      setBotNickname(preset.defaultNickname);
      setSystemPrompt(preset.systemPrompt);
      setAllowEditPrompt(preset.allowEditPrompt);
    }
  };

  const resetForm = () => {
    setBotName("");
    setBotNickname("");
    setSystemPrompt("");
    setSelectedPresetId("");
    setAllowEditPrompt(true);
    setBotColor("#f43f5e");
  };

  const handleCreate = async () => {
    if (!botName || !botNickname) return;
    await createBotAction(roomId, {
      name: botName,
      nickname: botNickname,
      systemPrompt: systemPrompt || "你是一个TRPG跑团助手，熟悉COC规则。你需要帮助玩家和主持人推进剧情。",
      model,
      activation,
      enableTools,
      providerId: providerId ?? undefined,
      avatarColor: botColor,
    });
    setShowCreate(false);
    resetForm();
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
      enableTools,
      providerId: providerId ?? undefined,
      avatarColor: botColor,
    });
    setEditingBot(null);
    resetForm();
    router.refresh();
    loadBots();
  };

  const startEdit = (bot: BotInfo) => {
    setEditingBot(bot);
    setBotName((bot as any).name || bot.config.name || "");
    setBotNickname(bot.nickname || "");
    setSystemPrompt(bot.config.systemPrompt || "");
    setModel(bot.config.model || "gpt-4o-mini");
    setActivation(bot.config.activation || "@mention");
    setEnableTools(bot.config.enableTools || ["send_message", "roll_dice"]);
    // Restore the saved provider only if it still exists in the available list.
    // A stale id (e.g. the shared provider was deleted/recreated by an admin) would
    // leave the <select> showing the first option while state keeps the dead id —
    // a Save would then re-persist the broken provider. Fall back to the first
    // available provider so state matches what the dropdown actually displays.
    const savedProvider = bot.config.providerId
      ? providers.find(p => p.id === bot.config.providerId)
      : undefined;
    if (savedProvider) {
      setProviderId(savedProvider.id);
    } else if (providers.length > 0) {
      setProviderId(providers[0].id);
      setModel(providers[0].model || "gpt-4o");
    }
    setBotColor(bot.avatarColor || getRandomColorForUser(bot.id));
    setShowCreate(false);
    setSelectedPresetId("");
    setAllowEditPrompt(true);
  };

  const cancelEdit = () => {
    setEditingBot(null);
    resetForm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-text">{t("title")}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl cursor-pointer">×</button>
        </div>

        {loading ? (
          <div className="text-center text-text-muted py-8">{t("loading")}</div>
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
                <div>• Bot Data: <code className="text-text-muted">{t("dataDesc")}</code></div>
                <div>• Context: <code className="text-text-muted">{t("contextDesc")}</code></div>
              </div>
            </div>

            {/* Existing bots */}
            {bots.length > 0 && (
              <div>
                <h4 className="text-xs text-text-dim font-medium mb-2 uppercase">{t("createdBots")}</h4>
                <div className="flex flex-col gap-2">
                  {bots.map(bot => {
                    const isBotDisabled = !aiEnabled;
                    const providerId = bot.config.providerId;
                    const isProviderError = !providerId || !validProviderIds.includes(providerId);

                    return (
                      <div key={bot.id} className="bg-surface-alt rounded-theme p-3 border border-border flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm font-theme-mono"
                            style={{
                              backgroundColor: bot.avatarColor || getRandomColorForUser(bot.id),
                              color: getContrastColor(bot.avatarColor || getRandomColorForUser(bot.id)),
                            }}
                          >
                            🤖
                          </div>
                          {isBotDisabled && (
                            <div className="absolute -bottom-1 -right-1 bg-surface rounded-full text-[10px] leading-none border border-border p-[1px] shadow-sm select-none animate-pulse" title={tRoom("aiDisabled")}>🚫</div>
                          )}
                          {!isBotDisabled && isProviderError && (
                            <div className="absolute -bottom-1 -right-1 bg-surface rounded-full text-[10px] leading-none border border-border p-[1px] shadow-sm select-none" title={tRoom("providerError")}>⚠️</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-text flex items-center flex-wrap gap-1.5">
                            <span className="truncate">{bot.nickname}</span>
                            {isBotDisabled && (
                              <span className="text-[9px] font-normal px-1 rounded-sm bg-red-500/10 text-red-500 border border-red-500/20 select-none">
                                {tRoom("tagDisabled")}
                              </span>
                            )}
                            {!isBotDisabled && isProviderError && (
                              <span className="text-[9px] font-normal px-1 rounded-sm bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 select-none animate-pulse">
                                {tRoom("tagProviderError")}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-text-muted truncate">
                            {t("activationDesc", { model: bot.config.model || "gpt-4o-mini", activation: bot.config.activation === "manual" ? t("activationManual") : t("activationMention") })}
                          </div>
                          {!isBotDisabled && isProviderError && (
                            <div className="text-[9px] text-yellow-500 mt-1 select-none font-medium animate-pulse">
                              ⚠️ {tRoom("providerError")}
                            </div>
                          )}
                          {isBotDisabled && (
                            <div className="text-[9px] text-red-500 mt-1 select-none font-medium">
                              🚫 {tRoom("aiDisabled")}
                            </div>
                          )}
                        </div>
                        {isHost && (
                          <button
                            onClick={async () => {
                              await triggerBotAction(roomId, bot.id);
                              router.refresh();
                            }}
                            className="text-xs text-accent hover:bg-accent/10 px-2 py-1 rounded transition font-bold cursor-pointer shrink-0"
                            title={t("triggerManual")}
                          >
                            ⚡
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(bot)}
                          className="text-xs text-text-muted hover:text-primary px-2 py-1 rounded hover:bg-surface transition cursor-pointer shrink-0"
                        >
                          ✏️ {t("edit")}
                        </button>
                        {isBotDisabled ? (
                          <span className="text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded font-bold select-none shrink-0">
                            {tRoom("tagDisabled")}
                          </span>
                        ) : isProviderError ? (
                          <span className="text-[10px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded font-bold select-none shrink-0 animate-pulse">
                            {tRoom("tagProviderError")}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold select-none shrink-0">ACTIVE</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!showCreate && !editingBot && isHost && (
              <button onClick={() => setShowCreate(true)}
                className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-theme font-bold transition cursor-pointer">
                ＋ {t("createBot")}
              </button>
            )}

            {/* Create / Edit form */}
            {(showCreate || editingBot) && (
              <div className="bg-surface-alt rounded-theme p-4 border border-primary/30 flex flex-col gap-3">
                <h4 className="font-bold text-text text-sm">{editingBot ? t("editBot") : t("createBot")}</h4>

                {presets.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-dim">{t("presetSelect")}</label>
                    <select value={selectedPresetId} onChange={e => handlePresetChange(e.target.value)}
                      className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none">
                      <option value="">{t("manualPreset")}</option>
                      {presets.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">{t("name")}</label>
                  <input value={botName} onChange={e => setBotName(e.target.value)}
                    placeholder={t("namePlaceholder")} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">{t("nickname")}</label>
                  <input value={botNickname} onChange={e => setBotNickname(e.target.value)}
                    placeholder={t("nicknamePlaceholder")} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm font-mono outline-none" />
                  <p className="text-[10px] text-text-muted">{t("nicknameHint", { name: botNickname || "..." })}</p>
                </div>

                {/* Avatar Color */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">{tChar("avatarColor")}</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {PRESET_AVATAR_COLORS.map(preset => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => setBotColor(preset.hex)}
                        className={`w-6 h-6 rounded-full border transition cursor-pointer relative ${
                          botColor.toLowerCase() === preset.hex.toLowerCase()
                            ? "border-text scale-110 shadow-sm"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: preset.hex }}
                        title={preset.name}
                      >
                        {botColor.toLowerCase() === preset.hex.toLowerCase() && (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px]" style={{ color: preset.text }}>
                            ✓
                          </span>
                        )}
                      </button>
                    ))}
                    {/* Custom Hex input */}
                    <div className="flex items-center gap-1.5 ml-1.5">
                      <input
                        type="color"
                        value={botColor.startsWith("#") && botColor.length === 7 ? botColor : "#6366f1"}
                        onChange={e => setBotColor(e.target.value)}
                        className="w-6 h-6 border-0 p-0 rounded-full cursor-pointer bg-transparent outline-none overflow-hidden"
                      />
                      <input
                        type="text"
                        value={botColor}
                        onChange={e => {
                          const val = e.target.value;
                          if (val.length <= 7) {
                            setBotColor(val);
                          }
                        }}
                        placeholder="#HEX"
                        className="w-16 p-1 border border-input-border bg-input-bg rounded text-[10px] text-text font-mono outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">{t("prompt")}</label>
                  <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                    placeholder={t("promptPlaceholder")} rows={4}
                    disabled={!allowEditPrompt}
                    className={`p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none font-mono outline-none ${
                      !allowEditPrompt ? "opacity-60 cursor-not-allowed" : ""
                    }`} />
                </div>

                {providers.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-dim">AI Provider</label>
                    <select value={providerId || ""} onChange={e => {
                      const pid = parseInt(e.target.value);
                      setProviderId(pid);
                      const p = providers.find(x => x.id === pid);
                      if (p) setModel(p.model || "gpt-4o");
                    }} className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none">
                      {providers.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.model}) {p.isShared ? `[${tp("shared")}]` : `[${tp("private")}]`}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-text-muted">{tp("presetLabel")}</p>
                  </div>
                )}

                {providers.length > 0 && providerId && (
                  <p className="text-[10px] text-text-muted">{t("modelHint", { model })}</p>
                )}
                <div className="flex gap-3">
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-xs text-text-dim">{t("activation")}</label>
                    <select value={activation} onChange={e => setActivation(e.target.value)}
                      className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none">
                      <option value="@mention">{t("activationMention")}</option>
                      <option value="manual">{t("activationManual")}</option>
                    </select>
                  </div>
                </div>

                {/* Tool Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">{t("tools")}</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { key: "send_message", label: "toolSendMessage" },
                      { key: "roll_dice", label: "toolRollDice" },
                      { key: "inspect_item", label: "toolInspectItem" },
                      { key: "my_inventory", label: "toolMyInventory" },
                      { key: "my_clues", label: "toolMyClues" },
                      { key: "my_character", label: "toolMyCharacter" },
                      { key: "search_history", label: "toolSearchHistory" },
                      { key: "set_character_card", label: "toolSetCharacterCard" },
                    ].map(tool => (
                      <label key={tool.key} className={`flex items-center gap-1.5 p-1.5 rounded text-xs cursor-pointer transition ${
                        enableTools.includes(tool.key) ? "bg-primary/10 text-primary" : "bg-surface text-text-muted"
                      }`}>
                        <input type="checkbox" checked={enableTools.includes(tool.key)}
                          onChange={e => {
                            if (e.target.checked) setEnableTools([...enableTools, tool.key]);
                            else setEnableTools(enableTools.filter(t => t !== tool.key));
                          }}
                          className="w-3.5 h-3.5 accent-primary cursor-pointer" />
                        {t(tool.label)}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => {
                    setShowCreate(false);
                    cancelEdit();
                  }}
                    className="flex-1 px-3 py-2 text-text-muted text-sm cursor-pointer">{tCommon("cancel")}</button>
                  <button onClick={editingBot ? handleUpdate : handleCreate} disabled={!botName || !botNickname}
                    className="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded font-bold text-sm cursor-pointer">
                    {editingBot ? t("submitSave") : t("submitCreate")}
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
