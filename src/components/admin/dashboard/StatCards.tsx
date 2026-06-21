import type { ReactNode } from "react";

export function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const borders: Record<string, string> = {
    primary: "border-primary/30 bg-primary/5",
    danger: "border-danger/30 bg-danger/5",
    success: "border-success/30 bg-success/5",
    accent: "border-accent/30 bg-accent/5",
  };
  const texts: Record<string, string> = {
    primary: "text-primary",
    danger: "text-danger",
    success: "text-success",
    accent: "text-accent",
  };
  return (
    <div className={`theme-border border p-4 hover:scale-[1.02] transition-all duration-200 rounded-theme ${borders[accent] || borders.primary}`}>
      <div className="text-xs text-text-dim mb-1">{label}</div>
      <div className={`text-2xl font-bold ${texts[accent] || texts.primary}`}>{value}</div>
    </div>
  );
}

export function StatusBadge({ label, value, accent }: { label: string; value: ReactNode; accent: string }) {
  const styles: Record<string, string> = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    success: "border-success/20 bg-success/5 text-success",
    muted: "border-border bg-surface-alt text-text-muted",
    accent: "border-accent/20 bg-accent/5 text-accent",
  };
  return (
    <div className={`theme-border border p-3 hover:scale-[1.01] transition-all duration-200 rounded-theme ${styles[accent] || styles.primary}`}>
      <div className="text-[10px] text-text-dim uppercase mb-0.5">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
