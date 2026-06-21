"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import { getMyLoginHistory } from "@/app/actions/login-history";
import { UserLoginHistory } from "@/components/user/UserLoginHistory";

export function LoginHistoryTab() {
  const ts = useTranslations("userSettings");
  const tp = useTranslations("adminProviders");
  const [records, setRecords] = useState<Awaited<ReturnType<typeof getMyLoginHistory>>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingHistory(true);
    setHistoryError("");
    getMyLoginHistory()
      .then(data => setRecords(data))
      .catch((e: unknown) => {
        setHistoryError(e instanceof Error ? e.message : "Failed to load login history");
      })
      .finally(() => setLoadingHistory(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
          <History className="w-5 h-5 text-primary" />
          {ts("tabHistory")}
        </h4>
        <p className="text-xs text-text-muted">
          {records.length > 0 ? ts("historyDesc") : ""}
        </p>
      </div>
      {loadingHistory ? (
        <div className="text-center text-text-dim py-8 text-sm">{tp("loading")}</div>
      ) : historyError ? (
        <div className="text-center text-danger py-8 text-sm">{historyError}</div>
      ) : (
        <div className="bg-surface-alt/30 border border-border rounded-theme p-3">
          <UserLoginHistory records={records} />
        </div>
      )}
    </div>
  );
}
