"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldAlert, Save, Lock, AlertCircle } from "lucide-react";
import { updateSystemConfig } from "@/app/actions/ai";
import { DEFAULT_SENSITIVE_WORDS } from "@/lib/sensitive-words-constants";

interface AdminSensitiveWordsProps {
  initialWords: string;
}

export function AdminSensitiveWords({ initialWords }: AdminSensitiveWordsProps) {
  const t = useTranslations("admin");
  const [customWords, setCustomWords] = useState(initialWords);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const [showDefaults, setShowDefaults] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      await updateSystemConfig("sensitive_words", customWords);
      setMsg(t("saveSuccess") || "配置已保存");
      setMsgType("success");
    } catch (e) {
      console.error(e);
      setMsg(t("saveFailed") || "保存失败，请重试");
      setMsgType("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-surface p-6 rounded-xl border border-border shadow-lg flex flex-col gap-6 transition-all duration-200 hover:border-purple-500/20">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-danger/10 text-danger rounded-lg shrink-0">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-text text-lg mb-1 flex items-center gap-2">
            {t("sensitiveWords") || "敏感词过滤设置"}
          </h3>
          <p className="text-xs text-text-muted leading-relaxed">
            {t("sensitiveWordsDesc") || "配置发言拦截词汇。系统预置了与中国大陆政治相关的敏感词（默认且不可删除），您可以在下方添加额外的自定义敏感词。"}
          </p>
        </div>
      </div>

      <div className="border-t border-border/60 my-1" />

      {/* Default Words (Immutable) */}
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <label className="text-sm font-bold text-text flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-text-dim" />
            {t("defaultBlacklist") || "系统预置词（不可删除）"}
            <span className="text-[10px] bg-danger/10 text-danger border border-danger/20 px-2 py-0.5 rounded-full font-normal">
              {DEFAULT_SENSITIVE_WORDS.length} 个敏感词已保护
            </span>
          </label>
          <button
            onClick={() => setShowDefaults(!showDefaults)}
            className="text-xs text-primary hover:text-primary-hover font-medium transition"
          >
            {showDefaults ? "收起预置列表" : "展开预置列表"}
          </button>
        </div>

        {showDefaults && (
          <div className="p-3 bg-bg/50 border border-border rounded-lg max-h-36 overflow-y-auto flex flex-wrap gap-1.5 scrollbar-thin">
            {DEFAULT_SENSITIVE_WORDS.map((w, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 text-[10px] bg-danger/5 text-danger-dim border border-danger/10 px-2 py-1 rounded-md"
              >
                {w}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Custom Words */}
      <div className="flex flex-col gap-2.5">
        <label htmlFor="custom-sensitive-words" className="text-sm font-bold text-text">
          {t("customBlacklist") || "自定义敏感词（每行或逗号隔开一个）"}
        </label>
        <textarea
          id="custom-sensitive-words"
          value={customWords}
          onChange={(e) => setCustomWords(e.target.value)}
          placeholder="例如：赌博, 翻墙, 暴政"
          disabled={saving}
          className="p-3 bg-bg border border-border rounded-lg text-text text-sm outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition min-h-[120px] font-mono leading-relaxed placeholder-text-dim"
        />
        <p className="text-[10px] text-text-dim flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          当房间中用户发送的消息包含上述任一词汇时，消息将被阻断，且仅发送者本人能看到警告提示。
        </p>
      </div>

      {/* Footer / Actions */}
      <div className="flex items-center gap-4 mt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:bg-text-dim text-white font-bold px-4 py-2 rounded-lg text-sm transition shadow-md hover:shadow-lg disabled:shadow-none"
        >
          <Save className="w-4 h-4" />
          {saving ? "保存中..." : (t("saveConfig") || "保存配置")}
        </button>

        {msg && (
          <span
            className={`text-xs font-semibold animate-fade-in ${
              msgType === "success" ? "text-success" : "text-danger"
            }`}
          >
            {msg}
          </span>
        )}
      </div>
    </section>
  );
}
