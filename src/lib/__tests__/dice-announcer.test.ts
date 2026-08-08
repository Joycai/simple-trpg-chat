import { describe, it, expect } from "vitest";
import {
  attachAnnouncer,
  mergeQuip,
  gradeToQuipGroup,
  pickPoolQuip,
  isBreakerOpen,
  recordBreakerResult,
  takeToken,
  type AnnouncerInfo,
} from "../dice-announcer";

const announcer: AnnouncerInfo = { botUserId: 42, nickname: "投娘小幸", botConfigJson: null };

describe("attachAnnouncer", () => {
  it("tags a diceDetail JSON string with the announcer identity, pending quip", () => {
    const out = attachAnnouncer(JSON.stringify({ dice: "d100", results: [50] }), announcer);
    const parsed = JSON.parse(out);
    expect(parsed.dice).toBe("d100"); // original fields untouched
    expect(parsed.announcer).toEqual({ userId: 42, nickname: "投娘小幸", quipPending: true });
  });

  it("coexists with proxiedBy* fields already on the detail", () => {
    const withProxy = JSON.stringify({ dice: "d100", proxiedByUserId: 7, proxiedByNickname: "房主" });
    const out = attachAnnouncer(withProxy, announcer);
    const parsed = JSON.parse(out);
    expect(parsed.proxiedByNickname).toBe("房主");
    expect(parsed.announcer.userId).toBe(42);
  });

  it("returns the input unchanged on malformed JSON", () => {
    expect(attachAnnouncer("not json", announcer)).toBe("not json");
  });
});

describe("mergeQuip", () => {
  it("merges a quip into an existing announcer tag and clears quipPending", () => {
    const tagged = attachAnnouncer(JSON.stringify({ dice: "d100" }), announcer);
    const merged = mergeQuip(tagged, "骰子女神今天心情不错～");
    expect(merged).not.toBeNull();
    const parsed = JSON.parse(merged!);
    expect(parsed.announcer.quip).toBe("骰子女神今天心情不错～");
    expect(parsed.announcer.quipPending).toBeUndefined();
  });

  it("returns null when the detail has no announcer tag", () => {
    expect(mergeQuip(JSON.stringify({ dice: "d100" }), "quip")).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(mergeQuip("not json", "quip")).toBeNull();
  });
});

describe("gradeToQuipGroup", () => {
  it("maps a VisualGrade straight through", () => {
    expect(gradeToQuipGroup("critical")).toBe("critical");
    expect(gradeToQuipGroup("fumble")).toBe("fumble");
  });

  it("maps null/undefined (plain expression rolls) to 'plain'", () => {
    expect(gradeToQuipGroup(null)).toBe("plain");
    expect(gradeToQuipGroup(undefined)).toBe("plain");
  });
});

describe("pickPoolQuip", () => {
  it("picks deterministically via an injected rng", () => {
    const pool = ["a", "b", "c"];
    expect(pickPoolQuip(pool, () => 0)).toBe("a");
    expect(pickPoolQuip(pool, () => 0.999)).toBe("c");
    expect(pickPoolQuip(pool, () => 0.5)).toBe("b");
  });

  it("returns null for an empty pool", () => {
    expect(pickPoolQuip([])).toBeNull();
  });
});

describe("circuit breaker", () => {
  it("is closed with no prior state", () => {
    expect(isBreakerOpen(undefined, 1000)).toBe(false);
  });

  it("opens after reaching the fail threshold and stays open until openUntil", () => {
    let state = recordBreakerResult(undefined, false, 0);
    state = recordBreakerResult(state, false, 0);
    expect(isBreakerOpen(state, 0)).toBe(false); // 2 fails — still closed
    state = recordBreakerResult(state, false, 0);
    expect(state.fails).toBe(3);
    expect(isBreakerOpen(state, 0)).toBe(true); // 3rd fail — opens
    expect(isBreakerOpen(state, 5 * 60 * 1000 - 1)).toBe(true);
    expect(isBreakerOpen(state, 5 * 60 * 1000 + 1)).toBe(false); // expired — half-open probe allowed
  });

  it("resets fail count on success", () => {
    let state = recordBreakerResult(undefined, false, 0);
    state = recordBreakerResult(state, false, 0);
    state = recordBreakerResult(state, true, 0);
    expect(state).toEqual({ fails: 0, openUntil: 0 });
  });
});

describe("token bucket rate limiter", () => {
  it("starts full and drains one token per call", () => {
    let state: ReturnType<typeof takeToken>[1] | undefined;
    let allowed: boolean;
    [allowed, state] = takeToken(state, 0);
    expect(allowed).toBe(true);
    [allowed, state] = takeToken(state, 0);
    expect(allowed).toBe(true);
    [allowed, state] = takeToken(state, 0);
    expect(allowed).toBe(true);
    [allowed, state] = takeToken(state, 0); // 4th call, capacity 3 — exhausted
    expect(allowed).toBe(false);
  });

  it("refills at 1 token per 2 seconds", () => {
    let [, state] = takeToken(undefined, 0);
    [, state] = takeToken(state, 0);
    [, state] = takeToken(state, 0); // now empty at t=0
    let allowed: boolean;
    [allowed, state] = takeToken(state, 1999);
    expect(allowed).toBe(false); // not yet refilled
    [allowed, state] = takeToken(state, 2000);
    expect(allowed).toBe(true); // exactly one tick elapsed
  });

  it("never exceeds capacity even after a long idle period", () => {
    const [, state] = takeToken({ tokens: 1, lastRefill: 0 }, 1_000_000);
    expect(state.tokens).toBeLessThanOrEqual(2); // capacity(3) - 1 taken
  });
});
