"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { History, BarChart3, Coins } from "lucide-react";
import { getMyAiPointsInfo } from "@/app/actions/ai-points";

export function AiPointsTab({ userRole }: { userRole: string }) {
  const ts = useTranslations("userSettings");
  const tp = useTranslations("adminProviders");
  const locale = useLocale();

  const [pointsInfo, setPointsInfo] = useState<Awaited<ReturnType<typeof getMyAiPointsInfo>> | null>(null);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [pointsError, setPointsError] = useState("");

  const loadPoints = () => {
    setLoadingPoints(true);
    setPointsError("");
    getMyAiPointsInfo()
      .then(data => setPointsInfo(data as typeof pointsInfo))
      .catch((e: unknown) => {
        setPointsError(e instanceof Error ? e.message : "Failed to load AI points info");
      })
      .finally(() => setLoadingPoints(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
          <Coins className="w-5 h-5 text-primary" />
          {ts("tabAiPoints")}
        </h4>
        <p className="text-xs text-text-muted">{ts("aiPointsDesc")}</p>
      </div>

      {loadingPoints ? (
        <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
      ) : pointsError ? (
        <div className="text-center text-danger py-8 text-sm flex flex-col items-center gap-2">
          <span>{pointsError}</span>
          <button
            onClick={loadPoints}
            className="text-xs text-primary hover:underline cursor-pointer"
          >
            {locale === "zh" ? "重试" : "Retry"}
          </button>
        </div>
      ) : pointsInfo ? (
        <div className="space-y-4">
          {/* Balance Card */}
          <div className="bg-primary/5 border border-primary/20 rounded-theme p-5 text-center shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
            <div className="text-xs text-text-muted font-bold mb-1 flex items-center justify-center gap-1.5 relative z-10">
              <Coins className="w-4 h-4 text-primary" /> {ts("currentBalance")}
            </div>
            <div className="text-3xl font-black text-primary relative z-10 tracking-tight">
              {userRole === "admin" ? ts("unlimitedPoints") : `${pointsInfo.balance.toFixed(4)}`}
            </div>
          </div>

          {/* Two Column Layout on larger screen */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left col: Daily points usage */}
            <div className="space-y-2">
              <h5 className="text-xs font-bold text-text flex items-center gap-1.5 border-b border-border pb-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-text-dim" /> {ts("dailyPointUsage")}
              </h5>
              {pointsInfo.dailyUsage.length > 0 ? (
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto pr-1">
                  {pointsInfo.dailyUsage.map((u) => (
                    <div key={u.day} className="flex justify-between items-center bg-surface-alt/30 p-2 rounded-theme border border-border text-xs font-theme-mono">
                      <span className="font-mono text-text-muted">{u.day}</span>
                      <span className="font-bold text-text">{u.points.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-text-dim py-6 text-xs bg-surface-alt/10 rounded-theme border border-dashed border-border">{ts("emptyPointsHistory")}</div>
              )}
            </div>

            {/* Right col: Balance Change History Log */}
            <div className="space-y-2">
              <h5 className="text-xs font-bold text-text flex items-center gap-1.5 border-b border-border pb-1.5">
                <History className="w-3.5 h-3.5 text-text-dim" /> {ts("pointsHistory")}
              </h5>
              {pointsInfo.logs.length > 0 ? (
                <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                  {pointsInfo.logs.map((log) => {
                    const isNegative = log.amount < 0;
                    const amountStr = isNegative ? `${log.amount.toFixed(4)}` : `+${log.amount.toFixed(4)}`;
                    const amountColor = isNegative ? "text-danger" : "text-success";

                    const localTime = new Date(log.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
                      month: "numeric",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    });

                    return (
                      <div key={log.id} className="p-2.5 bg-surface-alt/30 rounded-theme border border-border flex flex-col gap-1 text-xs hover:border-primary/20 transition">
                        <div className="flex justify-between items-center">
                          <span className="text-text-dim text-[10px]">{localTime}</span>
                          <span className={`font-bold font-theme-mono ${amountColor}`}>{amountStr}</span>
                        </div>
                        <div className="text-text font-medium leading-tight">{log.description}</div>
                        <div className="flex justify-between text-[9px] text-text-dim mt-0.5 font-theme-mono border-t border-border/20 pt-1">
                          <span>
                            {ts("thChangeType")}: {log.type === "usage" ? ts("typeUsage") : ts("typeAdmin")}
                          </span>
                          <span>
                            {ts("thBalanceAfter")}: {log.afterPoints.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-text-dim py-6 text-xs bg-surface-alt/10 rounded-theme border border-dashed border-border">{ts("emptyPointsHistory")}</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
      )}
    </div>
  );
}
