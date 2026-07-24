import { describe, it, expect } from "vitest";
import { applyWrapEdit, applyLinePrefixEdit, applyMentionEdit } from "@/lib/textarea-edits";

/** Render an edit as `text` with the resulting selection marked by [ ]. */
function marked({ next, selStart, selEnd }: { next: string; selStart: number; selEnd: number }) {
  return `${next.slice(0, selStart)}[${next.slice(selStart, selEnd)}]${next.slice(selEnd)}`;
}

describe("applyWrapEdit", () => {
  it("wraps the selection and keeps the inner text selected", () => {
    expect(marked(applyWrapEdit("abc def", 4, 7, "**", "**"))).toBe("abc **[def]**");
  });

  it("inserts the placeholder when the selection is empty", () => {
    expect(marked(applyWrapEdit("abc", 3, 3, "**", "**", "bold"))).toBe("abc**[bold]**");
  });

  it("inserts nothing but the markers when empty with no placeholder", () => {
    expect(marked(applyWrapEdit("abc", 3, 3, "`", "`"))).toBe("abc`[]`");
  });

  it("handles asymmetric markers", () => {
    expect(marked(applyWrapEdit("x", 0, 1, "[", "](url)"))).toBe("[[x]](url)");
  });
});

describe("applyLinePrefixEdit", () => {
  it("prefixes the caret's line and shifts the caret by one prefix", () => {
    // caret mid-word on a single line
    expect(marked(applyLinePrefixEdit("hello", 2, 2, "- "))).toBe("- he[]llo");
  });

  it("prefixes every line the selection spans", () => {
    const out = applyLinePrefixEdit("abc\ndef", 0, 7, "- ");
    expect(out.next).toBe("- abc\n- def");
  });

  it("shifts start by the FIRST line's prefix, not the total", () => {
    // Regression: `start + totalDelta` (2 lines x 2 chars = 4) put the anchor
    // at 5 instead of 3, so typing overwrote the wrong characters.
    const out = applyLinePrefixEdit("abc\ndef", 1, 6, "- ");
    expect(out.next).toBe("- abc\n- def");
    expect(out.selStart).toBe(3); // was 1, +2 for this line's prefix
    expect(out.selEnd).toBe(10); // was 6, +4 for both prefixes
    expect(marked(out)).toBe("- a[bc\n- de]f");
  });

  it("does not shift start when the first line already has the prefix", () => {
    const out = applyLinePrefixEdit("- abc\ndef", 2, 9, "- ");
    expect(out.next).toBe("- abc\n- def");
    expect(out.selStart).toBe(2);
    expect(out.selEnd).toBe(11);
  });

  it("never doubles an existing prefix", () => {
    expect(applyLinePrefixEdit("- abc", 0, 5, "- ").next).toBe("- abc");
    expect(applyLinePrefixEdit("> a\n> b", 0, 7, "> ").next).toBe("> a\n> b");
  });

  it("prefixes only the current line when the caret is on a later line", () => {
    const out = applyLinePrefixEdit("one\ntwo\nthree", 5, 5, "## ");
    expect(out.next).toBe("one\n## two\nthree");
    expect(out.selStart).toBe(8);
  });

  it("leaves text before the line untouched", () => {
    const out = applyLinePrefixEdit("keep\nedit", 6, 9, "> ");
    expect(out.next).toBe("keep\n> edit");
  });

  it("handles a selection that starts exactly at a line start", () => {
    const out = applyLinePrefixEdit("abc\ndef", 4, 7, "- ");
    expect(out.next).toBe("abc\n- def");
    expect(marked(out)).toBe("abc\n- [def]");
  });

  it("handles an empty document", () => {
    expect(applyLinePrefixEdit("", 0, 0, "- ").next).toBe("- ");
  });
});

describe("applyMentionEdit", () => {
  it("replaces the @-draft with the completed mention", () => {
    // "see @dag" with the draft starting at 4 and the caret at the end
    expect(marked(applyMentionEdit("see @dag", 4, 8, "Dagger"))).toBe("see @Dagger []");
  });

  it("consumes only up to the caret, leaving the rest intact", () => {
    // Regression: mixing a stale start with a live caret dropped or duplicated
    // characters; here the caret sits before the trailing text.
    expect(applyMentionEdit("see @dag rest", 4, 8, "Dagger").next).toBe("see @Dagger  rest");
  });

  it("keeps text that follows a mid-string draft", () => {
    expect(applyMentionEdit("a @x b", 2, 4, "Item").next).toBe("a @Item  b");
  });

  it("clamps a caret that precedes the draft start, consuming nothing", () => {
    // Defensive: a stale caret must not produce a reversed slice. Clamping `to`
    // up to `at` means the draft is left in place rather than text being eaten.
    expect(applyMentionEdit("see @dag", 4, 2, "Dagger").next).toBe("see @Dagger @dag");
  });

  it("clamps bounds past the end of the value", () => {
    expect(applyMentionEdit("ab", 99, 99, "X").next).toBe("ab@X ");
  });
});
