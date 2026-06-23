"use client";

import React, { useState, useMemo } from "react";
import { Search, Globe, Lock, Cpu, ArrowDownToLine, ArrowUpFromLine, Database, BarChart3, Layers, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";

interface UsageRecord {
  id: number;
  day: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  userName: string;
  username: string;
  providerName: string;
  model: string;
  isShared: boolean;
}

interface TokenUsageDashboardProps {
  usages: UsageRecord[];
}

type RangeKey = "all" | "today" | "week" | "month";

// Stable "today" snapshot computed once (avoids Date.now() in render — purity lint).
function todayParts() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${day}`;
  // Monday as week start
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  return { todayStr, mondayStr, monthPrefix: `${y}-${m}` };
}

export function TokenUsageDashboard({ usages }: TokenUsageDashboardProps) {
  const t = useTranslations("tokenUsage");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "shared" | "private">("all");
  const [range, setRange] = useState<RangeKey>("all");
  const [today] = useState(todayParts);

  // Range filter (by day string) — shared by every aggregate below.
  const inRange = useMemo(() => {
    return usages.filter((r) => {
      if (range === "all") return true;
      if (range === "today") return r.day === today.todayStr;
      if (range === "month") return r.day.startsWith(today.monthPrefix);
      // week
      return r.day >= today.mondayStr && r.day <= today.todayStr;
    });
  }, [usages, range, today]);

  // Detail-table records: range + search + type.
  const filteredUsages = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return inRange.filter((record) => {
      const matchesSearch =
        !q ||
        record.userName.toLowerCase().includes(q) ||
        record.username.toLowerCase().includes(q) ||
        record.providerName.toLowerCase().includes(q) ||
        record.model.toLowerCase().includes(q);
      const matchesType =
        filterType === "all" ||
        (filterType === "shared" && record.isShared) ||
        (filterType === "private" && !record.isShared);
      return matchesSearch && matchesType;
    });
  }, [inRange, searchTerm, filterType]);

  // Aggregate stat cards (based on range only — the headline numbers).
  const stats = useMemo(() => {
    let input = 0,
      cached = 0,
      output = 0;
    inRange.forEach((r) => {
      input += r.inputTokens;
      cached += r.cachedInputTokens;
      output += r.outputTokens;
    });
    return { input, cached, output, total: input + output };
  }, [inRange]);

  // Daily token consumption (input + output per day).
  const daily = useMemo(() => {
    const map = new Map<string, number>();
    inRange.forEach((r) => {
      map.set(r.day, (map.get(r.day) ?? 0) + r.inputTokens + r.outputTokens);
    });
    const rows = Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-14)
      .map(([day, value]) => ({ day, value }));
    const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
    return { rows, max };
  }, [inRange]);

  // By-model share.
  const byModel = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    inRange.forEach((r) => {
      const v = r.inputTokens + r.outputTokens;
      map.set(r.model, (map.get(r.model) ?? 0) + v);
      total += v;
    });
    return Array.from(map.entries())
      .map(([model, value]) => ({ model, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [inRange]);

  // Consumption ranking by user.
  const ranking = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    inRange.forEach((r) => {
      const cur = map.get(r.username) ?? { name: r.userName, value: 0 };
      cur.value += r.inputTokens + r.outputTokens;
      map.set(r.username, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [inRange]);

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const cards = [
    { label: t("statsTotal"), value: stats.total, color: "text-primary", icon: Cpu },
    { label: t("statsInput"), value: stats.input, color: "text-success", icon: ArrowDownToLine },
    { label: t("statsOutput"), value: stats.output, color: "text-accent", icon: ArrowUpFromLine },
    { label: t("statsCached"), value: stats.cached, color: "text-ai", icon: Database },
  ];

  const ranges: { key: RangeKey; label: string }[] = [
    { key: "all", label: t("rangeAll") },
    { key: "today", label: t("rangeToday") },
    { key: "week", label: t("rangeWeek") },
    { key: "month", label: t("rangeMonth") },
  ];

  return (
    <div className="flex flex-col gap-6 font-theme">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text font-theme-display">{t("title")}</h1>
          <p className="text-sm text-text-muted mt-1">{t("description")}</p>
        </div>
        <div className="flex bg-surface-alt theme-border p-1 rounded-theme shrink-0">
          {ranges.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-theme transition-all ${
                range === r.key
                  ? "bg-primary text-primary-foreground shadow-[var(--theme-glow)]"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="bg-surface theme-border p-5 rounded-theme flex flex-col gap-2 transition-shadow hover:shadow-[var(--theme-glow)]"
            >
              <div className="text-xs text-text-dim flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                {c.label}
              </div>
              <div className={`text-3xl font-bold font-theme-display ${c.color}`}>{fmt(c.value)}</div>
            </div>
          );
        })}
      </div>

      {/* Daily chart + by-model */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily consumption */}
        <div className="lg:col-span-2 bg-surface theme-border rounded-theme p-5">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-text font-theme-display">{t("dailyTitle")}</h3>
          </div>
          {daily.rows.length > 0 ? (
            <div className="flex items-end gap-2 h-44">
              {daily.rows.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <div className="w-full flex items-end justify-center h-36">
                    <div
                      className="w-full max-w-[2.75rem] rounded-t-md bg-gradient-to-t from-primary/30 to-primary shadow-[var(--theme-glow)] transition-all"
                      style={{ height: `${daily.max > 0 ? Math.max(4, (d.value / daily.max) * 100) : 0}%` }}
                      title={d.value.toLocaleString()}
                    />
                  </div>
                  <span className="text-[10px] text-text-dim font-theme-mono truncate w-full text-center">
                    {d.day.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-sm text-text-dim">{t("empty")}</div>
          )}
        </div>

        {/* By model */}
        <div className="bg-surface theme-border rounded-theme p-5">
          <div className="flex items-center gap-2 mb-5">
            <Layers className="w-4 h-4 text-ai" />
            <h3 className="font-semibold text-text font-theme-display">{t("byModelTitle")}</h3>
          </div>
          {byModel.length > 0 ? (
            <div className="flex flex-col gap-4">
              {byModel.map((m) => (
                <div key={m.model} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text font-theme-mono truncate">{m.model}</span>
                    <span className="text-text-muted">{m.pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-ai"
                      style={{ width: `${m.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-sm text-text-dim">{t("empty")}</div>
          )}
        </div>
      </div>

      {/* Consumption ranking */}
      <div className="bg-surface theme-border rounded-theme p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-text font-theme-display">{t("rankingTitle")}</h3>
        </div>
        {ranking.length > 0 ? (
          <div className="flex flex-col">
            {ranking.map((u, i) => (
              <div
                key={u.name + i}
                className="flex items-center gap-4 py-3 border-b border-border last:border-0"
              >
                <span
                  className={`w-6 text-center font-bold font-theme-mono ${
                    i === 0 ? "text-accent" : "text-text-dim"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-text font-medium truncate">{u.name}</span>
                <span className="font-theme-mono text-sm text-primary">{u.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-text-dim">{t("empty")}</div>
        )}
      </div>

      {/* Detail table */}
      <div className="bg-surface theme-border rounded-theme overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 flex flex-wrap gap-3 items-center justify-between border-b border-border">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full pl-9 pr-4 py-2 bg-input-bg border border-input-border rounded-theme text-sm text-text placeholder-text-dim outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            />
          </div>
          <div className="flex bg-surface-alt theme-border p-0.5 rounded-theme shrink-0">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1 text-xs font-medium rounded-theme transition-all ${
                filterType === "all" ? "bg-primary text-primary-foreground" : "text-text-muted hover:text-text"
              }`}
            >
              {t("filterAll")}
            </button>
            <button
              onClick={() => setFilterType("shared")}
              className={`px-3 py-1 text-xs font-medium rounded-theme transition-all flex items-center gap-1 ${
                filterType === "shared" ? "bg-primary text-primary-foreground" : "text-text-muted hover:text-text"
              }`}
            >
              <Globe className="w-3 h-3" />
              {t("filterShared")}
            </button>
            <button
              onClick={() => setFilterType("private")}
              className={`px-3 py-1 text-xs font-medium rounded-theme transition-all flex items-center gap-1 ${
                filterType === "private" ? "bg-primary text-primary-foreground" : "text-text-muted hover:text-text"
              }`}
            >
              <Lock className="w-3 h-3" />
              {t("filterPrivate")}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-alt border-b border-border text-xs font-semibold text-text-dim uppercase tracking-wider">
                <th className="px-6 py-4">{t("thDate")}</th>
                <th className="px-6 py-4">{t("thUser")}</th>
                <th className="px-6 py-4">AI Provider</th>
                <th className="px-6 py-4 text-right">{t("thInput")}</th>
                <th className="px-6 py-4 text-right">{t("thCached")}</th>
                <th className="px-6 py-4 text-right">{t("thOutput")}</th>
                <th className="px-6 py-4 text-right">{t("thTotal")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm text-text">
              {filteredUsages.length > 0 ? (
                filteredUsages.map((record) => {
                  const recordTotal = record.inputTokens + record.outputTokens;
                  return (
                    <tr key={record.id} className="hover:bg-surface-alt/50 transition-all duration-150">
                      <td className="px-6 py-4 whitespace-nowrap font-medium font-theme-mono text-xs">
                        {record.day}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-semibold text-text">{record.userName}</span>
                          <span className="text-xs text-text-dim font-theme-mono">@{record.username}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span className="font-medium text-text">{record.providerName}</span>
                            <span className="text-xs text-text-dim font-theme-mono">{record.model}</span>
                          </div>
                          {record.isShared ? (
                            <span className="text-[10px] bg-accent/10 text-accent border border-accent/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                              <Globe className="w-2.5 h-2.5" /> {t("lblShared")}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-border text-text-muted px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                              <Lock className="w-2.5 h-2.5" /> {t("lblPrivate")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-theme-mono text-sm">
                        {record.inputTokens.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-theme-mono text-sm text-success">
                        {record.cachedInputTokens > 0 ? (
                          <span>{record.cachedInputTokens.toLocaleString()}</span>
                        ) : (
                          <span className="text-text-dim">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-theme-mono text-sm">
                        {record.outputTokens.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-theme-mono text-sm font-bold text-primary">
                        {recordTotal.toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-text-dim">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
