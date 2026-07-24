import { describe, it, expect } from "vitest";
import { splitBlocks, splitCodeFences, parseTableRow, type Block } from "@/lib/markdown-blocks";

/** Every source line must survive into exactly one block — the core invariant. */
function renderedText(blocks: Block[]): string[] {
  return blocks.flatMap((b) => {
    switch (b.kind) {
      case "heading": return [b.text];
      case "quote": return b.lines;
      case "list": return b.items;
      case "table": return [...b.headers, ...b.rows.flat()];
      case "break": return [];
      case "paragraph": return [b.text];
    }
  });
}

describe("splitBlocks — separator-only runs (regression: swallowed lines)", () => {
  it("does not drop the lines after a lone separator row", () => {
    const blocks = splitBlocks("|---|---|\n重要线索：凶手是管家\nX");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(renderedText(blocks)).toEqual(["|---|---|", "重要线索：凶手是管家", "X"]);
  });

  it("treats a single `|---|` used as a horizontal rule as text, not a table", () => {
    const blocks = splitBlocks("上文\n|---|\n下文");
    expect(renderedText(blocks)).toEqual(["上文", "|---|", "下文"]);
  });

  it("does not swallow content after an all-blank-cell row", () => {
    // `|  |  |` also matches the separator pattern.
    const blocks = splitBlocks("|  |  |\n后续内容");
    expect(renderedText(blocks)).toEqual(["|  |  |", "后续内容"]);
  });

  it("handles consecutive separator rows without losing the next line", () => {
    const blocks = splitBlocks("|---|\n|:--:|\n结尾");
    expect(renderedText(blocks)).toEqual(["|---|", "|:--:|", "结尾"]);
  });

  it("recovers a real table that follows a stray separator row", () => {
    const blocks = splitBlocks("|---|\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "break", "table"]);
  });
});

describe("splitBlocks — tables", () => {
  it("parses a standard table", () => {
    const blocks = splitBlocks("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(blocks).toEqual([
      { kind: "table", line: 0, headers: ["a", "b"], rows: [["1", "2"]] },
    ]);
  });

  it("renders a header-only table when there is no separator row", () => {
    const blocks = splitBlocks("| a | b |");
    expect(blocks).toEqual([{ kind: "table", line: 0, headers: ["a", "b"], rows: [] }]);
  });

  it("stops the table at the first non-table line", () => {
    const blocks = splitBlocks("| a | b |\n|---|---|\n| 1 | 2 |\n收尾说明");
    expect(blocks.map((b) => b.kind)).toEqual(["table", "paragraph"]);
    expect(blocks[1]).toMatchObject({ kind: "paragraph", text: "收尾说明" });
  });

  it("keeps multiple body rows in order", () => {
    const blocks = splitBlocks("| a |\n|---|\n| 1 |\n| 2 |\n| 3 |");
    expect(blocks[0]).toMatchObject({ headers: ["a"], rows: [["1"], ["2"], ["3"]] });
  });
});

describe("splitBlocks — other block kinds", () => {
  it("parses headings at all three levels", () => {
    const blocks = splitBlocks("# One\n## Two\n### Three");
    expect(blocks).toEqual([
      { kind: "heading", line: 0, level: 1, text: "One" },
      { kind: "heading", line: 1, level: 2, text: "Two" },
      { kind: "heading", line: 2, level: 3, text: "Three" },
    ]);
  });

  it("groups consecutive blockquote lines and strips the marker", () => {
    const blocks = splitBlocks("> first\n> second\nafter");
    expect(blocks[0]).toEqual({ kind: "quote", line: 0, lines: ["first", "second"] });
    expect(blocks[1]).toMatchObject({ kind: "paragraph", text: "after" });
  });

  it("groups consecutive list items for both markers", () => {
    const blocks = splitBlocks("- one\n* two\nafter");
    expect(blocks[0]).toEqual({ kind: "list", line: 0, items: ["one", "two"] });
    expect(blocks[1]).toMatchObject({ kind: "paragraph", text: "after" });
  });

  it("emits a break for blank lines", () => {
    const blocks = splitBlocks("a\n\nb");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "break", "paragraph"]);
  });

  it("handles a mixed document without losing any line", () => {
    const src = ["# 标题", "正文一", "", "- 项目 A", "- 项目 B", "> 引用", "| a | b |", "|---|---|", "| 1 | 2 |", "收尾"];
    const blocks = splitBlocks(src.join("\n"));
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading", "paragraph", "break", "list", "quote", "table", "paragraph",
    ]);
    expect(renderedText(blocks)).toEqual([
      "标题", "正文一", "项目 A", "项目 B", "引用", "a", "b", "1", "2", "收尾",
    ]);
  });

  it("assigns strictly increasing start lines, so keys stay unique", () => {
    const blocks = splitBlocks("# h\n> q\n- l\n| a |\n\np");
    const lineNumbers = blocks.map((b) => b.line);
    expect(lineNumbers).toEqual([...lineNumbers].sort((x, y) => x - y));
    expect(new Set(lineNumbers).size).toBe(lineNumbers.length);
  });

  it("returns a single empty paragraph-free result for empty input", () => {
    expect(splitBlocks("")).toEqual([{ kind: "break", line: 0 }]);
  });
});

describe("splitCodeFences", () => {
  it("extracts a fenced block with a language tag", () => {
    expect(splitCodeFences("```ts\nconst a = 1;\n```")).toEqual([
      { kind: "markdown", text: "" },
      { kind: "code", lang: "ts", code: "const a = 1;" },
      { kind: "markdown", text: "" },
    ]);
  });

  it("treats a whitespace-bearing first line as code, not a language tag", () => {
    const parts = splitCodeFences("```\nplain text here\n```");
    expect(parts[1]).toEqual({ kind: "code", lang: null, code: "plain text here" });
  });

  it("keeps surrounding markdown around a fence", () => {
    const parts = splitCodeFences("before\n```js\nx\n```\nafter");
    expect(parts.map((p) => p.kind)).toEqual(["markdown", "code", "markdown"]);
    expect(parts[0]).toEqual({ kind: "markdown", text: "before\n" });
    expect(parts[2]).toEqual({ kind: "markdown", text: "\nafter" });
  });

  it("leaves an unterminated fence as markdown", () => {
    expect(splitCodeFences("```ts\nx")).toEqual([{ kind: "markdown", text: "```ts\nx" }]);
  });
});

describe("parseTableRow", () => {
  it("strips outer pipes and trims cells", () => {
    expect(parseTableRow("| a | b  |c |")).toEqual(["a", "b", "c"]);
  });
});
