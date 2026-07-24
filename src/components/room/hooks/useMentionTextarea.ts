"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mentionQueryAt, type NotebookLinkEntity } from "@/lib/notebook";
import { applyLinePrefixEdit, applyMentionEdit, applyWrapEdit, type TextEdit } from "@/lib/textarea-edits";

const DEFAULT_MAX_SUGGESTIONS = 6;

interface MentionDraft {
  /** Index of the `@` that opened the draft. */
  start: number;
  query: string;
}

export interface MentionTextarea {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  mention: MentionDraft | null;
  activeIdx: number;
  suggestions: NotebookLinkEntity[];
  pickerOpen: boolean;
  setActiveIdx: (i: number) => void;
  /** Spread onto the <textarea>. */
  textareaProps: Required<Pick<
    React.ComponentProps<"textarea">,
    "onChange" | "onKeyDown" | "onSelect" | "onBlur"
  >>;
  insertMention: (entity: NotebookLinkEntity) => void;
  startMention: () => void;
  applyWrap: (before: string, after: string, placeholder?: string) => void;
  applyLinePrefix: (prefix: string) => void;
}

/**
 * The markdown toolbar + `@`-mention behavior shared by the notebook and event
 * editors. Both had their own near-identical copy; the event one was pasted
 * from the notebook and lost three details on the way, so the two drifted into
 * different bugs. Owning it once means a fix lands in both.
 *
 * Four things this gets right that the copies did not:
 *
 * 1. Caret tracking runs off `onSelect`, the only native event that fires for
 *    *every* selection change — arrow keys, Home/End, drag-select. The copies
 *    listened on `onChange`/`onClick`, so moving the caret with the keyboard
 *    left a stale draft: typing `@dag`, pressing Left twice, then Enter used
 *    the old offsets and produced `"@Dagger ag"`.
 * 2. The blur timer that dismisses the picker is cancellable. Clicking the `@`
 *    toolbar button blurs the textarea first, and nothing cancelled the
 *    already-queued dismissal, so the picker opened and then vanished ~150ms
 *    later on its own.
 * 3. Opening a draft resets the highlighted row. Escape cleared the draft but
 *    not the index, so the next `@` session started highlighting wherever the
 *    last one left off and Enter inserted the wrong entry.
 * 4. Selection is restored through `src/lib/textarea-edits.ts`, which shifts
 *    the anchor by the current line's prefix rather than every line's — and
 *    restores it at all, which the event editor had stopped doing.
 */
export function useMentionTextarea(opts: {
  value: string;
  setValue: (next: string) => void;
  entities: NotebookLinkEntity[];
  maxSuggestions?: number;
}): MentionTextarea {
  const { value, setValue, entities, maxSuggestions = DEFAULT_MAX_SUGGESTIONS } = opts;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [commitSeq, setCommitSeq] = useState(0);
  const [mention, setMention] = useState<MentionDraft | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // Applies the caret position queued by the last commit, after React has put
  // the new text in the DOM.
  useEffect(() => {
    const sel = pendingSelection.current;
    if (!sel) return;
    pendingSelection.current = null;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(sel.start, sel.end);
  }, [commitSeq]);

  const cancelBlurDismiss = useCallback(() => {
    if (blurTimer.current !== null) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }, []);

  useEffect(() => cancelBlurDismiss, [cancelBlurDismiss]);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return entities.filter((e) => !q || e.title.toLowerCase().includes(q)).slice(0, maxSuggestions);
  }, [mention, entities, maxSuggestions]);

  const pickerOpen = mention !== null && suggestions.length > 0;

  /**
   * Commit an edit and put the caret where the edit says it belongs.
   *
   * The selection is applied from an effect, not a rAF. `value` is owned by the
   * parent, so a rAF scheduled here can run before React has committed the new
   * text: `setSelectionRange` then lands on the *old* string, gets clamped, and
   * the subsequent re-render drops the caret at the end of the document. The
   * effect runs after the commit, when the offsets mean what they say.
   *
   * Keyed on a counter rather than `value` so an edit that happens to produce
   * identical text (prefixing a line that already has the prefix) still
   * restores focus.
   */
  const commit = useCallback((edit: TextEdit) => {
    pendingSelection.current = { start: edit.selStart, end: edit.selEnd };
    setValue(edit.next);
    setCommitSeq((n) => n + 1);
  }, [setValue]);

  /** Re-read the `@`-draft under the caret. Runs on every caret move. */
  const syncMention = useCallback((el: HTMLTextAreaElement) => {
    setMention(mentionQueryAt(el.value, el.selectionStart ?? 0));
    setActiveIdx(0);
  }, []);

  const insertMention = useCallback((entity: NotebookLinkEntity) => {
    const el = textareaRef.current;
    if (!el || !mention) return;
    cancelBlurDismiss();
    // Both bounds read together: the draft's start and the live caret.
    commit(applyMentionEdit(el.value, mention.start, el.selectionStart ?? mention.start, entity.title));
    setMention(null);
    setActiveIdx(0);
  }, [mention, commit, cancelBlurDismiss]);

  const startMention = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    // The toolbar button blurred the textarea; cancel that pending dismissal
    // before opening, or it fires right after we open.
    cancelBlurDismiss();
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    commit({ next: `${value.slice(0, start)}@${value.slice(end)}`, selStart: start + 1, selEnd: start + 1 });
    // Batched with the commit above, so the picker opens on the same render as
    // the inserted "@" rather than a frame later.
    setMention({ start, query: "" });
    setActiveIdx(0);
  }, [value, commit, cancelBlurDismiss]);

  const applyWrap = useCallback((before: string, after: string, placeholder = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    commit(applyWrapEdit(value, start, el.selectionEnd ?? start, before, after, placeholder));
  }, [value, commit]);

  const applyLinePrefix = useCallback((prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    commit(applyLinePrefixEdit(value, start, el.selectionEnd ?? start, prefix));
  }, [value, commit]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      setActiveIdx(0);
    }
  }, [pickerOpen, suggestions, activeIdx, insertMention]);

  const textareaProps = useMemo(() => ({
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      syncMention(e.target);
    },
    onKeyDown,
    // `select` is the only native event that fires for every caret move,
    // including arrow keys and Home/End — `click` misses all of those.
    onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => syncMention(e.currentTarget),
    onBlur: () => {
      cancelBlurDismiss();
      // Deferred so a click on a suggestion lands before the picker closes.
      blurTimer.current = setTimeout(() => {
        blurTimer.current = null;
        setMention(null);
        setActiveIdx(0);
      }, 150);
    },
  }), [setValue, syncMention, onKeyDown, cancelBlurDismiss]);

  return {
    textareaRef,
    mention,
    activeIdx,
    suggestions,
    pickerOpen,
    setActiveIdx,
    textareaProps,
    insertMention,
    startMention,
    applyWrap,
    applyLinePrefix,
  };
}
