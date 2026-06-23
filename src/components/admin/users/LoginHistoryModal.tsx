"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { History, X } from "lucide-react";
import { getUserLoginHistory } from "@/app/actions/login-history";
import { UserLoginHistory } from "@/components/user/UserLoginHistory";
import { OverlayShell } from "@/components/shared/OverlayShell";

type HistoryRecords = Awaited<ReturnType<typeof getUserLoginHistory>>;

export function LoginHistoryModal({
  user,
  onClose,
}: {
  user: { id: number; displayName: string };
  onClose: () => void;
}) {
  const t = useTranslations("admin");
  const [records, setRecords] = useState<HistoryRecords>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getUserLoginHistory(user.id)
      .then((r) => { if (active) setRecords(r); })
      .catch(() => { if (active) setRecords([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.id]);

  return (
    <OverlayShell
      onClose={onClose}
      rootClassName="p-4"
      panelClassName="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
    >
      {(close) => (
        <>
          <div className="flex items-start justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <History className="w-5 h-5 text-primary shrink-0" />
              <div>
                <h3 className="font-bold text-text text-lg font-theme-display leading-tight">{t("loginRecordsTitle")}</h3>
                <p className="text-xs text-text-muted mt-0.5">{user.displayName} · {t("recentCount", { count: records.length })}</p>
              </div>
            </div>
            <button onClick={close} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="text-center text-text-dim py-8 text-sm">{t("loading")}</div>
            ) : (
              <UserLoginHistory records={records} />
            )}
          </div>
        </>
      )}
    </OverlayShell>
  );
}
