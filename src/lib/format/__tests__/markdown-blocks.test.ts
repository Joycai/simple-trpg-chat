import { describe, it, expect } from "vitest";
import { splitBlocks, splitCodeFences, parseTableRow, type Block, type ListBlock } from "@/lib/format/markdown-blocks";

/** Item texts of a list tree in document order (each item before its children). */
function listText(list: ListBlock): string[] {
  return list.items.flatMap((item) => [item.text, ...item.children.flatMap(listText)]);
}

/** Item source lines of a list tree in document order. */
function listLines(list: ListBlock): number[] {
  return list.items.flatMap((item) => [item.line, ...item.children.flatMap(listLines)]);
}

/** Every source line must survive into exactly one block — the core invariant. */
function renderedText(blocks: Block[]): string[] {
  return blocks.flatMap((b) => {
    switch (b.kind) {
      case "heading": return [b.text];
      case "quote": return b.lines;
      case "list": return listText(b);
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
    expect(blocks[0]).toEqual({
      kind: "list", line: 0, ordered: false,
      items: [{ line: 0, text: "one", children: [] }, { line: 1, text: "two", children: [] }],
    });
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

/** Compact shape of a list tree: text, or [text, ...child lists]; `ol:` marks ordered lists. */
type Shape = string | (string | Shape[])[];
function shape(list: ListBlock): Shape[] {
  const items = list.items.map((item): Shape =>
    item.children.length === 0 ? item.text : [item.text, ...item.children.map(shape)],
  );
  return list.ordered ? [`ol:${list.start}`, ...items] : items;
}
function onlyList(src: string): ListBlock {
  const blocks = splitBlocks(src);
  expect(blocks).toHaveLength(1);
  expect(blocks[0].kind).toBe("list");
  return blocks[0] as ListBlock;
}

describe("splitBlocks — nested lists", () => {
  it("nests a 3-space-indented item under its parent (the reported case)", () => {
    expect(shape(onlyList("* item1\n   * item1.1"))).toEqual([["item1", ["item1.1"]]]);
  });

  it("accepts 2-space, 4-space and tab indents", () => {
    for (const indent of ["  ", "    ", "\t"]) {
      expect(shape(onlyList(`- a\n${indent}- b\n- c`))).toEqual([["a", ["b"]], "c"]);
    }
  });

  it("nests three levels and returns to the middle one", () => {
    const list = onlyList("- a\n  - b\n    - c\n  - d\n- e");
    expect(shape(list)).toEqual([["a", [["b", ["c"]], "d"]], "e"]);
  });

  it("goes only one level deeper however far the indent jumps", () => {
    expect(shape(onlyList("- a\n        - b\n- c"))).toEqual([["a", ["b"]], "c"]);
  });

  it("keeps an unevenly indented sub-item beside its siblings", () => {
    // `c` sits between the `a` and `b` columns: it closes `b`'s level but is
    // still deeper than `a`, so it rejoins a's child list.
    expect(shape(onlyList("- a\n    - b\n  - c"))).toEqual([["a", ["b", "c"]]]);
  });

  it("mixes - and * within one list", () => {
    expect(shape(onlyList("* a\n  - b\n- c"))).toEqual([["a", ["b"]], "c"]);
  });

  it("uses the first line's indent as the base level", () => {
    expect(shape(onlyList("  - a\n    - b\n- c"))).toEqual([["a", ["b"]], "c"]);
  });

  it("resets the base level when a line backs out past the first line's indent", () => {
    expect(shape(onlyList("   - a\n- b\n  - c"))).toEqual(["a", ["b", ["c"]]]);
  });

  it("parses CRLF content like LF content", () => {
    expect(splitBlocks("# 标题\r\n- a\r\n  - b\r\n段落")).toEqual(splitBlocks("# 标题\n- a\n  - b\n段落"));
  });

  it("stays linear on a long run of spaces that ends in a line separator", () => {
    const line = `- ${" ".repeat(20000)}\u2028`;
    const t0 = performance.now();
    expect(splitBlocks(line)[0].kind).toBe("list");
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("ends the list at a paragraph, blank line, heading or table", () => {
    for (const next of ["收尾", "", "# 标题", "| a | b |"]) {
      const blocks = splitBlocks(`- a\n  - b\n${next}`);
      expect(blocks[0].kind).toBe("list");
      expect(blocks).toHaveLength(2);
    }
  });

  it("keeps indented non-list text as a paragraph", () => {
    const blocks = splitBlocks("- a\n   接续文字");
    expect(blocks.map((b) => b.kind)).toEqual(["list", "paragraph"]);
    expect(blocks[1]).toMatchObject({ line: 1, text: "   接续文字" });
  });

  it("accepts a full-width space or NBSP after the marker", () => {
    expect(shape(onlyList("-\u3000项目\n  1.\u00a0子项"))).toEqual([["项目", ["ol:1", "子项"]]]);
  });

  it("does not treat bold, italics or rules as list items", () => {
    const blocks = splitBlocks("**粗体**\n*斜体*\n---\n1.5 倍伤害");
    expect(blocks.every((b) => b.kind === "paragraph")).toBe(true);
  });
});

describe("splitBlocks — ordered lists", () => {
  it("parses `1.` and `1)` items and keeps the start number", () => {
    expect(shape(onlyList("1. a\n2. b"))).toEqual(["ol:1", "a", "b"]);
    expect(shape(onlyList("3) a\n4) b"))).toEqual(["ol:3", "a", "b"]);
  });

  it("nests bullets under numbers and numbers under bullets", () => {
    expect(shape(onlyList("1. a\n   - b\n   - c\n2. d"))).toEqual(["ol:1", ["a", ["b", "c"]], "d"]);
    expect(shape(onlyList("- a\n  1. b\n  2. c"))).toEqual([["a", ["ol:1", "b", "c"]]]);
  });

  it("starts a new top-level block when the marker kind switches", () => {
    const blocks = splitBlocks("- a\n1. b\n- c");
    expect(blocks.map((b) => b.kind)).toEqual(["list", "list", "list"]);
    expect(blocks.map((b) => b.line)).toEqual([0, 1, 2]);
    expect(renderedText(blocks)).toEqual(["a", "b", "c"]);
  });

  it("opens a sibling child list when the kind switches below the top level", () => {
    expect(shape(onlyList("- a\n  - b\n  1. c\n  2. d\n- e"))).toEqual([["a", ["b"], ["ol:1", "c", "d"]], "e"]);
  });
});

describe("splitBlocks — random documents (property)", () => {
  /** Small deterministic PRNG so failures reproduce. */
  function rng(seed: number) {
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  }
  const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const INDENTS = ["", "", " ", "  ", "   ", "    ", "      ", "\t", " \t"] as const;
  const MARKERS = ["-", "*", "1.", "2.", "10)"] as const;

  it("never drops, duplicates or reorders a line", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const lines: string[] = [];
      const expected: string[] = [];
      const n = 1 + Math.floor(r() * 25);
      for (let k = 0; k < n; k++) {
        const t = `t${k}`;
        const roll = r();
        if (roll < 0.6) lines.push(`${pick(r, INDENTS)}${pick(r, MARKERS)} ${t}`);
        else if (roll < 0.75) lines.push(t);
        else if (roll < 0.85) lines.push(`# ${t}`);
        else { lines.push(""); continue; }
        expected.push(t);
      }
      const blocks = splitBlocks(lines.join("\n"));
      expect(renderedText(blocks), `seed ${seed}`).toEqual(expected);

      const itemLines = blocks.flatMap((b) => (b.kind === "list" ? listLines(b) : [b.line]));
      const sorted = [...itemLines].sort((x, y) => x - y);
      expect(itemLines, `seed ${seed}`).toEqual(sorted);
      expect(new Set(itemLines).size, `seed ${seed}`).toBe(itemLines.length);
    }
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
