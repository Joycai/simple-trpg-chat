import { describe, it, expect } from "vitest";
import { ALL_CLOSED, setOverlay } from "../useOverlayVisibility";

describe("setOverlay", () => {
  it("opens and closes one overlay, leaving the rest", () => {
    const opened = setOverlay(ALL_CLOSED, "character", true);
    expect(opened.character).toBe(true);
    expect(opened.inventory).toBe(false);
    expect(setOverlay(opened, "character", false)).toEqual(ALL_CLOSED);
  });

  it("applies an updater to that overlay's current value", () => {
    const once = setOverlay(ALL_CLOSED, "notebook", (v) => !v);
    expect(once.notebook).toBe(true);
    expect(setOverlay(once, "notebook", (v) => !v).notebook).toBe(false);
  });

  it("returns the same map when nothing changes, so React bails out", () => {
    expect(setOverlay(ALL_CLOSED, "events", false)).toBe(ALL_CLOSED);
    expect(setOverlay(ALL_CLOSED, "events", (v) => v)).toBe(ALL_CLOSED);
  });
});
