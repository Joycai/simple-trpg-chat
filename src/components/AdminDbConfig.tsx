"use client";

import { useState, useEffect } from "react";
import { getDbConfigAction, saveDbConfigAction, testDbConnectionAction } from "@/app/actions/db-config";

export function AdminDbConfig() {
  const [dbType, setDbType] = useState("sqlite");
  const [pgUrl, setPgUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getDbConfigAction().then(config => {
      setDbType(config.dbType);
      setPgUrl(config.pgUrl);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveDbConfigAction(dbType, pgUrl);
      setMessage("✅ 配置已保存。重启服务后生效。");
    } catch (e: any) {
      setMessage(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!pgUrl) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDbConnectionAction(pgUrl);
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="bg-surface p-6 rounded-theme shadow-sm border border-border">
      <h3 className="text-lg font-bold mb-4 border-b border-border pb-2">
        🗄️ 数据库配置
      </h3>

      <div className="flex flex-col gap-4">
        {/* DB Type selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted font-medium">数据库类型</label>
          <select
            value={dbType}
            onChange={e => setDbType(e.target.value)}
            className="p-2 border border-border rounded bg-surface max-w-xs"
          >
            <option value="sqlite">📦 SQLite（默认，零配置）</option>
            <option value="postgresql">🐘 PostgreSQL</option>
          </select>
        </div>

        {/* PostgreSQL config */}
        {dbType === "postgresql" && (
          <div className="flex flex-col gap-3 bg-accent/5 border border-accent/20 rounded-theme p-4">
            <p className="text-xs text-text-dim">
              PostgreSQL 连接字符串格式：<code className="bg-surface px-1 py-0.5 rounded text-accent">postgres://user:password@host:5432/dbname</code>
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted font-medium">连接字符串</label>
              <div className="flex gap-2">
                <input
                  value={pgUrl}
                  onChange={e => setPgUrl(e.target.value)}
                  placeholder="postgres://user:password@localhost:5432/trpg"
                  className="flex-1 p-2 border border-border rounded bg-surface font-mono text-sm"
                />
                <button
                  onClick={handleTest}
                  disabled={testing || !pgUrl}
                  className="bg-accent/10 hover:bg-accent/20 text-accent px-4 py-2 rounded font-bold text-sm disabled:opacity-40"
                >
                  {testing ? "测试中..." : "🔌 测试连接"}
                </button>
              </div>
            </div>

            {/* Test result */}
            {testResult && (
              <div className={`text-sm p-3 rounded font-medium ${
                testResult.ok ? "bg-success/10 text-success border border-success/20" : "bg-danger/10 text-danger border border-danger/20"
              }`}>
                {testResult.ok ? "✅ 连接成功！" : `❌ 连接失败：${testResult.error}`}
              </div>
            )}
          </div>
        )}

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-theme font-bold text-sm disabled:opacity-40"
          >
            {saving ? "保存中..." : "💾 保存配置"}
          </button>
          {message && (
            <span className={`text-sm font-medium ${message.startsWith("✅") ? "text-success" : "text-danger"}`}>
              {message}
            </span>
          )}
        </div>

        <p className="text-xs text-text-dim">
          注意：切换到 PostgreSQL 后，需要重启服务才能生效。SQLite 数据不会自动迁移。
        </p>
      </div>
    </section>
  );
}
