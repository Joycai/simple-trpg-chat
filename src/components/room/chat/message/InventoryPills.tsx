"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";

/**
 * Structured host-log pill for `systemKind === 'inventory-dispatch'`. Reads the
 * `diceDetail` JSON payload (action + item + recipient + count) and renders an
 * action-colored icon next to a sentence whose item name is wrapped in a
 * type-colored chip (item / clue / info / character). Falls back to the plain
 * `content` text if the payload is missing or malformed.
 */
type DispatchAction = "distribute" | "push" | "share" | "update" | "duplicate";
type DispatchItemType = "clue" | "info" | "character" | "item";
type DispatchPayload = {
  inventoryDispatch?: {
    action?: DispatchAction;
    item?: { type?: DispatchItemType; title?: string };
    recipient?: { kind?: "all" | "user"; name?: string } | null;
    count?: number | null;
  };
};

/** Action → leading-icon component. Color tokens are static classes below. */
const DISPATCH_ACTION_ICON: Record<DispatchAction, typeof Icons.Send> = {
  distribute: Icons.Send,
  push: Icons.Navigation,
  share: Icons.Share2,
  update: Icons.RefreshCw,
  duplicate: Icons.AlertTriangle,
};

/** Item type → chip icon (mirrors src/components/room/inventory/inventory-styles.ts). */
const DISPATCH_ITEM_ICON: Record<DispatchItemType, typeof Icons.Box> = {
  item: Icons.Box,
  clue: Icons.Search,
  info: Icons.File,
  character: Icons.User,
};

/**
 * Per-action icon bubble classes — static so Tailwind's JIT can discover them.
 * Distribute/push share the ai (sending) accent; share goes green; update is a
 * neutral grey; duplicate uses danger to read as a warning.
 */
const DISPATCH_ACTION_ICON_CLASS: Record<DispatchAction, string> = {
  distribute: "bg-ai/15 text-ai border-ai/30",
  push: "bg-primary/15 text-primary border-primary/30",
  share: "bg-success/15 text-success border-success/30",
  update: "bg-text-muted/15 text-text-muted border-border",
  duplicate: "bg-danger/15 text-danger border-danger/30",
};

/** Outer pill background — duplicate gets a soft danger wash so the warning reads at a glance. */
const DISPATCH_PILL_CLASS: Record<DispatchAction, string> = {
  distribute: "bg-surface-alt border-border",
  push: "bg-surface-alt border-border",
  share: "bg-surface-alt border-border",
  update: "bg-surface-alt border-border",
  duplicate: "bg-danger/10 border-danger/40",
};

/** Per-item-type chip classes — semantic tokens so all themes pick up their own palette. */
const DISPATCH_CHIP_CLASS: Record<DispatchItemType, string> = {
  item: "border-success/45 bg-success/10 text-success",
  clue: "border-primary/45 bg-primary/10 text-primary",
  info: "border-ai/45 bg-ai/10 text-ai",
  character: "border-accent/45 bg-accent/10 text-accent",
};

function DispatchChip({ type, title }: { type: DispatchItemType; title: string }) {
  const ChipIcon = DISPATCH_ITEM_ICON[type];
  return (
    <span
      className={`dispatch-chip inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${DISPATCH_CHIP_CLASS[type]}`}
      data-item-type={type}
    >
      <ChipIcon className="dispatch-chip-icon w-3 h-3" />
      <span className="dispatch-chip-title font-medium">{title}</span>
    </span>
  );
}

export function DispatchPill({
  content,
  diceDetail,
  enter = false,
}: {
  content: string;
  diceDetail: string | null | undefined;
  /** Entrance-animation gate, forwarded from the owning ChatMessage. */
  enter?: boolean;
}) {
  const t = useTranslations("inventoryDispatch");
  // Captured once on mount — same pattern as ChatMessage's `entered`.
  const [entered] = useState(enter);
  const pillEnterClass = entered ? "animate-in fade-in" : "";

  let payload: DispatchPayload["inventoryDispatch"] | null = null;
  if (diceDetail) {
    try {
      const parsed = JSON.parse(diceDetail) as DispatchPayload;
      payload = parsed.inventoryDispatch ?? null;
    } catch {
      payload = null;
    }
  }

  // Fallback: no payload → render the plain content as a neutral pill so older
  // messages (or any malformed payload) still display sensibly.
  if (!payload?.action || !payload.item?.type || !payload.item.title) {
    return (
      <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`}>
        <span className="system-pill-body inline-flex items-center gap-1.5 text-xs italic px-3 py-1 rounded-full bg-surface-alt text-text-dim">
          <span className="system-pill-text">{content}</span>
        </span>
      </div>
    );
  }

  const action = payload.action;
  const itemType = payload.item.type;
  const itemTitle = payload.item.title;
  const recipient = payload.recipient ?? null;
  const count = payload.count ?? null;
  const ActionIcon = DISPATCH_ACTION_ICON[action];

  // Pick the message template based on action + recipient shape.
  const messageKey: string =
    action === "distribute" ? (recipient?.kind === "all" ? "distributedAll" : "distributedOne")
    : action === "push" ? (recipient?.kind === "all" ? "cluePushAll" : "cluePushTargeted")
    : action === "share" ? "shared"
    : action === "update" ? "updated"
    : recipient?.kind === "all" ? "alreadyHadAll" : "alreadyHadOne";

  return (
    <div
      className={`dispatch-pill-wrap flex justify-center py-2 ${pillEnterClass}`}
      data-action={action}
    >
      <div
        className={`dispatch-pill inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1 rounded-full border text-xs ${DISPATCH_PILL_CLASS[action]} text-text`}
        data-action={action}
        data-item-type={itemType}
      >
        <span
          className={`dispatch-pill-icon inline-flex items-center justify-center w-6 h-6 rounded-full border shrink-0 ${DISPATCH_ACTION_ICON_CLASS[action]}`}
          aria-hidden
        >
          <ActionIcon className="w-3.5 h-3.5" />
        </span>
        <span className="dispatch-pill-text inline-flex items-center gap-1.5 flex-wrap">
          {t.rich(messageKey, {
            strong: (chunks) => <strong className="dispatch-pill-recipient font-semibold text-text">{chunks}</strong>,
            num: (chunks) => <span className="dispatch-pill-count font-theme-mono font-semibold text-text">{chunks}</span>,
            chip: () => <DispatchChip type={itemType} title={itemTitle} />,
            recipient: recipient?.name ?? "",
            recipients: recipient?.name ?? "",
            count: count ?? 0,
          })}
          {action === "duplicate" && (
            <span className="dispatch-pill-note text-text-dim"> · {t("notRedistributed")}</span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Structured recipient-side pill for `systemKind === 'inventory-receipt'`. Reads
 * the `diceDetail` JSON (action + item + optional sender) and renders an
 * action-colored icon · sentence with a type-colored chip · NEW/更新 badge ·
 * "查看背包" CTA wired to `onOpenInventory`. Falls back to a neutral pill
 * when the payload is missing or malformed.
 */
type ReceiptAction = "received" | "updated" | "shared-received";

type ReceiptPayloadShape = {
  inventoryReceipt?: {
    action?: ReceiptAction;
    item?: { type?: DispatchItemType; title?: string };
    sender?: string | null;
  };
};

/** Receipt action → leading-icon component. */
const RECEIPT_ACTION_ICON: Record<ReceiptAction, typeof Icons.Send> = {
  received: Icons.Send,
  updated: Icons.RefreshCw,
  "shared-received": Icons.Share2,
};

/**
 * Per-action icon bubble color tokens — `received` uses the chip's item-type
 * accent (cyan box / red diamond etc.), `updated` is neutral grey, and
 * `shared-received` borrows the success (moss-green) palette to match the
 * player-to-player exchange feel.
 */
const RECEIPT_ACTION_ICON_CLASS: Record<ReceiptAction, string> = {
  received: "bg-ai/15 text-ai border-ai/30",
  updated: "bg-text-muted/15 text-text-muted border-border",
  "shared-received": "bg-success/15 text-success border-success/30",
};

/** Badge palette — NEW reads as fresh (primary), 更新 as a softer reminder (accent). */
const RECEIPT_BADGE_CLASS: Record<"new" | "updated", string> = {
  new: "bg-primary/15 text-primary border-primary/40",
  updated: "bg-accent/15 text-accent border-accent/40",
};

export function ReceiptPill({
  content,
  diceDetail,
  onOpenInventory,
  enter = false,
}: {
  content: string;
  diceDetail: string | null | undefined;
  onOpenInventory?: () => void;
  /** Entrance-animation gate, forwarded from the owning ChatMessage. */
  enter?: boolean;
}) {
  const t = useTranslations("inventoryReceipt");
  // Captured once on mount — same pattern as ChatMessage's `entered`.
  const [entered] = useState(enter);
  const pillEnterClass = entered ? "animate-in fade-in" : "";

  let payload: ReceiptPayloadShape["inventoryReceipt"] | null = null;
  if (diceDetail) {
    try {
      const parsed = JSON.parse(diceDetail) as ReceiptPayloadShape;
      payload = parsed.inventoryReceipt ?? null;
    } catch {
      payload = null;
    }
  }

  // Fallback to a neutral pill when the payload is missing — keeps older
  // recipient messages (or any malformed payload) sensible.
  if (!payload?.action || !payload.item?.type || !payload.item.title) {
    return (
      <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`}>
        <span className="system-pill-body inline-flex items-center gap-1.5 text-xs italic px-3 py-1 rounded-full bg-surface-alt text-text-dim">
          <span className="system-pill-text">{content}</span>
        </span>
      </div>
    );
  }

  const action = payload.action;
  const itemType = payload.item.type;
  const itemTitle = payload.item.title;
  const sender = payload.sender ?? null;
  const ActionIcon = RECEIPT_ACTION_ICON[action];

  // Sentence template: clue gets a dedicated "received new clue" phrasing;
  // every other type uses the generic "you received <chip>".
  const messageKey: string =
    action === "shared-received" ? "shared"
    : action === "updated" ? "updated"
    : itemType === "clue" ? "receivedClue"
    : "received";

  // Badge: `received` first-time → NEW; `updated` → 更新; player-to-player share
  // already conveys novelty via the sender name, so we drop the badge there.
  const badge: "new" | "updated" | null =
    action === "updated" ? "updated"
    : action === "received" ? "new"
    : null;

  return (
    <div
      className={`receipt-pill-wrap flex justify-center py-2 ${pillEnterClass}`}
      data-action={action}
    >
      <div
        className="receipt-pill inline-flex items-center gap-2 pl-1.5 pr-1.5 py-1 rounded-full border bg-surface-alt border-border text-xs text-text"
        data-action={action}
        data-item-type={itemType}
      >
        <span
          className={`receipt-pill-icon inline-flex items-center justify-center w-6 h-6 rounded-full border shrink-0 ${RECEIPT_ACTION_ICON_CLASS[action]}`}
          aria-hidden
        >
          <ActionIcon className="w-3.5 h-3.5" />
        </span>
        <span className="receipt-pill-text inline-flex items-center gap-1.5 flex-wrap pl-1">
          {t.rich(messageKey, {
            strong: (chunks) => <strong className="receipt-pill-sender font-semibold text-text">{chunks}</strong>,
            chip: () => <DispatchChip type={itemType} title={itemTitle} />,
            sender: sender ?? "",
          })}
        </span>
        {badge && (
          <span
            className={`receipt-pill-badge inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${RECEIPT_BADGE_CLASS[badge]}`}
            data-badge={badge}
          >
            {badge === "new" ? t("badgeNew") : t("badgeUpdated")}
          </span>
        )}
        {onOpenInventory && (
          <button
            type="button"
            onClick={onOpenInventory}
            className="receipt-pill-cta inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:text-primary-hover transition pl-2 pr-2 py-0.5 rounded-full border border-transparent hover:border-primary/30 hover:bg-primary/5 cursor-pointer"
          >
            {t("viewBackpack")}
            <Icons.ChevronDown className="w-3 h-3 -rotate-90" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
