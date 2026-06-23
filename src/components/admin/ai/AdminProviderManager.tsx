"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Globe, Eye, EyeOff, X, Check } from "lucide-react";
import { getAllProviders, createProvider, updateProvider, deleteProvider } from "@/app/actions/ai-providers";
import { testAiConnection } from "@/app/actions/ai";
import { useTranslations } from "next-intl";
import { OverlayShell } from "@/components/shared/OverlayShell";

export function AdminProviderManager() {
  const tp = useTranslations("adminProviders");

  const [providers, setProviders] = useState<Awaited<ReturnType<typeof getAllProviders>>>([]);
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
  const [showKey, setShowKey] = useState(false);
  const [preset, setPreset] = useState("custom");
  const [tokenRateInput, setTokenRateInput] = useState("0");
  const [tokenRateCached, setTokenRateCached] = useState("0");
  const [tokenRateOutput, setTokenRateOutput] = useState("0");

  const handlePresetChange = (val: string) => {
    setPreset(val);
    if (val === "openai") {
      setName("OpenAI");
      setEndpoint("https://api.openai.com/v1");
      setModel("gpt-4o");
      setTokenRateInput("0.15");
      setTokenRateCached("0.075");
      setTokenRateOutput("0.60");
    } else if (val === "deepseek-flash") {
      setName("DeepSeek");
      setEndpoint("https://api.deepseek.com");
      setModel("deepseek-v4-flash");
      setTokenRateInput("0.015");
      setTokenRateCached("0.005");
      setTokenRateOutput("0.06");
    } else if (val === "deepseek-pro") {
      setName("DeepSeek");
      setEndpoint("https://api.deepseek.com");
      setModel("deepseek-v4-pro");
      setTokenRateInput("0.15");
      setTokenRateCached("0.075");
      setTokenRateOutput("0.60");
    } else if (val === "custom") {
      setName("");
      setEndpoint("");
      setModel("");
      setTokenRateInput("0");
      setTokenRateCached("0");
      setTokenRateOutput("0");
    }
  };

  const load = async () => {
    setLoading(true);
    try { setProviders(await getAllProviders()); } catch {}
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const handleSave = async (close: () => void) => {
    if (!name.trim() || !endpoint.trim() || (!editId && !key.trim())) {
      setMsg(tp("msgRequireFields")); return;
    }
    const rates = {
      tokenRateInput: parseFloat(tokenRateInput) || 0,
      tokenRateCached: parseFloat(tokenRateCached) || 0,
      tokenRateOutput: parseFloat(tokenRateOutput) || 0,
    };
    let result;
    if (editId) {
      result = await updateProvider(editId, { name, apiEndpoint: endpoint, apiKey: key || undefined, model, isShared, ...rates });
    } else {
      result = await createProvider({ name, apiEndpoint: endpoint, apiKey: key, model, isShared, ...rates });
    }
    if (result && "error" in result) {
      setMsg(result.error);
      return;
    }
    setMsg(tp("msgSaved")); close(); setEditId(null);
    setName(""); setEndpoint(""); setKey(""); setModel("gpt-4o"); setIsShared(false);
    setTokenRateInput("0"); setTokenRateCached("0"); setTokenRateOutput("0");
    await load();
  };

  const openCreate = () => {
    setEditId(null); setName(""); setEndpoint(""); setKey(""); setModel("gpt-4o"); setIsShared(false);
    setTokenRateInput("0"); setTokenRateCached("0"); setTokenRateOutput("0"); setPreset("custom"); setMsg("");
    setShowForm(true);
  };

  // First two letters of the provider name as a compact avatar (e.g. OpenAI → OP).
  const initials = (n: string) => n.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "AI";

  return (
    <section className="bg-surface theme-border border border-border rounded-theme shadow-lg p-5 flex flex-col gap-4 font-theme">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-text text-lg font-theme-display">{tp("sectionTitle")}</h3>
        {!showForm && (
          <button onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-theme text-sm font-bold border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition cursor-pointer">
            <Plus className="w-4 h-4" /> {tp("addProvider")}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-text-dim py-4 text-sm">{tp("loading")}</div>
      ) : providers.length === 0 && !showForm ? (
        <div className="text-center text-text-dim py-6 text-sm">{tp("empty")}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-surface-alt/40 rounded-theme border border-border">
              <span className="w-10 h-10 rounded-theme bg-ai/10 text-ai flex items-center justify-center text-xs font-bold font-theme-mono shrink-0">
                {initials(p.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-text truncate">{p.name}</div>
                <div className="text-xs text-text-muted truncate font-theme-mono">{p.model} · sk-••••{p.apiKeyEncrypted.slice(-4)}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" /> {tp("statusNormal")}
                </span>
                {p.isShared && (
                  <span className="text-[11px] bg-accent/10 text-accent px-2 py-1 rounded-theme inline-flex items-center gap-1 font-medium">
                    <Globe className="w-3 h-3" /> {tp("shared")}
                  </span>
                )}
                <button onClick={() => {
                  setEditId(p.id);
                  setName(p.name);
                  setEndpoint(p.apiEndpoint);
                  setModel(p.model);
                  setIsShared(!!p.isShared);
                  setTokenRateInput(String(p.tokenRateInput ?? 0));
                  setTokenRateCached(String(p.tokenRateCached ?? 0));
                  setTokenRateOutput(String(p.tokenRateOutput ?? 0));
                  setKey("");
                  setPreset("custom");
                  setMsg("");
                  setShowForm(true);
                }}
                  className="text-sm font-medium text-primary hover:text-primary-hover transition cursor-pointer">{tp("btnEdit")}</button>
                <button onClick={async () => { try { await deleteProvider(p.id); await load(); } catch {} }}
                  className="text-sm font-medium text-danger hover:text-danger/80 transition cursor-pointer">{tp("btnDelete")}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && createPortal(
        <OverlayShell
          onClose={() => { setShowForm(false); setMsg(""); }}
          rootClassName="p-4"
          panelClassName="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        >
          {(close) => (
            <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
              <h3 className="font-bold text-text text-lg font-theme-display flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent" />
                {editId ? tp("editTitle") : tp("providerModalTitle")}
              </h3>
              <button onClick={close} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* Quick preset */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-dim font-medium">{tp("labelPreset")}</label>
                <select
                  value={preset}
                  onChange={e => handlePresetChange(e.target.value)}
                  className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary"
                >
                  <option value="custom">{tp("presetCustom")}</option>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek-flash">DeepSeek (deepseek-v4-flash)</option>
                  <option value="deepseek-pro">DeepSeek (deepseek-v4-pro)</option>
                </select>
              </div>

              {/* Name + Model */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">{tp("labelName")}</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder={tp("namePlaceholder")}
                    className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">{tp("labelModel")}</label>
                  <input value={model} onChange={e => setModel(e.target.value)} placeholder={tp("modelPlaceholder")}
                    className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm font-theme-mono placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
                </div>
              </div>

              {/* Endpoint */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-dim font-medium">{tp("labelEndpoint")}</label>
                <input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder={tp("urlPlaceholder")}
                  className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm font-theme-mono placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
              </div>

              {/* API Key */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-dim font-medium">{tp("labelKey")}</label>
                <div className="relative">
                  <input value={key} type={showKey ? "text" : "password"} onChange={e => setKey(e.target.value)}
                    placeholder={editId ? tp("keyPlaceholderEdit") : tp("keyPlaceholderNew")}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm font-theme-mono placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
                  <button type="button" onClick={() => setShowKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text transition cursor-pointer">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Share toggle box */}
              <label className={`flex items-center gap-3 px-3.5 py-3 rounded-theme border cursor-pointer transition ${isShared ? "border-accent/50 bg-accent/10" : "border-input-border bg-input-bg hover:bg-surface-alt"}`}>
                <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} className="sr-only" />
                <span className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition ${isShared ? "bg-accent border-accent text-accent-foreground" : "border-input-border"}`}>
                  {isShared && <Check className="w-3.5 h-3.5" />}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text">
                  <Globe className="w-4 h-4 text-accent" /> {tp("shareAllUsers")}
                </span>
              </label>

              {/* Quota rates */}
              {isShared && (
                <div className="rounded-theme border border-border bg-surface-alt/40 p-4 flex flex-col gap-3">
                  <p className="text-[11px] font-bold text-accent uppercase tracking-wider">{tp("quotaTitle")}</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-text-dim font-medium">{tp("rateInputShort")}</label>
                      <input type="number" step="0.000001" min="0" value={tokenRateInput} onChange={e => setTokenRateInput(e.target.value)} placeholder="0.0001"
                        className="px-2.5 py-2 bg-input-bg border border-input-border rounded-theme text-text text-sm font-theme-mono text-center outline-none transition focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-text-dim font-medium">{tp("rateCachedShort")}</label>
                      <input type="number" step="0.000001" min="0" value={tokenRateCached} onChange={e => setTokenRateCached(e.target.value)} placeholder="0.00005"
                        className="px-2.5 py-2 bg-input-bg border border-input-border rounded-theme text-text text-sm font-theme-mono text-center outline-none transition focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-text-dim font-medium">{tp("rateOutputShort")}</label>
                      <input type="number" step="0.000001" min="0" value={tokenRateOutput} onChange={e => setTokenRateOutput(e.target.value)} placeholder="0.0002"
                        className="px-2.5 py-2 bg-input-bg border border-input-border rounded-theme text-text text-sm font-theme-mono text-center outline-none transition focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent" />
                    </div>
                  </div>
                </div>
              )}

              {msg && <p className={`text-xs ${msg === tp("msgSaved") || msg === tp("msgConnectOk") ? "text-success" : "text-danger"}`}>{msg}</p>}

              {/* Footer */}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={async () => {
                  if (!endpoint.trim() || !key.trim()) { setMsg(tp("msgRequireTestFields")); return; }
                  setTesting(true); setMsg("");
                  try {
                    const r = await testAiConnection(endpoint.trim(), key.trim(), model || "gpt-4o");
                    setMsg(r.success ? tp("msgConnectOk") : `❌ ${r.error}`);
                  } catch (e: unknown) { setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`); }
                  setTesting(false);
                }} disabled={testing}
                  className="px-4 py-2.5 rounded-theme border border-border text-text-muted hover:text-text hover:bg-surface-alt disabled:opacity-50 text-sm font-medium transition cursor-pointer shrink-0">
                  {testing ? tp("btnTesting") : tp("btnTestConn")}
                </button>
                <button onClick={() => handleSave(close)}
                  className="flex-1 py-2.5 bg-gradient-to-b from-primary to-primary/85 hover:brightness-110 text-primary-foreground rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">
                  {tp("btnSave")}
                </button>
              </div>
            </div>
            </>
          )}
        </OverlayShell>,
        document.body
      )}
    </section>
  );
}
