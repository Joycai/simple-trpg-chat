"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Edit2, Trash2, Plus, X, Check } from "lucide-react";
import { createBotPresetAction, updateBotPresetAction, deleteBotPresetAction } from "@/app/actions/bot-presets";
import { OverlayShell } from "@/components/shared/OverlayShell";

const DOT_COLORS = ["bg-ai", "bg-primary", "bg-accent", "bg-success", "bg-warning"];

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
  const [showCreate, setShowCreate] = useState(false);
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

  const handleCreate = async (e: React.FormEvent, close: () => void) => {
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
      close();
      router.refresh();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create preset");
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent, close: () => void) => {
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
      close();
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
    setShowCreate(false);
    setEditingId(preset.id);
    setEditName(preset.name);
    setEditDefaultNickname(preset.defaultNickname);
    setEditSystemPrompt(preset.systemPrompt);
    setEditAllowEditPrompt(preset.allowEditPrompt);
    setEditError("");
  };

  return (
    <section className="bg-surface theme-border border border-border rounded-theme shadow-lg p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-text text-lg font-theme-display">{t("botPresetsTitle")}</h3>
        {editingId === null && (
          <button
            onClick={() => { setShowCreate(v => !v); setCreateError(""); }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-theme text-sm font-bold border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> {t("addPreset")}
          </button>
        )}
      </div>

      {/* Edit Modal */}
      {editingId !== null && createPortal(
        <OverlayShell
          onClose={() => setEditingId(null)}
          rootClassName="p-4"
          panelClassName="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        >
          {(close) => (
            <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
              <h3 className="font-bold text-text text-lg font-theme-display flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary" />
                {t("editPreset")}
              </h3>
              <button type="button" onClick={close}
                className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => handleUpdateSubmit(e, close)} className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">{t("presetName")}</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t("presetNamePlaceholder")} required
                    className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">{t("defaultNickname")} @</label>
                  <input value={editDefaultNickname} onChange={(e) => setEditDefaultNickname(e.target.value)} placeholder={t("defaultNicknamePlaceholder")} required
                    className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm font-theme-mono placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-dim font-medium">{t("systemPrompt")}</label>
                <textarea value={editSystemPrompt} onChange={(e) => setEditSystemPrompt(e.target.value)} placeholder={t("promptPlaceholder")} rows={5} required
                  className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm font-theme-mono resize-none placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
              </div>

              <label className={`flex items-start gap-3 px-3.5 py-3 rounded-theme border cursor-pointer transition ${editAllowEditPrompt ? "border-primary/50 bg-primary/10" : "border-input-border bg-input-bg hover:bg-surface-alt"}`}>
                <input type="checkbox" checked={editAllowEditPrompt} onChange={(e) => setEditAllowEditPrompt(e.target.checked)} className="sr-only" />
                <span className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 mt-0.5 transition ${editAllowEditPrompt ? "bg-primary border-primary text-primary-foreground" : "border-input-border"}`}>
                  {editAllowEditPrompt && <Check className="w-3.5 h-3.5" />}
                </span>
                <div>
                  <div className="text-sm font-medium text-text">{t("allowEditPrompt")}</div>
                  <div className="text-xs text-text-dim mt-0.5">{t("allowEditPromptDesc")}</div>
                </div>
              </label>

              {editError && <p className="text-xs text-danger">{editError}</p>}

              <div className="flex items-center gap-3 pt-1">
                <button type="button"
                  onClick={() => editingId !== null && handleDelete(editingId, editName)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-theme text-sm font-medium border border-danger/40 text-danger hover:bg-danger/10 transition cursor-pointer">
                  <Trash2 className="w-4 h-4" /> {t("delete")}
                </button>
                <div className="flex items-center gap-3 ml-auto">
                  <button type="button" onClick={close}
                    className="px-4 py-2 text-sm text-text-muted hover:text-text transition cursor-pointer">{tCommon("cancel")}</button>
                  <button type="submit"
                    className="px-6 py-2.5 bg-gradient-to-b from-primary to-primary/85 hover:brightness-110 text-primary-foreground rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">
                    {t("savePreset")}
                  </button>
                </div>
              </div>
            </form>
            </>
          )}
        </OverlayShell>,
        document.body
      )}

      {/* Create Modal */}
      {showCreate && createPortal(
        <OverlayShell
          onClose={() => { setShowCreate(false); setCreateError(""); }}
          rootClassName="p-4"
          panelClassName="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        >
          {(close) => (
            <>
            <div className="flex items-start justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
              <div>
                <h3 className="font-bold text-text text-lg font-theme-display flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  {t("botPresetsTitle")}
                </h3>
                <p className="text-xs text-text-muted mt-1">{t("presetModalDesc")}</p>
              </div>
              <button type="button" onClick={close}
                className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => handleCreate(e, close)} className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">{t("presetName")}</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("presetNamePlaceholder")} required
                    className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">{t("defaultNickname")} @</label>
                  <input value={defaultNickname} onChange={(e) => setDefaultNickname(e.target.value)} placeholder={t("defaultNicknamePlaceholder")} required
                    className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm font-theme-mono placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-dim font-medium">{t("systemPrompt")}</label>
                <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder={t("promptPlaceholder")} rows={5} required
                  className="px-3.5 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm font-theme-mono resize-none placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
              </div>

              <label className={`flex items-start gap-3 px-3.5 py-3 rounded-theme border cursor-pointer transition ${allowEditPrompt ? "border-primary/50 bg-primary/10" : "border-input-border bg-input-bg hover:bg-surface-alt"}`}>
                <input type="checkbox" checked={allowEditPrompt} onChange={(e) => setAllowEditPrompt(e.target.checked)} className="sr-only" />
                <span className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 mt-0.5 transition ${allowEditPrompt ? "bg-primary border-primary text-primary-foreground" : "border-input-border"}`}>
                  {allowEditPrompt && <Check className="w-3.5 h-3.5" />}
                </span>
                <div>
                  <div className="text-sm font-medium text-text">{t("allowEditPrompt")}</div>
                  <div className="text-xs text-text-dim mt-0.5">{t("allowEditPromptDesc")}</div>
                </div>
              </label>

              {createError && <p className="text-xs text-danger">{createError}</p>}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button type="button" onClick={close}
                  className="px-4 py-2 text-sm text-text-muted hover:text-text transition cursor-pointer">{tCommon("cancel")}</button>
                <button type="submit"
                  className="px-6 py-2.5 bg-gradient-to-b from-primary to-primary/85 hover:brightness-110 text-primary-foreground rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">
                  {t("createPreset")}
                </button>
              </div>
            </form>
            </>
          )}
        </OverlayShell>,
        document.body
      )}

      {/* Preset chips */}
      {presets.length === 0 && !showCreate && editingId === null ? (
        <div className="py-8 text-center text-text-dim text-sm">{t("noPresets")}</div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => startEdit(preset)}
              className={`group inline-flex items-center gap-2 px-3.5 py-2.5 rounded-theme border bg-surface-alt/40 transition cursor-pointer ${
                editingId === preset.id ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40 hover:bg-surface-alt"
              }`}
              title={preset.systemPrompt}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[preset.id % DOT_COLORS.length]}`} />
              <span className="text-sm font-bold text-text">{preset.name}</span>
              <span className="text-xs text-text-dim font-theme-mono">{preset.defaultNickname}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
