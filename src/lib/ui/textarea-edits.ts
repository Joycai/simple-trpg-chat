/**
 * Pure text/selection math for the markdown toolbars in the notebook and event
 * editors. Dependency-free (no React, no DOM) so the selection arithmetic —
 * historically wrong in both editors, differently — is unit-testable.
 *
 * Each helper takes the current value and selection and returns the next value
 * plus where the selection should land; the caller applies both.
 */

export interface TextEdit {
  next: string;
  selStart: number;
  selEnd: number;
}

/**
 * Wrap the selection (or insert `placeholder` when empty) with before/after,
 * leaving the inner text selected so it can be typed over.
 */
export function applyWrapEdit(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = "",
): TextEdit {
  const selected = value.slice(start, end) || placeholder;
  return {
    next: value.slice(0, start) + before + selected + after + value.slice(end),
    selStart: start + before.length,
    selEnd: start + before.length + selected.length,
  };
}

/**
 * Prefix every line the selection touches — headings, list markers, quotes.
 * Lines that already carry the prefix are left alone, so clicking twice does
 * not produce `-- item`.
 *
 * The selection math is the subtle part. `end` shifts by the *total* inserted
 * length, but `start` only shifts by what was inserted on its own line: using
 * the total (as the notebook editor did once the caret sat mid-line) pushes the
 * anchor past where the user was typing, and dropping the restore entirely (as
 * the event editor did) sends the caret to the end of the document.
 */
export function applyLinePrefixEdit(
  value: string,
  start: number,
  end: number,
  prefix: string,
): TextEdit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const block = value.slice(lineStart, end);
  const lines = block.split("\n");
  const prefixed = lines.map((l) => (l.startsWith(prefix) ? l : prefix + l)).join("\n");
  const totalDelta = prefixed.length - block.length;
  const firstLineDelta = lines[0].startsWith(prefix) ? 0 : prefix.length;
  return {
    next: value.slice(0, lineStart) + prefixed + value.slice(end),
    selStart: start + firstLineDelta,
    selEnd: end + totalDelta,
  };
}

/**
 * Replace the `@…` draft that starts at `mentionStart` and runs to `caret`
 * with a completed `@Title ` mention, leaving the caret after the trailing
 * space.
 *
 * Both bounds must come from the same moment: pairing a stale `mentionStart`
 * with a live caret (or vice versa) is what left `"@Dagger ag"` behind when the
 * user moved the caret before picking a suggestion.
 */
export function applyMentionEdit(
  value: string,
  mentionStart: number,
  caret: number,
  title: string,
): TextEdit {
  const at = Math.max(0, Math.min(mentionStart, value.length));
  const to = Math.max(at, Math.min(caret, value.length));
  const inserted = `@${title} `;
  const pos = at + inserted.length;
  return {
    next: value.slice(0, at) + inserted + value.slice(to),
    selStart: pos,
    selEnd: pos,
  };
}

/** One Markdown list line split into its parts; `indent + marker + gap + body` is the line. */
export interface ListLine {
  indent: string;
  /** `-` / `*`, or an ordered marker such as `3.` / `3)`. */
  marker: string;
  /** The blanks between the marker and the body — at least one. */
  gap: string;
  body: string;
}

/**
 * A bullet (`-` / `*`) or ordered (`1.` / `1)`) marker followed by at least one
 * blank — the same markers the shared Markdown renderer recognizes. The blank is
 * what keeps `---`, `**bold**` and `1.5` from counting as list items.
 */
const LIST_LINE = /^([ \t]*)([-*]|\d{1,9}[.)])([ \t]+)(.*)$/;

/** Parse a single line (no `\n`) as a list item, or `null` when it is not one. */
export function parseListLine(line: string): ListLine | null {
  const m = LIST_LINE.exec(line);
  return m ? { indent: m[1], marker: m[2], gap: m[3], body: m[4] } : null;
}

/** The marker for the item after `marker`: bullets repeat, `3.` becomes `4.`. */
function nextListMarker(marker: string): string {
  const ordered = /^(\d+)([.)])$/.exec(marker);
  return ordered ? `${Number(ordered[1]) + 1}${ordered[2]}` : marker;
}

/** One indent step for list items. */
const LIST_INDENT = "  ";

/**
 * Tab / Shift+Tab on list lines: indent every list line the selection touches by
 * two spaces, or outdent it by a leading tab or up to two leading spaces. Other
 * lines in the selection are left as they are.
 *
 * Returns `null` when no touched line is a list item, so the caller can let the
 * key do what it normally does (move focus). A list line that has nothing left
 * to outdent still yields an edit — an unchanged one — so Shift+Tab on a list
 * line doesn't throw focus backwards.
 *
 * A non-empty selection that ends at the very start of a line does not touch
 * that line, as in code editors: selecting two whole lines by dragging to the
 * start of the third must not indent the third.
 */
export function applyListIndentEdit(
  value: string,
  start: number,
  end: number,
  direction: "in" | "out",
): TextEdit | null {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const last = end > start && end > from && value[end - 1] === "\n" ? end - 1 : end;
  const nl = value.indexOf("\n", last);
  const to = nl === -1 ? value.length : nl;
  const lines = value.slice(from, to).split("\n");
  if (!lines.some((l) => parseListLine(l))) return null;

  // Every change sits at a line start: drop `del` characters, insert `ins`.
  const edits: { at: number; del: number; ins: string }[] = [];
  let at = from;
  const changed = lines.map((line) => {
    let del = 0;
    let ins = "";
    if (parseListLine(line)) {
      if (direction === "in") ins = LIST_INDENT;
      else del = line.startsWith("\t") ? 1 : (/^ {1,2}/.exec(line)?.[0].length ?? 0);
    }
    edits.push({ at, del, ins });
    at += line.length + 1;
    return ins + line.slice(del);
  });

  // Map an old offset into the new text. A position inside removed indent lands
  // where the line's indent now ends. `keepAtLineStart` stops a selection that
  // begins at column 0 from shrinking past the indent it just gained.
  const map = (p: number, keepAtLineStart: boolean) => {
    let shift = 0;
    for (const e of edits) {
      if (p < e.at || (keepAtLineStart && p === e.at)) break;
      if (p < e.at + e.del) return e.at + shift + e.ins.length;
      shift += e.ins.length - e.del;
    }
    return p + shift;
  };

  return {
    next: value.slice(0, from) + changed.join("\n") + value.slice(to),
    selStart: map(start, start !== end),
    selEnd: map(end, false),
  };
}

/**
 * Enter on a list item: continue the list on a new line at the same indent with
 * the same bullet (ordered markers count up, keeping `.` or `)`). Enter on an
 * empty item clears the marker instead, ending the list without adding a line.
 *
 * A selection is replaced first, as a plain Enter would. Returns `null` — let the
 * browser insert its newline — when the caret's line is not a list item, or the
 * caret sits inside the marker (Enter there should push the item down, not split
 * its marker).
 */
export function applyListEnterEdit(value: string, start: number, end: number): TextEdit | null {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nl = value.indexOf("\n", end);
  const lineEnd = nl === -1 ? value.length : nl;
  // The caret's line as it reads once the selection is gone.
  const line = value.slice(lineStart, start) + value.slice(end, lineEnd);
  const col = start - lineStart;
  const item = parseListLine(line);
  if (!item || col < item.indent.length + item.marker.length + item.gap.length) return null;

  if (item.body === "") {
    return {
      next: value.slice(0, lineStart) + value.slice(lineEnd),
      selStart: lineStart,
      selEnd: lineStart,
    };
  }

  const before = line.slice(0, col);
  const after = line.slice(col).replace(/^[ \t]+/, "");
  const inserted = `\n${item.indent}${nextListMarker(item.marker)}${item.gap}`;
  const caret = lineStart + before.length + inserted.length;
  return {
    next: value.slice(0, lineStart) + before + inserted + after + value.slice(lineEnd),
    selStart: caret,
    selEnd: caret,
  };
}

/**
 * The single span `prev[start, end)` that must become `text` to turn `prev` into
 * `next` (common prefix and suffix trimmed). Lets a caller replay an edit as one
 * native insertion, which keeps the browser's undo history intact.
 */
export function replacedRange(prev: string, next: string): { start: number; end: number; text: string } {
  const max = Math.min(prev.length, next.length);
  let s = 0;
  while (s < max && prev[s] === next[s]) s++;
  let e = 0;
  while (e < max - s && prev[prev.length - 1 - e] === next[next.length - 1 - e]) e++;
  return { start: s, end: prev.length - e, text: next.slice(s, next.length - e) };
}
