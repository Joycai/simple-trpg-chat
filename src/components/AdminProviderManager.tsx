"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Globe } from "lucide-react";
import { getAllProviders, createProvider, updateProvider, deleteProvider } from "@/app/actions/ai-providers";
import { testAiConnection } from "@/app/actions/ai";

export function AdminProviderManager() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [isShared, setIsShared] = useState(false);
  const [msg, setMsg] = useState("");
  const [testing, setTesting] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setProviders(await getAllProviders()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!name.trim() || !endpoint.trim() || (!editId && !key.trim())) {
      setMsg("请填写名称、API地址和密钥"); return;
    }
    try {
      if (editId) {
        await updateProvider(editId, { name, apiEndpoint: endpoint, apiKey: key || undefined, model, isShared });
      } else {
        await createProvider({ name, apiEndpoint: endpoint, apiKey: key, model, isShared });
      }
      setMsg("已保存"); setShowForm(false); setEditId(null);
      setName(""); setEndpoint(""); setKey(""); setModel("gpt-4o"); setIsShared(false);
      await load();
    } catch (e: any) { setMsg(e.message || "保存失败"); }
  };

  return (
    <section className="bg-surface p-5 rounded-xl theme-border border border-border shadow-lg">
      <h3 className="font-bold text-text mb-3 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-accent" />
        AI Provider 管理
      </h3>
      <p className="text-xs text-text-muted mb-3">管理 AI 模型提供商。开启共享后，所有 Host 均可使用该 Provider。</p>

      {loading ? (
        <div className="text-center text-text-dim py-4 text-sm">加载中...</div>
      ) : (
        <div className="space-y-2 mb-3">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-surface-alt rounded-lg border border-border">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{p.name}</span>
                  {p.isShared && <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded flex items-center gap-0.5"><Globe className="w-3 h-3" /> 共享</span>}
                </div>
                <div className="text-xs text-text-muted truncate">{p.model} · {p.apiEndpoint}</div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={() => { setEditId(p.id); setName(p.name); setEndpoint(p.apiEndpoint); setModel(p.model); setIsShared(!!p.isShared); setKey(""); setShowForm(true); }}
                  className="p-1 text-text-muted hover:text-text"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={async () => { try { await deleteProvider(p.id); await load(); } catch {} }}
                  className="p-1 text-text-muted hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {providers.length === 0 && <div className="text-center text-text-dim py-4 text-sm">暂无 Provider</div>}
        </div>
      )}

      {!showForm ? (
        <button onClick={() => { setEditId(null); setName(""); setEndpoint(""); setKey(""); setModel("gpt-4o"); setIsShared(false); setShowForm(true); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-primary/50 transition">
          <Plus className="w-4 h-4" /> 添加 Provider
        </button>
      ) : (
        <div className="bg-surface-alt rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs font-medium text-text">{editId ? "编辑" : "新增"} Provider</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="名称" className="w-full p-2 bg-bg border border-border rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
          <input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="API 地址" className="w-full p-2 bg-bg border border-border rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
          <input value={key} type="password" onChange={e => setKey(e.target.value)} placeholder={editId ? "新密钥（留空不修改）" : "API Key"} className="w-full p-2 bg-bg border border-border rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
          <input value={model} onChange={e => setModel(e.target.value)} placeholder="模型" className="w-full p-2 bg-bg border border-border rounded text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
          <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
            <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} className="rounded" />
            <Globe className="w-3.5 h-3.5" /> 共享给所有 Host
          </label>
          {msg && <p className={`text-xs ${msg === "已保存" ? "text-success" : "text-danger"}`}>{msg}</p>}
          <div className="flex gap-2">

            <button type="button" onClick={async () => {

              if (!endpoint.trim() || !key.trim()) { setMsg("请填写 API 地址和密钥"); return; }
              setTesting(true); setMsg("");
              try {
                const r = await testAiConnection(endpoint.trim(), key.trim(), model || "gpt-4o");
                setMsg(r.success ? "✨ 连接成功！" : `❌ ${r.error}`);
              } catch (e: any) { setMsg(`❌ ${e.message}`); }
              setTesting(false);
            }} disabled={testing}
              className="py-1.5 px-3 bg-surface-alt text-text-muted rounded text-sm hover:text-text disabled:opacity-50">
              {testing ? "测试中..." : "🔌 测试"}
            </button>
            <button onClick={handleSave} className="flex-1 py-1.5 bg-primary hover:bg-primary-hover text-white rounded text-sm font-medium">保存</button>
            <button onClick={() => { setShowForm(false); setMsg(""); }} className="flex-1 py-1.5 bg-surface-alt text-text-muted rounded text-sm">取消</button>
          </div>
        </div>
      )}
    </section>
  );
}
