/**
 * Block-level splitting for the lightweight Markdown renderer used by chat
 * bubbles and notebook notes (`src/components/shared/MarkdownRenderer.tsx`).
 *
 * Dependency-free (no React) so the line-consumption logic — historically the
 * source of silently-dropped content — is unit-testable in isolation. The
 * renderer keeps only the JSX; every decision about *which lines belong to
 * which block* lives here.
 */

/** A fenced code block (``` … ```) or the Markdown between two fences. */
export type TopLevelPart =
  | { kind: "code"; lang: string | null; code: string }
  | { kind: "markdown"; text: string };

/** One list item; `line` is its 0-based source line — a stable React key. */
export interface ListItem {
  line: number;
  text: string;
  /**
   * Lists nested under this item, in source order. More than one when the
   * marker kind switches at the same depth (`- a` then `1. b`), as in CommonMark.
   */
  children: ListBlock[];
}

/** A run of sibling items sharing one marker kind. */
export interface ListBlock {
  ordered: boolean;
  /** The first item's number for an ordered list (`3.` → 3); absent otherwise. */
  start?: number;
  items: ListItem[];
}

export type Block =
  /** `line` is the 0-based index of the block's first line — a stable React key. */
  | { kind: "heading"; line: number; level: 1 | 2 | 3; text: string }
  | { kind: "quote"; line: number; lines: string[] }
  | ({ kind: "list"; line: number } & ListBlock)
  | { kind: "table"; line: number; headers: string[]; rows: string[][] }
  | { kind: "break"; line: number }
  | { kind: "paragraph"; line: number; text: string };

/** A row of only dashes/colons/pipes/spaces — `|---|---|`, and also `|  |  |`. */
const SEPARATOR_ROW = /^\|[\s\-:|]+\|$/;

/** A line that opens a table: starts with `|` and carries at least one more. */
function isTableLine(line: string): boolean {
  return line.startsWith("|") && line.includes("|", 1);
}

/**
 * A list item line: optional indent, a `-` / `*` bullet or a `1.` / `1)`
 * number, at least one space, then the item text. `**bold**` and `---` don't
 * match because the marker must be followed by whitespace.
 */
const LIST_LINE = /^([ \t]*)([-*]|\d{1,9}[.)])[ \t]+(.*)$/;

interface ListLine {
  indent: number;
  ordered: boolean;
  number: number;
  text: string;
}

function parseListLine(line: string): ListLine | null {
  const m = LIST_LINE.exec(line);
  if (!m) return null;
  const ordered = m[2] !== "-" && m[2] !== "*";
  return {
    indent: indentWidth(m[1]),
    ordered,
    number: ordered ? parseInt(m[2], 10) : 0,
    text: m[3],
  };
}

/** Width of leading whitespace in columns, with tab stops every 4 columns. */
function indentWidth(ws: string): number {
  let col = 0;
  for (const ch of ws) col = ch === "\t" ? col + 4 - (col % 4) : col + 1;
  return col;
}

function newList(first: ListLine, line: number): ListBlock {
  const list: ListBlock = first.ordered
    ? { ordered: true, start: first.number, items: [] }
    : { ordered: false, items: [] };
  list.items.push({ line, text: first.text, children: [] });
  return list;
}

/**
 * Consume the run of list lines starting at `start` and rebuild the nesting.
 *
 * Depth is judged relative to the enclosing items rather than by a fixed
 * width, so 2-, 3- and 4-space (and tab) indents all work: a line indented
 * past its parent's is one level deeper however far it jumps, and a line
 * indented less closes every level it no longer reaches. The run ends at the
 * first non-list line (blank lines included) or when the top-level marker kind
 * switches, which leaves the next line for the caller to start a fresh block.
 */
function parseListRun(lines: string[], start: number): { list: ListBlock; next: number } {
  const first = parseListLine(lines[start])!;
  const root = newList(first, start);
  // Each level's indent and the list currently open at that level.
  const stack: { indent: number; list: ListBlock }[] = [{ indent: first.indent, list: root }];

  let i = start + 1;
  for (; i < lines.length; i++) {
    const item = parseListLine(lines[i]);
    if (!item) break;

    while (stack.length > 1 && item.indent < stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1];

    if (item.indent > top.indent) {
      // One level deeper, under the last item at this level. Rejoin its
      // trailing child list when the kind matches, so a sub-item that was
      // indented unevenly still lands beside its siblings.
      const parent = top.list.items[top.list.items.length - 1];
      const last = parent.children[parent.children.length - 1];
      if (last && last.ordered === item.ordered) {
        last.items.push({ line: i, text: item.text, children: [] });
        stack.push({ indent: item.indent, list: last });
      } else {
        const child = newList(item, i);
        parent.children.push(child);
        stack.push({ indent: item.indent, list: child });
      }
      continue;
    }

    if (item.ordered !== top.list.ordered) {
      if (stack.length === 1) break;
      // Same depth, other kind: a new sibling list under the same parent.
      const parent = stack[stack.length - 2].list;
      const owner = parent.items[parent.items.length - 1];
      const sibling = newList(item, i);
      owner.children.push(sibling);
      top.list = sibling;
      continue;
    }

    top.list.items.push({ line: i, text: item.text, children: [] });
  }

  return { list: root, next: i };
}

/** Parse a table row like `| col1 | col2 | col3 |`. */
export function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * Split raw content into fenced-code and Markdown runs. Mirrors the previous
 * inline `content.split(/(```[\s\S]*?```)/g)`, including the heuristic that a
 * first line without whitespace and under 20 chars is a language tag.
 */
export function splitCodeFences(content: string): TopLevelPart[] {
  return content.split(/(```[\s\S]*?```)/g).map((part): TopLevelPart => {
    if (part.startsWith("```") && part.endsWith("```") && part.length >= 6) {
      const code = part.slice(3, -3).trim();
      const [first, ...rest] = code.split("\n");
      const isLang = !/\s/.test(first) && first.length < 20;
      return { kind: "code", lang: isLang ? first : null, code: isLang ? rest.join("\n") : code };
    }
    return { kind: "markdown", text: part };
  });
}

/**
 * Split one Markdown run into block-level nodes.
 *
 * Every line lands in exactly one block — the invariant the table branch used
 * to break. Table detection scans ahead with a separate cursor and only commits
 * it once there is at least one data row; a run of nothing but separator rows
 * therefore falls through and is emitted as ordinary paragraphs instead of
 * swallowing itself and the line after it.
 */
export function splitBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const start = i;
    const line = lines[i];

    // Heading: # / ## / ###
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        kind: "heading",
        line: start,
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // Blockquote: consecutive lines starting with >
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", line: start, lines: quoteLines });
      continue;
    }

    // List: consecutive bullet / numbered lines, nested by indentation.
    if (LIST_LINE.test(line)) {
      const { list, next } = parseListRun(lines, i);
      blocks.push({ kind: "list", line: start, ...list });
      i = next;
      continue;
    }

    // Table: scan ahead with `j` so `i` is only consumed once we know there is
    // a table to emit. Without a data row the whole run is not a table at all.
    if (isTableLine(line)) {
      let j = i;
      const tableLines: string[] = [];
      while (j < lines.length && isTableLine(lines[j])) {
        tableLines.push(lines[j]);
        j++;
      }
      const dataRows = tableLines.filter((l) => !SEPARATOR_ROW.test(l));
      if (dataRows.length > 0) {
        i = j;
        blocks.push({
          kind: "table",
          line: start,
          headers: parseTableRow(dataRows[0]),
          rows: dataRows.slice(1).map(parseTableRow),
        });
        continue;
      }
      // Fall through with `i` untouched: the separator rows render as paragraphs.
    }

    // Empty line — a vertical gap.
    if (line.trim() === "") {
      blocks.push({ kind: "break", line: start });
      i++;
      continue;
    }

    blocks.push({ kind: "paragraph", line: start, text: line });
    i++;
  }

  return blocks;
}
