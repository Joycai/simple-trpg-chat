"use client";

import { useState, useEffect, useRef } from "react";
import { startTextImportAnalysisAction, cancelTextImportAnalysisAction, batchImportItemsAction } from "@/app/actions/ai-import";
import { getMyProviders } from "@/app/actions/ai-providers";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface AiImportPanelProps {
  roomId: number;
  onClose: () => void;
}

type Step = "input" | "preview" | "done";

interface PreviewItem {
  type: "clue" | "info" | "character" | "item";
  title: string;
  content: string | Record<string, string>;
}

const TYPE_COLORS: Record<string, string> = {
  clue: "bg-accent/10 text-accent border-accent/30",
  info: "bg-primary/10 text-primary border-primary/30",
  character: "bg-success/10 text-success border-success/30",
  item: "bg-warning/10 text-warning border-warning/30",
};

export function AiImportPanel({ roomId, onClose }: AiImportPanelProps) {
  const t = useTranslations("aiImport");
  const tCommon = useTranslations("common");
  const tp = useTranslations("adminProviders");
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [rawText, setRawText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<any[]>([]);
  const [providerId, setProviderId] = useState<number | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getMyProviders().then(list => {
      setProviders(list);
      if (list.length > 0) setProviderId(list[0].id);
    }).catch(() => { /* leave empty; server falls back to first available */ });
  }, []);

  // Clear analyzing state and any pending client-side timeout.
  const finishAnalyzing = () => {
    setAnalyzing(false);
    jobIdRef.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Listen for async analysis results delivered over SSE (re-dispatched by RoomClient).
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!data || data.jobId !== jobIdRef.current) return;
      if (data.success && data.items) {
        setItems(data.items);
        setStep("preview");
      } else if (!data.cancelled) {
        setError(data.error || tCommon("error"));
      }
      finishAnalyzing();
    };
    window.addEventListener("ai-import-result", handler);
    return () => {
      window.removeEventListener("ai-import-result", handler);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [tCommon]);

  const handleAnalyze = async () => {
    if (!rawText.trim()) return;
    setAnalyzing(true);
    setError("");
    try {
      const result = await startTextImportAnalysisAction(roomId, rawText.trim(), providerId ?? undefined);
      if (!result.success || !result.jobId) {
        setError(result.error || tCommon("error"));
        finishAnalyzing();
        return;
      }
      // Result will arrive asynchronously via the "ai-import-result" window event.
      jobIdRef.current = result.jobId;
      // Client-side fallback timeout in case the SSE result never arrives.
      timeoutRef.current = setTimeout(() => {
        if (jobIdRef.current) {
          setError(t("errTimeout"));
          finishAnalyzing();
        }
      }, 90000);
    } catch (e: any) {
      setError(e.message || tCommon("error"));
      finishAnalyzing();
    }
  };

  const handleCancel = () => {
    const jobId = jobIdRef.current;
    if (jobId) {
      cancelTextImportAnalysisAction(roomId, jobId).catch(() => { /* best-effort */ });
    }
    finishAnalyzing();
  };

  const updateItem = (index: number, field: string, value: any) => {
    setItems(prev => {
      const copy = [...prev];
      (copy[index] as any)[field] = value;
      return copy;
    });
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    if (items.length === 0) return;
    setImporting(true);
    try {
      const result = await batchImportItemsAction(roomId, items);
      setImportedCount(result.imported);
      setStep("done");
      router.refresh();
    } catch (e: any) {
      setError(e.message || tCommon("error"));
    } finally {
      setImporting(false);
    }
  };

  const handleBack = () => {
    setStep("input");
    setError("");
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative ml-auto w-full sm:w-[420px] bg-surface border-l border-border shadow-2xl h-full overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">{t("title")}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl cursor-pointer">×</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Step 1: Input */}
          {step === "input" && (
            <>
              <p className="text-sm text-text-muted">
                {t("description")}
              </p>
              {providers.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim">{t("providerLabel")}</label>
                  <select
                    value={providerId ?? ""}
                    onChange={e => setProviderId(parseInt(e.target.value))}
                    disabled={analyzing}
                    className="p-2 border border-input-border bg-input-bg rounded text-text text-sm outline-none disabled:opacity-50">
                    {providers.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.model}) {p.isShared ? `[${tp("shared")}]` : `[${tp("private")}]`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder={`${t("placeholder")}\n\n${t("exampleHeader")}\n${t("example1")}\n${t("example2")}\n${t("example3")}`}
                rows={12}
                maxLength={5000}
                disabled={analyzing}
                className="w-full p-3 border border-input-border bg-input-bg rounded-theme text-sm text-text resize-none font-mono leading-relaxed outline-none disabled:opacity-50"
              />
              <div className="flex justify-between items-center text-xs text-text-dim">
                <span>{rawText.length}/5000</span>
                {error && <span className="text-danger">{error}</span>}
              </div>
              {analyzing ? (
                <div className="flex gap-2">
                  <button
                    disabled
                    className="flex-1 bg-accent/70 text-white py-3 rounded-theme font-bold flex items-center justify-center gap-2 cursor-default">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    {t("btnAnalyzing")}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-4 bg-surface-alt hover:bg-border text-text py-3 rounded-theme font-bold transition cursor-pointer">
                    {t("btnCancel")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAnalyze}
                  disabled={!rawText.trim()}
                  className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-white py-3 rounded-theme font-bold transition cursor-pointer">
                  {t("btnAnalyze")}
                </button>
              )}
            </>
          )}

          {/* Step 2: Preview & Edit */}
          {step === "preview" && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">
                  {t("resultHeader", { count: items.length })}
                </span>
                <button onClick={handleBack} className="text-xs text-primary hover:underline cursor-pointer">{t("btnBack")}</button>
              </div>

              {error && (
                <div className="bg-danger/10 border border-danger/20 text-danger text-sm p-3 rounded">{error}</div>
              )}

              <div className="flex flex-col gap-3">
                {items.map((item, i) => (
                  <div key={i} className="bg-surface-alt rounded-theme border border-border p-3 flex flex-col gap-2">
                    {/* Type badge */}
                    <div className="flex items-center justify-between">
                      <select
                        value={item.type}
                        onChange={e => updateItem(i, "type", e.target.value)}
                        className={`text-xs font-bold px-2 py-0.5 rounded border ${TYPE_COLORS[item.type] || ""}`}
                      >
                        {["clue", "info", "character", "item"].map(typeKey => (
                          <option key={typeKey} value={typeKey}>{t(typeKey)}</option>
                        ))}
                      </select>
                      <button onClick={() => removeItem(i)}
                        className="text-xs text-text-dim hover:text-danger transition cursor-pointer">{t("btnDelete")}</button>
                    </div>

                    {/* Title */}
                    <input
                      value={item.title}
                      onChange={e => updateItem(i, "title", e.target.value)}
                      className="text-sm font-bold text-text bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none p-0.5"
                    />

                    {/* Content */}
                    {typeof item.content === "string" ? (
                      <textarea
                        value={item.content}
                        onChange={e => updateItem(i, "content", e.target.value)}
                        rows={3}
                        className="text-xs text-text-muted bg-surface rounded p-2 border border-input-border resize-none outline-none"
                      />
                    ) : (
                      <div className="flex flex-col gap-1">
                        {Object.entries(item.content).map(([k, v]) => (
                          <div key={k} className="flex gap-2 items-start">
                            <span className="text-[10px] text-text-dim w-16 shrink-0 pt-0.5">{k}</span>
                            <input
                              value={v}
                              onChange={e => {
                                  const content = { ...(item.content as Record<string, string>), [k]: e.target.value };
                                  updateItem(i, "content", content);
                                }}
                              className="flex-1 text-xs text-text-muted bg-surface rounded px-2 py-0.5 border border-input-border outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={handleImport}
                disabled={importing || items.length === 0}
                className="w-full bg-success hover:bg-primary-hover disabled:opacity-40 text-white py-3 rounded-theme font-bold transition cursor-pointer flex items-center justify-center gap-2">
                {importing && <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
                {importing ? t("btnImporting") : t("btnConfirmImport", { count: items.length })}
              </button>
            </>
          )}

          {/* Step 3: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <span className="text-5xl">🎉</span>
              <h4 className="text-lg font-bold text-text">{t("successHeader")}</h4>
              <p className="text-sm text-text-muted">
                {t("successDesc", { count: importedCount })}
              </p>
              <div className="flex gap-3">
                <button onClick={() => { setStep("input"); setRawText(""); setItems([]); }}
                  className="bg-accent hover:bg-accent-hover text-white px-6 py-2 rounded-theme font-bold text-sm cursor-pointer">
                  {t("btnContinue")}
                </button>
                <button onClick={onClose}
                  className="bg-surface-alt hover:bg-border text-text px-6 py-2 rounded-theme font-bold text-sm cursor-pointer">
                  {t("btnDone")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
