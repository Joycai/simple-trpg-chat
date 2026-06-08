"use client";

import { useState } from "react";
import { analyzeTextForImportAction, batchImportItemsAction } from "@/app/actions/ai-import";
import { useRouter } from "next/navigation";

interface AiImportPanelProps {
  roomId: number;
  onClose: () => void;
}

type Step = "input" | "preview" | "done";

interface PreviewItem {
  type: "clue" | "info" | "character" | "item";
  title: string;
  content: string | Record<string, string>;
}

const TYPE_LABELS: Record<string, string> = {
  clue: "🃏 线索",
  info: "📄 信息",
  character: "👤 人物",
  item: "📦 物品",
};

const TYPE_COLORS: Record<string, string> = {
  clue: "bg-accent/10 text-accent border-accent/30",
  info: "bg-primary/10 text-primary border-primary/30",
  character: "bg-success/10 text-success border-success/30",
  item: "bg-warning/10 text-warning border-warning/30",
};

export function AiImportPanel({ roomId, onClose }: AiImportPanelProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [rawText, setRawText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError] = useState("");

  const handleAnalyze = async () => {
    if (!rawText.trim()) return;
    setAnalyzing(true);
    setError("");
    try {
      const result = await analyzeTextForImportAction(roomId, rawText.trim());
      if (result.success && result.items) {
        setItems(result.items);
        setStep("preview");
      } else {
        setError(result.error || "分析失败");
      }
    } catch (e: any) {
      setError(e.message || "请求失败");
    } finally {
      setAnalyzing(false);
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    setItems(prev => {
      const copy = [...prev];
      (copy[index] as any)[field] = value;
      return copy;
    });
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    if (items.length === 0) return;
    setImporting(true);
    try {
      const result = await batchImportItemsAction(roomId, items);
      setImportedCount(result.imported);
      setStep("done");
      router.refresh();
    } catch (e: any) {
      setError(e.message || "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const handleBack = () => {
    setStep("input");
    setError("");
  };

  const renderContent = (content: string | Record<string, string>) => {
    if (typeof content === "string") return content;
    return Object.entries(content)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative ml-auto w-[420px] bg-surface border-l border-border shadow-2xl h-full overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">📥 AI 智能导入</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl">×</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Step 1: Input */}
          {step === "input" && (
            <>
              <p className="text-sm text-text-muted">
                粘贴模组剧本、线索描述或 NPC 设定文本，AI 将自动分析并拆解为结构化条目。
              </p>
              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder="在此粘贴文本（最多 5000 字）...

例如：
• 地下室发现一滩暗红色血迹，经鉴定为O型血
• 老约翰是镇上唯一的钟表匠，今年67岁
• 银色怀表背面刻着'致我最爱的L'"
                rows={12}
                maxLength={5000}
                className="w-full p-3 border border-input-border bg-input-bg rounded-theme text-sm text-text resize-none font-mono leading-relaxed"
              />
              <div className="flex justify-between items-center text-xs text-text-dim">
                <span>{rawText.length}/5000</span>
                {error && <span className="text-danger">{error}</span>}
              </div>
              <button
                onClick={handleAnalyze}
                disabled={analyzing || !rawText.trim()}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-white py-3 rounded-theme font-bold transition">
                {analyzing ? "🤖 AI 分析中..." : "🤖 AI 智能解析"}
              </button>
            </>
          )}

          {/* Step 2: Preview & Edit */}
          {step === "preview" && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">
                  共识别 <strong className="text-text">{items.length}</strong> 个条目，请审核后导入
                </span>
                <button onClick={handleBack} className="text-xs text-primary hover:underline">← 返回修改文本</button>
              </div>

              {error && (
                <div className="bg-danger/10 border border-danger/20 text-danger text-sm p-3 rounded">{error}</div>
              )}

              <div className="flex flex-col gap-3">
                {items.map((item, i) => (
                  <div key={i} className="bg-surface-alt rounded-theme border border-border p-3 flex flex-col gap-2">
                    {/* Type badge */}
                    <div className="flex items-center justify-between">
                      <select
                        value={item.type}
                        onChange={e => updateItem(i, "type", e.target.value)}
                        className={`text-xs font-bold px-2 py-0.5 rounded border ${TYPE_COLORS[item.type] || ""}`}
                      >
                        {Object.entries(TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <button onClick={() => removeItem(i)}
                        className="text-xs text-text-dim hover:text-danger transition">🗑 删除</button>
                    </div>

                    {/* Title */}
                    <input
                      value={item.title}
                      onChange={e => updateItem(i, "title", e.target.value)}
                      className="text-sm font-bold text-text bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none p-0.5"
                    />

                    {/* Content */}
                    {typeof item.content === "string" ? (
                      <textarea
                        value={item.content}
                        onChange={e => updateItem(i, "content", e.target.value)}
                        rows={3}
                        className="text-xs text-text-muted bg-surface rounded p-2 border border-input-border resize-none"
                      />
                    ) : (
                      <div className="flex flex-col gap-1">
                        {Object.entries(item.content).map(([k, v]) => (
                          <div key={k} className="flex gap-2 items-start">
                            <span className="text-[10px] text-text-dim w-16 shrink-0 pt-0.5">{k}</span>
                            <input
                              value={v}
                              onChange={e => {
                                const content = { ...(item.content as Record<string, string>), [k]: e.target.value };
                                updateItem(i, "content", content);
                              }}
                              className="flex-1 text-xs text-text-muted bg-surface rounded px-2 py-0.5 border border-input-border"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={handleImport}
                disabled={importing || items.length === 0}
                className="w-full bg-success hover:bg-primary-hover disabled:opacity-40 text-white py-3 rounded-theme font-bold transition">
                {importing ? "导入中..." : `✅ 确认导入 (${items.length} 条)`}
              </button>
            </>
          )}

          {/* Step 3: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <span className="text-5xl">🎉</span>
              <h4 className="text-lg font-bold text-text">导入完成！</h4>
              <p className="text-sm text-text-muted">
                成功导入 <strong className="text-success">{importedCount}</strong> 条数据
              </p>
              <div className="flex gap-3">
                <button onClick={() => { setStep("input"); setRawText(""); setItems([]); }}
                  className="bg-accent hover:bg-accent-hover text-white px-6 py-2 rounded-theme font-bold text-sm">
                  📥 继续导入
                </button>
                <button onClick={onClose}
                  className="bg-surface-alt hover:bg-border text-text px-6 py-2 rounded-theme font-bold text-sm">
                  完成
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
