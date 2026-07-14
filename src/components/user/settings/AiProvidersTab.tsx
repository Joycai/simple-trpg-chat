"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Bot, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { getMyProviders, createProvider, updateProvider, deleteProvider } from "@/app/actions/ai-providers";
import { testAiConnection } from "@/app/actions/ai";
import { VendorSelect } from "@/components/shared/VendorSelect";
import { ModelPicker } from "@/components/shared/ModelPicker";
import { COMPAT_VENDOR_ID, getVendor } from "@/lib/provider-presets";

export function AiProvidersTab() {
  const t = useTranslations("admin");
  const ts = useTranslations("userSettings");
  const tp = useTranslations("adminProviders");

  const [providers, setProviders] = useState<Awaited<ReturnType<typeof getMyProviders>>>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providersError, setProvidersError] = useState("");
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [editProviderId, setEditProviderId] = useState<number | null>(null);
  const [provName, setProvName] = useState("");
  const [provEndpoint, setProvEndpoint] = useState("");
  const [provKey, setProvKey] = useState("");
  const [provModel, setProvModel] = useState("gpt-4o");
  const [provMsg, setProvMsg] = useState("");
  const [provSuccess, setProvSuccess] = useState(false);
  const [testing, setTesting] = useState(false);
  const [vendor, setVendor] = useState(COMPAT_VENDOR_ID);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingProviders(true);
    setProvidersError("");
    getMyProviders()
      .then(data => setProviders(data as typeof providers))
      .catch((e: unknown) => {
        setProvidersError(e instanceof Error ? e.message : "Failed to load AI providers");
      })
      .finally(() => setLoadingProviders(false));
  }, []);

  const handleVendorChange = (val: string) => {
    setVendor(val);
    const v = getVendor(val);
    if (v && val !== COMPAT_VENDOR_ID) {
      setProvName(v.name);
      setProvEndpoint(v.endpoint);
      setProvModel(v.models[0]?.id ?? "");
    } else {
      setProvName("");
      setProvEndpoint("");
      setProvModel("");
    }
  };

  const handleTestConnection = async () => {
    if (!provEndpoint.trim() || !provKey.trim()) {
      setProvMsg(tp("msgRequireTestFields"));
      setProvSuccess(false);
      return;
    }
    setTesting(true); setProvMsg(""); setProvSuccess(false);
    try {
      const result = await testAiConnection(provEndpoint.trim(), provKey.trim(), provModel || "gpt-4o");
      if (result.success) {
        setProvMsg(tp("msgConnectOk"));
        setProvSuccess(true);
      } else {
        setProvMsg(result.error || "");
        setProvSuccess(false);
      }
    } catch (e: unknown) {
      setProvMsg(e instanceof Error ? e.message : String(e));
      setProvSuccess(false);
    }
    setTesting(false);
  };

  const handleSaveProvider = async () => {
    if (!provName.trim() || !provEndpoint.trim() || (!editProviderId && !provKey.trim())) {
      setProvMsg(tp("msgRequireFields"));
      setProvSuccess(false);
      return;
    }
    try {
      if (editProviderId) {
        await updateProvider(editProviderId, { name: provName, apiEndpoint: provEndpoint, apiKey: provKey, vendor, model: provModel });
      } else {
        await createProvider({ name: provName, apiEndpoint: provEndpoint, apiKey: provKey, vendor, model: provModel });
      }
      setProvMsg(tp("msgSaved"));
      setProvSuccess(true);
      setShowAddProvider(false); setEditProviderId(null);
      setProvName(""); setProvEndpoint(""); setProvKey(""); setProvModel("gpt-4o");
      const list = await getMyProviders();
      setProviders(list);
    } catch (e: unknown) {
      setProvMsg(e instanceof Error ? e.message : t("saveFailed"));
      setProvSuccess(false);
    }
  };

  const handleDeleteProvider = async (id: number) => {
    try {
      await deleteProvider(id);
      setProviders(providers.filter(p => p.id !== id));
    } catch (e: unknown) {
      setProvMsg(e instanceof Error ? e.message : t("saveFailed"));
      setProvSuccess(false);
    }
  };

  return (
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
        ) : providersError ? (
          <div className="text-center text-danger py-8 text-sm">{providersError}</div>
        ) : (
          providers.filter((p) => (p as { isOwner?: boolean }).isOwner).map((p) => (
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
                      setVendor(p.vendor ?? COMPAT_VENDOR_ID);
                      setProvMsg("");
                      setProvSuccess(false);
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
              setVendor(COMPAT_VENDOR_ID);
              setProvMsg("");
              setProvSuccess(false);
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
                <label className="block text-xs font-semibold text-text-muted">{tp("labelVendor")}</label>
                <VendorSelect value={vendor} onChange={handleVendorChange} t={tp} />
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
                <ModelPicker
                  value={provModel}
                  onChange={setProvModel}
                  vendor={vendor}
                  endpoint={provEndpoint}
                  apiKey={provKey}
                  providerId={editProviderId}
                  t={tp}
                  inputClassName="w-full p-2 bg-bg border border-border rounded-theme text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
              </div>
            </div>

            {provMsg && (
              <p className={`text-xs font-semibold flex items-center gap-1 ${provSuccess ? "text-success" : "text-danger"}`}>
                {provSuccess ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
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
  );
}
