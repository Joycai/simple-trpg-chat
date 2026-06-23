import type { ReactNode } from "react";

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
    <div className="bg-surface theme-border border border-border rounded-theme p-4 transition-all duration-200 hover:shadow-[var(--theme-glow)]">
      <div className="text-xs text-text-dim mb-1.5">{label}</div>
      <div className={`text-3xl font-bold font-theme-display ${VALUE_TEXT[accent] || VALUE_TEXT.primary}`}>{value}</div>
    </div>
  );
}

export function StatusBadge({ label, value, accent }: { label: string; value: ReactNode; accent: string }) {
  return (
    <div className="bg-surface theme-border border border-border rounded-theme p-4 transition-all duration-200 hover:shadow-[var(--theme-glow)]">
      <div className="text-xs text-text-dim mb-1.5">{label}</div>
      <div className={`text-xl font-bold font-theme-display ${VALUE_TEXT[accent] || VALUE_TEXT.primary}`}>{value}</div>
    </div>
  );
}
