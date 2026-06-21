"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import { getMyPrivateTokenUsages } from "@/app/actions/ai-providers";

export function AiUsageTab() {
  const ts = useTranslations("userSettings");
  const tp = useTranslations("adminProviders");
  const ttu = useTranslations("tokenUsage");

  const [usageRecords, setUsageRecords] = useState<Awaited<ReturnType<typeof getMyPrivateTokenUsages>>>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingUsage(true);
    setUsageError("");
    getMyPrivateTokenUsages()
      .then(data => setUsageRecords(data as typeof usageRecords))
      .catch((e: unknown) => {
        setUsageError(e instanceof Error ? e.message : "Failed to load usage statistics");
      })
      .finally(() => setLoadingUsage(false));
  }, []);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
          <BarChart3 className="w-5 h-5 text-primary" />
          {ts("tabAiUsage")}
        </h4>
        <p className="text-xs text-text-muted">
          {ts("aiUsageDesc")}
        </p>
      </div>

      {loadingUsage ? (
        <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
      ) : usageError ? (
        <div className="text-center text-danger py-8 text-sm">{usageError}</div>
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
  );
}
