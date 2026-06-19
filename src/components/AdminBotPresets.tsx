"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Edit2, Trash2 } from "lucide-react";
import { createBotPresetAction, updateBotPresetAction, deleteBotPresetAction } from "@/app/actions/bot-presets";

interface BotPreset {
  id: number;
  name: string;
  defaultNickname: string;
  systemPrompt: string;
  allowEditPrompt: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AdminBotPresetsProps {
  presets: BotPreset[];
}

export function AdminBotPresets({ presets }: AdminBotPresetsProps) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const router = useRouter();

  // Create Form State
  const [name, setName] = useState("");
  const [defaultNickname, setDefaultNickname] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [allowEditPrompt, setAllowEditPrompt] = useState(true);
  const [createError, setCreateError] = useState("");

  // Edit State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDefaultNickname, setEditDefaultNickname] = useState("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");
  const [editAllowEditPrompt, setEditAllowEditPrompt] = useState(true);
  const [editError, setEditError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");

    if (!name.trim() || !defaultNickname.trim() || !systemPrompt.trim()) {
      setCreateError("All fields are required");
      return;
    }

    try {
      await createBotPresetAction({
        name: name.trim(),
        defaultNickname: defaultNickname.trim(),
        systemPrompt: systemPrompt.trim(),
        allowEditPrompt,
      });
      setName("");
      setDefaultNickname("");
      setSystemPrompt("");
      setAllowEditPrompt(true);
      router.refresh();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create preset");
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError("");

    if (!editingId) return;
    if (!editName.trim() || !editDefaultNickname.trim() || !editSystemPrompt.trim()) {
      setEditError("All fields are required");
      return;
    }

    try {
      await updateBotPresetAction(editingId, {
        name: editName.trim(),
        defaultNickname: editDefaultNickname.trim(),
        systemPrompt: editSystemPrompt.trim(),
        allowEditPrompt: editAllowEditPrompt,
      });
      setEditingId(null);
      router.refresh();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update preset");
    }
  };

  const handleDelete = async (id: number, presetName: string) => {
    if (confirm(`Are you sure you want to delete preset "${presetName}"?`)) {
      try {
        await deleteBotPresetAction(id);
        if (editingId === id) setEditingId(null);
        router.refresh();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Failed to delete preset");
      }
    }
  };

  const startEdit = (preset: BotPreset) => {
    setEditingId(preset.id);
    setEditName(preset.name);
    setEditDefaultNickname(preset.defaultNickname);
    setEditSystemPrompt(preset.systemPrompt);
    setEditAllowEditPrompt(preset.allowEditPrompt);
    setEditError("");
  };

  return (
    <section className="bg-surface p-5 rounded-xl border border-border shadow-lg flex flex-col gap-4">
      <h3 className="font-bold text-text flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-primary" />
        {t("presetManagement")}
        <span className="text-xs text-text-dim font-normal ml-auto">
          {presets.length} Presets
        </span>
      </h3>
      <p className="text-xs text-text-muted -mt-2">{t("presetManagementDesc")}</p>

      {/* Edit Form */}
      {editingId !== null && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-2">
          <h4 className="text-sm font-bold text-primary mb-3 flex items-center gap-1.5">
            <Edit2 className="w-3.5 h-3.5" />
            {t("editPreset")}
          </h4>
          <form onSubmit={handleUpdateSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-dim">{t("presetName")}</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t("presetNamePlaceholder")}
                  className="p-2 bg-surface border border-border rounded text-text text-sm"
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-dim">{t("defaultNickname")}</label>
                <input
                  value={editDefaultNickname}
                  onChange={(e) => setEditDefaultNickname(e.target.value)}
                  placeholder={t("defaultNicknamePlaceholder")}
                  className="p-2 bg-surface border border-border rounded text-text text-sm font-mono"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">{t("systemPrompt")}</label>
              <textarea
                value={editSystemPrompt}
                onChange={(e) => setEditSystemPrompt(e.target.value)}
                placeholder={t("promptPlaceholder")}
                rows={4}
                className="p-2 bg-surface border border-border rounded text-text text-sm font-mono resize-none"
                required
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer py-1 select-none">
              <input
                type="checkbox"
                checked={editAllowEditPrompt}
                onChange={(e) => setEditAllowEditPrompt(e.target.checked)}
                className="w-3.5 h-3.5 accent-primary cursor-pointer"
              />
              <span className="font-medium">{t("allowEditPrompt")}</span>
              <span className="text-[10px] text-text-dim">({t("allowEditPromptDesc")})</span>
            </label>

            {editError && <p className="text-xs text-danger">{editError}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg font-bold text-sm transition cursor-pointer"
              >
                {t("savePreset")}
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="text-text-dim hover:text-text text-sm px-2 cursor-pointer"
              >
                {tCommon("cancel")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Form */}
      <details className="group border border-border rounded-lg bg-surface-alt p-3 [&_summary::-webkit-details-marker]:hidden">
        <summary className="text-sm text-text-muted cursor-pointer hover:text-text transition flex items-center gap-1">
          <span className="transition-transform group-open:rotate-90">▶</span>
          <span className="font-medium">＋ {t("createPreset")}</span>
        </summary>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 mt-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">{t("presetName")}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("presetNamePlaceholder")}
                className="p-2 bg-surface border border-border rounded text-text text-sm"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">{t("defaultNickname")}</label>
              <input
                value={defaultNickname}
                onChange={(e) => setDefaultNickname(e.target.value)}
                placeholder={t("defaultNicknamePlaceholder")}
                className="p-2 bg-surface border border-border rounded text-text text-sm font-mono"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-dim">{t("systemPrompt")}</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t("promptPlaceholder")}
              rows={4}
              className="p-2 bg-surface border border-border rounded text-text text-sm font-mono resize-none"
              required
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer py-1 select-none">
            <input
              type="checkbox"
              checked={allowEditPrompt}
              onChange={(e) => setAllowEditPrompt(e.target.checked)}
              className="w-3.5 h-3.5 accent-primary cursor-pointer"
            />
            <span className="font-medium">{t("allowEditPrompt")}</span>
            <span className="text-[10px] text-text-dim">({t("allowEditPromptDesc")})</span>
          </label>

          {createError && <p className="text-xs text-danger">{createError}</p>}

          <button
            type="submit"
            className="bg-primary hover:bg-primary-hover text-white py-2 rounded-lg font-bold text-sm transition cursor-pointer"
          >
            {t("createPreset")}
          </button>
        </form>
      </details>

      {/* Preset List Table */}
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-text-muted text-xs border-b border-border">
              <th className="pb-2.5 font-medium">{t("presetName")}</th>
              <th className="pb-2.5 font-medium">{t("defaultNickname")}</th>
              <th className="pb-2.5 font-medium max-w-[200px]">{t("systemPrompt")}</th>
              <th className="pb-2.5 font-medium text-center">{t("allowEditPrompt")}</th>
              <th className="pb-2.5 font-medium text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {presets.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-text-dim text-sm">
                  {t("noPresets")}
                </td>
              </tr>
            ) : (
              presets.map((preset) => (
                <tr
                  key={preset.id}
                  className="border-b border-border last:border-0 hover:bg-surface-alt transition text-xs"
                >
                  <td className="py-3 font-semibold text-text">{preset.name}</td>
                  <td className="py-3 font-mono text-text-muted">{preset.defaultNickname}</td>
                  <td className="py-3 max-w-[200px] truncate text-text-muted font-mono" title={preset.systemPrompt}>
                    {preset.systemPrompt}
                  </td>
                  <td className="py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        preset.allowEditPrompt
                          ? "bg-success/20 text-success"
                          : "bg-text-dim/20 text-text-dim"
                      }`}
                    >
                      {preset.allowEditPrompt ? "YES" : "NO"}
                    </span>
                  </td>
                  <td className="py-3 text-right flex items-center justify-end gap-2.5">
                    <button
                      onClick={() => startEdit(preset)}
                      className="text-text-muted/60 hover:text-primary transition cursor-pointer"
                      title={t("editPreset")}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(preset.id, preset.name)}
                      className="text-danger/60 hover:text-danger transition cursor-pointer"
                      title={t("delete")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
