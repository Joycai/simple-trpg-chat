"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { useMentionTextarea } from "@/components/room/hooks/useMentionTextarea";
import { MentionPicker } from "@/components/room/MentionPicker";
import {
  type NotebookLinkEntity,
  NOTE_TITLE_MAX,
  NOTE_CONTENT_MAX,
} from "@/lib/notebook";
import { colorMeta, type Category, type Note } from "./notebook-helpers";

interface NotebookEditorProps {
  note: Note | null; // null = create
  categories: Category[];
  entities: NotebookLinkEntity[];
  /** The drawer reads this before closing, so a mistouch outside cannot
   *  silently discard an in-progress note. */
  dirtyRef?: React.MutableRefObject<() => boolean>;
  onCancel: () => void;
  onSave: (input: { title: string; content: string; categoryId: number | null }) => Promise<void>;
}

const MAX_SUGGESTIONS = 6;

/**
 * Full-pane note editor: title, category chips, a markdown toolbar and a plain
 * textarea. Typing `@` opens a backpack picker (driven by `mentionQueryAt`);
 * picking an entry inserts its plain `@标题` token followed by a space.
 */
export function NotebookEditor({ note, categories, entities, dirtyRef, onCancel, onSave }: NotebookEditorProps) {
  const t = useTranslations("notebook");
  const tCommon = useTranslations("common");

  const [title, setTitle] = useState(note?.title ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(
    note && categories.some((c) => c.id === note.categoryId) ? note.categoryId : null
  );
  const [content, setContent] = useState(note?.content ?? "");
  const [saving, setSaving] = useState(false);

  const {
    textareaRef, textareaProps, mention, activeIdx, setActiveIdx,
    suggestions, pickerOpen, insertMention, startMention, applyWrap, applyLinePrefix,
  } = useMentionTextarea({ value: content, setValue: setContent, entities, maxSuggestions: MAX_SUGGESTIONS });

  /** Unsaved-work guard: the drawer and the back button both unmount us. */
  const dirty =
    title !== (note?.title ?? "") ||
    content !== (note?.content ?? "") ||
    categoryId !== (note && categories.some((c) => c.id === note.categoryId) ? note.categoryId : null);

  // A ref, not a callback prop: the parent only reads it on close, so there is
  // no reason to re-render the drawer on every keystroke.
  useEffect(() => {
    if (dirtyRef) dirtyRef.current = () => dirty;
  });

  const handleCancel = () => { if (!dirty || confirm(t("discardConfirm"))) onCancel(); };

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), content, categoryId });
    } catch {
      // Expected failures are already reported (localized) by the caller; this
      // only catches the unexpected, where a raw message would be Next's
      // production redaction notice rather than anything the user can act on.
      alert(tCommon("error"));
    } finally {
      setSaving(false);
    }
  };

  const toolBtn = "flex items-center justify-center w-8 h-8 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Editor header: back + title + save */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-border shrink-0">
        <button onClick={handleCancel} className={toolBtn} aria-label={tCommon("cancel")}>
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

        {/* Category chips — the user's own categories, tinted by label color */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-muted shrink-0">{t("categoryLabel")}</span>
          <button
            onClick={() => setCategoryId(null)}
            aria-pressed={categoryId === null}
            className={`px-3 py-1 rounded-full border text-xs font-bold transition cursor-pointer ${
              categoryId === null
                ? "text-text border-text-muted bg-surface-alt"
                : "text-text-muted border-border hover:text-text hover:bg-surface-alt"
            }`}
          >
            {t("uncategorized")}
          </button>
          {categories.map((cat) => {
            const meta = colorMeta(cat.color);
            return (
              <button
                key={cat.id}
                onClick={() => setCategoryId(cat.id)}
                aria-pressed={categoryId === cat.id}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold transition cursor-pointer ${
                  categoryId === cat.id
                    ? meta.chipOn
                    : "text-text-muted border-border hover:text-text hover:bg-surface-alt"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                {cat.name}
              </button>
            );
          })}
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
          <span className="ml-auto flex items-center gap-2 pr-1 text-xs font-theme-mono select-none">
            <span className={content.length > NOTE_CONTENT_MAX * 0.9 ? "text-warning" : "text-text-dim"}>
              {content.length} / {NOTE_CONTENT_MAX}
            </span>
            <span className="text-text-dim">{t("markdownLabel")}</span>
          </span>
        </div>

        {/* Content + mention picker */}
        <div className="relative flex-1 min-h-[14rem] flex flex-col">
          <textarea
            ref={textareaRef}
            value={content}
            {...textareaProps}
            maxLength={NOTE_CONTENT_MAX}
            placeholder={t("contentPlaceholder")}
            className="flex-1 w-full resize-none bg-input-bg border border-input-border rounded-theme px-3.5 py-3 text-sm text-text leading-relaxed font-theme outline-none focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent/50"
          />

          {pickerOpen && (
            <MentionPicker
              query={mention?.query ?? ""}
              suggestions={suggestions}
              activeIdx={activeIdx}
              onPick={insertMention}
              onHover={setActiveIdx}
              className="left-2 right-2 sm:left-8 sm:right-auto sm:w-80 bottom-2"
            />
          )}
        </div>
      </div>
    </div>
  );
}
