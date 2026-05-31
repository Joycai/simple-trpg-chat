"use client";

import { useState, useEffect } from "react";
import { getHostAiConfig, updateHostAiConfig, testAiConnection, getSystemConfig } from "@/app/actions/ai";
import { useRouter } from "next/navigation";

interface HostAiSettingsProps {
  onClose: () => void;
}

export function HostAiSettings({ onClose }: HostAiSettingsProps) {
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [error, setError] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const enabled = await getSystemConfig("ai_enabled");
        setAiEnabled(enabled === "true");
        if (enabled === "true") {
          const config = await getHostAiConfig();
          if (config) {
            setEndpoint(config.apiEndpoint || "");
            setApiKey(config.apiKey || "");
            setModel(config.model || "gpt-4o-mini");
          }
        }
      } catch { /* */ }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await updateHostAiConfig({ apiEndpoint: endpoint, apiKey, model });
      router.refresh();
      onClose();
    } catch (e: any) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testAiConnection(endpoint, apiKey, model);
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return null;

  if (!aiEnabled) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div
          className="bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-md mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🔒</div>
            <h3 className="font-bold text-text mb-2">AI 功能未开启</h3>
            <p className="text-sm text-text-muted mb-4">
              请联系管理员在系统配置中开启 AI 功能
            </p>
            <button
              onClick={onClose}
              className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-theme font-bold text-sm transition"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-text">🤖 AI 配置</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl leading-none transition">
            ×
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-5">
          {/* Endpoint */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-dim font-medium">API 地址</label>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="p-2.5 border border-input-border bg-input-bg rounded outline-none focus:ring-2 focus:ring-primary/50 text-text text-sm font-mono"
            />
            <p className="text-xs text-text-muted">OpenAI 兼容 API 地址</p>
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-dim font-medium">API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full p-2.5 pr-10 border border-input-border bg-input-bg rounded outline-none focus:ring-2 focus:ring-primary/50 text-text text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text transition"
                title={showKey ? "隐藏" : "显示"}
              >
                {showKey ? "🙈" : "👁️"}
              </button>
            </div>
            <p className="text-xs text-text-muted">
              仅服务端存储，前端只返回掩码（sk-***xxxx）
            </p>
          </div>

          {/* Model */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-dim font-medium">模型</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              className="p-2.5 border border-input-border bg-input-bg rounded outline-none focus:ring-2 focus:ring-primary/50 text-text text-sm"
            />
          </div>

          {/* Connection test */}
          <div className="bg-surface-alt rounded-theme p-4 border border-border">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-text">连接测试</span>
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !endpoint}
                className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-white px-3 py-1.5 rounded text-xs font-bold transition"
              >
                {testing ? "测试中..." : "🔗 测试连接"}
              </button>
            </div>
            {testResult && (
              <div
                className={`text-xs px-3 py-2 rounded ${
                  testResult.success
                    ? "bg-success/10 border border-success/30 text-success"
                    : "bg-danger/10 border border-danger/30 text-danger"
                }`}
              >
                {testResult.success ? "✨ AI 服务握手成功！" : `❌ ${testResult.error}`}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-text text-sm px-3 py-2 rounded">
              ⚠️ {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-6 py-2 rounded-theme font-bold text-sm transition"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
