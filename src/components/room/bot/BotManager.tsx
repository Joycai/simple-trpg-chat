"use client";

import { useState, useEffect } from "react";
import { createBotAction, getRoomBotsAction, updateBotAction, triggerBotAction } from "@/app/actions/bot";
import { getMyProviders } from "@/app/actions/ai-providers";
import { getBotPresetsAction } from "@/app/actions/bot-presets";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PRESET_AVATAR_COLORS, getContrastColor, getRandomColorForUser } from "@/lib/avatar-colors";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { Icons } from "@/components/shared/icons";

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
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Create form
  const [botName, setBotName] = useState("");
  const [botNickname, setBotNickname] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("");
  const [activation, setActivation] = useState("@mention");
  const [enableTools, setEnableTools] = useState<string[]>(["roll_dice"]);
  const [editingBot, setEditingBot] = useState<BotInfo | null>(null);
  const [botColor, setBotColor] = useState<string>("#f43f5e");
  const [providers, setProviders] = useState<{ id: number; name: string; model: string; isShared: boolean }[]>([]);
  const [providerId, setProviderId] = useState<number | null>(null);

  // Preset State
  const [presets, setPresets] = useState<{ id: number; name: string; defaultNickname: string; systemPrompt: string; allowEditPrompt: boolean }[]>([]);
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadBots(); }, [roomId]);

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
    setBotName(bot.config.name || "");
    setBotNickname(bot.nickname || "");
    setSystemPrompt(bot.config.systemPrompt || "");
    setModel(bot.config.model || "gpt-4o-mini");
    setActivation(bot.config.activation || "@mention");
    setEnableTools(bot.config.enableTools || ["roll_dice"]);
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
    setSelectedPresetId("");
    setAllowEditPrompt(true);
  };

  const cancelEdit = () => {
    setEditingBot(null);
    resetForm();
  };

  const fieldCls = "w-full px-3.5 py-3 border border-input-border bg-input-bg rounded-theme text-text text-sm outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary placeholder:text-text-dim";
  const labelCls = "text-sm text-text-muted mb-1.5 block";

  const TOOLS = [
    { key: "roll_dice", label: "toolRollDice" },
    { key: "send_image", label: "toolSendImage" },
    { key: "inspect_item", label: "toolInspectItem" },
    { key: "my_inventory", label: "toolMyInventory" },
    { key: "my_clues", label: "toolMyClues" },
    { key: "my_character", label: "toolMyCharacter" },
    { key: "search_history", label: "toolSearchHistory" },
    { key: "set_character_card", label: "toolSetCharacterCard" },
  ] as const;

  return (
    <OverlayShell
      onClose={onClose}
      rootClassName="p-4"
      panelClassName="bg-surface theme-border rounded-theme shadow-2xl p-6 w-full max-w-lg max-h-[88vh] overflow-y-auto"
    >
      {(close) => (
        <>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-xl text-text font-theme-display">{t("title")}</h3>
          <button onClick={close} aria-label={tCommon("close")}
            className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="text-center text-text-muted py-8">{t("loading")}</div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Existing bots */}
            {bots.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <h4 className="text-sm text-text-muted">{t("createdBots")}</h4>
                {bots.map(bot => {
                  const isBotDisabled = !aiEnabled;
                  const botProviderId = bot.config.providerId;
                  const isProviderError = !botProviderId || !validProviderIds.includes(botProviderId);
                  const color = bot.avatarColor || getRandomColorForUser(bot.id);
                  const initial = (bot.config.name || bot.nickname || "?").trim().charAt(0) || "?";
                  const activationLabel = bot.config.activation === "manual" ? t("activationManual") : t("activationMention");

                  return (
                    <div key={bot.id} className="bg-surface-alt/40 rounded-theme p-3 border border-border flex items-center gap-3">
                      <div className="w-11 h-11 rounded-theme flex items-center justify-center text-lg font-bold shrink-0 shadow-sm font-theme-display"
                        style={{ backgroundColor: color, color: getContrastColor(color) }}>
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-[15px] font-bold text-text truncate">{bot.nickname}</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ai border border-ai/40 bg-ai/10 rounded px-1.5 py-0.5 leading-none select-none">
                            <Icons.Lock className="w-3 h-3" /> BOT
                          </span>
                          {isBotDisabled && (
                            <span className="text-[10px] font-bold text-danger border border-danger/40 bg-danger/10 rounded px-1.5 py-0.5 leading-none select-none">
                              {tRoom("tagDisabled")}
                            </span>
                          )}
                          {!isBotDisabled && isProviderError && (
                            <span className="text-[10px] font-bold rounded px-1.5 py-0.5 leading-none select-none border" style={{ color: "#f59e0b", borderColor: "#f59e0b66", backgroundColor: "#f59e0b1a" }}>
                              {tRoom("tagProviderError")}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-text-muted truncate mt-0.5 font-theme-mono">
                          @{bot.nickname} · {bot.config.model || "gpt-4o-mini"} · {activationLabel}
                        </div>
                      </div>
                      {isHost && (
                        <button onClick={async () => { await triggerBotAction(roomId, bot.id); router.refresh(); }}
                          title={t("triggerManual")} aria-label={t("triggerManual")}
                          className="flex items-center justify-center w-9 h-9 rounded-theme bg-accent/10 text-accent hover:bg-accent/20 transition cursor-pointer shrink-0">
                          <Icons.Zap className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => startEdit(bot)} title={t("edit")} aria-label={t("edit")}
                        className="flex items-center justify-center w-9 h-9 rounded-theme text-text-muted hover:text-primary hover:bg-surface-alt transition cursor-pointer shrink-0">
                        <Icons.Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create / Edit form */}
            {isHost && (
              <div className="bg-surface-alt/30 rounded-theme p-5 border border-ai/30 flex flex-col gap-4">
                <h4 className="font-bold text-ai text-base font-theme-display">{editingBot ? t("editBot") : t("createBot")}</h4>

                {presets.length > 0 && (
                  <div>
                    <label className={labelCls}>{t("presetSelect")}</label>
                    <div className="relative">
                      <select value={selectedPresetId} onChange={e => handlePresetChange(e.target.value)}
                        className={`${fieldCls} appearance-none pr-9 cursor-pointer`}>
                        <option value="">{t("manualPreset")}</option>
                        {presets.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                      </select>
                      <Icons.ChevronDown className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Name + nickname */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{t("name")}</label>
                    <input value={botName} onChange={e => setBotName(e.target.value)} placeholder={t("namePlaceholder")} className={fieldCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{t("nickname")}</label>
                    <input value={botNickname} onChange={e => setBotNickname(e.target.value)} placeholder={t("nicknamePlaceholder")} className={`${fieldCls} font-theme-mono`} />
                  </div>
                </div>

                {/* Avatar color */}
                <div>
                  <label className={labelCls}>{tChar("avatarColor")}</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {PRESET_AVATAR_COLORS.map(preset => {
                      const sel = botColor.toLowerCase() === preset.hex.toLowerCase();
                      return (
                        <button key={preset.hex} type="button" onClick={() => setBotColor(preset.hex)} title={preset.name}
                          className={`w-9 h-9 rounded-theme transition cursor-pointer relative ${sel ? "ring-2 ring-offset-2 ring-offset-surface ring-text" : "hover:scale-105"}`}
                          style={{ backgroundColor: preset.hex }}>
                          {sel && (
                            <span className="absolute inset-0 flex items-center justify-center" style={{ color: preset.text }}>
                              <Icons.Check className="w-4 h-4" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <div className="flex items-center gap-1.5 ml-1">
                      <input type="color" value={botColor.startsWith("#") && botColor.length === 7 ? botColor : "#6366f1"}
                        onChange={e => setBotColor(e.target.value)}
                        className="w-9 h-9 border-0 p-0 rounded-theme cursor-pointer bg-transparent outline-none overflow-hidden" />
                      <input type="text" value={botColor} onChange={e => { if (e.target.value.length <= 7) setBotColor(e.target.value); }}
                        placeholder="#HEX" className="w-20 px-2 py-1.5 border border-input-border bg-input-bg rounded-theme text-xs text-text font-theme-mono outline-none" />
                    </div>
                  </div>
                </div>

                {/* System prompt */}
                <div>
                  <label className={labelCls}>{t("prompt")}</label>
                  <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder={t("promptPlaceholder")} rows={4}
                    disabled={!allowEditPrompt}
                    className={`${fieldCls} resize-none leading-relaxed ${!allowEditPrompt ? "opacity-60 cursor-not-allowed" : ""}`} />
                </div>

                {/* AI provider */}
                {providers.length > 0 && (
                  <div>
                    <label className={labelCls}>AI Provider</label>
                    <div className="relative">
                      <select value={providerId || ""} onChange={e => {
                        const pid = parseInt(e.target.value); setProviderId(pid);
                        const p = providers.find(x => x.id === pid); if (p) setModel(p.model || "gpt-4o");
                      }} className={`${fieldCls} appearance-none pr-9 cursor-pointer`}>
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.model}) {p.isShared ? `[${tp("shared")}]` : `[${tp("private")}]`}</option>
                        ))}
                      </select>
                      <Icons.ChevronDown className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    {providerId && <p className="text-xs text-text-dim mt-1.5">{t("modelHint", { model })}</p>}
                  </div>
                )}

                {/* Trigger mode */}
                <div>
                  <label className={labelCls}>{t("activation")}</label>
                  <div className="relative">
                    <select value={activation} onChange={e => setActivation(e.target.value)}
                      className={`${fieldCls} appearance-none pr-9 cursor-pointer`}>
                      <option value="@mention">{t("activationMention")}</option>
                      <option value="manual">{t("activationManual")}</option>
                    </select>
                    <Icons.ChevronDown className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Tools as toggle pills */}
                <div>
                  <label className={labelCls}>{t("tools")}</label>
                  <div className="flex flex-wrap gap-2">
                    {TOOLS.map(tool => {
                      const on = enableTools.includes(tool.key);
                      return (
                        <button key={tool.key} type="button"
                          onClick={() => setEnableTools(on ? enableTools.filter(k => k !== tool.key) : [...enableTools, tool.key])}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                            on ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-text-muted hover:text-text hover:bg-surface-alt"
                          }`}>
                          {t(tool.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  {editingBot && (
                    <button onClick={cancelEdit}
                      className="flex-1 py-3 rounded-theme border border-border text-text-muted hover:text-text hover:bg-surface-alt font-bold text-sm cursor-pointer transition">
                      {tCommon("cancel")}
                    </button>
                  )}
                  <button onClick={editingBot ? handleUpdate : handleCreate} disabled={!botName || !botNickname}
                    className="flex-1 py-3 rounded-theme bg-gradient-to-b from-primary to-primary/85 text-primary-foreground font-bold text-sm transition hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:shadow-none shadow-[var(--theme-glow)]">
                    {editingBot ? t("submitSave") : t("submitCreate")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </>
      )}
    </OverlayShell>
  );
}
