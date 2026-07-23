"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import {
  NOTEBOOK_CATEGORIES,
  mentionQueryAt,
  type NotebookCategory,
  type NotebookLinkEntity,
  NOTE_TITLE_MAX,
} from "@/lib/notebook";
import { CATEGORY_META, entityMeta, type Note } from "./notebook-helpers";

interface NotebookEditorProps {
  note: Note | null; // null = create
  entities: NotebookLinkEntity[];
  onCancel: () => void;
  onSave: (input: { title: string; content: string; category: NotebookCategory }) => Promise<void>;
}

const MAX_SUGGESTIONS = 6;

/**
 * Full-pane note editor: title, category chips, a markdown toolbar and a plain
 * textarea. Typing `@` opens a backpack picker (driven by `mentionQueryAt`);
 * picking an entry inserts its plain `@标题` token followed by a space.
 */
export function NotebookEditor({ note, entities, onCancel, onSave }: NotebookEditorProps) {
  const t = useTranslations("notebook");
  const tCommon = useTranslations("common");

  const [title, setTitle] = useState(note?.title ?? "");
  const [category, setCategory] = useState<NotebookCategory>(
    (NOTEBOOK_CATEGORIES as readonly string[]).includes(note?.category ?? "")
      ? (note!.category as NotebookCategory)
      : "misc"
  );
  const [content, setContent] = useState(note?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return entities
      .filter((e) => !q || e.title.toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [mention, entities]);

  const pickerOpen = mention !== null && suggestions.length > 0;

  /** Re-evaluate the @-draft under the caret after any edit / caret move. */
  const syncMention = (el: HTMLTextAreaElement) => {
    const found = mentionQueryAt(el.value, el.selectionStart ?? 0);
    setMention(found);
    setActiveIdx(0);
  };

  const insertMention = (entity: NotebookLinkEntity) => {
    const el = textareaRef.current;
    if (!el || !mention) return;
    const caret = el.selectionStart ?? 0;
    const next = `${content.slice(0, mention.start)}@${entity.title} ${content.slice(caret)}`;
    setContent(next);
    setMention(null);
    const newCaret = mention.start + entity.title.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
    });
  };

  /** Wrap the current selection (or insert `placeholder`) with before/after. */
  const applyWrap = (before: string, after: string, placeholder = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const selected = content.slice(start, end) || placeholder;
    const next = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  /** Prefix each selected line (or the caret's line) — headings, lists, quotes. */
  const applyLinePrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const block = content.slice(lineStart, end);
    const prefixed = block.split("\n").map((l) => (l.startsWith(prefix) ? l : prefix + l)).join("\n");
    const next = content.slice(0, lineStart) + prefixed + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const delta = prefixed.length - block.length;
      el.setSelectionRange(start + (start === lineStart ? prefix.length : delta), end + delta);
    });
  };

  const startMention = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? content.length;
    const next = `${content.slice(0, start)}@${content.slice(el.selectionEnd ?? start)}`;
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 1, start + 1);
      setMention({ start, query: "" });
      setActiveIdx(0);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!pickerOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMention(null);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), content, category });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  };

  const toolBtn = "flex items-center justify-center w-8 h-8 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Editor header: back + title + save */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-border shrink-0">
        <button onClick={onCancel} className={toolBtn} aria-label={tCommon("cancel")}>
          <Icons.ArrowLeft className="w-5 h-5" />
        </button>
        <h4 className="font-bold text-text text-lg font-theme-display flex-1 truncate">
          {note ? t("editNote") : t("newNote")}
        </h4>
        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="notebook-save-btn flex items-center gap-1.5 h-9 px-4 rounded-theme bg-accent text-accent-foreground text-sm font-bold hover:bg-accent-hover transition disabled:opacity-50 cursor-pointer"
        >
          {saving && <Icons.Loader2 className="w-4 h-4 animate-spin" />}
          {t("save")}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-4 gap-3 overflow-y-auto">
        {/* Title */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={NOTE_TITLE_MAX}
          placeholder={t("noteTitlePlaceholder")}
          autoFocus={!note}
          className="w-full bg-input-bg border border-input-border rounded-theme px-3.5 py-2.5 text-lg font-bold text-text font-theme-display outline-none focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent/50"
        />

        {/* Category chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-muted shrink-0">{t("categoryLabel")}</span>
          {NOTEBOOK_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={`px-3 py-1 rounded-full border text-xs font-bold transition cursor-pointer ${
                category === cat
                  ? "bg-accent text-accent-foreground border-accent"
                  : "text-text-muted border-border hover:text-text hover:bg-surface-alt"
              }`}
            >
              {t(CATEGORY_META[cat].labelKey)}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 border-y border-border py-1.5">
          <button onClick={() => applyLinePrefix("## ")} className={toolBtn} title={t("toolHeading")}><Icons.Heading2 className="w-4 h-4" /></button>
          <button onClick={() => applyWrap("**", "**")} className={toolBtn} title={t("toolBold")}><Icons.Bold className="w-4 h-4" /></button>
          <button onClick={() => applyWrap("*", "*")} className={toolBtn} title={t("toolItalic")}><Icons.Italic className="w-4 h-4" /></button>
          <span className="w-px h-4 bg-border mx-1" aria-hidden />
          <button onClick={() => applyLinePrefix("- ")} className={toolBtn} title={t("toolList")}><Icons.List className="w-4 h-4" /></button>
          <button onClick={() => applyLinePrefix("> ")} className={toolBtn} title={t("toolQuote")}><Icons.Quote className="w-4 h-4" /></button>
          <button onClick={() => applyWrap("[", "](url)", t("toolLinkText"))} className={toolBtn} title={t("toolLink")}><Icons.Link2 className="w-4 h-4" /></button>
          <span className="w-px h-4 bg-border mx-1" aria-hidden />
          <button onClick={startMention} className={`${toolBtn} text-accent hover:text-accent`} title={t("toolMention")}><Icons.AtSign className="w-4 h-4" /></button>
          <span className="ml-auto text-xs text-text-dim font-theme-mono select-none pr-1">Markdown</span>
        </div>

        {/* Content + mention picker */}
        <div className="relative flex-1 min-h-[14rem] flex flex-col">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => { setContent(e.target.value); syncMention(e.target); }}
            onKeyDown={handleKeyDown}
            onClick={(e) => syncMention(e.currentTarget)}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            placeholder={t("contentPlaceholder")}
            className="flex-1 w-full resize-none bg-input-bg border border-input-border rounded-theme px-3.5 py-3 text-sm text-text leading-relaxed font-theme outline-none focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent/50"
          />

          {pickerOpen && (
            <div className="notebook-mention-picker absolute left-2 right-2 sm:left-8 sm:right-auto sm:w-80 bottom-2 bg-surface border border-border rounded-theme shadow-xl overflow-hidden z-10">
              <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border">
                <span className="text-sm font-bold text-accent font-theme-mono">@{mention?.query}</span>
                <span className="text-xs text-text-muted">{t("mentionHeader")}</span>
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {suggestions.map((e, i) => {
                  const { Icon, labelKey, chipClass } = entityMeta(e.type);
                  return (
                    <button
                      key={e.id}
                      onMouseDown={(ev) => { ev.preventDefault(); insertMention(e); }}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2 transition cursor-pointer ${i === activeIdx ? "bg-surface-alt" : ""}`}
                    >
                      <span className={`flex items-center justify-center w-8 h-8 rounded-theme border shrink-0 ${chipClass}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-text truncate">{e.title}</span>
                        <span className="block text-xs text-text-muted">{t(labelKey)} · {t("fromBackpack")}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between px-3.5 py-1.5 border-t border-border text-[11px] text-text-dim select-none">
                <span>↑↓ {t("mentionSelect")} · ⏎ {t("mentionInsert")}</span>
                <span>{t("mentionItems", { count: suggestions.length })}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
