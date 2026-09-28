"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mentionQueryAt, type NotebookLinkEntity } from "@/lib/room/notebook";
import {
  applyLinePrefixEdit,
  applyListEnterEdit,
  applyListIndentEdit,
  applyMentionEdit,
  applyWrapEdit,
  replacedRange,
  type TextEdit,
} from "@/lib/ui/textarea-edits";

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
 * 4. Selection is restored through `src/lib/ui/textarea-edits.ts`, which shifts
 *    the anchor by the current line's prefix rather than every line's — and
 *    restores it at all, which the event editor had stopped doing.
 *
 * With `listKeys`, Tab / Shift+Tab indent and outdent Markdown list lines and
 * Enter continues (or, on an empty item, ends) a list. Tab is only taken on list
 * lines; Escape there hands the next Tab back to the browser, so keyboard users
 * can always leave the textarea.
 */
export function useMentionTextarea(opts: {
  value: string;
  setValue: (next: string) => void;
  entities: NotebookLinkEntity[];
  maxSuggestions?: number;
  /** Tab / Shift+Tab / Enter edit Markdown lists (see above). */
  listKeys?: boolean;
}): MentionTextarea {
  const { value, setValue, entities, maxSuggestions = DEFAULT_MAX_SUGGESTIONS, listKeys = false } = opts;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  /** Set by Escape on a list line: the next Tab moves focus instead of indenting.
   *  Any caret move, text change, other key or blur takes it back. */
  const tabReleased = useRef(false);
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

  /**
   * Apply a keystroke's list edit as a native insertion, so it lands in the
   * browser's undo history like the typing around it. Setting `value` (what
   * `commit` does) would leave Ctrl+Z unable to step back over every Enter in
   * a list. `execCommand` is deprecated but still the only way to do that; if
   * it is unavailable or refuses, fall back to `commit`.
   *
   * The resulting `input` event goes through `onChange`, which stores the new
   * text — so the DOM already holds it and the selection can be set right away.
   */
  const applyKeyEdit = useCallback((el: HTMLTextAreaElement, edit: TextEdit) => {
    const { start, end, text } = replacedRange(el.value, edit.next);
    let applied = false;
    try {
      el.setSelectionRange(start, end);
      applied = text
        ? document.execCommand("insertText", false, text)
        : start === end || document.execCommand("delete");
    } catch {
      applied = false;
    }
    // A mismatch also covers the browser trimming the insertion to `maxlength`.
    if (applied && el.value === edit.next) el.setSelectionRange(edit.selStart, edit.selEnd);
    else commit(edit);
  }, [commit]);

  /** Tab / Shift+Tab / Enter / Escape on Markdown list lines (`listKeys`). */
  const onListKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Composition keys (Enter picks the IME candidate) belong to the IME.
    // Safari reports that Enter with isComposing already false, but keyCode 229.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;

    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const released = tabReleased.current;
    tabReleased.current = false;
    const otherModifier = e.ctrlKey || e.altKey || e.metaKey;

    if (e.key === "Escape") {
      // Only where Tab is being taken: elsewhere Escape keeps meaning "close".
      // preventDefault keeps the enclosing drawer's Escape-to-close from firing.
      if (!released && !otherModifier && !e.shiftKey && applyListIndentEdit(el.value, start, end, "in")) {
        tabReleased.current = true;
        e.preventDefault();
      }
      return;
    }

    if (e.key === "Tab") {
      if (released || otherModifier) return;
      const edit = applyListIndentEdit(el.value, start, end, e.shiftKey ? "out" : "in");
      if (!edit) return;
      e.preventDefault();
      // Past maxLength (which only binds user typing) the edit is dropped; Tab
      // still stays in the textarea rather than jumping focus.
      if (el.maxLength > 0 && edit.next.length > el.maxLength) return;
      if (edit.next !== el.value) applyKeyEdit(el, edit);
      return;
    }

    if (e.key === "Enter" && !otherModifier && !e.shiftKey) {
      const edit = applyListEnterEdit(el.value, start, end);
      if (!edit || (el.maxLength > 0 && edit.next.length > el.maxLength)) return;
      e.preventDefault();
      applyKeyEdit(el, edit);
    }
  }, [applyKeyEdit]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!pickerOpen) {
      if (listKeys) onListKey(e);
      return;
    }
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
  }, [pickerOpen, listKeys, onListKey, suggestions, activeIdx, insertMention]);

  const textareaProps = useMemo(() => ({
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      tabReleased.current = false;
      setValue(e.target.value);
      syncMention(e.target);
    },
    onKeyDown,
    // `select` is the only native event that fires for every caret move,
    // including arrow keys and Home/End — `click` misses all of those.
    // It also ends an Escape's Tab release: keydowns alone miss IME input
    // (keyCode 229), clicks and picked mentions.
    onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      tabReleased.current = false;
      syncMention(e.currentTarget);
    },
    onBlur: () => {
      tabReleased.current = false;
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
