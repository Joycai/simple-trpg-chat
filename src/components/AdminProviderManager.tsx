"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Globe } from "lucide-react";
import { getAllProviders, createProvider, updateProvider, deleteProvider } from "@/app/actions/ai-providers";
import { testAiConnection } from "@/app/actions/ai";
import { useTranslations } from "next-intl";

export function AdminProviderManager() {
  const tp = useTranslations("adminProviders");
  const t = useTranslations("admin");

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
  const [preset, setPreset] = useState("custom");

  const handlePresetChange = (val: string) => {
    setPreset(val);
    if (val === "openai") {
      setName("OpenAI");
      setEndpoint("https://api.openai.com/v1");
      setModel("gpt-4o");
    } else if (val === "deepseek-flash") {
      setName("DeepSeek");
      setEndpoint("https://api.deepseek.com");
      setModel("deepseek-v4-flash");
    } else if (val === "deepseek-pro") {
      setName("DeepSeek");
      setEndpoint("https://api.deepseek.com");
      setModel("deepseek-v4-pro");
    } else if (val === "custom") {
      setName("");
      setEndpoint("");
      setModel("");
    }
  };

  const load = async () => {
    setLoading(true);
    try { setProviders(await getAllProviders()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!name.trim() || !endpoint.trim() || (!editId && !key.trim())) {
      setMsg(tp("msgRequireFields")); return;
    }
    try {
      if (editId) {
        await updateProvider(editId, { name, apiEndpoint: endpoint, apiKey: key || undefined, model, isShared });
      } else {
        await createProvider({ name, apiEndpoint: endpoint, apiKey: key, model, isShared });
      }
      setMsg(tp("msgSaved")); setShowForm(false); setEditId(null);
      setName(""); setEndpoint(""); setKey(""); setModel("gpt-4o"); setIsShared(false);
      await load();
    } catch (e: any) { setMsg(e.message || t("saveFailed")); }
  };

  return (
    <section className="bg-surface p-5 rounded-theme theme-border border border-border shadow-lg font-theme">
      <h3 className="font-bold text-text mb-3 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-accent" />
        {tp("title")}
      </h3>
      <p className="text-xs text-text-muted mb-3">{tp("description")}</p>

      {loading ? (
        <div className="text-center text-text-dim py-4 text-sm">{tp("loading")}</div>
      ) : (
        <div className="space-y-2 mb-3">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-surface-alt rounded-theme border border-border">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{p.name}</span>
                  {p.isShared && <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-theme flex items-center gap-0.5"><Globe className="w-3 h-3" /> {tp("shared")}</span>}
                </div>
                <div className="text-xs text-text-muted truncate font-theme-mono">{p.model} · {p.apiEndpoint}</div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={() => { setEditId(p.id); setName(p.name); setEndpoint(p.apiEndpoint); setModel(p.model); setIsShared(!!p.isShared); setKey(""); setPreset("custom"); setShowForm(true); }}
                  className="p-1 text-text-muted hover:text-text cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={async () => { try { await deleteProvider(p.id); await load(); } catch {} }}
                  className="p-1 text-text-muted hover:text-danger cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {providers.length === 0 && <div className="text-center text-text-dim py-4 text-sm">{tp("empty")}</div>}
        </div>
      )}

      {!showForm ? (
        <button onClick={() => { setEditId(null); setName(""); setEndpoint(""); setKey(""); setModel("gpt-4o"); setIsShared(false); setPreset("custom"); setShowForm(true); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-border rounded-theme text-sm text-text-muted hover:text-text hover:border-primary/50 transition font-medium cursor-pointer">
          <Plus className="w-4 h-4" /> {tp("addProvider")}
        </button>
      ) : (
        <div className="bg-surface-alt rounded-theme border border-border p-3 space-y-2">
          <p className="text-xs font-medium text-text">{editId ? tp("editTitle") : tp("newTitle")}</p>
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
          <input value={name} onChange={e => setName(e.target.value)} placeholder={tp("namePlaceholder")} className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
          <input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder={tp("urlPlaceholder")} className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
          <input value={key} type="password" onChange={e => setKey(e.target.value)} placeholder={editId ? tp("keyPlaceholderEdit") : tp("keyPlaceholderNew")} className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
          <input value={model} onChange={e => setModel(e.target.value)} placeholder={tp("modelPlaceholder")} className="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-1 focus:ring-primary" />
          <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
            <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} className="rounded font-theme" />
            <Globe className="w-3.5 h-3.5" /> {tp("shareLabel")}
          </label>
          {msg && <p className={`text-xs ${msg === tp("msgSaved") ? "text-success" : "text-danger"}`}>{msg}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={async () => {
              if (!endpoint.trim() || !key.trim()) { setMsg(tp("msgRequireTestFields")); return; }
              setTesting(true); setMsg("");
              try {
                const r = await testAiConnection(endpoint.trim(), key.trim(), model || "gpt-4o");
                setMsg(r.success ? tp("msgConnectOk") : `❌ ${r.error}`);
              } catch (e: any) { setMsg(`❌ ${e.message}`); }
              setTesting(false);
            }} disabled={testing}
              className="py-1.5 px-3 bg-surface-alt text-text-muted rounded-theme text-sm hover:text-text disabled:opacity-50 font-medium cursor-pointer">
              {testing ? tp("btnTesting") : tp("btnTest")}
            </button>
            <button onClick={handleSave} className="flex-1 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-theme text-sm font-semibold cursor-pointer">{tp("btnSave")}</button>
            <button onClick={() => { setShowForm(false); setMsg(""); }} className="flex-1 py-1.5 bg-surface-alt text-text-muted rounded-theme text-sm font-medium cursor-pointer">{tp("btnCancel")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
