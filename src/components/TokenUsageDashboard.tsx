"use client";

import React, { useState, useMemo } from "react";
import { Search, Globe, Lock, Shield, Cpu, RefreshCw, BarChart2 } from "lucide-react";

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

export function TokenUsageDashboard({ usages }: TokenUsageDashboardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "shared" | "private">("all");
  const [selectedDate, setSelectedDate] = useState("");

  // Filtered records
  const filteredUsages = useMemo(() => {
    return usages.filter(record => {
      // 1. Search Term Filter (User name, username, or Provider name/model)
      const matchesSearch =
        record.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.providerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.model.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Type Filter (Shared/Private)
      const matchesType =
        filterType === "all" ||
        (filterType === "shared" && record.isShared) ||
        (filterType === "private" && !record.isShared);

      // 3. Date Filter
      const matchesDate = !selectedDate || record.day === selectedDate;

      return matchesSearch && matchesType && matchesDate;
    });
  }, [usages, searchTerm, filterType, selectedDate]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalInput = 0;
    let totalCached = 0;
    let totalOutput = 0;

    filteredUsages.forEach(r => {
      totalInput += r.inputTokens;
      totalCached += r.cachedInputTokens;
      totalOutput += r.outputTokens;
    });

    return {
      input: totalInput,
      cached: totalCached,
      output: totalOutput,
      total: totalInput + totalOutput,
    };
  }, [filteredUsages]);

  return (
    <div className="flex flex-col gap-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border p-4 rounded-xl flex flex-col gap-1">
          <div className="text-xs text-text-dim uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            总输入 Token
          </div>
          <div className="text-2xl font-bold text-text mt-1">{stats.input.toLocaleString()}</div>
          <div className="text-[10px] text-text-muted mt-0.5">包含缓存命中的输入</div>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl flex flex-col gap-1">
          <div className="text-xs text-text-dim uppercase tracking-wider flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-success" />
            输入（缓存命中）
          </div>
          <div className="text-2xl font-bold text-success mt-1">{stats.cached.toLocaleString()}</div>
          <div className="text-[10px] text-text-muted mt-0.5">
            占比: {stats.input > 0 ? ((stats.cached / stats.input) * 100).toFixed(1) : "0.0"}%
          </div>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl flex flex-col gap-1">
          <div className="text-xs text-text-dim uppercase tracking-wider flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-accent" />
            总输出 Token
          </div>
          <div className="text-2xl font-bold text-text mt-1">{stats.output.toLocaleString()}</div>
          <div className="text-[10px] text-text-muted mt-0.5">模型生成返回的 Token 数量</div>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl flex flex-col gap-1 bg-primary/5">
          <div className="text-xs text-primary-dim uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" />
            总 Token 消耗
          </div>
          <div className="text-2xl font-bold text-primary mt-1">{stats.total.toLocaleString()}</div>
          <div className="text-[10px] text-text-muted mt-0.5">输入 + 输出总计</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface border border-border p-4 rounded-xl flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1 min-w-[280px]">
          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-dim" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索用户、昵称、Provider..."
              className="w-full pl-9 pr-4 py-1.5 bg-surface-alt border border-border rounded-lg text-sm text-text placeholder-text-dim outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            />
          </div>

          {/* Date Picker */}
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 bg-surface-alt border border-border rounded-lg text-sm text-text outline-none focus:ring-1 focus:ring-primary transition-all"
          />

          {/* Reset Date button */}
          {selectedDate && (
            <button
              onClick={() => setSelectedDate("")}
              className="text-xs text-primary hover:text-primary-dim transition-all"
            >
              清除日期
            </button>
          )}
        </div>

        {/* Tab-like filters */}
        <div className="flex bg-surface-alt border border-border p-0.5 rounded-lg shrink-0">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              filterType === "all" ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilterType("shared")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
              filterType === "shared" ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
            }`}
          >
            <Globe className="w-3 h-3 text-accent" />
            仅共享 (Shared)
          </button>
          <button
            onClick={() => setFilterType("private")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
              filterType === "private" ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
            }`}
          >
            <Lock className="w-3 h-3 text-text-dim" />
            仅私有 (Private)
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-alt border-b border-border text-xs font-semibold text-text-dim uppercase tracking-wider">
                <th className="px-6 py-4">日期</th>
                <th className="px-6 py-4">用户</th>
                <th className="px-6 py-4">AI Provider</th>
                <th className="px-6 py-4 text-right">输入 Tokens</th>
                <th className="px-6 py-4 text-right">缓存命中</th>
                <th className="px-6 py-4 text-right">输出 Tokens</th>
                <th className="px-6 py-4 text-right">总计</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm text-text">
              {filteredUsages.length > 0 ? (
                filteredUsages.map(record => {
                  const recordTotal = record.inputTokens + record.outputTokens;
                  return (
                    <tr key={record.id} className="hover:bg-surface-alt/50 transition-all duration-150">
                      {/* Date */}
                      <td className="px-6 py-4 whitespace-nowrap font-medium font-mono text-xs">
                        {record.day}
                      </td>

                      {/* User */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-semibold text-text">{record.userName}</span>
                          <span className="text-xs text-text-dim font-mono">@{record.username}</span>
                        </div>
                      </td>

                      {/* AI Provider */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span className="font-medium text-text">{record.providerName}</span>
                            <span className="text-xs text-text-dim font-mono">{record.model}</span>
                          </div>
                          {record.isShared ? (
                            <span className="text-[10px] bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                              <Globe className="w-2.5 h-2.5" /> 共享
                            </span>
                          ) : (
                            <span className="text-[10px] bg-border text-text-muted px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                              <Lock className="w-2.5 h-2.5" /> 私有
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Input Tokens */}
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm">
                        {record.inputTokens.toLocaleString()}
                      </td>

                      {/* Cached Tokens */}
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm text-success">
                        {record.cachedInputTokens > 0 ? (
                          <span>{record.cachedInputTokens.toLocaleString()}</span>
                        ) : (
                          <span className="text-text-dim">-</span>
                        )}
                      </td>

                      {/* Output Tokens */}
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm">
                        {record.outputTokens.toLocaleString()}
                      </td>

                      {/* Total */}
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm font-bold text-primary">
                        {recordTotal.toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-text-dim">
                    没有找到符合条件的 Token 使用记录。
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
