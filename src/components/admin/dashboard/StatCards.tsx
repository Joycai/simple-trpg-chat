import type { ReactNode } from "react";

// The hover glow lives on ::after as an opacity fade rather than transitioning
// box-shadow on the card itself — opacity composites, box-shadow repaints.
const CARD_CLASS =
  "relative bg-surface theme-border border border-border rounded-theme p-4 " +
  "after:pointer-events-none after:absolute after:-inset-px after:rounded-[var(--theme-radius)] " +
  "after:shadow-[var(--theme-glow)] after:opacity-0 after:transition-opacity after:duration-200 " +
  "hover:after:opacity-100";

const VALUE_TEXT: Record<string, string> = {
  primary: "text-primary",
  danger: "text-danger",
  success: "text-success",
  accent: "text-accent",
  ai: "text-ai",
  muted: "text-text-muted",
};

export function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={CARD_CLASS}>
      <div className="text-xs text-text-dim mb-1.5">{label}</div>
      <div className={`text-3xl font-bold font-theme-display ${VALUE_TEXT[accent] || VALUE_TEXT.primary}`}>{value}</div>
    </div>
  );
}

export function StatusBadge({ label, value, accent }: { label: string; value: ReactNode; accent: string }) {
  return (
    <div className={CARD_CLASS}>
      <div className="text-xs text-text-dim mb-1.5">{label}</div>
      <div className={`text-xl font-bold font-theme-display ${VALUE_TEXT[accent] || VALUE_TEXT.primary}`}>{value}</div>
    </div>
  );
}
