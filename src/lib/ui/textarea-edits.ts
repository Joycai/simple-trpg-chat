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
