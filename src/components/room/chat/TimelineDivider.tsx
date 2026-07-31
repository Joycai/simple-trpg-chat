"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { composeTimelineLabel, type TimelineDividerData } from "@/lib/messaging/timeline-payload";
import { useHostLabel } from "@/components/shared/host-label";

interface Props {
  /** Structured payload; when null the `fallback` content string is shown instead. */
  data: TimelineDividerData | null;
  fallback: string;
  isHost: boolean;
  onWithdraw?: () => void | Promise<void>;
}


/**
 * In-channel "timeline divider" — a gold, centered date separator. For the host
 * a 撤回 (withdraw) control appears on hover and opens a double-confirm dialog.
 */
export function TimelineDivider({ data, fallback, isHost, onWithdraw }: Props) {
  const t = useTranslations("timeline");
  const hostLabel = useHostLabel();
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);

  const label = (data ? composeTimelineLabel(data, t, locale) : "") || fallback;
  // Glyph reflecting the divider's time: 上午/下午/夜晚 → sunrise/sun/moon, exact clock → clock.
  const TimeIcon =
    !data ? Icons.Sunrise
    : data.timeMode === "clock" ? Icons.Clock
    : data.segment === "afternoon" ? Icons.Sun
    : data.segment === "night" ? Icons.Moon
    : Icons.Sunrise;

  return (
    <div className="timeline-divider group relative flex flex-col items-center gap-1 py-3 animate-in fade-in">
      <div className="flex w-full items-center justify-center gap-3 px-2">
        <span className="flex-1 h-px bg-gradient-to-r from-transparent to-accent/45" />
        <span className="inline-flex items-center gap-2 text-accent whitespace-nowrap">
          <TimeIcon className="w-4 h-4 shrink-0" />
          <span className="font-theme-display font-bold tracking-wide text-[15px]">{label}</span>
          <TimeIcon className="w-4 h-4 shrink-0 -scale-x-100" />
        </span>
        <span className="flex-1 h-px bg-gradient-to-l from-transparent to-accent/45" />
      </div>
      <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-text-dim select-none">
        {t("subtitle", { host: hostLabel })}
      </span>

      {/* Host-only withdraw affordance — revealed on hover of the divider row. */}
      {isHost && onWithdraw && (
        <button
          onClick={() => setConfirming(true)}
          className="absolute right-1 top-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-theme border border-danger/40 bg-danger/5 text-danger text-xs font-bold opacity-0 group-hover:opacity-100 focus:opacity-100 transition cursor-pointer"
          title={t("withdraw")}
        >
          <Icons.Undo2 className="w-3.5 h-3.5" />
          {t("withdraw")}
        </button>
      )}

      {confirming && (
        <WithdrawConfirm
          label={label}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            await onWithdraw?.();
            setConfirming(false);
          }}
        />
      )}
    </div>
  );
}

function WithdrawConfirm({
  label,
  onCancel,
  onConfirm,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const t = useTranslations("timeline");
  const hostLabel = useHostLabel();
  const { close, panelRef, backdropRef, panelClass } = useOverlayTransition(onCancel);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      // Parent unmounts this on success; guard against setState-after-unmount noise.
      setBusy(false);
    }
  };

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        ref={panelRef} className={`bg-surface theme-border rounded-theme shadow-2xl p-6 w-full max-w-sm ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-theme bg-danger/10 text-danger shrink-0">
            <Icons.Undo2 className="w-5 h-5" />
          </span>
          <h3 className="font-bold text-lg text-text font-theme-display">{t("withdrawTitle")}</h3>
        </div>
        <p className="text-sm text-text-muted leading-relaxed mb-5">
          {t("withdrawBefore")}
          <span className="font-bold text-text">「{label}」</span>
          {t("withdrawMiddle")}
          <span className="font-bold text-danger">{t("withdrawIrreversible")}</span>
          {t("withdrawAfter", { host: hostLabel })}
        </p>
        <div className="flex gap-3">
          <button
            onClick={close}
            disabled={busy}
            className="px-5 py-2.5 rounded-theme font-bold text-sm text-text-muted border border-border hover:bg-surface-alt transition cursor-pointer disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 py-2.5 rounded-theme font-bold text-sm bg-gradient-to-b from-danger to-danger/80 text-white shadow-[0_0_18px_rgb(var(--theme-danger)/0.4)] transition hover:brightness-110 cursor-pointer disabled:opacity-50"
          >
            {t("confirmWithdraw")}
          </button>
        </div>
      </div>
    </div>
  );
}
