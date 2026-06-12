"use client";

import { useState, useEffect } from "react";
import { Shield, History, X, Key, Bot, Plus, Trash2, Pencil, BarChart3, Coins } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { changeOwnPassword } from "@/app/admin/actions";
import { getMyLoginHistory } from "@/app/actions/login-history";
import { getMyProviders, createProvider, updateProvider, deleteProvider, getMyPrivateTokenUsages } from "@/app/actions/ai-providers";
import { testAiConnection } from "@/app/actions/ai";
import { setUserLocale } from "@/app/actions/locale";
import { UserLoginHistory } from "@/components/UserLoginHistory";
import { getMyAiPointsInfo } from "@/app/actions/ai-points";

interface UserSettingsPanelProps {
  userName: string;
  userRole: string;
  onClose: () => void;
}

type Tab = "security" | "history" | "ai" | "ai-usage" | "ai-points";

export function UserSettingsPanel({ userName, userRole, onClose }: UserSettingsPanelProps) {
  const t = useTranslations("admin");
  const ts = useTranslations("userSettings");
  const tp = useTranslations("adminProviders");
  const ttu = useTranslations("tokenUsage");
  const locale = useLocale();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("security");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdOk, setPwdOk] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // AI providers
  const [providers, setProviders] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [editProviderId, setEditProviderId] = useState<number | null>(null);
  const [provName, setProvName] = useState("");
  const [provEndpoint, setProvEndpoint] = useState("");
  const [provKey, setProvKey] = useState("");
  const [provModel, setProvModel] = useState("gpt-4o");
  const [provMsg, setProvMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [preset, setPreset] = useState("custom");

  const handlePresetChange = (val: string) => {
    setPreset(val);
    if (val === "openai") {
      setProvName("OpenAI");
      setProvEndpoint("https://api.openai.com/v1");
      setProvModel("gpt-4o");
    } else if (val === "deepseek-flash") {
      setProvName("DeepSeek");
      setProvEndpoint("https://api.deepseek.com");
      setProvModel("deepseek-v4-flash");
    } else if (val === "deepseek-pro") {
      setProvName("DeepSeek");
      setProvEndpoint("https://api.deepseek.com");
      setProvModel("deepseek-v4-pro");
    } else if (val === "custom") {
      setProvName("");
      setProvEndpoint("");
      setProvModel("");
    }
  };
  const [usageRecords, setUsageRecords] = useState<any[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [pointsInfo, setPointsInfo] = useState<any>(null);
  const [loadingPoints, setLoadingPoints] = useState(false);

  const handleTestConnection = async () => {
    if (!provEndpoint.trim() || !provKey.trim()) { setProvMsg(tp("msgRequireTestFields")); return; }
    setTesting(true); setProvMsg("");
    try {
      const result = await testAiConnection(provEndpoint.trim(), provKey.trim(), provModel || "gpt-4o");
      setProvMsg(result.success ? tp("msgConnectOk") : `❌ ${result.error}`);
    } catch (e: any) { setProvMsg(`❌ ${e.message}`); }
    setTesting(false);
  };

  const handleLocaleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value as "zh" | "en";
    await setUserLocale(newLocale);
    window.location.reload();
  };

  useEffect(() => {
    if (tab === "history") {
      setLoadingHistory(true);
      getMyLoginHistory().then(setRecords).catch(() => {}).finally(() => setLoadingHistory(false));
    }
    if (tab === "ai") {
      setLoadingProviders(true);
      getMyProviders().then(setProviders).catch(() => {}).finally(() => setLoadingProviders(false));
    }
    if (tab === "ai-usage") {
      setLoadingUsage(true);
      getMyPrivateTokenUsages().then(setUsageRecords).catch(() => {}).finally(() => setLoadingUsage(false));
    }
    if (tab === "ai-points") {
      setLoadingPoints(true);
      getMyAiPointsInfo().then(setPointsInfo).catch(() => {}).finally(() => setLoadingPoints(false));
    }
  }, [tab]);

  const handleSaveProvider = async () => {
    if (!provName.trim() || !provEndpoint.trim() || (!editProviderId && !provKey.trim())) {
      setProvMsg(tp("msgRequireFields")); return;
    }
    try {
      if (editProviderId) {
        await updateProvider(editProviderId, { name: provName, apiEndpoint: provEndpoint, apiKey: provKey, model: provModel });
      } else {
        await createProvider({ name: provName, apiEndpoint: provEndpoint, apiKey: provKey, model: provModel });
      }
      setProvMsg(tp("msgSaved")); setShowAddProvider(false); setEditProviderId(null);
      setProvName(""); setProvEndpoint(""); setProvKey(""); setProvModel("gpt-4o");
      const list = await getMyProviders();
      setProviders(list);
    } catch (e: any) { setProvMsg(e.message || t("saveFailed")); }
  };

  const handleDeleteProvider = async (id: number) => {
    try { await deleteProvider(id); setProviders(providers.filter(p => p.id !== id)); }
    catch (e: any) { setProvMsg(e.message || t("saveFailed")); }
  };

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) return;
    if (newPwd.length < 3) { setPwdMsg(t("passwordTooShort")); return; }
    try {
      await changeOwnPassword(oldPwd, newPwd);
      setPwdOk(true);
      setPwdMsg(t("passwordResetOk"));
      setOldPwd(""); setNewPwd("");
    } catch (e: any) {
      setPwdMsg(e.message || t("passwordResetFail"));
      setPwdOk(false);
    }
  };

  const roleLabel = userRole === "admin" ? ts("roleAdmin") : userRole === "host" ? ts("roleHost") : ts("rolePlayer");
  const roleColor = userRole === "admin" ? "bg-danger/20 text-danger" : userRole === "host" ? "bg-success/20 text-success" : "bg-primary/20 text-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface border border-border rounded-theme theme-border shadow-2xl w-full max-w-md md:max-w-4xl mx-4 h-[85vh] md:h-[620px] max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="font-bold text-text text-lg">{ts("title")}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text p-1 hover:bg-surface-alt rounded transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info bar + Language switcher */}
        <div className="px-5 py-3 bg-surface-alt/40 border-b border-border flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm border border-primary/20">
              {userName[0]?.toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold text-text flex items-center gap-2">
                {userName}
                <span className={`px-2 py-0.5 rounded-theme text-[9px] font-extrabold tracking-wider uppercase ${roleColor}`}>{roleLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-medium">{ts("language")}:</span>
            <select
              value={locale}
              onChange={handleLocaleChange}
              className="p-1 bg-surface border border-border rounded text-xs text-text outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* Bottom Panel: Navigation + Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Navigation */}
          <div className="flex md:flex-col border-b md:border-b-0 md:border-r border-border overflow-x-auto md:overflow-x-visible md:overflow-y-auto select-none shrink-0 md:w-52 bg-surface-alt/10 py-1.5 md:py-4 px-2 gap-1 scrollbar-none">
            {([
              ["security", Shield, ts("tabSecurity")],
              ["history", History, ts("tabHistory")],
              ["ai", Bot, ts("tabAi")],
              ["ai-usage", BarChart3, ts("tabAiUsage")],
              ["ai-points", Coins, ts("tabAiPoints")],
            ] as const).map(([key, Icon, label]) => {
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs md:text-sm font-medium transition-all duration-150 rounded-theme md:w-full text-left shrink-0 cursor-pointer ${
                    isActive
                      ? "text-primary bg-primary/10 border-b-2 md:border-b-0 md:border-l-4 border-primary font-semibold"
                      : "text-text-muted hover:text-text hover:bg-surface-alt/50"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-text-dim"}`} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Content Pane */}
          <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-surface">
            {tab === "security" && (
              <div className="space-y-4 max-w-md">
                <div>
                  <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
                    <Shield className="w-5 h-5 text-primary" />
                    {ts("tabSecurity")}
                  </h4>
                  <p className="text-xs text-text-muted">{ts("securityDesc")}</p>
                </div>
                <div className="bg-surface-alt border border-border rounded-theme p-4 space-y-4 shadow-sm">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-muted block">{ts("oldPassword")}</label>
                    <input
                      type="password"
                      value={oldPwd}
                      onChange={e => setOldPwd(e.target.value)}
                      placeholder={ts("oldPassword")}
                      className="w-full p-2.5 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-muted block">{ts("newPasswordHint")}</label>
                    <input
                      type="password"
                      value={newPwd}
                      onChange={e => setNewPwd(e.target.value)}
                      placeholder={ts("newPasswordHint")}
                      className="w-full p-2.5 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    />
                  </div>
                  {pwdMsg && (
                    <p className={`text-xs font-semibold ${pwdOk ? "text-success" : "text-danger"}`}>{pwdMsg}</p>
                  )}
                  <button
                    onClick={handleChangePwd}
                    className="w-full bg-primary hover:bg-primary-hover text-white py-2.5 rounded-theme font-bold text-sm transition shadow-sm cursor-pointer"
                  >
                    {ts("confirmUpdate")}
                  </button>
                </div>
              </div>
            )}

            {tab === "history" && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
                    <History className="w-5 h-5 text-primary" />
                    {ts("tabHistory")}
                  </h4>
                  <p className="text-xs text-text-muted">{ts("emptyHistory") ? "你的账号最近登录记录" : ""}</p>
                </div>
                {loadingHistory ? (
                  <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
                ) : (
                  <div className="bg-surface-alt/30 border border-border rounded-theme p-3">
                    <UserLoginHistory records={records} />
                  </div>
                )}
              </div>
            )}

            {tab === "ai" && (
              <div className="space-y-4 max-w-2xl">
                <div>
                  <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
                    <Bot className="w-5 h-5 text-primary" />
                    {ts("tabAi")}
                  </h4>
                  <p className="text-xs text-text-muted">{ts("aiDesc")}</p>
                </div>

                <div className="space-y-3">
                  {loadingProviders ? (
                    <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
                  ) : (
                    providers.filter((p: any) => p.isOwner).map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3.5 bg-surface-alt rounded-theme border border-border hover:border-primary/40 transition">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-text">{p.name}</div>
                          <div className="text-xs text-text-muted truncate mt-0.5">{p.model} · {p.apiEndpoint}</div>
                          <div className="text-xs text-text-dim font-mono mt-1">{p.apiKeyEncrypted}</div>
                        </div>
                        {p.isOwner && (
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            <button
                              onClick={() => {
                                setEditProviderId(p.id);
                                setProvName(p.name);
                                setProvEndpoint(p.apiEndpoint);
                                setProvModel(p.model);
                                setProvKey("");
                                setPreset("custom");
                                setShowAddProvider(true);
                              }}
                              className="p-1.5 text-text-muted hover:text-text hover:bg-surface-alt rounded transition cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProvider(p.id)}
                              className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {!showAddProvider ? (
                    <button
                      onClick={() => {
                        setEditProviderId(null);
                        setProvName("");
                        setProvEndpoint("");
                        setProvKey("");
                        setProvModel("gpt-4o");
                        setPreset("custom");
                        setShowAddProvider(true);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-border rounded-theme text-sm text-text-muted hover:text-text hover:border-primary transition font-semibold cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> {tp("addProvider")}
                    </button>
                  ) : (
                    <div className="bg-surface-alt rounded-theme border border-border p-4 space-y-3.5 shadow-sm">
                      <p className="text-xs font-bold text-text uppercase tracking-wider">{editProviderId ? tp("editTitle") : tp("newTitle")}</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-text-muted">{tp("presetLabel")}</label>
                          <select
                            value={preset}
                            onChange={e => handlePresetChange(e.target.value)}
                            className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                          >
                            <option value="custom">{tp("presetCustom")}</option>
                            <option value="openai">OpenAI</option>
                            <option value="deepseek-flash">DeepSeek (deepseek-v4-flash)</option>
                            <option value="deepseek-pro">DeepSeek (deepseek-v4-pro)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-text-muted">Name</label>
                          <input
                            value={provName}
                            onChange={e => setProvName(e.target.value)}
                            placeholder={tp("namePlaceholder")}
                            className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-text-muted">API Endpoint</label>
                        <input
                          value={provEndpoint}
                          onChange={e => setProvEndpoint(e.target.value)}
                          placeholder={tp("urlPlaceholder")}
                          className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-text-muted">API Key</label>
                          <input
                            value={provKey}
                            type="password"
                            onChange={e => setProvKey(e.target.value)}
                            placeholder={editProviderId ? tp("keyPlaceholderEdit") : tp("keyPlaceholderNew")}
                            className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-text-muted">Model</label>
                          <input
                            value={provModel}
                            onChange={e => setProvModel(e.target.value)}
                            placeholder={tp("modelPlaceholder")}
                            className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                          />
                        </div>
                      </div>

                      {provMsg && (
                        <p className={`text-xs font-semibold ${provMsg === tp("msgSaved") || provMsg === tp("msgConnectOk") ? "text-success" : "text-danger"}`}>
                          {provMsg}
                        </p>
                      )}

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleTestConnection}
                          disabled={testing}
                          className="py-2 px-4 bg-bg border border-border text-text-muted rounded-theme text-sm hover:text-text disabled:opacity-50 font-semibold transition cursor-pointer"
                        >
                          {testing ? tp("btnTesting") : tp("btnTest")}
                        </button>
                        <button
                          onClick={handleSaveProvider}
                          className="flex-1 py-2 bg-primary hover:bg-primary-hover text-white rounded-theme text-sm font-bold shadow-sm transition cursor-pointer"
                        >
                          {tp("btnSave")}
                        </button>
                        <button
                          onClick={() => {
                            setShowAddProvider(false);
                            setProvMsg("");
                          }}
                          className="py-2 px-4 bg-bg border border-border text-text-muted rounded-theme text-sm hover:text-text font-semibold transition cursor-pointer"
                        >
                          {tp("btnCancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "ai-usage" && (
              <div className="space-y-4 max-w-3xl">
                <div>
                  <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    {ts("tabAiUsage")}
                  </h4>
                  <p className="text-xs text-text-muted">
                    私有大模型提供商的 Token 消耗量统计（按每日聚合）
                  </p>
                </div>

                {loadingUsage ? (
                  <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
                ) : usageRecords.length > 0 ? (
                  <div className="space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-3 bg-surface-alt/40 p-4 rounded-theme border border-border text-center shadow-sm">
                      <div>
                        <div className="text-[10px] text-text-dim uppercase font-bold tracking-wider">{ttu("thInput")}</div>
                        <div className="text-sm font-extrabold text-text mt-1">
                          {usageRecords.reduce((acc, r) => acc + r.inputTokens, 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-success uppercase font-bold tracking-wider">{ttu("thCached")}</div>
                        <div className="text-sm font-extrabold text-success mt-1">
                          {usageRecords.reduce((acc, r) => acc + r.cachedInputTokens, 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-accent uppercase font-bold tracking-wider">{ttu("thOutput")}</div>
                        <div className="text-sm font-extrabold text-text mt-1">
                          {usageRecords.reduce((acc, r) => acc + r.outputTokens, 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Detailed list */}
                    <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                      {usageRecords.map((r) => {
                        const total = r.inputTokens + r.outputTokens;
                        return (
                          <div key={r.id} className="p-3 bg-surface-alt/25 rounded-theme border border-border flex flex-col gap-1.5 text-xs hover:border-primary/25 transition">
                            <div className="flex justify-between items-center font-semibold text-text">
                              <span className="font-theme-mono text-[11px] bg-surface-alt/70 px-1.5 py-0.5 rounded border border-border/50">{r.day}</span>
                              <span className="text-text-muted truncate max-w-[200px]">{r.providerName} ({r.model})</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2 mt-1 text-text-dim text-[10px] font-theme-mono border-t border-border/30 pt-1.5">
                              <div>{ttu("thInput")}: <span className="text-text font-semibold">{r.inputTokens}</span></div>
                              <div>{ttu("thCached")}: <span className="text-success font-semibold">{r.cachedInputTokens || "-"}</span></div>
                              <div>{ttu("thOutput")}: <span className="text-text font-semibold">{r.outputTokens}</span></div>
                              <div className="text-right text-primary font-bold">{ttu("thTotal")}: {total}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-text-dim py-8 text-sm">{ts("emptyProvidersUsage")}</div>
                )}
              </div>
            )}

            {tab === "ai-points" && (
              <div className="space-y-4 max-w-3xl">
                <div>
                  <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
                    <Coins className="w-5 h-5 text-primary" />
                    {ts("tabAiPoints")}
                  </h4>
                  <p className="text-xs text-text-muted">{ts("aiPointsDesc")}</p>
                </div>

                {loadingPoints ? (
                  <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
                ) : pointsInfo ? (
                  <div className="space-y-4">
                    {/* Balance Card */}
                    <div className="bg-primary/5 border border-primary/20 rounded-theme p-4.5 text-center shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
                      <div className="text-xs text-text-muted font-bold mb-1 flex items-center justify-center gap-1.5 relative z-10">
                        <Coins className="w-4 h-4 text-primary" /> {ts("currentBalance")}
                      </div>
                      <div className="text-3xl font-black text-primary relative z-10 tracking-tight">
                        {userRole === "admin" ? ts("unlimitedPoints") : `${pointsInfo.balance.toFixed(4)}`}
                      </div>
                    </div>

                    {/* Two Column Layout on larger screen */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Left col: Daily points usage */}
                      <div className="space-y-2">
                        <h5 className="text-xs font-bold text-text flex items-center gap-1.5 border-b border-border pb-1.5">
                          <BarChart3 className="w-3.5 h-3.5 text-text-dim" /> {ts("dailyPointUsage")}
                        </h5>
                        {pointsInfo.dailyUsage.length > 0 ? (
                          <div className="space-y-1.5 max-h-[30vh] overflow-y-auto pr-1">
                            {pointsInfo.dailyUsage.map((u: any) => (
                              <div key={u.day} className="flex justify-between items-center bg-surface-alt/30 p-2 rounded-theme border border-border text-xs font-theme-mono">
                                <span className="font-mono text-text-muted">{u.day}</span>
                                <span className="font-bold text-text">{u.points.toFixed(4)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-text-dim py-6 text-xs bg-surface-alt/10 rounded-theme border border-dashed border-border">{ts("emptyPointsHistory")}</div>
                        )}
                      </div>

                      {/* Right col: Balance Change History Log */}
                      <div className="space-y-2">
                        <h5 className="text-xs font-bold text-text flex items-center gap-1.5 border-b border-border pb-1.5">
                          <History className="w-3.5 h-3.5 text-text-dim" /> {ts("pointsHistory")}
                        </h5>
                        {pointsInfo.logs.length > 0 ? (
                          <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                            {pointsInfo.logs.map((log: any) => {
                              const isNegative = log.amount < 0;
                              const amountStr = isNegative ? `${log.amount.toFixed(4)}` : `+${log.amount.toFixed(4)}`;
                              const amountColor = isNegative ? "text-danger" : "text-success";
                              
                              const localTime = new Date(log.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
                                month: "numeric",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              });

                              return (
                                <div key={log.id} className="p-2.5 bg-surface-alt/30 rounded-theme border border-border flex flex-col gap-1 text-xs hover:border-primary/20 transition">
                                  <div className="flex justify-between items-center">
                                    <span className="text-text-dim text-[10px]">{localTime}</span>
                                    <span className={`font-bold font-theme-mono ${amountColor}`}>{amountStr}</span>
                                  </div>
                                  <div className="text-text font-medium leading-tight">{log.description}</div>
                                  <div className="flex justify-between text-[9px] text-text-dim mt-0.5 font-theme-mono border-t border-border/20 pt-1">
                                    <span>
                                      {ts("thChangeType")}: {log.type === "usage" ? ts("typeUsage") : ts("typeAdmin")}
                                    </span>
                                    <span>
                                      {ts("thBalanceAfter")}: {log.afterPoints.toFixed(4)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center text-text-dim py-6 text-xs bg-surface-alt/10 rounded-theme border border-dashed border-border">{ts("emptyPointsHistory")}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
