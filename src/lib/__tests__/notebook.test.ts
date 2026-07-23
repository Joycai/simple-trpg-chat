import { describe, it, expect } from "vitest";
import {
  segmentMentions,
  extractMentions,
  stripMarkdown,
  highlightSegments,
  searchNotes,
  mentionQueryAt,
  type NotebookLinkEntity,
} from "@/lib/notebook";

const ENTITIES: NotebookLinkEntity[] = [
  { id: 1, type: "clue", title: "血迹纸条" },
  { id: 2, type: "character", title: "神秘访客" },
  { id: 3, type: "item", title: "黄铜钥匙" },
  { id: 4, type: "item", title: "黄铜" }, // shorter prefix of #3 — longest must win
];

describe("segmentMentions", () => {
  it("resolves @Title tokens against entity titles", () => {
    const segs = segmentMentions("守夜人 @神秘访客 当晚不在岗", ENTITIES);
    expect(segs).toEqual([
      { kind: "text", text: "守夜人 " },
      { kind: "mention", text: "神秘访客", entity: ENTITIES[1] },
      { kind: "text", text: " 当晚不在岗" },
    ]);
  });

  it("prefers the longest matching title", () => {
    const segs = segmentMentions("@黄铜钥匙吻合", ENTITIES);
    expect(segs[0]).toEqual({ kind: "mention", text: "黄铜钥匙", entity: ENTITIES[2] });
    expect(segs[1]).toEqual({ kind: "text", text: "吻合" });
  });

  it("degrades unmatched @ to plain text (deleted item)", () => {
    const segs = segmentMentions("看看 @已删除物品 怎么样", [ENTITIES[0]]);
    expect(segs).toEqual([{ kind: "text", text: "看看 @已删除物品 怎么样" }]);
  });

  it("handles adjacent mentions and no entities", () => {
    expect(segmentMentions("@血迹纸条@神秘访客", ENTITIES).filter(s => s.kind === "mention")).toHaveLength(2);
    expect(segmentMentions("hello @x", [])).toEqual([{ kind: "text", text: "hello @x" }]);
  });
});

describe("extractMentions", () => {
  it("returns distinct entities in first-appearance order", () => {
    const found = extractMentions("@神秘访客 和 @血迹纸条，再提一次 @神秘访客", ENTITIES);
    expect(found.map((e) => e.id)).toEqual([2, 1]);
  });

  it("returns empty when nothing matches", () => {
    expect(extractMentions("没有链接", ENTITIES)).toEqual([]);
  });
});

describe("stripMarkdown", () => {
  it("removes block and inline markers", () => {
    const md = "## 已确认的事实\n- 守夜人 **不在岗**\n> 引用\n*异常* `code` [链接](http://x)";
    expect(stripMarkdown(md)).toBe("已确认的事实 守夜人 不在岗 引用 异常 code 链接");
  });

  it("drops fenced code blocks", () => {
    expect(stripMarkdown("前\n```js\nlet a=1\n```\n后")).toBe("前 后");
  });
});

describe("highlightSegments", () => {
  it("marks every occurrence case-insensitively", () => {
    const segs = highlightSegments("Dock dock DOCK", "dock");
    expect(segs.filter((s) => s.hl)).toHaveLength(3);
    expect(segs.map((s) => s.text).join("")).toBe("Dock dock DOCK");
  });

  it("returns the whole text unhighlighted for empty query", () => {
    expect(highlightSegments("abc", "  ")).toEqual([{ text: "abc", hl: false }]);
  });
});

describe("searchNotes", () => {
  const notes = [
    { id: 1, title: "三号栈桥的疑点", content: "…和**栈桥**的编号对得上。守夜人当晚不在岗" },
    { id: 2, title: "仓库暗号与图案", content: "暗号刻在栈桥尽头的木桩上" },
    { id: 3, title: "无关笔记", content: "别的内容" },
  ];

  it("matches title and content, title-heavy scoring first", () => {
    const results = searchNotes(notes, "栈桥");
    expect(results.map((r) => r.note.id)).toEqual([1, 2]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("builds a plain-text snippet around the first content hit", () => {
    const results = searchNotes(notes, "栈桥");
    expect(results[1].snippet).toContain("栈桥尽头的木桩");
    expect(results[1].snippet).not.toContain("**");
  });

  it("returns empty for blank queries", () => {
    expect(searchNotes(notes, "   ")).toEqual([]);
  });
});

describe("mentionQueryAt", () => {
  it("finds the @draft ending at the caret", () => {
    const text = "下一步：问船务处\n@血";
    expect(mentionQueryAt(text, text.length)).toEqual({ start: 9, query: "血" });
  });

  it("returns null when whitespace breaks the draft or no @ nearby", () => {
    const text = "@血迹 纸条";
    expect(mentionQueryAt(text, text.length)).toBeNull();
    expect(mentionQueryAt("plain", 5)).toBeNull();
  });

  it("caps the lookback so distant @ doesn't trigger", () => {
    const text = "@" + "很".repeat(20);
    expect(mentionQueryAt(text, text.length)).toBeNull();
  });
});
