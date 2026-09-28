import { describe, expect, it } from "vitest";
import { isOwnWrite, tabId } from "../tab-id";
import { writeOrigin } from "@/lib/character/broadcast";

describe("tabId", () => {
  it("is stable for the page and passes the server's check", () => {
    const id = tabId();
    expect(tabId()).toBe(id);
    expect(writeOrigin(3, id)).toBe(`3:${id}`);
  });
});

describe("isOwnWrite", () => {
  it("matches only this tab's write as this user", () => {
    expect(isOwnWrite(writeOrigin(3, tabId()), 3)).toBe(true);
    // Another tab or device of the same user reloads.
    expect(isOwnWrite(writeOrigin(3, "other-tab"), 3)).toBe(false);
    // Someone replaying this tab's id is bound to their own user id.
    expect(isOwnWrite(writeOrigin(9, tabId()), 3)).toBe(false);
    expect(isOwnWrite(null, 3)).toBe(false);
  });
});
