"use client";

import { useState, useEffect } from "react";
import { Shield, History, X, Key, Bot, Plus, Trash2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { changeOwnPassword } from "@/app/admin/actions";
import { getMyLoginHistory } from "@/app/actions/login-history";
import { getMyProviders, createProvider, updateProvider, deleteProvider } from "@/app/actions/ai-providers";
import { UserLoginHistory } from "@/components/UserLoginHistory";

interface UserSettingsPanelProps {
  userName: string;
  userRole: string;
  onClose: () => void;
}

type Tab = "security" | "history" | "ai";

export function UserSettingsPanel({ userName, userRole, onClose }: UserSettingsPanelProps) {
  const t = useTranslations("admin");
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

  useEffect(() => {
    if (tab === "history") {
      setLoadingHistory(true);
      getMyLoginHistory().then(setRecords).catch(() => {}).finally(() => setLoadingHistory(false));
    }
    if (tab === "ai") {
      setLoadingProviders(true);
      getMyProviders().then(setProviders).catch(() => {}).finally(() => setLoadingProviders(false));
    }
  }, [tab]);

  const handleSaveProvider = async () => {
    if (!provName.trim() || !provEndpoint.trim() || !provKey.trim()) {
      setProvMsg("请填写名称、API地址和密钥"); return;
    }
    try {
      if (editProviderId) {
        await updateProvider(editProviderId, { name: provName, apiEndpoint: provEndpoint, apiKey: provKey, model: provModel });
      } else {
        await createProvider({ name: provName, apiEndpoint: provEndpoint, apiKey: provKey, model: provModel });
      }
      setProvMsg("已保存"); setShowAddProvider(false); setEditProviderId(null);
      setProvName(""); setProvEndpoint(""); setProvKey(""); setProvModel("gpt-4o");
      const list = await getMyProviders();
      setProviders(list);
    } catch (e: any) { setProvMsg(e.message || "保存失败"); }
  };

  const handleDeleteProvider = async (id: number) => {
    try { await deleteProvider(id); setProviders(providers.filter(p => p.id !== id)); }
    catch (e: any) { setProvMsg(e.message || "删除失败"); }
  };

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) return;
    if (newPwd.length < 3) { setPwdMsg(t("passwordTooShort") || "密码至少3位"); return; }
    try {
      await changeOwnPassword(oldPwd, newPwd);
      setPwdOk(true);
      setPwdMsg(t("passwordResetOk") || "密码已重置");
      setOldPwd(""); setNewPwd("");
    } catch (e: any) {
      setPwdMsg(e.message || t("passwordResetFail") || "修改失败");
      setPwdOk(false);
    }
  };

  const roleLabel = userRole === "admin" ? "Admin" : userRole === "host" ? "Host" : "Player";
  const roleColor = userRole === "admin" ? "bg-danger/20 text-danger" : userRole === "host" ? "bg-success/20 text-success" : "bg-primary/20 text-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface border border-border rounded-theme theme-border shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold text-text text-lg">个人设置</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info bar */}
        <div className="px-5 py-3 bg-surface-alt border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
            {userName[0]?.toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-text">{userName}</div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${roleColor}`}>{roleLabel}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {([
            ["security", Shield, "账号安全"],
            ["history", History, "登录日志"],
            ["ai", Bot, "AI 配置"],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                tab === key ? "text-primary border-b-2 border-primary" : "text-text-muted hover:text-text"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "security" && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">修改你的登录密码。修改后需要重新登录。</p>
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                placeholder="当前密码" className="w-full p-2.5 bg-bg border border-border rounded-lg text-text text-sm outline-none focus:ring-2 focus:ring-primary" />
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                placeholder="新密码（至少3位）" className="w-full p-2.5 bg-bg border border-border rounded-lg text-text text-sm outline-none focus:ring-2 focus:ring-primary" />
              {pwdMsg && (
                <p className={`text-xs ${pwdOk ? "text-success" : "text-danger"}`}>{pwdMsg}</p>
              )}
              <button onClick={handleChangePwd}
                className="w-full bg-primary hover:bg-primary-hover text-white py-2.5 rounded-lg font-bold text-sm transition">
                确认修改
              </button>
            </div>
          )}

          {tab === "history" && (
            loadingHistory ? (
              <div className="text-center text-text-dim py-8 text-sm">加载中...</div>
            ) : (
              <UserLoginHistory records={records} />
            )
          )}

          {tab === "ai" && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">管理你的 AI 模型提供商，Bot 创建时可以从中选择。</p>

              {loadingProviders ? (
                <div className="text-center text-text-dim py-8 text-sm">加载中...</div>
              ) : (
                providers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-surface-alt rounded-lg border border-border">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text">{p.name}</span>
                        {p.isShared && <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">🌍 共享</span>}
                        {!p.isOwner && !p.isShared && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">🔒 私有</span>}
                      </div>
                      <div className="text-xs text-text-muted truncate">{p.model} · {p.apiEndpoint}</div>
                      <div className="text-xs text-text-dim font-mono">{p.apiKeyEncrypted}</div>
                    </div>
                    {p.isOwner && (
                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={() => { setEditProviderId(p.id); setProvName(p.name); setProvEndpoint(p.apiEndpoint); setProvModel(p.model); setProvKey(""); setShowAddProvider(true); }}
                        className="p-1 text-text-muted hover:text-text"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDeleteProvider(p.id)}
                        className="p-1 text-text-muted hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    )}
                  </div>
                ))
              )}

              {!showAddProvider ? (
                <button onClick={() => { setEditProviderId(null); setProvName(""); setProvEndpoint(""); setProvKey(""); setProvModel("gpt-4o"); setShowAddProvider(true); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-primary/50 transition">
                  <Plus className="w-4 h-4" /> 添加 Provider
                </button>
              ) : (
                <div className="bg-surface-alt rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-text">{editProviderId ? "编辑" : "新增"} Provider</p>
                  <input value={provName} onChange={e => setProvName(e.target.value)} placeholder="名称（如：我的 DeepSeek）" className="w-full p-2 bg-bg border border-border rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
                  <input value={provEndpoint} onChange={e => setProvEndpoint(e.target.value)} placeholder="API 地址（如：https://api.deepseek.com/v1）" className="w-full p-2 bg-bg border border-border rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
                  <input value={provKey} type="password" onChange={e => setProvKey(e.target.value)} placeholder={editProviderId ? "新密钥（留空不修改）" : "API Key"} className="w-full p-2 bg-bg border border-border rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
                  <input value={provModel} onChange={e => setProvModel(e.target.value)} placeholder="模型（如：gpt-4o）" className="w-full p-2 bg-bg border border-border rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
                  {provMsg && <p className={`text-xs ${provMsg === "已保存" ? "text-success" : "text-danger"}`}>{provMsg}</p>}
                  <div className="flex gap-2">
                    <button onClick={handleSaveProvider} className="flex-1 py-1.5 bg-primary hover:bg-primary-hover text-white rounded text-sm font-medium">保存</button>
                    <button onClick={() => { setShowAddProvider(false); setProvMsg(""); }} className="flex-1 py-1.5 bg-surface-alt text-text-muted rounded text-sm">取消</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
