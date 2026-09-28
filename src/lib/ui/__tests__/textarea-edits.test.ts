import { describe, it, expect } from "vitest";
import {
  applyWrapEdit,
  applyLinePrefixEdit,
  applyMentionEdit,
  parseListLine,
  applyListIndentEdit,
  applyListEnterEdit,
  replacedRange,
} from "@/lib/ui/textarea-edits";

/** Render an edit as `text` with the resulting selection marked by [ ]. */
function marked({ next, selStart, selEnd }: { next: string; selStart: number; selEnd: number }) {
  return `${next.slice(0, selStart)}[${next.slice(selStart, selEnd)}]${next.slice(selEnd)}`;
}

/** The inverse of `marked`: `"a[b]c"` → value `"abc"` with the selection on `b`. */
function at(src: string): [string, number, number] {
  const start = src.indexOf("[");
  const end = src.indexOf("]") - 1;
  return [src.replace("[", "").replace("]", ""), start, end];
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

describe("parseListLine", () => {
  it("splits bullet and ordered items into their parts", () => {
    expect(parseListLine("- a")).toEqual({ indent: "", marker: "-", gap: " ", body: "a" });
    expect(parseListLine("  * b c")).toEqual({ indent: "  ", marker: "*", gap: " ", body: "b c" });
    expect(parseListLine("\t12. x")).toEqual({ indent: "\t", marker: "12.", gap: " ", body: "x" });
    expect(parseListLine("3)  y")).toEqual({ indent: "", marker: "3)", gap: "  ", body: "y" });
  });

  it("accepts a full-width space after the marker, as the renderer does", () => {
    expect(parseListLine("-\u3000线索")).toEqual({ indent: "", marker: "-", gap: "\u3000", body: "线索" });
    expect(marked(applyListEnterEdit(...at("1.\u3000线索[]"))!)).toBe("1.\u3000线索\n2.\u3000[]");
  });

  it("accepts an item with no body yet", () => {
    expect(parseListLine("- ")).toEqual({ indent: "", marker: "-", gap: " ", body: "" });
    expect(parseListLine("  2. ")?.body).toBe("");
  });

  it("rejects lines where the marker is not followed by a blank", () => {
    for (const line of ["-", "1.", "---", "**bold**", "1.5 m", "-a", "", "plain", "+ plus", "#1. no"]) {
      expect(parseListLine(line), line).toBeNull();
    }
  });
});

describe("applyListIndentEdit", () => {
  it("indents the caret's list line by two spaces and moves the caret with it", () => {
    expect(marked(applyListIndentEdit(...at("- a[]b"), "in")!)).toBe("  - a[]b");
  });

  it("outdents by two spaces, and back again", () => {
    expect(marked(applyListIndentEdit(...at("    - a[]b"), "out")!)).toBe("  - a[]b");
    expect(marked(applyListIndentEdit(...at(" - a[]"), "out")!)).toBe("- a[]");
  });

  it("outdents a tab-indented item by the tab", () => {
    expect(marked(applyListIndentEdit(...at("\t\t1. x[]"), "out")!)).toBe("\t1. x[]");
  });

  it("returns an unchanged edit for a list line with nothing to outdent", () => {
    const out = applyListIndentEdit(...at("- a[]"), "out");
    expect(out && marked(out)).toBe("- a[]");
  });

  it("returns null when no touched line is a list item", () => {
    expect(applyListIndentEdit(...at("plain[] text"), "in")).toBeNull();
    expect(applyListIndentEdit(...at("[a\nb]"), "out")).toBeNull();
    expect(applyListIndentEdit(...at("[]"), "in")).toBeNull();
  });

  it("moves only the list lines of a mixed selection and keeps the selection", () => {
    const out = applyListIndentEdit(...at("in[tro\n- one\n\n- tw]o\nafter"), "in")!;
    expect(out.next).toBe("intro\n  - one\n\n  - two\nafter");
    expect(marked(out)).toBe("in[tro\n  - one\n\n  - tw]o\nafter");
  });

  it("keeps a selection that starts at column 0 covering the new indent", () => {
    expect(marked(applyListIndentEdit(...at("[- a\n- b]"), "in")!)).toBe("[  - a\n  - b]");
  });

  it("does not touch the line a selection ends at the very start of", () => {
    const out = applyListIndentEdit(...at("[- a\n- b\n]- c"), "in")!;
    expect(marked(out)).toBe("[  - a\n  - b\n]- c");
  });

  it("puts a caret that sat inside removed indent at the new indent end", () => {
    expect(marked(applyListIndentEdit(...at("   [] - a"), "out")!)).toBe(" [] - a");
    expect(marked(applyListIndentEdit(...at("x\n [] - a"), "out")!)).toBe("x\n[]- a");
  });

  it("shifts both ends by the right amount across outdented lines", () => {
    const out = applyListIndentEdit(...at("  - [a\n    - b\nc]"), "out")!;
    expect(marked(out)).toBe("- [a\n  - b\nc]");
  });

  it("leaves text around the touched lines alone", () => {
    expect(applyListIndentEdit(...at("top\n- x[]\nbottom"), "in")!.next).toBe("top\n  - x\nbottom");
  });
});

describe("applyListEnterEdit", () => {
  it("continues a bullet item", () => {
    expect(marked(applyListEnterEdit(...at("- a[]"))!)).toBe("- a\n- []");
    expect(marked(applyListEnterEdit(...at("* a[]\nnext"))!)).toBe("* a\n* []\nnext");
  });

  it("keeps the indent of a nested item", () => {
    expect(marked(applyListEnterEdit(...at("- a\n  - b[]"))!)).toBe("- a\n  - b\n  - []");
    expect(marked(applyListEnterEdit(...at("\t- b[]"))!)).toBe("\t- b\n\t- []");
  });

  it("counts ordered items up, keeping the delimiter and gap", () => {
    expect(marked(applyListEnterEdit(...at("  3. x[]"))!)).toBe("  3. x\n  4. []");
    expect(marked(applyListEnterEdit(...at("1) x[]"))!)).toBe("1) x\n2) []");
    expect(marked(applyListEnterEdit(...at("9.  x[]"))!)).toBe("9.  x\n10.  []");
  });

  it("splits an item mid-line, carrying the rest onto the new item", () => {
    expect(marked(applyListEnterEdit(...at("- foo[] bar"))!)).toBe("- foo\n- []bar");
  });

  it("replaces a selection before continuing", () => {
    expect(marked(applyListEnterEdit(...at("- a[bc]d"))!)).toBe("- a\n- []d");
  });

  it("continues rather than clears when the selection was the whole body", () => {
    expect(marked(applyListEnterEdit(...at("- [abc]"))!)).toBe("- \n- []");
  });

  it("clears the marker of an empty item instead of adding a line", () => {
    expect(marked(applyListEnterEdit(...at("- a\n- []"))!)).toBe("- a\n[]");
    expect(marked(applyListEnterEdit(...at("- a\n  2.  []\nafter"))!)).toBe("- a\n[]\nafter");
  });

  it("returns null off list lines", () => {
    expect(applyListEnterEdit(...at("plain[]"))).toBeNull();
    expect(applyListEnterEdit(...at("- a\ntext[]"))).toBeNull();
    expect(applyListEnterEdit(...at("[]"))).toBeNull();
  });

  it("returns null when the caret is inside the marker", () => {
    expect(applyListEnterEdit(...at("[]- a"))).toBeNull();
    expect(applyListEnterEdit(...at("  1[]. a"))).toBeNull();
  });
});

describe("replacedRange", () => {
  it("finds the single changed span", () => {
    expect(replacedRange("- a", "- a\n- ")).toEqual({ start: 3, end: 3, text: "\n- " });
    expect(replacedRange("x\n- \ny", "x\n\ny")).toEqual({ start: 2, end: 4, text: "" });
    expect(replacedRange("abc", "abc")).toEqual({ start: 3, end: 3, text: "" });
  });

  it("replays every list edit exactly", () => {
    const cases: [string, number, number][] = [
      at("- a\n  - b[]"),
      at("[- a\n- b\n]- c"),
      at("- a\n- []"),
      at("  - a\n  - [a]"),
    ];
    for (const [value, start, end] of cases) {
      for (const edit of [
        applyListEnterEdit(value, start, end),
        applyListIndentEdit(value, start, end, "in"),
        applyListIndentEdit(value, start, end, "out"),
      ]) {
        if (!edit) continue;
        const r = replacedRange(value, edit.next);
        expect(value.slice(0, r.start) + r.text + value.slice(r.end)).toBe(edit.next);
      }
    }
  });
});
