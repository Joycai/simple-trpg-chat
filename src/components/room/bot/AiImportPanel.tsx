"use client";

import { useState, useEffect, useRef } from "react";
import { startTextImportAnalysisAction, cancelTextImportAnalysisAction, batchImportItemsAction } from "@/app/actions/ai-import";
import { getMyProviders } from "@/app/actions/ai-providers";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "@/components/shared/icons";
import { BadgeDropdown, type BadgeDropdownItem } from "@/components/shared/BadgeDropdown";

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

const STEP_ORDER: Step[] = ["input", "preview", "done"];

/** Top progress stepper: ① 输入 — ② 预览 — ③ 完成. */
function ImportStepper({ current, labels }: { current: Step; labels: [string, string, string] }) {
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <div className="flex items-center">
      {STEP_ORDER.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2 shrink-0">
              <span className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition ${
                done ? "bg-success text-white" : active ? "bg-ai text-white shadow-[0_0_12px_rgb(var(--theme-ai)/0.5)]" : "border border-border text-text-dim"
              }`}>
                {done ? <Icons.Check className="w-4 h-4" /> : i + 1}
              </span>
              <span className={`text-sm whitespace-nowrap ${done ? "text-success font-medium" : active ? "text-text font-bold" : "text-text-dim"}`}>
                {labels[i]}
              </span>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <span className={`h-px flex-1 mx-3 ${i < currentIdx ? "bg-success" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AiImportPanel({ roomId, onClose }: AiImportPanelProps) {
  const t = useTranslations("aiImport");
  const tCommon = useTranslations("common");
  const tp = useTranslations("adminProviders");
  const router = useRouter();
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose, "drawer");
  const [step, setStep] = useState<Step>("input");
  const [rawText, setRawText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<{ id: number; name: string; model: string; isShared: boolean }[]>([]);
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : tCommon("error"));
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

  const updateItem = (index: number, field: string, value: unknown) => {
    setItems(prev => {
      const copy = [...prev];
      (copy[index] as unknown as Record<string, unknown>)[field] = value;
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setImporting(false);
    }
  };

  const handleBack = () => {
    setStep("input");
    setError("");
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={close}>
      <div className={`absolute inset-0 bg-black/30 ${backdropClass}`} />
      <div className={`relative ml-auto w-full sm:w-[440px] bg-surface border-l border-border shadow-2xl h-full overflow-y-auto ${panelClass}`}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-5 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-xl font-theme-display">{t("title")}</h3>
          <button onClick={close} aria-label={tCommon("close")}
            className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          {/* Progress stepper */}
          <ImportStepper current={step} labels={[t("stepInput"), t("stepPreview"), t("stepDone")]} />

          {/* Step 1: Input */}
          {step === "input" && (
            <>
              <p className="text-sm text-text-muted leading-relaxed">
                {t("description")}
              </p>
              {providers.length > 0 && (
                <div>
                  <label className="text-sm text-text-muted mb-1.5 block">{t("providerLabel")}</label>
                  <BadgeDropdown
                    value={String(providerId ?? "")}
                    onChange={id => setProviderId(parseInt(id))}
                    disabled={analyzing}
                    headerText={t("providerHeader")}
                    tone="accent"
                    items={providers.map((p): BadgeDropdownItem => ({
                      id: String(p.id),
                      label: p.name,
                      description: `${p.model} · ${p.isShared ? tp("shared") : tp("private")}`,
                      descriptionMono: true,
                      badge: { letters: p.name.slice(0, 2).toUpperCase() },
                    }))}
                  />
                </div>
              )}
              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder={`${t("example1")}\n\n${t("example2")}\n\n${t("example3")}`}
                rows={14}
                maxLength={5000}
                disabled={analyzing}
                className="w-full px-4 py-3.5 border border-input-border bg-input-bg rounded-theme text-sm text-text resize-none leading-relaxed outline-none transition focus:ring-[3px] focus:ring-ai/[0.18] focus:border-ai placeholder:text-text-dim disabled:opacity-50"
              />
              <div className="flex justify-between items-center text-xs text-text-dim">
                <span>{rawText.length} / 5000</span>
                {error && <span className="text-danger">{error}</span>}
              </div>
              {analyzing ? (
                <div className="flex gap-2">
                  <button disabled
                    className="flex-1 py-3 rounded-theme font-bold flex items-center justify-center gap-2 cursor-default bg-gradient-to-b from-ai to-ai/80 text-ai-foreground opacity-80">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full" />
                    {t("btnAnalyzing")}
                  </button>
                  <button onClick={handleCancel}
                    className="px-4 rounded-theme border border-border text-text-muted hover:text-text hover:bg-surface-alt py-3 font-bold transition cursor-pointer">
                    {t("btnCancel")}
                  </button>
                </div>
              ) : (
                <button onClick={handleAnalyze} disabled={!rawText.trim()}
                  className="w-full py-3.5 rounded-theme font-bold transition hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:shadow-none bg-gradient-to-b from-ai to-ai/80 text-ai-foreground shadow-[0_0_18px_rgb(var(--theme-ai)/0.4)]">
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
                <button onClick={handleBack} className="text-sm text-primary hover:underline cursor-pointer">{t("btnBack")}</button>
              </div>

              {error && (
                <div className="bg-danger/10 border border-danger/20 text-danger text-sm p-3 rounded-theme">{error}</div>
              )}

              <div className="flex flex-col gap-3">
                {items.map((item, i) => (
                  <div key={i} className="bg-surface-alt/40 rounded-theme border border-border p-4 flex flex-col gap-3">
                    {/* Type badge + delete */}
                    <div className="flex items-center justify-between">
                      <div className="relative">
                        <select
                          value={item.type}
                          onChange={e => updateItem(i, "type", e.target.value)}
                          className={`text-xs font-bold pl-2.5 pr-6 py-1 rounded-theme border appearance-none cursor-pointer outline-none ${TYPE_COLORS[item.type] || ""}`}
                        >
                          {["clue", "info", "character", "item"].map(typeKey => (
                            <option key={typeKey} value={typeKey}>{t(typeKey)}</option>
                          ))}
                        </select>
                        <Icons.ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
                      </div>
                      <button onClick={() => removeItem(i)}
                        className="text-xs text-text-dim hover:text-danger transition cursor-pointer">{t("btnDelete")}</button>
                    </div>

                    {/* Title */}
                    <input
                      value={item.title}
                      onChange={e => updateItem(i, "title", e.target.value)}
                      className="text-base font-bold text-text bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none pb-2 transition"
                    />

                    {/* Content */}
                    {typeof item.content === "string" ? (
                      <textarea
                        value={item.content}
                        onChange={e => updateItem(i, "content", e.target.value)}
                        rows={2}
                        className="text-sm text-text-muted bg-surface rounded-theme p-2.5 border border-input-border resize-none outline-none focus:border-primary transition leading-relaxed"
                      />
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {Object.entries(item.content).map(([k, v]) => (
                          <div key={k} className="flex gap-2 items-start">
                            <span className="text-[10px] text-text-dim w-16 shrink-0 pt-1.5">{k}</span>
                            <input
                              value={v}
                              onChange={e => {
                                  const content = { ...(item.content as Record<string, string>), [k]: e.target.value };
                                  updateItem(i, "content", content);
                                }}
                              className="flex-1 text-sm text-text-muted bg-surface rounded-theme px-2.5 py-1 border border-input-border outline-none focus:border-primary transition"
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
                className="w-full py-3.5 rounded-theme font-bold transition hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2 bg-gradient-to-b from-success to-success/80 text-primary-foreground shadow-[0_0_16px_rgb(var(--theme-success)/0.35)]">
                {importing && <span className="animate-spin inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full" />}
                {importing ? t("btnImporting") : t("btnConfirmImport", { count: items.length })}
              </button>
            </>
          )}

          {/* Step 3: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center text-center gap-4 py-16">
              <span className="flex items-center justify-center w-20 h-20 rounded-full border-2 border-success/50 text-success shadow-[0_0_28px_rgb(var(--theme-success)/0.4)]">
                <Icons.Check className="w-10 h-10" />
              </span>
              <h4 className="text-2xl font-bold text-text font-theme-display mt-2">{t("successHeader")}</h4>
              <p className="text-sm text-text-muted">
                {t.rich("successDesc", { count: importedCount, b: (c) => <span className="font-bold text-success">{c}</span> })}
              </p>
              <div className="flex gap-3 mt-2">
                <button onClick={() => { setStep("input"); setRawText(""); setItems([]); }}
                  className="px-6 py-2.5 rounded-theme border border-ai/40 bg-ai/10 text-ai hover:bg-ai/20 font-bold text-sm cursor-pointer transition">
                  {t("btnContinue")}
                </button>
                <button onClick={close}
                  className="px-6 py-2.5 rounded-theme bg-primary text-primary-foreground hover:bg-primary-hover font-bold text-sm cursor-pointer transition shadow-[var(--theme-glow)]">
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
