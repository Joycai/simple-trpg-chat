"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Ticket, Copy, Check, Plus, XCircle, Clock } from "lucide-react";
import {
  generateInviteCodeAction,
  listMyInviteCodesAction,
  revokeInviteCodeAction,
  type InviteCodeView,
} from "@/app/actions/invite";

/** Host-only tab: generate / track / revoke invite codes (48h TTL, quota-based). */
export function InvitesTab() {
  const ts = useTranslations("userSettings");
  const ti = useTranslations("invites");
  const locale = useLocale();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quota, setQuota] = useState(0);
  const [defaultQuota, setDefaultQuota] = useState(4);
  const [codes, setCodes] = useState<InviteCodeView[]>([]);
  const [busy, setBusy] = useState(false);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Captured once on mount so remaining-time formatting stays pure across re-renders.
  const [now] = useState(() => Date.now());

  const load = () => {
    setLoading(true);
    setError("");
    listMyInviteCodesAction()
      .then((res) => {
        if (res.success) {
          setQuota(res.quota);
          setDefaultQuota(res.defaultQuota);
          setCodes(res.codes);
        } else {
          setError(res.error);
        }
      })
      .catch(() => setError(ti("errorUnknown")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await generateInviteCodeAction();
      if (res.success) {
        setFreshCode(res.code);
        load();
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm(ti("revokeConfirm"))) return;
    setBusy(true);
    setError("");
    try {
      const res = await revokeInviteCodeAction(id);
      if (res.success) {
        setFreshCode(null);
        load();
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  /** Remaining lifetime of an active code, e.g. "23h" / "45min". */
  const remainingLabel = (expiresAt: string): string => {
    const ms = new Date(expiresAt).getTime() - now;
    if (ms <= 0) return ti("statusExpired");
    const hours = Math.floor(ms / 3600000);
    if (hours >= 1) return ti("expiresInHours", { count: hours });
    return ti("expiresInMinutes", { count: Math.max(1, Math.floor(ms / 60000)) });
  };

  const statusView = (c: InviteCodeView): { label: string; cls: string } => {
    switch (c.status) {
      case "active":
        return { label: ti("statusActive"), cls: "border-primary/30 bg-primary/10 text-primary" };
      case "used":
        return { label: ti("statusUsed"), cls: "border-success/30 bg-success/10 text-success" };
      case "revoked":
        return { label: ti("statusRevoked"), cls: "border-danger/30 bg-danger/10 text-danger" };
      default:
        return { label: ti("statusExpired"), cls: "border-border bg-surface-alt text-text-dim" };
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
          <Ticket className="w-5 h-5 text-primary" />
          {ts("tabInvites")}
        </h4>
        <p className="text-xs text-text-muted">{ti("desc")}</p>
      </div>

      {loading ? (
        <div className="text-center text-text-dim py-8 text-sm">{ti("loading")}</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-theme px-3 py-2">{error}</div>
          )}

          {/* Quota card + generate */}
          <div className="bg-primary/5 border border-primary/20 rounded-theme p-5 shadow-sm relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
            <div className="text-center sm:text-left relative z-10">
              <div className="text-xs text-text-muted font-bold mb-1 flex items-center justify-center sm:justify-start gap-1.5">
                <Ticket className="w-4 h-4 text-primary" /> {ti("remainingQuota")}
              </div>
              <div className="text-3xl font-black text-primary tracking-tight">
                {quota}
                <span className="text-base font-bold text-text-dim ml-1">/ {defaultQuota}</span>
              </div>
            </div>
            <div className="flex flex-col items-center sm:items-end gap-1.5 relative z-10">
              <button
                onClick={handleGenerate}
                disabled={busy || quota <= 0}
                className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-hover disabled:bg-text-dim disabled:cursor-not-allowed text-primary-foreground px-4 py-2.5 rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]"
              >
                <Plus className="w-4 h-4" />
                {busy ? ti("generating") : ti("generate")}
              </button>
              <p className="text-[10px] text-text-dim">{quota <= 0 ? ti("noQuotaHint") : ti("ttlHint")}</p>
            </div>
          </div>

          {/* Freshly generated code callout */}
          {freshCode && (
            <div className="bg-success/5 border border-success/30 rounded-theme p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-center sm:text-left">
                <div className="text-[10px] text-success font-bold uppercase tracking-wider mb-1">{ti("freshCodeLabel")}</div>
                <div className="text-lg font-black text-text font-theme-mono tracking-widest select-all">{freshCode}</div>
              </div>
              <button
                onClick={() => handleCopy(freshCode)}
                className="inline-flex items-center gap-1.5 border border-success/40 bg-success/10 hover:bg-success/20 text-success px-3.5 py-2 rounded-theme text-xs font-bold transition cursor-pointer shrink-0"
              >
                {copied === freshCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === freshCode ? ti("copied") : ti("copy")}
              </button>
            </div>
          )}

          {/* History list */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold text-text flex items-center gap-1.5 border-b border-border pb-1.5">
              <Clock className="w-3.5 h-3.5 text-text-dim" /> {ti("historyTitle")}
            </h5>
            {codes.length === 0 ? (
              <div className="text-center text-text-dim py-6 text-xs bg-surface-alt/10 rounded-theme border border-dashed border-border">
                {ti("emptyHistory")}
              </div>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {codes.map((c) => {
                  const sv = statusView(c);
                  return (
                    <div
                      key={c.id}
                      className="p-3 bg-surface-alt/30 rounded-theme border border-border flex flex-wrap items-center gap-x-3 gap-y-2 text-xs hover:border-primary/20 transition"
                    >
                      <span className="font-theme-mono font-bold text-text tracking-wider">{c.code}</span>
                      <span className={`px-2 py-0.5 rounded-theme text-[10px] font-bold border ${sv.cls}`}>{sv.label}</span>
                      <span className="text-text-dim ml-auto">
                        {c.status === "active"
                          ? remainingLabel(c.expiresAt)
                          : c.status === "used"
                            ? ti("usedByAt", { name: c.usedByName ?? "?", time: c.usedAt ? formatTime(c.usedAt) : "-" })
                            : formatTime(c.createdAt)}
                      </span>
                      {c.status === "active" && (
                        <span className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopy(c.code)}
                            className="p-1.5 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer"
                            title={ti("copy")}
                          >
                            {copied === c.code ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleRevoke(c.id)}
                            disabled={busy}
                            className="p-1.5 rounded-theme text-text-muted hover:text-danger hover:bg-danger/10 transition cursor-pointer"
                            title={ti("revoke")}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
