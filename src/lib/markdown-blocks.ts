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

export type Block =
  /** `line` is the 0-based index of the block's first line — a stable React key. */
  | { kind: "heading"; line: number; level: 1 | 2 | 3; text: string }
  | { kind: "quote"; line: number; lines: string[] }
  | { kind: "list"; line: number; items: string[] }
  | { kind: "table"; line: number; headers: string[]; rows: string[][] }
  | { kind: "break"; line: number }
  | { kind: "paragraph"; line: number; text: string };

/** A row of only dashes/colons/pipes/spaces — `|---|---|`, and also `|  |  |`. */
const SEPARATOR_ROW = /^\|[\s\-:|]+\|$/;

/** A line that opens a table: starts with `|` and carries at least one more. */
function isTableLine(line: string): boolean {
  return line.startsWith("|") && line.includes("|", 1);
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

    // Bullet list: consecutive lines starting with "- " or "* "
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", line: start, items });
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
