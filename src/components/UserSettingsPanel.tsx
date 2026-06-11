"use client";

import { useState, useEffect } from "react";
import { Shield, History, X, Key, Bot, Plus, Trash2, Pencil, BarChart3 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { changeOwnPassword } from "@/app/admin/actions";
import { getMyLoginHistory } from "@/app/actions/login-history";
import { getMyProviders, createProvider, updateProvider, deleteProvider, getMyPrivateTokenUsages } from "@/app/actions/ai-providers";
import { testAiConnection } from "@/app/actions/ai";
import { setUserLocale } from "@/app/actions/locale";
import { UserLoginHistory } from "@/components/UserLoginHistory";

interface UserSettingsPanelProps {
  userName: string;
  userRole: string;
  onClose: () => void;
}

type Tab = "security" | "history" | "ai" | "ai-usage";

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
      <div className="bg-surface border border-border rounded-theme theme-border shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold text-text text-lg">{ts("title")}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info bar + Language switcher */}
        <div className="px-5 py-3 bg-surface-alt border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {userName[0]?.toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium text-text">{userName}</div>
              <span className={`px-2 py-0.5 rounded-theme text-[10px] font-bold uppercase ${roleColor}`}>{roleLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-medium">{ts("language")}:</span>
            <select
              value={locale}
              onChange={handleLocaleChange}
              className="p-1 bg-surface border border-border rounded text-xs text-text outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {([
            ["security", Shield, ts("tabSecurity")],
            ["history", History, ts("tabHistory")],
            ["ai", Bot, ts("tabAi")],
            ["ai-usage", BarChart3, ts("tabAiUsage")],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition-colors ${
                tab === key ? "text-primary border-b-2 border-primary" : "text-text-muted hover:text-text"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "security" && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">{ts("securityDesc")}</p>
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                placeholder={ts("oldPassword")} className="w-full p-2.5 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary" />
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                placeholder={ts("newPasswordHint")} className="w-full p-2.5 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary" />
              {pwdMsg && (
                <p className={`text-xs ${pwdOk ? "text-success" : "text-danger"}`}>{pwdMsg}</p>
              )}
              <button onClick={handleChangePwd}
                className="w-full bg-primary hover:bg-primary-hover text-white py-2.5 rounded-theme font-bold text-sm transition">
                {ts("confirmUpdate")}
              </button>
            </div>
          )}

          {tab === "history" && (
            loadingHistory ? (
              <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
            ) : (
              <UserLoginHistory records={records} />
            )
          )}

          {tab === "ai" && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">{ts("aiDesc")}</p>

              {loadingProviders ? (
                <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
              ) : (
                providers.filter((p: any) => p.isOwner).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-surface-alt rounded-theme border border-border">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-text">{p.name}</div>
                      <div className="text-xs text-text-muted truncate">{p.model} · {p.apiEndpoint}</div>
                      <div className="text-xs text-text-dim font-mono">{p.apiKeyEncrypted}</div>
                    </div>
                    {p.isOwner && (
                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={() => { setEditProviderId(p.id); setProvName(p.name); setProvEndpoint(p.apiEndpoint); setProvModel(p.model); setProvKey(""); setPreset("custom"); setShowAddProvider(true); }}
                        className="p-1 text-text-muted hover:text-text"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDeleteProvider(p.id)}
                        className="p-1 text-text-muted hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    )}
                  </div>
                ))
              )}

              {!showAddProvider ? (
                <button onClick={() => { setEditProviderId(null); setProvName(""); setProvEndpoint(""); setProvKey(""); setProvModel("gpt-4o"); setPreset("custom"); setShowAddProvider(true); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-border rounded-theme text-sm text-text-muted hover:text-text hover:border-primary/50 transition font-medium">
                  <Plus className="w-4 h-4" /> {tp("addProvider")}
                </button>
              ) : (
                <div className="bg-surface-alt rounded-theme border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-text">{editProviderId ? tp("editTitle") : tp("newTitle")}</p>
                  <div>
                    <label className="block text-[10px] text-text-dim mb-1 font-semibold">{tp("presetLabel")}</label>
                    <select
                      value={preset}
                      onChange={e => handlePresetChange(e.target.value)}
                      className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="custom">{tp("presetCustom")}</option>
                      <option value="openai">OpenAI</option>
                      <option value="deepseek-flash">DeepSeek (deepseek-v4-flash)</option>
                      <option value="deepseek-pro">DeepSeek (deepseek-v4-pro)</option>
                    </select>
                  </div>
                  <input value={provName} onChange={e => setProvName(e.target.value)} placeholder={tp("namePlaceholder")} className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
                  <input value={provEndpoint} onChange={e => setProvEndpoint(e.target.value)} placeholder={tp("urlPlaceholder")} className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
                  <input value={provKey} type="password" onChange={e => setProvKey(e.target.value)} placeholder={editProviderId ? tp("keyPlaceholderEdit") : tp("keyPlaceholderNew")} className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
                  <input value={provModel} onChange={e => setProvModel(e.target.value)} placeholder={tp("modelPlaceholder")} className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
                  {provMsg && <p className={`text-xs ${provMsg === tp("msgSaved") ? "text-success" : "text-danger"}`}>{provMsg}</p>}
                  <div className="flex gap-2">
                    <button onClick={handleTestConnection} disabled={testing}
                      className="py-1.5 px-3 bg-surface-alt text-text-muted rounded-theme text-sm hover:text-text disabled:opacity-50 font-medium">
                      {testing ? tp("btnTesting") : tp("btnTest")}
                    </button>
                    <button onClick={handleSaveProvider} className="flex-1 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-theme text-sm font-semibold">{tp("btnSave")}</button>
                    <button onClick={() => { setShowAddProvider(false); setProvMsg(""); }} className="flex-1 py-1.5 bg-surface-alt text-text-muted rounded-theme text-sm font-medium">{tp("btnCancel")}</button>
                  </div>
                </div>
              )}
            </div>
          )}

        {tab === "ai-usage" && (
          loadingUsage ? (
            <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
          ) : usageRecords.length > 0 ? (
            <div className="space-y-4">
              {/* Simple Summary */}
              <div className="grid grid-cols-3 gap-2 bg-surface-alt p-3 rounded-theme border border-border text-center">
                <div>
                  <div className="text-[10px] text-text-dim uppercase font-semibold">{ttu("thInput")}</div>
                  <div className="text-xs font-bold text-text mt-0.5">
                    {usageRecords.reduce((acc, r) => acc + r.inputTokens, 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-success uppercase font-semibold">{ttu("thCached")}</div>
                  <div className="text-xs font-bold text-success mt-0.5">
                    {usageRecords.reduce((acc, r) => acc + r.cachedInputTokens, 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-accent uppercase font-semibold">{ttu("thOutput")}</div>
                  <div className="text-xs font-bold text-text mt-0.5">
                    {usageRecords.reduce((acc, r) => acc + r.outputTokens, 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Detailed list */}
              <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                {usageRecords.map((r) => {
                  const total = r.inputTokens + r.outputTokens;
                  return (
                    <div key={r.id} className="p-3 bg-surface-alt rounded-theme border border-border flex flex-col gap-1 text-xs">
                      <div className="flex justify-between items-center font-medium text-text">
                        <span className="font-theme-mono text-[11px]">{r.day}</span>
                        <span className="text-text-dim truncate max-w-[180px]">{r.providerName} ({r.model})</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 mt-1 text-text-muted text-[10px] font-theme-mono">
                        <div>{ttu("thInput")}: {r.inputTokens}</div>
                        <div>{ttu("thCached")}: {r.cachedInputTokens || "-"}</div>
                        <div>{ttu("thOutput")}: {r.outputTokens}</div>
                        <div className="text-right text-primary font-semibold">{ttu("thTotal")}: {total}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center text-text-dim py-8 text-sm">{ts("emptyProvidersUsage")}</div>
          )
        )}
        </div>
      </div>
    </div>
  );
}
